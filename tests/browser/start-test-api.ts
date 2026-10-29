import { createApp } from "../../apps/api/src/app.js";
import { createScopedPostgresContext } from "../helpers/pg-test-helper.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createRequire } from "node:module";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_PORT = Number(process.env.QA_TEST_API_PORT ?? 3000);
// Marker che sopravvive a un arresto non grazioso (SIGKILL, crash): permette di
// rimuovere al riavvio uno schema lasciato orfano dalla sessione precedente.
const SCHEMA_MARKER = join(tmpdir(), `myteam-qa-test-api-${API_PORT}.schema`);

/**
 * Rimuove lo schema lasciato da una esecuzione precedente terminata senza cleanup.
 * Opera solo sullo schema annotato dal marker di questo script: nessuna cancellazione
 * indiscriminata di schemi altrui.
 */
async function sweepPreviousRun(databaseUrl: string): Promise<void> {
  if (!existsSync(SCHEMA_MARKER)) return;
  const previous = readFileSync(SCHEMA_MARKER, "utf8").trim();
  if (!/^test_qa_[0-9a-f]{32}$/.test(previous)) {
    console.warn("Marker schema non valido: sweep ignorato");
    return;
  }
  const require = createRequire(import.meta.url);
  const pgPath = require.resolve("pg", { paths: [new URL("../../apps/api", import.meta.url).pathname] });
  const { Client } = require(pgPath);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${previous}" CASCADE`);
    console.log(`QA sweep: schema orfano rimosso (${previous})`);
  } catch (err: any) {
    console.warn(`QA sweep non riuscito per ${previous}: ${err?.message ?? err}`);
  } finally {
    await client.end().catch(() => {});
  }
  try { unlinkSync(SCHEMA_MARKER); } catch {}
}

async function main() {
  if (process.env.TEST_DATABASE_URL) {
    await sweepPreviousRun(process.env.TEST_DATABASE_URL);
  }

  const ctx = await createScopedPostgresContext();
  if (!ctx) {
    console.error("No PostgreSQL context");
    process.exit(1);
  }
  writeFileSync(SCHEMA_MARKER, ctx.schema, "utf8");

  const app = createApp({
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
    }
  });

  const address = await app.listen({ host: "127.0.0.1", port: API_PORT });
  console.log("FASTIFY_API_READY at", address);

  // Shutdown idempotente: un secondo Ctrl+C non deve interrompere il cleanup dello schema.
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Rete di sicurezza: se il cleanup si blocca, esce comunque dopo 15 s.
    const hardExit = setTimeout(() => process.exit(1), 15_000);
    hardExit.unref();
    try {
      await Promise.race([
        app.close(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ]);
    } catch {}
    try {
      await ctx.cleanup();
    } catch {}
    try { unlinkSync(SCHEMA_MARKER); } catch {}
    clearTimeout(hardExit);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}

main().catch(err => {
  console.error("Error starting test API:", err);
  process.exit(1);
});
