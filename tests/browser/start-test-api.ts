import { createApp } from "../../apps/api/src/app.js";
import { applyMigrations } from "../../apps/api/src/persistence/migrate.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createRequire } from "node:module";
import { existsSync, lstatSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  dropSchemaAndVerifyAbsent,
  finalizeSchemaCleanup,
  MARKER_OWNER,
  recoverMarkedSchema,
  validateTestDatabaseUrl,
  withTimeout,
} from "./schema-cleanup.js";

const API_PORT = Number(process.env.QA_TEST_API_PORT ?? 3000);
if (!Number.isInteger(API_PORT) || API_PORT < 0 || API_PORT > 65535) {
  throw new Error("QA_TEST_API_PORT must be an integer from 0 through 65535");
}
const SCHEMA_MARKER = join(tmpdir(), `myteam-qa-test-api-${API_PORT}.schema`);
const CLEANUP_STEP_TIMEOUT_MS = 8_000;
const SHUTDOWN_DEADLINE_MS = 25_000;

const require = createRequire(import.meta.url);
const pgPath = require.resolve("pg", {
  paths: [fileURLToPath(new URL("../../apps/api", import.meta.url))],
});
const { Client, Pool } = require(pgPath);

function readSecureMarker(): string | null {
  if (!existsSync(SCHEMA_MARKER)) return null;
  const stats = lstatSync(SCHEMA_MARKER);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("Refusing QA schema cleanup: marker is not a regular file");
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new Error("Refusing QA schema cleanup: marker is not owned by this user");
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error("Refusing QA schema cleanup: marker permissions are broader than 0600");
  }
  return readFileSync(SCHEMA_MARKER, "utf8");
}

function removeMarkerIfUnchanged(expected: string): void {
  const current = readSecureMarker();
  if (current === null || current !== expected) {
    throw new Error("Refusing to remove QA schema marker: marker changed during cleanup");
  }
  unlinkSync(SCHEMA_MARKER);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    throw error;
  }
}

function createPgClient(databaseUrl: string) {
  return new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 4_000,
    statement_timeout: 4_000,
    query_timeout: 4_000,
  });
}

async function withClient<T>(databaseUrl: string, operation: (client: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const client = createPgClient(databaseUrl);
  await withTimeout("PostgreSQL connection", client.connect(), 5_000);
  try {
    return await operation(client);
  } finally {
    await withTimeout("PostgreSQL connection close", client.end(), 5_000);
  }
}

async function verifySchemaAbsent(databaseUrl: string, schema: string): Promise<void> {
  await withClient(databaseUrl, async (client) => {
    const result = await withTimeout(
      "PostgreSQL schema absence query",
      client.query("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present", [schema]),
      5_000,
    ) as { rows: Array<{ present: boolean }> };
    if (result.rows[0]?.present !== false) {
      throw new Error(`QA schema cleanup was not verified: ${schema} still exists or absence could not be confirmed`);
    }
  });
}

async function removeOwnedSchemaAndVerify(databaseUrl: string, schema: string): Promise<void> {
  await withClient(databaseUrl, async (client) => {
    await withTimeout("PostgreSQL schema drop and verification", dropSchemaAndVerifyAbsent(client, schema), 10_000);
  });
}

async function sweepPreviousRun(databaseUrl: string, expectedDatabase: string): Promise<void> {
  const rawMarker = readSecureMarker();
  if (rawMarker === null) return;
  await recoverMarkedSchema({
    rawMarker,
    expectedDatabase,
    isProcessAlive,
    removeOwnedSchemaAndVerify: async (schema) => removeOwnedSchemaAndVerify(databaseUrl, schema),
    removeMarker: () => removeMarkerIfUnchanged(rawMarker),
  });
  console.log("QA_RECOVERY_VERIFIED: previous owned schema absent and marker removed");
}

interface HarnessContext {
  schema: string;
  scopedPool: any;
  adminPool: any;
  cleanup: () => Promise<void>;
}

async function createHarnessContext(databaseUrl: string, database: string): Promise<{ ctx: HarnessContext; markerContent: string }> {
  const schema = `test_qa_${randomUUID().replaceAll("-", "")}`;
  const markerContent = JSON.stringify({
    version: 1,
    owner: MARKER_OWNER,
    schema,
    database,
    pid: process.pid,
    runId: randomUUID(),
  });
  // Claim the marker before creating any schema: a crash during CREATE/migration
  // leaves a provenance record that the next run can safely reconcile.
  writeFileSync(SCHEMA_MARKER, markerContent, { encoding: "utf8", flag: "wx", mode: 0o600 });

  const adminPool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 4_000 }) as any;
  let scopedPool: any;
  try {
    await withTimeout("PostgreSQL test database probe", adminPool.query("SELECT current_database()"), 5_000);
    await withTimeout("QA schema create", adminPool.query(`CREATE SCHEMA "${schema}"`), 5_000);
    scopedPool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}`, connectionTimeoutMillis: 4_000 }) as any;
    await withTimeout("QA schema migrations", applyMigrations(scopedPool), 15_000);
  } catch (error) {
    // Keep the marker until cleanup has independently succeeded. Fail closed if
    // either pool cannot close or the exact schema cannot be dropped/verified.
    try {
      if (scopedPool) await withTimeout("Scoped pool close after startup failure", scopedPool.end(), 5_000);
      await removeOwnedSchemaAndVerify(databaseUrl, schema);
      removeMarkerIfUnchanged(markerContent);
    } catch (cleanupError) {
      console.error("QA_STARTUP_CLEANUP_FAILED; marker preserved:", cleanupError);
    }
    try { await withTimeout("Admin pool close after startup failure", adminPool.end(), 5_000); } catch (closeError) {
      console.error("QA_STARTUP_POOL_CLOSE_FAILED:", closeError);
    }
    throw error;
  }

  return {
    markerContent,
    ctx: {
      schema,
      scopedPool,
      adminPool,
      cleanup: async () => {
        await withTimeout("Scoped pool close", scopedPool.end(), 5_000);
        await withTimeout("Admin pool close", adminPool.end(), 5_000);
        await removeOwnedSchemaAndVerify(databaseUrl, schema);
      },
    },
  };
}

async function cleanupContext(ctx: HarnessContext, databaseUrl: string, markerContent: string): Promise<void> {
  await finalizeSchemaCleanup({
    schema: ctx.schema,
    cleanup: () => ctx.cleanup(),
    verifyAbsent: (schema) => verifySchemaAbsent(databaseUrl, schema),
    removeMarker: () => removeMarkerIfUnchanged(markerContent),
    timeoutMs: CLEANUP_STEP_TIMEOUT_MS,
  });
  console.log(`QA_SCHEMA_CLEANUP_VERIFIED schema=${ctx.schema} marker_removed=true`);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required; browser API refuses an implicit database fallback");
  const { database } = validateTestDatabaseUrl(databaseUrl);
  await sweepPreviousRun(databaseUrl, database);

  let ctx: HarnessContext | null = null;
  let markerContent: string | null = null;
  let app: ReturnType<typeof createApp> | null = null;

  try {
    const setup = await createHarnessContext(databaseUrl, database);
    ctx = setup.ctx;
    markerContent = setup.markerContent;
    app = createApp({
      logger: false,
      pool: ctx.scopedPool,
      verifyAdminToken: async (header) => {
        if (header === "Bearer forbidden-token") {
          throw new DomainError(403, "insufficient_permissions");
        }
        if (header === "Bearer test-admin-token") {
          return { subject: "browser-admin-tester" };
        }
        throw new DomainError(401, "authentication_required");
      },
    });

    const address = await app.listen({ host: "127.0.0.1", port: API_PORT });
    console.log("FASTIFY_API_READY at", address);
  } catch (error) {
    console.error("Error starting test API:", error);
    if (ctx && markerContent !== null) {
      try {
        if (app) await withTimeout("API close after startup failure", app.close(), 3_000);
        await cleanupContext(ctx, databaseUrl, markerContent);
      } catch (cleanupError) {
        console.error("QA_STARTUP_CLEANUP_FAILED; marker preserved:", cleanupError);
      }
    }
    process.exitCode = 1;
    return;
  }

  if (!ctx || !app) throw new Error("Internal error: API startup completed without context");

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    const hardExit = setTimeout(() => {
      console.error("QA_SHUTDOWN_DEADLINE_EXCEEDED; schema marker preserved");
      process.exit(1);
    }, SHUTDOWN_DEADLINE_MS);
    try {
      await withTimeout("API shutdown", app!.close(), 5_000);
      await cleanupContext(ctx!, databaseUrl, markerContent!);
      clearTimeout(hardExit);
      process.exit(0);
    } catch (error) {
      console.error("QA_SCHEMA_CLEANUP_FAILED; schema marker preserved:", error);
      clearTimeout(hardExit);
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

main().catch((error) => {
  console.error("Fatal test API error:", error);
  process.exit(1);
});
