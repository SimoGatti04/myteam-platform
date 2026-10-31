import assert from "node:assert/strict";
import test from "node:test";
import {
  dropSchemaAndVerifyAbsent,
  finalizeSchemaCleanup,
  MARKER_OWNER,
  parseSchemaMarker,
  recoverMarkedSchema,
  validateTestDatabaseUrl,
} from "./schema-cleanup.js";

const schema = `test_qa_${"a".repeat(32)}`;
const marker = JSON.stringify({
  version: 1,
  owner: MARKER_OWNER,
  schema,
  database: "qa_test",
  pid: 424242,
  runId: "b1f4ea7b-6421-4b62-8500-40d7a39f9303",
});

test("cleanup success drops the exact owned schema, verifies absence, then removes marker", async () => {
  const order: string[] = [];
  await finalizeSchemaCleanup({
    schema,
    cleanup: async () => { order.push("cleanup"); },
    verifyAbsent: async (value) => { assert.equal(value, schema); order.push("verify"); },
    removeMarker: () => { order.push("marker"); },
  });
  assert.deepEqual(order, ["cleanup", "verify", "marker"]);
});

test("cleanup exception fails and preserves marker", async () => {
  let markerRemoved = false;
  await assert.rejects(finalizeSchemaCleanup({
    schema,
    cleanup: async () => { throw new Error("DROP denied"); },
    verifyAbsent: async () => { assert.fail("verification must not run after cleanup failure"); },
    removeMarker: () => { markerRemoved = true; },
  }), /DROP denied/);
  assert.equal(markerRemoved, false);
});

test("unavailable PostgreSQL verification fails and preserves marker", async () => {
  let markerRemoved = false;
  await assert.rejects(finalizeSchemaCleanup({
    schema,
    cleanup: async () => {},
    verifyAbsent: async () => { throw new Error("ECONNREFUSED"); },
    removeMarker: () => { markerRemoved = true; },
  }), /ECONNREFUSED/);
  assert.equal(markerRemoved, false);
});

test("cleanup timeout is finite, fails, and preserves marker", async () => {
  let markerRemoved = false;
  await assert.rejects(finalizeSchemaCleanup({
    schema,
    cleanup: () => new Promise<void>(() => {}),
    verifyAbsent: async () => {},
    removeMarker: () => { markerRemoved = true; },
    timeoutMs: 15,
  }), /timed out after 15ms/);
  assert.equal(markerRemoved, false);
});

test("invalid marker and non-test database are rejected without cleanup", async () => {
  assert.throws(() => parseSchemaMarker("test_qa_" + "a".repeat(32)), /valid JSON/);
  assert.throws(() => validateTestDatabaseUrl("postgresql://localhost/prod"), /must end in _test/);
  let deleted = false;
  await assert.rejects(recoverMarkedSchema({
    rawMarker: "{}",
    expectedDatabase: "qa_test",
    isProcessAlive: () => false,
    removeOwnedSchemaAndVerify: async () => { deleted = true; },
    removeMarker: () => { deleted = true; },
  }), /marker fields are not canonical/);
  assert.equal(deleted, false);
});

test("recovery refuses a live owner and a mismatched database; failed recovery retains marker", async () => {
  let markerRemoved = false;
  let schemaRemoved = false;
  await assert.rejects(recoverMarkedSchema({
    rawMarker: marker,
    expectedDatabase: "qa_test",
    isProcessAlive: () => true,
    removeOwnedSchemaAndVerify: async () => { schemaRemoved = true; },
    removeMarker: () => { markerRemoved = true; },
  }), /process is still active/);
  await assert.rejects(recoverMarkedSchema({
    rawMarker: marker,
    expectedDatabase: "another_test",
    isProcessAlive: () => false,
    removeOwnedSchemaAndVerify: async () => { schemaRemoved = true; },
    removeMarker: () => { markerRemoved = true; },
  }), /different test database/);
  await assert.rejects(recoverMarkedSchema({
    rawMarker: marker,
    expectedDatabase: "qa_test",
    isProcessAlive: () => false,
    removeOwnedSchemaAndVerify: async () => { throw new Error("schema still exists"); },
    removeMarker: () => { markerRemoved = true; },
  }), /schema still exists/);
  assert.equal(schemaRemoved, false);
  assert.equal(markerRemoved, false);
});

test("DROP SCHEMA is not enough: absence query must return false", async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      return calls.length === 1 ? { rows: [] } : { rows: [{ present: true }] };
    },
  };
  await assert.rejects(dropSchemaAndVerifyAbsent(client, schema), /still exists/);
  assert.match(calls[0].sql, new RegExp(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`));
  assert.deepEqual(calls[1].values, [schema]);
});
