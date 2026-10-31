import { IntegrationError } from "../errors.js";

export interface SourceUrlPolicy {
  /** Exact hostnames that may be contacted. */
  allowedHosts: readonly string[];
  /** When true, `*.allowedHosts[i]` is also accepted. */
  allowSubdomains: boolean;
  /** Development escape hatch; must stay false for production sources. */
  allowHttp: boolean;
  /** Allowed explicit ports; the empty default port (443) is always allowed. */
  allowedPorts?: readonly number[];
  maxUrlLength?: number;
  /** Reject redirects that leave the original hostname. */
  sameHostRedirectsOnly?: boolean;
}

export const CSI_LIVE_HOST = "live.centrosportivoitaliano.it";

export const CSI_SOURCE_POLICY: SourceUrlPolicy = {
  allowedHosts: [CSI_LIVE_HOST],
  allowSubdomains: false,
  allowHttp: false,
  allowedPorts: [443],
  maxUrlLength: 2048,
  sameHostRedirectsOnly: true,
};

function fail(code: IntegrationError["code"], message: string, details?: Record<string, unknown>): never {
  throw new IntegrationError(code, message, details === undefined ? {} : { details });
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (IPV4.test(host)) return true;
  return host.includes(":");
}

function ipv4ToNumber(address: string): number | null {
  const match = IPV4.exec(address);
  if (match === null) return null;
  const octets = match.slice(1).map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => !Number.isFinite(octet) || octet < 0 || octet > 255)) return null;
  const [a = 0, b = 0, c = 0, d = 0] = octets;
  return ((a * 256 + b) * 256 + c) * 256 + d;
}

const PRIVATE_V4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** Loopback, link-local, private, CGNAT and reserved ranges are never fetched. */
export function isPrivateIp(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  if (normalized.length === 0) return true;

  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mapped !== null) return isPrivateIp(mapped[1] ?? "");

  if (normalized.includes(":")) {
    if (normalized === "::" || normalized === "::1") return true;
    if (normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) {
      return true;
    }
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("ff")) return true;
    return false;
  }

  const value = ipv4ToNumber(normalized);
  if (value === null) return true;
  for (const [base, bits] of PRIVATE_V4_RANGES) {
    const baseValue = ipv4ToNumber(base);
    if (baseValue === null) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) === (baseValue & mask)) return true;
  }
  return false;
}

function hostAllowed(hostname: string, policy: SourceUrlPolicy): boolean {
  const host = hostname.toLowerCase();
  for (const allowed of policy.allowedHosts) {
    const candidate = allowed.toLowerCase();
    if (host === candidate) return true;
    if (policy.allowSubdomains && host.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

/**
 * Validates a URL before any network activity. The check is intentionally
 * syntactic plus allowlist-based; DNS answers are checked separately by
 * `assertPublicAddresses` right before the request is issued.
 */
export function validateSourceUrl(rawUrl: string, policy: SourceUrlPolicy): URL {
  const maxLength = policy.maxUrlLength ?? 2048;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    fail("invalid_url", "URL is empty");
  }
  if (rawUrl.length > maxLength) {
    fail("invalid_url", "URL exceeds the maximum allowed length", { length: rawUrl.length, maxLength });
  }
  if (/[\u0000-\u001f\u007f\\]/.test(rawUrl)) {
    fail("invalid_url", "URL contains control characters or backslashes");
  }
  if (/(^|\/)(%2e|\.){2}(\/|$)/i.test(rawUrl)) {
    fail("invalid_url", "URL contains path traversal segments");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new IntegrationError("invalid_url", "URL cannot be parsed", { cause: error });
  }

  const expectedProtocol = policy.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!expectedProtocol.includes(url.protocol)) {
    fail("unsupported_scheme", `Protocol ${url.protocol} is not allowed`, { protocol: url.protocol });
  }
  if (url.username.length > 0 || url.password.length > 0) {
    fail("invalid_url", "URL must not contain credentials");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) fail("invalid_url", "URL has no hostname");
  if (hostname.endsWith(".")) fail("invalid_url", "URL hostname must not end with a dot");
  if (isIpLiteral(hostname)) fail("blocked_address", "IP literals are not accepted as source hosts", { hostname });
  if (!hostAllowed(hostname, policy)) {
    fail("blocked_host", `Host ${hostname} is not in the source allowlist`, { hostname });
  }

  const allowedPorts = policy.allowedPorts ?? [443];
  if (url.port !== "" && !allowedPorts.includes(Number.parseInt(url.port, 10))) {
    fail("invalid_url", `Port ${url.port} is not allowed for this source`, { port: url.port });
  }

  if (url.pathname.includes("//")) {
    fail("invalid_url", "URL path contains an empty segment sequence");
  }

  return url;
}

/** Rejects any redirect hop whose hostname differs from the original one. */
export function assertSameHost(original: URL, next: URL): void {
  if (original.hostname.toLowerCase() !== next.hostname.toLowerCase()) {
    fail("blocked_host", "Redirect leaves the configured source host", {
      from: original.hostname,
      to: next.hostname,
    });
  }
}

/** Called with the DNS answer for the hostname, immediately before the request. */
export function assertPublicAddresses(hostname: string, addresses: readonly string[]): void {
  if (addresses.length === 0) {
    fail("blocked_address", `Host ${hostname} did not resolve to any address`, { hostname });
  }
  for (const address of addresses) {
    if (isPrivateIp(address)) {
      fail("blocked_address", `Host ${hostname} resolves to a non-public address`, { hostname, address });
    }
  }
}
