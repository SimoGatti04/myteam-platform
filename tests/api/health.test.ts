import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createApp } from "../../apps/api/src/app.js";
import { loadConfig } from "../../apps/api/src/config.js";

const app = createApp({ logger: false });
after(async () => app.close());

test("GET /health returns the versioned liveness contract", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "myteam-platform-api",
    apiVersion: "v1",
  });
});

test("configuration defaults to loopback and the documented port", () => {
  assert.deepEqual(loadConfig({}), { host: "127.0.0.1", port: 3000 });
});

test("configuration rejects invalid ports", () => {
  assert.throws(() => loadConfig({ PORT: "70000" }), /PORT must be an integer/);
});
