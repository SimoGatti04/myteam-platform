import { isDeepStrictEqual } from "node:util";

export const SCHEMA_PATTERN = /^test_qa_[0-9a-f]{32}$/;
export const MARKER_OWNER = "myteam-platform-qa-browser-harness";

export interface SchemaMarker {
  version: 1;
  owner: typeof MARKER_OWNER;
  schema: string;
  database: string;
  pid: number;
  runId: string;
}

export interface QueryClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export function validateTestDatabaseUrl(raw: string): { url: URL; database: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!(["localhost", "127.0.0.1", "::1"].includes(hostname))) {
    throw new Error("Refusing QA schema cleanup: database host must be loopback");
  }
  if (!database || !database.endsWith("_test")) {
    throw new Error("Refusing QA schema cleanup: database name must end in _test");
  }
  return { url, database };
}

export function parseSchemaMarker(raw: string): SchemaMarker {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Refusing QA schema cleanup: marker is not valid JSON");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Refusing QA schema cleanup: marker must be an object");
  }
  const marker = value as Partial<SchemaMarker>;
  const expectedKeys = ["database", "owner", "pid", "runId", "schema", "version"];
  if (!isDeepStrictEqual(Object.keys(value).sort(), expectedKeys)) {
    throw new Error("Refusing QA schema cleanup: marker fields are not canonical");
  }
  if (marker.version !== 1 || marker.owner !== MARKER_OWNER) {
    throw new Error("Refusing QA schema cleanup: marker provenance is not recognized");
  }
  if (typeof marker.schema !== "string" || !SCHEMA_PATTERN.test(marker.schema)) {
    throw new Error("Refusing QA schema cleanup: marker schema name is invalid");
  }
  if (typeof marker.database !== "string" || !marker.database.endsWith("_test")) {
    throw new Error("Refusing QA schema cleanup: marker database is invalid");
  }
  if (!Number.isSafeInteger(marker.pid) || (marker.pid ?? 0) < 1) {
    throw new Error("Refusing QA schema cleanup: marker process ID is invalid");
  }
  if (typeof marker.runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marker.runId)) {
    throw new Error("Refusing QA schema cleanup: marker run ID is invalid");
  }
  return marker as SchemaMarker;
}

export async function withTimeout<T>(label: string, operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dropSchemaAndVerifyAbsent(client: QueryClient, schema: string): Promise<void> {
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new Error("Refusing QA schema cleanup: schema name failed strict validation");
  }
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  const result = await client.query(
    "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present",
    [schema],
  );
  if (result.rows[0]?.present !== false) {
    throw new Error(`QA schema cleanup was not verified: ${schema} still exists or could not be confirmed absent`);
  }
}

export async function finalizeSchemaCleanup(options: {
  schema: string;
  cleanup: () => Promise<void>;
  verifyAbsent: (schema: string) => Promise<void>;
  removeMarker: () => void;
  timeoutMs?: number;
}): Promise<void> {
  if (!SCHEMA_PATTERN.test(options.schema)) {
    throw new Error("Refusing QA schema cleanup: schema name failed strict validation");
  }
  const timeoutMs = options.timeoutMs ?? 8_000;
  await withTimeout("application shutdown", options.cleanup(), timeoutMs);
  await withTimeout("PostgreSQL schema absence verification", options.verifyAbsent(options.schema), timeoutMs);
  options.removeMarker();
}

export async function recoverMarkedSchema(options: {
  rawMarker: string;
  expectedDatabase: string;
  isProcessAlive: (pid: number) => boolean;
  removeOwnedSchemaAndVerify: (schema: string) => Promise<void>;
  removeMarker: () => void;
}): Promise<SchemaMarker> {
  const marker = parseSchemaMarker(options.rawMarker);
  if (marker.database !== options.expectedDatabase) {
    throw new Error("Refusing QA schema cleanup: marker belongs to a different test database");
  }
  if (options.isProcessAlive(marker.pid)) {
    throw new Error("Refusing QA schema cleanup: marker process is still active");
  }
  await options.removeOwnedSchemaAndVerify(marker.schema);
  options.removeMarker();
  return marker;
}
