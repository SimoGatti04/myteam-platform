import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import { test } from "node:test";
import type { Pool, PoolClient, QueryResult } from "pg";
import { createApp } from "../../src/app.js";
import { checkDatabaseReadiness } from "../../src/persistence/readiness.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function poolWith(connect: () => Promise<PoolClient>, waitingCount = 0): Pool {
  return { connect, waitingCount } as unknown as Pool;
}

function queryResult(rows: unknown[] = []): QueryResult {
  return { command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows } as QueryResult;
}

function clientWith(
  query: (sql: string) => Promise<QueryResult>,
  release: (error?: Error | boolean) => void = () => undefined,
): PoolClient {
  return { query, release } as unknown as PoolClient;
}

test("checkDatabaseReadiness fails closed when the pool is absent", async () => {
  assert.deepEqual(await checkDatabaseReadiness(undefined), { ok: false, reason: "no_pool" });
});

test("readiness acquires, probes with SELECT 1, and releases the client exactly once", async () => {
  let connectCount = 0;
  let releaseCount = 0;
  const client = clientWith(async (sql) => {
    assert.equal(sql, "SELECT 1");
    return { rows: [{ "?column?": 1 }] } as QueryResult;
  }, () => {
    releaseCount += 1;
  });
  const pool = poolWith(async () => {
    connectCount += 1;
    return client;
  });

  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: true });
  assert.equal(connectCount, 1);
  assert.equal(releaseCount, 1);
});

test("readiness handles pool acquisition rejection without leaking error details", async () => {
  const pool = poolWith(async () => {
    throw new Error("password=do-not-expose");
  });
  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: false, reason: "error" });
});

test("synchronous pool acquisition failure clears the probe timer", async () => {
  const pool = poolWith(() => {
    throw new Error("synchronous password-bearing driver failure");
  });
  assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 5_000 }), { ok: false, reason: "error" });
});

test("query failure discards the acquired client", async () => {
  let releaseError: Error | boolean | undefined;
  const pool = poolWith(async () => clientWith(async () => {
    throw new Error("FATAL: password authentication failed for secret_user");
  }, (error) => {
    releaseError = error;
  }));

  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: false, reason: "error" });
  assert.ok(releaseError instanceof Error);
  assert.equal(releaseError.message, "readiness_client_discard");
});

test("query timeout discards the client and the later query rejection is observed", async () => {
  const query = deferred<QueryResult>();
  let releaseError: Error | boolean | undefined;
  const pool = poolWith(async () => clientWith(() => query.promise, (error) => {
    releaseError = error;
  }));

  assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 20 }), { ok: false, reason: "timeout" });
  assert.ok(releaseError instanceof Error);
  query.reject(new Error("late query failure"));
  await nextTurn();
});

test("late pool acquisition after timeout is discarded and cannot accumulate retries", async () => {
  const delayedAcquisition = deferred<PoolClient>();
  let connectCount = 0;
  let lateReleaseError: Error | boolean | undefined;
  let recoveredReleaseCount = 0;
  const recoveredClient = clientWith(async () => queryResult([{ "?column?": 1 }]), () => {
    recoveredReleaseCount += 1;
  });
  const pool = poolWith(() => {
    connectCount += 1;
    return connectCount === 1 ? delayedAcquisition.promise : Promise.resolve(recoveredClient);
  });

  assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 20 }), { ok: false, reason: "timeout" });
  assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 20 }), { ok: false, reason: "timeout" });
  assert.equal(connectCount, 1, "a timed-out uncancellable acquire must block another queued acquire");

  delayedAcquisition.resolve(clientWith(async () => queryResult(), (error) => {
    lateReleaseError = error;
  }));
  await nextTurn();
  assert.ok(lateReleaseError instanceof Error);
  assert.equal(lateReleaseError.message, "readiness_late_client_discard");

  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: true });
  assert.equal(connectCount, 2);
  assert.equal(recoveredReleaseCount, 1);
});

test("late acquisition rejection is observed and allows a later retry", async () => {
  const delayedAcquisition = deferred<PoolClient>();
  let connectCount = 0;
  const pool = poolWith(() => {
    connectCount += 1;
    return connectCount === 1
      ? delayedAcquisition.promise
      : Promise.resolve(clientWith(async () => queryResult()));
  });

  assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 20 }), { ok: false, reason: "timeout" });
  delayedAcquisition.reject(new Error("late connection error with secret"));
  await nextTurn();
  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: true });
  assert.equal(connectCount, 2);
});

test("concurrent readiness calls share one pool acquisition and query", async () => {
  const pendingAcquisition = deferred<PoolClient>();
  let connectCount = 0;
  let queryCount = 0;
  const pool = poolWith(() => {
    connectCount += 1;
    return pendingAcquisition.promise;
  });

  const first = checkDatabaseReadiness(pool);
  const second = checkDatabaseReadiness(pool);
  assert.strictEqual(first, second);
  pendingAcquisition.resolve(clientWith(async () => {
    queryCount += 1;
    return queryResult();
  }));
  assert.deepEqual(await first, { ok: true });
  assert.equal(connectCount, 1);
  assert.equal(queryCount, 1);
});

test("pool congestion fails fast without adding a waiter", async () => {
  let connectCount = 0;
  const pool = poolWith(async () => {
    connectCount += 1;
    throw new Error("should not acquire");
  }, 3);

  assert.deepEqual(await checkDatabaseReadiness(pool), { ok: false, reason: "timeout" });
  assert.equal(connectCount, 0);
});

test("GET /ready returns 200 when SELECT 1 succeeds", async (t) => {
  const pool = poolWith(async () => clientWith(async () => queryResult([{ "?column?": 1 }])));
  const app = createApp({ logger: false, pool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json<{ status: string }>().status, "ready");
});

test("GET /ready returns a safe 503 for database errors", async (t) => {
  const pool = poolWith(async () => clientWith(async () => {
    throw new Error("postgresql://user:secret@10.0.0.5/db FATAL");
  }));
  const app = createApp({ logger: false, pool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
  assert.ok(!response.body.includes("secret"));
  assert.ok(!response.body.includes("10.0.0.5"));
});

test("GET /ready returns safe 503 on acquire timeout and releases a later client", async (t) => {
  const pendingAcquisition = deferred<PoolClient>();
  let releaseError: Error | boolean | undefined;
  const pool = poolWith(() => pendingAcquisition.promise);
  const app = createApp({ logger: false, pool, readinessTimeoutMs: 20 });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    status: "not_ready",
    service: "myteam-platform-api",
    apiVersion: "v1",
    error: "service_unavailable",
  });
  pendingAcquisition.resolve(clientWith(async () => queryResult(), (error) => {
    releaseError = error;
  }));
  await nextTurn();
  assert.ok(releaseError instanceof Error);
  assert.equal(releaseError.message, "readiness_late_client_discard");
});

test("GET /health remains independent of PostgreSQL", async (t) => {
  let connectCount = 0;
  const pool = poolWith(async () => {
    connectCount += 1;
    throw new Error("database unavailable");
  });
  const app = createApp({ logger: false, pool });
  t.after(async () => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(connectCount, 0);
});
