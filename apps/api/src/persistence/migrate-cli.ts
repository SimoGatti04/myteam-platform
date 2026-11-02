import { createDatabasePool } from "./pool.js";
import { applyMigrations } from "./migrate.js";

async function main(): Promise<void> {
  const pool = createDatabasePool(process.env.DATABASE_URL);
  if (!pool) throw new Error("DATABASE_URL is required to apply migrations");

  try {
    const applied = await applyMigrations(pool);
    if (applied.length === 0) {
      console.info("Database schema is already up to date.");
    } else {
      console.info(`Applied migrations: ${applied.join(", ")}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
