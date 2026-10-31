import assert from "node:assert/strict";
import { test } from "node:test";
import { isIntegrationError } from "../src/errors.js";
import {
  assertPublicAddresses,
  assertSameHost,
  CSI_SOURCE_POLICY,
  isPrivateIp,
  validateSourceUrl,
  type SourceUrlPolicy,
} from "../src/security/url-policy.js";

const BASE = "https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lombardia/Bergamo/C203/";

function rejectsWith(code: string) {
  return (error: unknown) => isIntegrationError(error) && error.code === code;
}

test("accepts only allowlisted HTTPS URLs", () => {
  const url = validateSourceUrl(BASE, CSI_SOURCE_POLICY);
  assert.equal(url.hostname, "live.centrosportivoitaliano.it");
  assert.throws(() => validateSourceUrl(BASE.replace("https:", "http:"), CSI_SOURCE_POLICY), rejectsWith("unsupported_scheme"));
  assert.throws(() => validateSourceUrl("https://evil.example/25/", CSI_SOURCE_POLICY), rejectsWith("blocked_host"));
  assert.throws(() => validateSourceUrl("https://sub.live.centrosportivoitaliano.it/", CSI_SOURCE_POLICY), rejectsWith("blocked_host"));
});

test("rejects credentials, IP literals, odd ports and traversal", () => {
  assert.throws(() => validateSourceUrl("https://user:pw@live.centrosportivoitaliano.it/", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
  assert.throws(() => validateSourceUrl("https://127.0.0.1/25/", CSI_SOURCE_POLICY), rejectsWith("blocked_address"));
  assert.throws(() => validateSourceUrl("https://[::1]/25/", CSI_SOURCE_POLICY), rejectsWith("blocked_address"));
  assert.throws(() => validateSourceUrl("https://live.centrosportivoitaliano.it:8443/25/", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
  assert.throws(() => validateSourceUrl("https://live.centrosportivoitaliano.it/25/%2e%2e/admin/", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
  assert.throws(() => validateSourceUrl("https://live.centrosportivoitaliano.it./25/", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
  assert.throws(() => validateSourceUrl("https://live.centrosportivoitaliano.it\\@evil.example/", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
  assert.throws(() => validateSourceUrl(" ", CSI_SOURCE_POLICY), rejectsWith("invalid_url"));
});

test("subdomain policy is opt-in", () => {
  const policy: SourceUrlPolicy = { ...CSI_SOURCE_POLICY, allowSubdomains: true };
  const url = validateSourceUrl("https://cdn.live.centrosportivoitaliano.it/", policy);
  assert.equal(url.hostname, "cdn.live.centrosportivoitaliano.it");
});

test("private, loopback, link-local and reserved addresses are detected", () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.0.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
    assert.equal(isPrivateIp(address), true, address);
  }
  for (const address of ["8.8.8.8", "93.184.216.34", "2001:4860:4860::8888"]) {
    assert.equal(isPrivateIp(address), false, address);
  }
  assert.throws(() => assertPublicAddresses("live.centrosportivoitaliano.it", ["10.0.0.5"]), rejectsWith("blocked_address"));
  assert.throws(() => assertPublicAddresses("live.centrosportivoitaliano.it", []), rejectsWith("blocked_address"));
  assert.doesNotThrow(() => assertPublicAddresses("live.centrosportivoitaliano.it", ["93.184.216.34"]));
});

test("redirects must stay on the same host", () => {
  const from = new URL(BASE);
  assert.doesNotThrow(() => assertSameHost(from, new URL("https://live.centrosportivoitaliano.it/25/altra/")));
  assert.throws(() => assertSameHost(from, new URL("https://evil.example/25/")), rejectsWith("blocked_host"));
});
