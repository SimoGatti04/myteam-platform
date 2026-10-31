import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rawUrl = process.env.TEST_DATABASE_URL;
const schema = process.argv[2];
assert.ok(rawUrl, "TEST_DATABASE_URL is required");
assert.match(schema ?? "", /^test_qa_[0-9a-f]{32}$/);
const url = new URL(rawUrl);
assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, "")));
assert.ok(decodeURIComponent(url.pathname.slice(1)).endsWith("_test"));
const require = createRequire(import.meta.url);
const pgPath = require.resolve("pg", { paths: [fileURLToPath(new URL("../../apps/api", import.meta.url))] });
const { Client } = require(pgPath);
const client = new Client({ connectionString: rawUrl, connectionTimeoutMillis: 4_000, query_timeout: 4_000 });
await client.connect();
try {
  const result = await client.query("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS present", [schema]) as { rows: Array<{ present: boolean }> };
  assert.equal(result.rows[0]?.present, false, `schema ${schema} still exists or could not be confirmed absent`);
  console.log(`QA_SCHEMA_ABSENT_VERIFIED schema=${schema}`);
} finally {
  await client.end();
}
