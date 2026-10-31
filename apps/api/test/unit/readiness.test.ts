import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { checkDatabaseReadiness } from "../../src/persistence/readiness.js";

test("checkDatabaseReadiness returns no_pool when pool is undefined", async () => {
  const result = await checkDatabaseReadiness(undefined);
  assert.deepEqual(result, { ok: false, reason: "no_pool" });
});

test("checkDatabaseReadiness returns ok true when database query succeeds", async () => {
  const mockPool = {
    query: async (sql: string) => {
      assert.equal(sql, "SELECT 1");
      return { rows: [{ "?column?": 1 }] };
    },
  } as unknown as Pool;

  const result = await checkDatabaseReadiness(mockPool);
  assert.deepEqual(result, { ok: true });
});

test("checkDatabaseReadiness handles error fail-closed without exposing error details", async () => {
  const mockPool = {
    query: async () => {
      throw new Error("FATAL: password authentication failed for user secret_user");
    },
  } as unknown as Pool;

  const result = await checkDatabaseReadiness(mockPool);
  assert.deepEqual(result, { ok: false, reason: "error" });
});

test("checkDatabaseReadiness fails closed on timeout", async () => {
  const mockPool = {
    query: async () => {
      // Simulate hung connection
      return new Promise(() => {});
    },
  } as unknown as Pool;

  const result = await checkDatabaseReadiness(mockPool, { timeoutMs: 50 });
  assert.deepEqual(result, { ok: false, reason: "timeout" });
});

test("GET /ready returns HTTP 200 when database pool is healthy", async (t) => {
  const mockPool = {
    query: async (sql: string) => {
      assert.equal(sql, "SELECT 1");
      return { rows: [{ "?column?": 1 }] };
    },
  } as unknown as Pool;

  const app = createApp({ logger: false, pool: mockPool });
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

test("GET /ready returns HTTP 503 when pool is not configured", async (t) => {
  const app = createApp({ logger: false });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
});

test("GET /ready returns HTTP 503 and no credentials when database query throws", async (t) => {
  const mockPool = {
    query: async () => {
      throw new Error("postgresql://postgres:SUPER_SECRET_PASSWORD@10.0.0.1:5432/myteam connection refused");
    },
  } as unknown as Pool;

  const app = createApp({ logger: false, pool: mockPool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
  assert.ok(!response.body.includes("SUPER_SECRET_PASSWORD"));
  assert.ok(!response.body.includes("postgres"));
});

test("GET /ready returns HTTP 503 when database query times out", async (t) => {
  const mockPool = {
    query: async () => new Promise(() => {}),
  } as unknown as Pool;

  const app = createApp({ logger: false, pool: mockPool, readinessTimeoutMs: 50 });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
});

test("GET /health remains liveness-only and independent of PostgreSQL", async (t) => {
  // Pool completely broken / throwing
  const mockPool = {
    query: async () => {
      throw new Error("Database is dead");
    },
  } as unknown as Pool;

  const appWithBrokenPool = createApp({ logger: false, pool: mockPool });
  t.after(async () => appWithBrokenPool.close());

  const healthBrokenResponse = await appWithBrokenPool.inject({ method: "GET", url: "/health" });
  assert.equal(healthBrokenResponse.statusCode, 200);
  assert.deepEqual(healthBrokenResponse.json(), {
    status: "ok",
    service: "myteam-platform-api",
    apiVersion: "v1",
  });

  // App without pool
  const appWithoutPool = createApp({ logger: false });
  t.after(async () => appWithoutPool.close());

  const healthNoPoolResponse = await appWithoutPool.inject({ method: "GET", url: "/health" });
  assert.equal(healthNoPoolResponse.statusCode, 200);
  assert.deepEqual(healthNoPoolResponse.json(), {
    status: "ok",
    service: "myteam-platform-api",
    apiVersion: "v1",
  });
});
