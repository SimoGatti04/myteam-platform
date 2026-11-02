import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../../../../db/migrations/", import.meta.url));

interface AppliedMigrationRow {
  name: string;
  checksum: string;
}

export async function applyMigrations(
  pool: Pool,
  migrationsDirectory = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{4}-[a-z0-9-]+\.sql$/.test(name))
    .sort();
  if (files.length === 0) throw new Error(`No SQL migrations found in ${migrationsDirectory}`);

  const client = await pool.connect();
  const appliedNow: string[] = [];
  let lockTaken = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", ["myteam-platform:migrations"]);
    lockTaken = true;
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const rows = await client.query<AppliedMigrationRow>("SELECT name, checksum FROM schema_migrations");
    const applied = new Map(rows.rows.map((row) => [row.name, row.checksum.trim()]));

    for (const name of files) {
      const sql = await readFile(join(migrationsDirectory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previousChecksum = applied.get(name);
      if (previousChecksum !== undefined) {
        if (previousChecksum !== checksum) {
          throw new Error(`Applied migration ${name} changed; add a new migration instead`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
        await client.query("COMMIT");
        appliedNow.push(name);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return appliedNow;
  } finally {
    if (lockTaken) {
      try {
        await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", ["myteam-platform:migrations"]);
      } catch {
        // Closing the connection also releases the session-scoped migration lock.
      }
    }
    client.release();
  }
}
