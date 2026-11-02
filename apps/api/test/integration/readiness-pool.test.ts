import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { Pool } from "pg";
import { checkDatabaseReadiness } from "../../src/persistence/readiness.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  "readiness discards a client acquired after timeout and recovers on PostgreSQL 16",
  { skip: !testDatabaseUrl ? "Set TEST_DATABASE_URL to a disposable local PostgreSQL *_test database" : false },
  async () => {
    const url = new URL(testDatabaseUrl!);
    assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname), "integration DB must be local");
    assert.ok(decodeURIComponent(url.pathname.slice(1)).endsWith("_test"), "integration DB must end in _test");

    const pool = new Pool({ connectionString: testDatabaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
    try {
      const version = await pool.query<{ server_version_num: string }>("SHOW server_version_num");
      assert.equal(version.rows[0]?.server_version_num.slice(0, 2), "16", "test must use PostgreSQL 16");

      const heldClient = await pool.connect();
      const timedOut = await checkDatabaseReadiness(pool, { timeoutMs: 30 });
      assert.deepEqual(timedOut, { ok: false, reason: "timeout" });
      assert.equal(pool.waitingCount, 1, "readiness acquisition should have been waiting behind the held client");

      heldClient.release();
      const cleanupDeadline = Date.now() + 2_000;
      while ((Number(pool.waitingCount) !== 0 || Number(pool.totalCount) !== 0) && Date.now() < cleanupDeadline) {
        await delay(10);
      }
      assert.equal(pool.waitingCount, 0, "late acquisition waiter must settle");
      assert.equal(pool.totalCount, 0, "late acquired socket must be discarded, not left checked out or idle");

      assert.deepEqual(await checkDatabaseReadiness(pool, { timeoutMs: 1_000 }), { ok: true });
      assert.equal(pool.waitingCount, 0);
      assert.equal(pool.idleCount, 1, "successful retry should return its client to the pool");
    } finally {
      await pool.end();
    }
  },
);
