import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { Pool } from "pg";
import { createApp } from "../../apps/api/src/app.js";

test("GET /ready contract: returns 200 and ReadyOkResponse when pool is connected", async (t) => {
  const healthyPool = {
    query: async (sql: string) => {
      assert.equal(sql, "SELECT 1");
      return { rows: [{ "?column?": 1 }] };
    },
  } as unknown as Pool;

  const app = createApp({ logger: false, pool: healthyPool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    database: "connected",
  });
});

test("GET /ready contract: returns 503 and ReadyUnavailableResponse without leaking details when database fails", async (t) => {
  const failingPool = {
    query: async () => {
      throw new Error("connection to server at 192.168.1.100 failed: auth error with secret password xyz");
    },
  } as unknown as Pool;

  const app = createApp({ logger: false, pool: failingPool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
  assert.ok(!response.body.includes("password"));
  assert.ok(!response.body.includes("192.168.1.100"));
});
