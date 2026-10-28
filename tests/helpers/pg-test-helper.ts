import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Pool as PgPool } from "pg";
import { applyMigrations } from "../../apps/api/src/persistence/migrate.js";

const require = createRequire(import.meta.url);
const pgPath = require.resolve("pg", {
  paths: [new URL("../../apps/api", import.meta.url).pathname],
});
const { Pool } = require(pgPath);

export interface ScopedPostgresContext {
  adminPool: PgPool;
  scopedPool: PgPool;
  schema: string;
  cleanup: () => Promise<void>;
}

export async function createScopedPostgresContext(): Promise<ScopedPostgresContext | null> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    return null;
  }

  const databaseUrl = new URL(testDatabaseUrl);
  const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, "");
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));

  assert.ok(["localhost", "127.0.0.1", "::1"].includes(hostname), "integration DB must be local loopback");
  assert.ok(databaseName.endsWith("_test"), "integration DB name must end in _test");

  const adminPool = new Pool({ connectionString: testDatabaseUrl }) as PgPool;
  const schema = `test_qa_${randomUUID().replaceAll("-", "")}`;

  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    const scopedPool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}` }) as PgPool;
    await applyMigrations(scopedPool);

    const cleanup = async () => {
      try {
        await scopedPool.end();
      } catch {}
      try {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await adminPool.end();
      } catch {}
    };

    return { adminPool, scopedPool, schema, cleanup };
  } catch (error) {
    await adminPool.end().catch(() => {});
    throw error;
  }
}
