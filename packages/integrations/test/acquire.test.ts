import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createDocumentClient,
  type AcquisitionLimits,
  type DocumentClientOptions,
  type FetchLike,
} from "../src/acquire/client.js";
import { isIntegrationError } from "../src/errors.js";
import { CSI_SOURCE_POLICY } from "../src/security/url-policy.js";
import { TokenBucket } from "../src/security/rate-limit.js";
import { fakeClock, fakeResponse, recordingFetch } from "./helpers.js";

const BASE = "https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lombardia/Bergamo/C203/";

const LIMITS: AcquisitionLimits = {
  timeoutMs: 1_000,
  maxBytes: 64 * 1024,
  maxRedirects: 2,
  requestsPerMinute: 60,
  cacheTtlMs: 60_000,
};

function client(fetchImpl: FetchLike, overrides: { limits?: Partial<AcquisitionLimits>; options?: Partial<DocumentClientOptions> } = {}) {
  const clock = fakeClock();
  const instance = createDocumentClient({
    policy: CSI_SOURCE_POLICY,
    limits: { ...LIMITS, ...(overrides.limits ?? {}) },
    fetchImpl,
    clock,
    ...(overrides.options ?? {}),
  });
  return { instance, clock };
}

function rejectsWith(code: string) {
  return (error: unknown) => isIntegrationError(error) && error.code === code;
}

test("acquires HTML, then serves it from cache until TTL or force refresh", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse({ body: "<html>ok</html>" }));
  const { instance, clock } = client(fetchImpl);

  const first = await instance.acquire(BASE);
  assert.equal(first.body, "<html>ok</html>");
  assert.equal(first.fromCache, false);
  assert.equal(fetchImpl.calls.length, 1);

  const second = await instance.acquire(BASE);
  assert.equal(second.fromCache, true);
  assert.equal(fetchImpl.calls.length, 1);

  clock.advance(61_000);
  await instance.acquire(BASE);
  assert.equal(fetchImpl.calls.length, 2);

  await instance.acquire(BASE, { forceRefresh: true });
  assert.equal(fetchImpl.calls.length, 3);
});

test("refuses non-allowlisted URLs before any request", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse({ body: "x" }));
  const { instance } = client(fetchImpl);
  await assert.rejects(instance.acquire("https://evil.example/25/"), rejectsWith("blocked_host"));
  assert.equal(fetchImpl.calls.length, 0);
});

test("rejects unsupported content types and oversized bodies", async () => {
  const json = recordingFetch(() => fakeResponse({ body: "{}", headers: { "content-type": "application/json" } }));
  await assert.rejects(client(json).instance.acquire(BASE), rejectsWith("unsupported_content_type"));

  const declared = recordingFetch(() =>
    fakeResponse({ body: "x", headers: { "content-length": "999999" } }),
  );
  await assert.rejects(client(declared).instance.acquire(BASE), rejectsWith("response_too_large"));

  const streamed = recordingFetch(() => fakeResponse({ chunks: ["a".repeat(40), "b".repeat(40)] }));
  await assert.rejects(
    client(streamed, { limits: { maxBytes: 50 } }).instance.acquire(BASE),
    rejectsWith("response_too_large"),
  );
});

test("follows same-host redirects only", async () => {
  const ok = recordingFetch((_url, index) =>
    index === 0
      ? fakeResponse({ status: 302, headers: { location: "/25/Calcio-a-5/Lombardia/Bergamo/C204/" } })
      : fakeResponse({ body: "destinazione" }),
  );
  const result = await client(ok).instance.acquire(BASE);
  assert.equal(result.body, "destinazione");
  assert.equal(ok.calls.length, 2);

  const crossHost = recordingFetch(() =>
    fakeResponse({ status: 302, headers: { location: "https://evil.example/25/" } }),
  );
  await assert.rejects(client(crossHost).instance.acquire(BASE), rejectsWith("blocked_host"));

  const loop = recordingFetch(() => fakeResponse({ status: 302, headers: { location: BASE } }));
  await assert.rejects(client(loop, { limits: { maxRedirects: 1 } }).instance.acquire(BASE), rejectsWith("too_many_redirects"));
});

test("retries transient failures with backoff and gives up eventually", async () => {
  const flaky = recordingFetch((_url, index) =>
    index < 2 ? fakeResponse({ status: 503, body: "busy" }) : fakeResponse({ body: "ok" }),
  );
  const { instance, clock } = client(flaky);
  const result = await instance.acquire(BASE);
  assert.equal(result.body, "ok");
  assert.equal(flaky.calls.length, 3);
  assert.ok(clock.slept >= 750);

  const alwaysDown = recordingFetch(() => fakeResponse({ status: 503, body: "busy" }));
  await assert.rejects(client(alwaysDown).instance.acquire(BASE), rejectsWith("http_error"));
  assert.equal(alwaysDown.calls.length, 3);
});

test("times out instead of hanging", async () => {
  const hanging: FetchLike = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted by client")));
    });
  await assert.rejects(client(hanging, { limits: { timeoutMs: 40 } }).instance.acquire(BASE), rejectsWith("timeout"));
});

test("DNS guard blocks private resolutions", async () => {
  const fetchImpl = recordingFetch(() => fakeResponse({ body: "x" }));
  const { instance } = client(fetchImpl, { options: { resolveHost: async () => ["10.0.0.9"] } });
  await assert.rejects(instance.acquire(BASE), rejectsWith("blocked_address"));
  assert.equal(fetchImpl.calls.length, 0);
});

test("concurrent acquisitions of the same URL are collapsed into one request", async () => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchImpl = recordingFetch(async () => {
    await gate;
    return fakeResponse({ body: "una-sola-richiesta" });
  });
  const { instance } = client(fetchImpl);
  const first = instance.acquire(BASE);
  const second = instance.acquire(BASE);
  release?.();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.body, "una-sola-richiesta");
  assert.equal(b.body, "una-sola-richiesta");
  assert.equal(fetchImpl.calls.length, 1);
});

test("rate limiter spaces requests", async () => {
  const clock = fakeClock();
  const bucket = new TokenBucket(1, 60, clock);
  await bucket.take();
  const startedAt = clock.now();
  await bucket.take();
  assert.ok(clock.now() - startedAt >= 900);
});
