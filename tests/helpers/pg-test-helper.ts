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

export class PostgresEnvironmentalError extends Error {
  public readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "PostgresEnvironmentalError";
    this.code = code;
  }
}

const KNOWN_ENV_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EADDRNOTAVAIL",
  "EACCES",
  "EPERM",
]);

export function isEnvironmentalConnectionError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof PostgresEnvironmentalError) return true;
  const anyErr = err as { code?: string; message?: string };
  if (anyErr.code && KNOWN_ENV_ERROR_CODES.has(anyErr.code)) return true;
  if (anyErr.message && /connect ECONNREFUSED|connect EPERM|connect EACCES|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND/i.test(anyErr.message)) {
    return true;
  }
  return false;
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

  // 1. Connection probe: checks if PostgreSQL service is reachable in this environment
  try {
    const probe = await adminPool.connect();
    probe.release();
  } catch (err: any) {
    await adminPool.end().catch(() => {});
    if (isEnvironmentalConnectionError(err)) {
      throw new PostgresEnvironmentalError(`PostgreSQL unreachable in current environment (${err.code || err.message})`, err.code);
    }
    // Auth or DB config error must fail
    throw err;
  }

  // 2. Schema creation: SQL error here must FAIL, not skip
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
  } catch (schemaErr: any) {
    await adminPool.end().catch(() => {});
    throw schemaErr;
  }

  const scopedPool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}` }) as PgPool;

  // 3. Schema migrations: DDL/SQL failure must FAIL, not skip
  try {
    await applyMigrations(scopedPool);
  } catch (migrationErr: any) {
    try {
      await scopedPool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    } catch {}
    throw migrationErr;
  }

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
}
