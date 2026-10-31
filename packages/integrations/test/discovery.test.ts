import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDiscoveryOptions } from "../src/csi/discovery.js";
import { CSI_PROFILE_V0, CSI_PROFILE_V0_LINKED_DISCOVERY } from "../src/csi/profile.js";
import { fixture, testLocator } from "./helpers.js";

test("discovers season options and drops unsafe links", () => {
  const baseUrl = testLocator().url;
  const result = parseDiscoveryOptions(fixture("discovery.html"), { profile: CSI_PROFILE_V0, baseUrl });
  assert.equal(result.options.length, 3);
  assert.deepEqual(result.options[0], {
    label: "2024/25",
    value: "24",
    href: "https://live.centrosportivoitaliano.it/24/",
  });
  assert.equal(result.options[1]?.href, "https://live.centrosportivoitaliano.it/25/");
  assert.equal(result.options[2]?.href, null);
  assert.ok(result.diagnostics.some((entry) => entry.code === "discovery_unsafe_link"));
});

test("a different markup is supported only by changing the profile", () => {
  const baseUrl = testLocator().url;
  const result = parseDiscoveryOptions(fixture("discovery-linked.html"), {
    profile: CSI_PROFILE_V0_LINKED_DISCOVERY,
    baseUrl,
  });
  assert.equal(result.options.length, 2);
  assert.equal(result.options[1]?.value, "25");
  assert.equal(result.options[1]?.label, "2025/26");
});

test("missing options produce a warning instead of an exception", () => {
  const result = parseDiscoveryOptions("<html><body><p>niente</p></body></html>", {
    profile: CSI_PROFILE_V0,
    baseUrl: testLocator().url,
  });
  assert.deepEqual(result.options, []);
  assert.ok(result.diagnostics.some((entry) => entry.code === "discovery_no_options"));
});
