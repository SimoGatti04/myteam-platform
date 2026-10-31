import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeTeamName,
  parseInteger,
  parsePublishedDate,
  parsePublishedTime,
  parseScore,
  seasonLabelFromSegment,
  toIsoKickoff,
  tokenSimilarity,
} from "../src/csi/normalize.js";

test("season labels follow the configured convention, overrides always win", () => {
  assert.equal(seasonLabelFromSegment("25", "start-year"), "2025/26");
  assert.equal(seasonLabelFromSegment("25", "end-year"), "2024/25");
  assert.equal(seasonLabelFromSegment("2025", "start-year"), "2025/26");
  assert.equal(seasonLabelFromSegment("25", "explicit"), null);
  assert.equal(seasonLabelFromSegment("25", "explicit", { "25": "2025/26" }), "2025/26");
  assert.equal(seasonLabelFromSegment("25", "start-year", { "25": "2024/25" }), "2024/25");
  assert.equal(seasonLabelFromSegment("xx", "start-year"), null);
});

test("kickoff ISO conversion honours Europe/Rome DST", () => {
  assert.equal(toIsoKickoff("2025-10-11", "16:30", "Europe/Rome"), "2025-10-11T16:30:00+02:00");
  assert.equal(toIsoKickoff("2025-12-06", "18:00", "Europe/Rome"), "2025-12-06T18:00:00+01:00");
  assert.equal(toIsoKickoff("2026-03-29", "03:30", "Europe/Rome"), "2026-03-29T03:30:00+02:00");
  assert.equal(toIsoKickoff("2025-10-11", null, "Europe/Rome"), "2025-10-11T00:00:00+02:00");
});

test("impossible dates and times are rejected instead of rolled over", () => {
  assert.equal(toIsoKickoff("2025-02-31", "18:00", "Europe/Rome"), null);
  assert.equal(toIsoKickoff("2025-10-11", "25:00", "Europe/Rome"), null);
  assert.equal(parsePublishedDate("31/02/2025"), null);
  assert.equal(parsePublishedDate("29/02/2024"), "2024-02-29");
  assert.equal(parsePublishedDate("11.10.25"), "2025-10-11");
  assert.equal(parsePublishedTime("18.30"), "18:30");
  assert.equal(parsePublishedTime(""), null);
});

test("scores and integers parse defensively", () => {
  assert.deepEqual(parseScore("3 - 1"), { home: 3, away: 1 });
  assert.deepEqual(parseScore("2–2"), { home: 2, away: 2 });
  assert.equal(parseScore("rinviata"), null);
  assert.equal(parseInteger("+12"), 12);
  assert.equal(parseInteger("-4"), -4);
  assert.equal(parseInteger(""), null);
});

test("team names are compared without legal forms or diacritics", () => {
  assert.equal(normalizeTeamName("A.S.D. Squadra  Alfa"), "squadra alfa");
  assert.equal(normalizeTeamName("Polisportiva Città di Bergamo"), "polisportiva citta di bergamo");
  assert.ok(tokenSimilarity("Squadra Alfa", "Squadra Alfa") === 1);
  assert.ok(tokenSimilarity("Squadra Alfa", "Squadra Beta") < 0.6);
});
