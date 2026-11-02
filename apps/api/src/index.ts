import { createApp } from "./app.js";
import { loadConfig, loadLogtoAdminConfig } from "./config.js";
import { createDatabasePool } from "./persistence/pool.js";
import { createLogtoAdminTokenVerifier } from "./platform/auth.js";

const config = loadConfig();
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required to start the API");
const pool = createDatabasePool(databaseUrl);
if (!pool) throw new Error("Unable to create PostgreSQL connection pool");

const logtoConfig = loadLogtoAdminConfig();
const verifyAdminToken = logtoConfig ? await createLogtoAdminTokenVerifier(logtoConfig) : undefined;
const app = createApp({
  pool,
  ...(verifyAdminToken ? { verifyAdminToken } : {}),
});
app.addHook("onClose", async () => pool.end());
if (!logtoConfig) {
  app.log.warn("Logto admin auth is not configured; admin writes will return 503");
}

try {
  await app.listen(config);
} catch (error) {
  app.log.error(error, "Unable to start API server");
  await app.close();
  process.exitCode = 1;
}
