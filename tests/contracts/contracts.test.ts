import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typeboxPath = require.resolve("@sinclair/typebox", {
  paths: [new URL("../../packages/contracts", import.meta.url).pathname],
});
const valuePath = typeboxPath.replace(/index\.js$/, "value/index.js");
const { FormatRegistry } = require(typeboxPath);
const { Value } = require(valuePath);

// Register standard formats if not present in typebox default registry
if (!FormatRegistry.Has("date")) {
  FormatRegistry.Set("date", (val: string) => /^\d{4}-\d{2}-\d{2}$/.test(val));
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (val: string) => !isNaN(Date.parse(val)));
}
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (val: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
  );
}

import {
  AdminTeamSchema,
  CompetitionCategorySchema,
  MatchCreateRequestSchema,
  MatchSchedulePatchRequestSchema,
  MatchStatusSchema,
  PublicMatchesSchema,
  PublicRosterSchema,
  PublicTeamSchema,
  SeasonCreateRequestSchema,
  TeamConfigurationRequestSchema,
} from "../../packages/contracts/src/index.js";

test("Contracts: SeasonCreateRequestSchema validates labels and dates", () => {
  const valid = { label: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-06-30" };
  assert.ok(Value.Check(SeasonCreateRequestSchema, valid));

  const invalid = { label: "", startsOn: "invalid-date", endsOn: "2027-06-30" };
  assert.equal(Value.Check(SeasonCreateRequestSchema, invalid), false);
});

test("Contracts: TeamConfigurationRequestSchema requires at least 1 property and enforces color hex patterns", () => {
  const valid = { primaryColor: "#1E3A8A", secondaryColor: "#F59E0B" };
  assert.ok(Value.Check(TeamConfigurationRequestSchema, valid));

  // Lowercase hex is valid in pattern
  assert.ok(Value.Check(TeamConfigurationRequestSchema, { primaryColor: "#ffffff" }));

  // Invalid hex pattern
  assert.equal(Value.Check(TeamConfigurationRequestSchema, { primaryColor: "red" }), false);
  assert.equal(Value.Check(TeamConfigurationRequestSchema, { primaryColor: "#FFF" }), false);
  assert.equal(Value.Check(TeamConfigurationRequestSchema, { primaryColor: "#1234567" }), false);

  // Empty object rejected (minProperties: 1)
  assert.equal(Value.Check(TeamConfigurationRequestSchema, {}), false);
});

test("Contracts: MatchStatus and CompetitionCategory enums match domain specs", () => {
  for (const s of ["scheduled", "to_be_scheduled", "postponed", "cancelled", "completed"]) {
    assert.ok(Value.Check(MatchStatusSchema, s), `Status ${s} should be valid`);
  }
  assert.equal(Value.Check(MatchStatusSchema, "unknown_status"), false);

  for (const c of ["league", "cup", "tournament", "friendly", "other"]) {
    assert.ok(Value.Check(CompetitionCategorySchema, c), `Category ${c} should be valid`);
  }
  assert.equal(Value.Check(CompetitionCategorySchema, "playoffs"), false);
});

test("Contracts: Public schema contracts do not expose administrative fields", () => {
  // PublicTeamSchema requires name and crestUrl
  const publicTeamSample = {
    name: "ASD Real Aurora",
    crestUrl: "https://example.com/crest.png",
    primaryColor: "#1E3A8A",
    secondaryColor: "#F59E0B",
    currentSeason: null,
  };
  assert.ok(Value.Check(PublicTeamSchema, publicTeamSample));

  // AdminTeamSchema has id, publishedAt, etc.
  const adminTeamSample = {
    id: 1,
    name: "ASD Real Aurora",
    crestUrl: "https://example.com/crest.png",
    primaryColor: "#1E3A8A",
    secondaryColor: "#F59E0B",
    currentSeasonId: "00000000-0000-0000-0000-000000000001",
    publishedAt: "2026-09-01T10:00:00.000Z",
  };
  assert.ok(Value.Check(AdminTeamSchema, adminTeamSample));
});
