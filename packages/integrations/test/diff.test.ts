import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSnapshots } from "../src/csi/diff.js";
import { snapshotFromFixture, testLocator } from "./helpers.js";
import { parseCompetitionPage, snapshotFromParsed } from "../src/csi/parse.js";
import { CSI_PROFILE_V0 } from "../src/csi/profile.js";
import { createSnapshot } from "../src/csi/snapshot.js";

test("re-importing identical content is idempotent", () => {
  const first = snapshotFromFixture("competition-sample.html");
  const second = snapshotFromFixture("competition-sample.html");
  const diff = diffSnapshots(first, second);
  assert.equal(diff.identical, true);
  assert.deepEqual(diff.matchAdded, []);
  assert.deepEqual(diff.matchRemoved, []);
  assert.deepEqual(diff.matchUpdated, []);
  assert.equal(diff.standingsChanged, false);
});

test("detects added, removed, promoted, rescheduled and relocated matches", () => {
  const before = snapshotFromFixture("competition-sample.html");
  const after = snapshotFromFixture("competition-sample-round2.html");
  const diff = diffSnapshots(before, after);

  assert.equal(diff.identical, false);
  assert.deepEqual(diff.matchAdded, ["id:P2025101AA0306"]);
  assert.deepEqual(diff.matchRemoved, ["id:P2025101AA0105"]);
  assert.ok(diff.teamAdded.includes("S109"));
  assert.equal(diff.standingsChanged, true);

  const promoted = diff.matchUpdated.find((update) => update.key === "id:P2025101AA0101");
  assert.ok(promoted !== undefined);
  assert.deepEqual(promoted.changes, ["status-promoted"]);

  const moved = diff.matchUpdated.find((update) => update.key === "id:P2025101AA0102");
  assert.ok(moved !== undefined);
  assert.deepEqual(moved.changes, ["rescheduled", "venue"]);

  const codes = diff.diagnostics.map((entry) => entry.code);
  assert.ok(codes.includes("matches_disappeared"));
  assert.ok(codes.includes("teams_disappeared") === false);
});

test("a homologated result reverting to unofficial is flagged as an error", () => {
  const officialSnapshot = snapshotFromFixture("competition-sample-round2.html");
  const olderSnapshot = snapshotFromFixture("competition-sample.html");
  const diff = diffSnapshots(officialSnapshot, olderSnapshot);
  const reverted = diff.matchUpdated.find((update) => update.key === "id:P2025101AA0101");
  assert.ok(reverted !== undefined);
  assert.ok(reverted.changes.includes("status-regressed"));
  assert.ok(diff.diagnostics.some((entry) => entry.code === "official_result_reverted" && entry.severity === "error"));
});

test("a null baseline marks every row as new", () => {
  const snapshot = snapshotFromFixture("competition-sample.html");
  const diff = diffSnapshots(null, snapshot);
  assert.equal(diff.matchAdded.length, snapshot.matches.length);
  assert.equal(diff.matchRemoved.length, 0);
});

test("snapshots from different competition URLs are rejected", () => {
  const locator = testLocator({ url: "https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lombardia/Bergamo/C204/" });
  const ctx = {
    profile: CSI_PROFILE_V0,
    baseUrl: locator.url,
    timeZone: "Europe/Rome",
    referenceDate: "2025-10-01",
    locator,
  };
  const other = createSnapshot(snapshotFromParsed(parseCompetitionPage('<table class="calendario"><tbody></tbody></table>', ctx), ctx, "2025-10-01T08:00:00.000Z"));
  const diff = diffSnapshots(snapshotFromFixture("competition-sample.html"), other);
  assert.ok(diff.diagnostics.some((entry) => entry.code === "snapshot_locator_changed" && entry.severity === "error"));
});
