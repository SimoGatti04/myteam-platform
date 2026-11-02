import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLogtoAdminConfig } from "../../src/config.js";

test("Logto configuration is optional locally but partial configuration fails", () => {
  assert.equal(loadLogtoAdminConfig({}), undefined);
  assert.throws(() => loadLogtoAdminConfig({ LOGTO_ISSUER: "https://id.example.test/oidc" }), /must be configured together/);
});

test("Logto configuration requires HTTPS and uses the proposed admin permission by default", () => {
  assert.throws(
    () => loadLogtoAdminConfig({ LOGTO_ISSUER: "http://id.example.test/oidc", LOGTO_AUDIENCE: "api" }),
    /clean HTTPS URLs/,
  );
  assert.throws(
    () => loadLogtoAdminConfig({
      LOGTO_ISSUER: "https://id.example.test/oidc",
      LOGTO_AUDIENCE: "api",
      LOGTO_JWKS_URL: "http://id.example.test/oidc/jwks",
    }),
    /clean HTTPS URLs/,
  );
  assert.deepEqual(
    loadLogtoAdminConfig({ LOGTO_ISSUER: "https://id.example.test/oidc", LOGTO_AUDIENCE: "api" }),
    {
      issuer: "https://id.example.test/oidc",
      audience: "api",
      requiredScope: "platform:admin",
    },
  );
});
