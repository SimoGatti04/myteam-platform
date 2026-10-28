import { Pool } from "pg";

export function createDatabasePool(connectionString: string | undefined): Pool | undefined {
  if (!connectionString) return undefined;

  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    application_name: "myteam-platform-api",
  });
}
