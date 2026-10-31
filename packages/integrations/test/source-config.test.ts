import assert from "node:assert/strict";
import { test } from "node:test";
import { isIntegrationError } from "../src/errors.js";
import { defaultCsiSourceConfig, policyFromConfig, validateSourceConfig } from "../src/source-config.js";

test("default configuration is valid and disabled by default", () => {
  const config = defaultCsiSourceConfig();
  assert.equal(config.enabled, false);
  assert.deepEqual(validateSourceConfig(config), config);
  assert.deepEqual(policyFromConfig(config).allowedHosts, ["live.centrosportivoitaliano.it"]);
  assert.equal(policyFromConfig(config).allowHttp, false);
});

test("invalid hosts, base URLs, time zones and limits are rejected with issues", () => {
  const base = defaultCsiSourceConfig();
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...base, allowedHosts: ["evil.example"] }, "allowedHosts"],
    [{ ...base, baseUrl: "http://live.centrosportivoitaliano.it/" }, "baseUrl"],
    [{ ...base, timeZone: "Europe/Nowhere" }, "timeZone"],
    [{ ...base, limits: { ...base.limits, directory: 10 } }, "limits"],
    [{ ...base, seasonLabelOverrides: { "25": "2025-26" } }, "seasonLabelOverrides"],
    [{ ...base, enabled: "yes" }, "enabled"],
  ];
  for (const [input, needle] of cases) {
    assert.throws(
      () => validateSourceConfig(input),
      (error: unknown) => {
        if (!isIntegrationError(error)) return false;
        const issues = (error.details?.["issues"] as string[] | undefined) ?? [];
        return issues.some((issue) => issue.includes(needle));
      },
      needle,
    );
  }
});

test("non-object configuration is rejected", () => {
  assert.throws(() => validateSourceConfig(null), (error: unknown) => isIntegrationError(error) && error.code === "configuration_invalid");
});
