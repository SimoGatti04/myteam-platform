import assert from "node:assert/strict";
import { test } from "node:test";
import { createTeamMatcher, type LocalTeam } from "../src/csi/matching.js";

const LOCAL: LocalTeam[] = [
  { localId: "t-alfa", name: "Squadra Alfa" },
  { localId: "t-beta", name: "Squadra Beta", aliases: ["Beta Calcio a 5"] },
  { localId: "t-aurora-1", name: "Aurora" },
  { localId: "t-aurora-2", name: "Aurora" },
];

test("confirmed CSI id bindings win over names", () => {
  const matcher = createTeamMatcher(LOCAL, { csiIdMap: { S999: "t-beta" } });
  const result = matcher.match({ csiTeamId: "S999", name: "Nome cambiato", logoUrl: null });
  assert.deepEqual(result, { status: "matched", localId: "t-beta", reason: "csi-id" });
});

test("stale bindings fall back to name matching", () => {
  const matcher = createTeamMatcher(LOCAL, { csiIdMap: { S999: "missing-local" } });
  const result = matcher.match({ csiTeamId: "S999", name: "Squadra Alfa", logoUrl: null });
  assert.deepEqual(result, { status: "matched", localId: "t-alfa", reason: "exact" });
});

test("explicit aliases are honoured", () => {
  const matcher = createTeamMatcher(LOCAL);
  const result = matcher.match({ csiTeamId: null, name: "Beta Calcio a 5", logoUrl: null });
  assert.deepEqual(result, { status: "matched", localId: "t-beta", reason: "alias" });
});

test("homonymous local teams are ambiguous, never guessed", () => {
  const matcher = createTeamMatcher(LOCAL);
  const result = matcher.match({ csiTeamId: null, name: "A.S.D. Aurora", logoUrl: null });
  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") {
    assert.deepEqual(result.candidates.map((candidate) => candidate.localId), ["t-aurora-1", "t-aurora-2"]);
  }
});

test("similar but not identical names require a human decision", () => {
  const matcher = createTeamMatcher([
    { localId: "l1", name: "Polisportiva Alfa Calcio" },
    { localId: "l2", name: "Polisportiva Alfa" },
  ]);
  const result = matcher.match({ csiTeamId: null, name: "Polisportiva Alfa", logoUrl: null });
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.localId, "l2");

  const weak = matcher.match({ csiTeamId: null, name: "Polisportiva Beta", logoUrl: null });
  assert.equal(weak.status, "unmatched");
});

test("unknown teams are unmatched, not created implicitly", () => {
  const matcher = createTeamMatcher(LOCAL);
  assert.deepEqual(matcher.match({ csiTeamId: null, name: "Squadra Omega", logoUrl: null }), { status: "unmatched" });
});
