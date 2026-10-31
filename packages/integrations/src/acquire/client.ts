import { IntegrationError } from "../errors.js";
import {
  assertPublicAddresses,
  assertSameHost,
  validateSourceUrl,
  type SourceUrlPolicy,
} from "../security/url-policy.js";
import { createSingleFlight, systemClock, TokenBucket, type Clock, type SingleFlight } from "../security/rate-limit.js";

export interface HttpResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
  url?: string;
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; redirect: "manual"; signal: AbortSignal },
) => Promise<HttpResponseLike>;

export interface AcquisitionLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  requestsPerMinute: number;
  cacheTtlMs: number;
}

export interface AcquiredDocument {
  url: string;
  status: number;
  body: string;
  fetchedAt: string;
  fromCache: boolean;
  etag: string | null;
}

export interface DocumentClientOptions {
  policy: SourceUrlPolicy;
  limits: AcquisitionLimits;
  /** Injectable for tests; production uses the global fetch. */
  fetchImpl?: FetchLike;
  clock?: Clock;
  /** DNS guard; when provided every hop is validated before the request. */
  resolveHost?: (hostname: string) => Promise<string[]>;
  singleFlight?: SingleFlight;
  /** Test seam to assert that no unexpected traffic was issued. */
  onRequest?: (url: string) => void;
}

export interface AcquireOptions {
  signal?: AbortSignal;
  forceRefresh?: boolean;
}

interface CacheEntry {
  body: string;
  etag: string | null;
  storedAt: number;
  fetchedAt: string;
}

const ACCEPTED_CONTENT_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;

function headerValue(response: HttpResponseLike, name: string): string | null {
  return response.headers.get(name);
}

function contentLength(response: HttpResponseLike): number | null {
  const raw = headerValue(response, "content-length");
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readBody(response: HttpResponseLike, maxBytes: number): Promise<string> {
  const declared = contentLength(response);
  if (declared !== null && declared > maxBytes) {
    throw new IntegrationError("response_too_large", "Declared response size exceeds the limit", {
      details: { declaredBytes: declared, maxBytes },
    });
  }

  let bytes: Uint8Array;
  if (response.body === undefined || response.body === null) {
    bytes = new Uint8Array(await response.arrayBuffer());
  } else {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new IntegrationError("response_too_large", "Streamed response exceeds the limit", {
          details: { maxBytes },
        });
      }
      chunks.push(value);
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }

  if (bytes.byteLength > maxBytes) {
    throw new IntegrationError("response_too_large", "Response exceeds the limit", { details: { maxBytes } });
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export interface DocumentClient {
  acquire(url: string, options?: AcquireOptions): Promise<AcquiredDocument>;
  clearCache(): void;
}

export function createDocumentClient(options: DocumentClientOptions): DocumentClient {
  const { policy, limits } = options;
  const clock = options.clock ?? systemClock;
  const fetchImpl: FetchLike =
    options.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<HttpResponseLike>);
  const singleFlight = options.singleFlight ?? createSingleFlight();
  const bucket = new TokenBucket(Math.max(1, Math.ceil(limits.requestsPerMinute / 10)), limits.requestsPerMinute, clock);
  const cache = new Map<string, CacheEntry>();

  const sleep = (ms: number): Promise<void> => clock.sleep(ms);

  async function requestOnce(url: URL, accept: string, signal: AbortSignal): Promise<HttpResponseLike> {
    await bucket.take();
    options.onRequest?.(url.toString());
    if (options.resolveHost !== undefined) {
      const addresses = await options.resolveHost(url.hostname);
      assertPublicAddresses(url.hostname, addresses);
    }
    return fetchImpl(url.toString(), {
      method: "GET",
      headers: { accept, "accept-language": "it-IT,it;q=0.9" },
      redirect: "manual",
      signal,
    });
  }

  async function acquireUrl(startUrl: URL, accept: string, signal: AbortSignal): Promise<HttpResponseLike> {
    let current = startUrl;
    for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
      const response = await requestOnce(current, accept, signal);
      if (response.status >= 300 && response.status < 400) {
        const location = headerValue(response, "location");
        if (location === null) {
          throw new IntegrationError("http_error", `Redirect without location (${response.status})`, {
            details: { status: response.status },
          });
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch (error) {
          throw new IntegrationError("invalid_url", "Redirect location cannot be parsed", { cause: error });
        }
        validateSourceUrl(next.toString(), policy);
        if (policy.sameHostRedirectsOnly === true) assertSameHost(startUrl, next);
        current = next;
        continue;
      }
      return response;
    }
    throw new IntegrationError("too_many_redirects", "Redirect limit exceeded", {
      details: { maxRedirects: limits.maxRedirects },
    });
  }

  function isRetryable(error: unknown): boolean {
    return error instanceof IntegrationError && error.retryable;
  }

  async function fetchWithRetry(url: URL, accept: string, signal: AbortSignal): Promise<HttpResponseLike> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await acquireUrl(url, accept, signal);
        if (RETRYABLE_STATUS.has(response.status)) {
          const retryAfter = headerValue(response, "retry-after");
          const waitMs =
            retryAfter !== null && /^\d+$/.test(retryAfter.trim())
              ? Number.parseInt(retryAfter, 10) * 1000
              : 250 * 2 ** attempt;
          lastError = new IntegrationError("http_error", `Source responded ${response.status}`, {
            retryable: true,
            details: { status: response.status },
          });
          if (attempt < MAX_RETRIES) await sleep(Math.min(waitMs, 5_000));
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === MAX_RETRIES) throw error;
        await sleep(250 * 2 ** attempt);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new IntegrationError("http_error", "Acquisition failed for an unknown reason");
  }

  async function perform(url: URL, forceRefresh: boolean): Promise<AcquiredDocument> {
    const cacheKey = url.toString();
    if (!forceRefresh) {
      const cached = cache.get(cacheKey);
      if (cached !== undefined && clock.now() - cached.storedAt < limits.cacheTtlMs) {
        return {
          url: cacheKey,
          status: 200,
          body: cached.body,
          fetchedAt: cached.fetchedAt,
          fromCache: true,
          etag: cached.etag,
        };
      }
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limits.timeoutMs);

    try {
      const accept = ACCEPTED_CONTENT_TYPES.join(", ");
      const response = await fetchWithRetry(url, accept, controller.signal);

      if (timedOut) {
        throw new IntegrationError("timeout", "Source did not answer within the timeout", {
          retryable: true,
          details: { timeoutMs: limits.timeoutMs },
        });
      }
      if (response.status < 200 || response.status >= 300) {
        throw new IntegrationError("http_error", `Source responded ${response.status}`, {
          retryable: response.status >= 500,
          details: { status: response.status },
        });
      }

      const contentType = headerValue(response, "content-type");
      const mime = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
      if (!ACCEPTED_CONTENT_TYPES.includes(mime)) {
        throw new IntegrationError("unsupported_content_type", "Source returned an unsupported content type", {
          details: { contentType: contentType ?? "" },
        });
      }

      const body = await readBody(response, limits.maxBytes);
      const etag = headerValue(response, "etag");
      const fetchedAt = new Date(clock.now()).toISOString();
      cache.set(cacheKey, { body, etag, storedAt: clock.now(), fetchedAt });
      return { url: cacheKey, status: response.status, body, fetchedAt, fromCache: false, etag };
    } catch (error) {
      if (timedOut) {
        throw new IntegrationError("timeout", "Source did not answer within the timeout", {
          retryable: true,
          details: { timeoutMs: limits.timeoutMs },
        });
      }
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(
        controller.signal.aborted ? "timeout" : "http_error",
        controller.signal.aborted ? "Acquisition aborted" : "Network acquisition failed",
        { retryable: true, cause: error },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async acquire(rawUrl: string, acquireOptions: AcquireOptions = {}): Promise<AcquiredDocument> {
      const url = validateSourceUrl(rawUrl, policy);
      const forceRefresh = acquireOptions.forceRefresh ?? false;
      const key = url.toString();

      if (acquireOptions.signal !== undefined) {
        const external = acquireOptions.signal;
        if (external.aborted) {
          throw new IntegrationError("timeout", "Acquisition aborted by caller", { retryable: false });
        }
        return singleFlight.run(key, () => perform(url, forceRefresh));
      }
      return singleFlight.run(key, () => perform(url, forceRefresh));
    },
    clearCache(): void {
      cache.clear();
    },
  };
}
