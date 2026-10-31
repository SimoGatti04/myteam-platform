import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSnapshots } from "../src/csi/diff.js";
import { buildImportPlan } from "../src/csi/import-plan.js";
import { createTeamMatcher, type LocalTeam } from "../src/csi/matching.js";
import { snapshotFromFixture } from "./helpers.js";

const LOCAL: LocalTeam[] = [
  { localId: "t-alfa", name: "Squadra Alfa" },
  { localId: "t-beta", name: "Squadra Beta" },
];

function baseline() {
  const snapshot = snapshotFromFixture("competition-sample.html");
  return { snapshot, diff: diffSnapshots(null, snapshot), matcher: createTeamMatcher(LOCAL) };
}

test("baseline import never publishes unconfirmed or unofficial data", () => {
  const { snapshot, diff, matcher } = baseline();
  const plan = buildImportPlan({ snapshot, diff, matcher });

  assert.equal(plan.requiresConfirmation, true);
  assert.ok(plan.matches.length > 0);
  for (const intent of plan.matches) {
    assert.equal(intent.action, "create");
    assert.equal(intent.publication === "none" || intent.publication.startsWith("blocked-"), true);
  }

  const official = plan.matches.find((intent) => intent.key === "id:P2025101AA0102");
  assert.equal(official?.publication, "blocked-unconfirmed");

  const unofficial = plan.matches.find((intent) => intent.key === "id:P2025101AA0101");
  assert.equal(unofficial?.publication, "blocked-unofficial");

  assert.equal(plan.standings.action, "manual-review");
  assert.equal(plan.standings.publication, "blocked-unofficial");

  const linked = plan.teams.find((intent) => intent.csiId === "S101");
  assert.equal(linked?.action, "link");
  assert.equal(linked?.localId, "t-alfa");

  const created = plan.teams.find((intent) => intent.csiId === "S103");
  assert.equal(created?.action, "create");
  assert.ok(created?.reasons.includes("unconfirmed-new-team"));
});

test("ambiguous teams become conflicts that block the import", () => {
  const { snapshot, diff } = baseline();
  const matcher = createTeamMatcher([
    ...LOCAL,
    { localId: "g1", name: "Squadra Gamma" },
    { localId: "g2", name: "Squadra Gamma" },
  ]);
  const plan = buildImportPlan({ snapshot, diff, matcher });
  const conflict = plan.teams.find((intent) => intent.csiId === "S103");
  assert.equal(conflict?.action, "conflict");
  assert.equal(conflict?.publication, "blocked-unconfirmed");
  assert.ok(conflict?.reasons.includes("ambiguous-local-team"));
  assert.equal(conflict?.localId, null);
  assert.ok(plan.diagnostics.some((entry) => entry.code === "team_ambiguous"));
});

test("administrative overrides are never overwritten", () => {
  const before = snapshotFromFixture("competition-sample.html");
  const after = snapshotFromFixture("competition-sample-round2.html");
  const diff = diffSnapshots(before, after);
  const plan = buildImportPlan({
    snapshot: after,
    diff,
    matcher: createTeamMatcher(LOCAL),
    overrides: { protectedMatchKeys: ["id:P2025101AA0101"], protectedTeamLocalIds: ["t-alfa"] },
  });

  const protectedMatch = plan.matches.find((intent) => intent.key === "id:P2025101AA0101");
  assert.equal(protectedMatch?.action, "skip-protected");
  assert.ok(protectedMatch?.reasons.includes("match-protected-by-admin"));

  const protectedTeam = plan.teams.find((intent) => intent.localId === "t-alfa");
  assert.equal(protectedTeam?.action, "skip-protected");

  const locked = buildImportPlan({ snapshot: after, diff, matcher: createTeamMatcher(LOCAL), overrides: { competitionLocked: true } });
  assert.equal(locked.competition.action, "skip-protected");
  assert.ok(locked.matches.every((intent) => intent.action === "skip-protected"));
});

test("removed matches are conflicts, never automatic deletions", () => {
  const before = snapshotFromFixture("competition-sample.html");
  const after = snapshotFromFixture("competition-sample-round2.html");
  const plan = buildImportPlan({ snapshot: after, diff: diffSnapshots(before, after), matcher: createTeamMatcher(LOCAL) });
  const removed = plan.matches.find((intent) => intent.key === "id:P2025101AA0105");
  assert.equal(removed?.action, "conflict");
  assert.ok(removed?.reasons.includes("never-delete-automatically"));
  assert.equal(removed?.publication, "none");
});

test("a homologated result reverting to unofficial requires manual review", () => {
  const officialSnapshot = snapshotFromFixture("competition-sample-round2.html");
  const older = snapshotFromFixture("competition-sample.html");
  const plan = buildImportPlan({ snapshot: older, diff: diffSnapshots(officialSnapshot, older), matcher: createTeamMatcher(LOCAL) });
  const reverted = plan.matches.find((intent) => intent.key === "id:P2025101AA0101");
  assert.equal(reverted?.action, "manual-review");
  assert.ok(reverted?.reasons.includes("requires-manual-review"));
});

test("identical snapshots produce no match intents and a stable plan digest", () => {
  const snapshot = snapshotFromFixture("competition-sample.html");
  const diff = diffSnapshots(snapshot, snapshot);
  const matcher = createTeamMatcher(LOCAL);
  const first = buildImportPlan({ snapshot, diff, matcher });
  const second = buildImportPlan({ snapshot, diff, matcher });
  assert.equal(first.matches.length, 0);
  assert.equal(first.planDigest, second.planDigest);
  assert.equal(first.requiresConfirmation, false);
  assert.equal(first.standings.action, "noop");
});
