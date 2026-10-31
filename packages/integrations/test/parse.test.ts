import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCompetitionPage } from "../src/csi/parse.js";
import { CSI_PROFILE_V0 } from "../src/csi/profile.js";
import { fixture, snapshotFromFixture, testParseContext } from "./helpers.js";

const context = testParseContext;

test("parses teams, logos and drops non-HTTPS crest URLs", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), context());
  assert.equal(parsed.teams.length, 8);
  const alfa = parsed.teams.find((team) => team.csiTeamId === "S101");
  assert.ok(alfa !== undefined);
  assert.equal(alfa.name, "Squadra Alfa");
  assert.equal(alfa.logoUrl, "https://static.example.invalid/crest/s101.png");

  const eta = parsed.teams.find((team) => team.csiTeamId === "S107");
  assert.ok(eta !== undefined);
  assert.equal(eta.logoUrl, null);
  assert.ok(parsed.diagnostics.some((entry) => entry.code === "team_logo_ignored"));
});

test("parses matchdays, kickoff, venue, score and result status", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), context());
  assert.equal(parsed.matches.length, 6);

  const byId = new Map(parsed.matches.map((match) => [match.csiMatchId, match] as const));

  const unofficial = byId.get("P2025101AA0101");
  assert.ok(unofficial !== undefined);
  assert.equal(unofficial.resultStatus, "unofficial");
  assert.deepEqual(unofficial.score, { home: 3, away: 1 });
  assert.equal(unofficial.kickoff?.iso, "2025-10-11T16:30:00+02:00");
  assert.equal(unofficial.venue, "Palestra Comunale — Via Roma 1");
  assert.equal(unofficial.idConfidence, "observed");

  const official = byId.get("P2025101AA0102");
  assert.equal(official?.resultStatus, "official");

  const scheduled = byId.get("P2025101AA0103");
  assert.equal(scheduled?.resultStatus, "scheduled");
  assert.equal(scheduled?.score, null);
  assert.equal(scheduled?.kickoff?.iso, "2025-10-25T20:45:00+02:00");

  const postponed = byId.get("P2025101AA0104");
  assert.equal(postponed?.resultStatus, "postponed");
  assert.equal(postponed?.kickoff?.time, null);

  const inferred = byId.get("P2025101AA0105");
  assert.equal(inferred?.resultStatus, "unofficial");
  assert.ok(inferred?.statusHints.includes("inferred:no-marker"));

  const noDate = byId.get("P2025101AA0106");
  assert.equal(noDate?.kickoff, null);
  assert.equal(noDate?.resultStatus, "unknown");
});

test("parses the full standings table without inventing missing columns", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), context());
  assert.equal(parsed.standings.length, 8);
  assert.equal(parsed.standingsStatus, "unofficial");
  const first = parsed.standings[0];
  assert.ok(first !== undefined);
  assert.equal(first.position, 1);
  assert.equal(first.team.name, "Squadra Alfa");
  assert.equal(first.team.csiTeamId, "S101");
  assert.equal(first.points, 6);
  assert.equal(first.played, 3);
  assert.equal(first.goalDifference, 4);
  assert.ok(parsed.diagnostics.some((entry) => entry.code === "standings_not_official"));
});

test("emits diagnostics for incomplete rows instead of guessing", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), context());
  const codes = new Set(parsed.diagnostics.map((entry) => entry.code));
  assert.ok(codes.has("match_row_incomplete"));
  assert.ok(codes.has("match_date_missing"));
  assert.ok(codes.has("result_status_inferred_unofficial"));
  assert.ok(!codes.has("duplicate_match_identifier"));
});

test("title and group label come from the page", () => {
  const parsed = parseCompetitionPage(fixture("competition-sample.html"), context());
  assert.equal(parsed.competitionTitle, "Calcio a 5 — Dilettanti A 5 — Girone B (fixture sintetica)");
  assert.equal(parsed.groupLabel, "Dilettanti A 5 Gruppo C / B");
});

test("malformed pages produce errors, duplicates are rejected and no fabrication happens", () => {
  const parsed = parseCompetitionPage(fixture("malformed.html"), context());
  assert.equal(parsed.matches.length, 2);
  assert.ok(parsed.diagnostics.some((entry) => entry.code === "duplicate_match_identifier" && entry.severity === "error"));
  assert.ok(parsed.diagnostics.some((entry) => entry.code === "match_date_missing"));
  assert.equal(parsed.standingsStatus, "absent");
});

test("snapshot keeps provenance and digest is content-based", () => {
  const a = snapshotFromFixture("competition-sample.html", "2025-10-01T08:00:00.000Z");
  const b = snapshotFromFixture("competition-sample.html", "2025-10-02T09:00:00.000Z");
  assert.equal(a.digest, b.digest);
  assert.notEqual(a.fetchedAt, b.fetchedAt);
  assert.equal(a.locator.competitionSegment, "C203");
  assert.equal(a.locator.sourceId, "csi-live");
  assert.equal(a.parserProfile.id, CSI_PROFILE_V0.id);
  assert.ok(a.warnings.length > 0);
});
