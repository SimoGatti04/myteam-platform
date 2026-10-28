import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import { realisticSeasonFixture, realisticTeamProfileFixture } from "../fixtures/q1-realistic-fixtures.js";

test("9.1 Empty DB State: Initial query returns null team and empty seasons list", async () => {
  const { app, adminHeaders } = createTestApp();
  try {
    // 1. Initial admin team profile is null
    const teamRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
    });
    assert.equal(teamRes.statusCode, 200);
    assert.equal(teamRes.json(), null, "Initial team profile must be null on empty DB");

    // 2. Initial seasons list is empty array
    const seasonsRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
    });
    assert.equal(seasonsRes.statusCode, 200);
    assert.deepEqual(seasonsRes.json(), [], "Initial seasons list must be empty array");

    // 3. Initial matches and players lists are empty arrays
    const matchesRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
    });
    assert.equal(matchesRes.statusCode, 200);
    assert.deepEqual(matchesRes.json(), []);

    const playersRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
    });
    assert.equal(playersRes.statusCode, 200);
    assert.deepEqual(playersRes.json(), []);

    // 4. Public routes are completely isolated (404)
    const pubTeam = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(pubTeam.statusCode, 404);
    assert.equal(pubTeam.json().error, "public_team_not_found");

    const pubRoster = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(pubRoster.statusCode, 404);
    assert.equal(pubRoster.json().error, "public_team_not_found");

    const pubMatches = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubMatches.statusCode, 404);
    assert.equal(pubMatches.json().error, "public_team_not_found");
  } finally {
    await app.close();
  }
});

test("9.2 Onboarding Step 1: Create Season on empty DB", async () => {
  const { app, adminHeaders } = createTestApp();
  try {
    // Creazione prima stagione
    const createSeasonRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    assert.equal(createSeasonRes.statusCode, 201);
    const season = createSeasonRes.json<{ id: string; label: string; startsOn: string; endsOn: string }>();
    assert.equal(season.label, realisticSeasonFixture.label);
    assert.equal(season.startsOn, realisticSeasonFixture.startsOn);
    assert.equal(season.endsOn, realisticSeasonFixture.endsOn);

    // Ora GET /admin/seasons restituisce la stagione
    const listRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
    });
    assert.equal(listRes.statusCode, 200);
    const list = listRes.json<Array<{ id: string }>>();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, season.id);
  } finally {
    await app.close();
  }
});

test("9.3 Onboarding Step 2: Configure and publish Team with the created season", async () => {
  const { app, adminHeaders } = createTestApp();
  try {
    // 1. Crea stagione
    const sRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    const seasonId = sRes.json<{ id: string }>().id;

    // 2. Configura Team collegando la stagione
    const configRes = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
        primaryColor: realisticTeamProfileFixture.primaryColor,
        secondaryColor: realisticTeamProfileFixture.secondaryColor,
        currentSeasonId: seasonId,
      },
    });
    assert.equal(configRes.statusCode, 200);
    const configured = configRes.json<{ name: string; currentSeasonId: string; publishedAt: string | null }>();
    assert.equal(configured.name, realisticTeamProfileFixture.name);
    assert.equal(configured.currentSeasonId, seasonId);
    assert.equal(configured.publishedAt, null, "Team starts unpublished");

    // 3. Pubblica il Team
    const pubRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/team/publish",
      headers: adminHeaders,
    });
    assert.equal(pubRes.statusCode, 200);
    const published = pubRes.json<{ publishedAt: string | null }>();
    assert.ok(published.publishedAt !== null, "publishedAt must be set");

    // 4. Ora le proiezioni pubbliche sono disponibili
    const pubTeam = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(pubTeam.statusCode, 200);
    assert.equal(pubTeam.json<{ name: string }>().name, realisticTeamProfileFixture.name);

    const pubRoster = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(pubRoster.statusCode, 200);
    assert.deepEqual(pubRoster.json<{ players: unknown[] }>().players, []);

    const pubMatches = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubMatches.statusCode, 200);
    assert.deepEqual(pubMatches.json<{ scheduled: unknown[] }>().scheduled, []);
  } finally {
    await app.close();
  }
});
