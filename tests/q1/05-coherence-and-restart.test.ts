import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../../apps/api/src/app.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createTestDatabase } from "../helpers/test-db.js";
import {
  realisticCompetitionsFixture,
  realisticOpponentsFixture,
  realisticSeasonFixture,
  realisticTeamProfileFixture,
} from "../fixtures/q1-realistic-fixtures.js";

const adminVerifier = async (h?: string) => {
  if (h === "Bearer admin") return { subject: "admin-actor" };
  throw new DomainError(401, "authentication_required");
};

const adminHeaders = { authorization: "Bearer admin" };

test("5.1 Competition category validation: accepts valid categories and rejects invalid", async () => {
  const db = createTestDatabase();
  const app = createApp({ logger: false, pool: db.pool, verifyAdminToken: adminVerifier });
  try {
    for (const cat of ["league", "cup", "tournament", "friendly", "other"] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/competitions",
        headers: adminHeaders,
        payload: { name: `Torneo ${cat}`, category: cat, isOfficial: cat !== "friendly" },
      });
      assert.equal(res.statusCode, 201, `Expected 201 for valid category ${cat}`);
      const comp = res.json<{ category: string; isOfficial: boolean }>();
      assert.equal(comp.category, cat);
    }

    // Reject invalid category
    const badCategory = await app.inject({
      method: "POST",
      url: "/api/v1/admin/competitions",
      headers: adminHeaders,
      payload: { name: "Categoria Invalida", category: "supercup_galactic", isOfficial: true },
    });
    assert.equal(badCategory.statusCode, 400);
    assert.equal(badCategory.json().error, "request_validation_failed");
  } finally {
    await app.close();
  }
});

test("5.2 Validation & Error format: Malformed UUID, bad payload structure, route not found", async () => {
  const db = createTestDatabase();
  const app = createApp({ logger: false, pool: db.pool, verifyAdminToken: adminVerifier });
  try {
    // 1. Malformed UUID param
    const badUuid = await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/matches/not-a-uuid/schedule",
      headers: adminHeaders,
      payload: { status: "postponed" },
    });
    assert.equal(badUuid.statusCode, 400);
    assert.equal(badUuid.json().error, "request_validation_failed");

    // 2. Unrecognized route
    const notFound = await app.inject({
      method: "GET",
      url: "/api/v1/non-existent-route",
    });
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.json().error, "route_not_found");

    // 3. Invalid payload: empty displayName violating minLength: 1
    const emptyDisplayName = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "" },
    });
    assert.equal(emptyDisplayName.statusCode, 400);
    assert.equal(emptyDisplayName.json().error, "request_validation_failed");

    // 4. Invalid payload: missing required displayName
    const missingDisplayName = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: {},
    });
    assert.equal(missingDisplayName.statusCode, 400);
    assert.equal(missingDisplayName.json().error, "request_validation_failed");

    // 5. Invalid payload: exceeding maxLength 120
    const tooLongDisplayName = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "a".repeat(121) },
    });
    assert.equal(tooLongDisplayName.statusCode, 400);
    assert.equal(tooLongDisplayName.json().error, "request_validation_failed");

    // 6. Invalid payload: wrong type (null displayName)
    const nullDisplayName = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: null },
    });
    assert.equal(nullDisplayName.statusCode, 400);
    assert.equal(nullDisplayName.json().error, "request_validation_failed");

    // 7. Fastify AJV behavior on extra properties:
    // When additional unmapped fields are sent, Fastify default AJV compiler strips them
    // (removeAdditional: true) instead of rejecting with 400, preserving valid defined fields.
    const extraProperty = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "Valid Name", unauthorizedField: "injected" },
    });
    assert.equal(extraProperty.statusCode, 201);
    assert.equal(extraProperty.json<{ displayName: string }>().displayName, "Valid Name");
    assert.equal((extraProperty.json() as Record<string, unknown>).unauthorizedField, undefined);
  } finally {
    await app.close();
  }
});

test("5.3 OBSERVATION: Season boundary vs Match date check in Core C1", async () => {
  const db = createTestDatabase();
  const app = createApp({ logger: false, pool: db.pool, verifyAdminToken: adminVerifier });
  try {
    // Create season 2026-09-01 -> 2027-06-30
    const sRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    const season = sRes.json<{ id: string }>();

    const oRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/opponents",
      headers: adminHeaders,
      payload: { name: "Squadra Fuori Stagione" },
    });
    const opponent = oRes.json<{ id: string }>();

    // Attempt to schedule a match in 2035 (outside season 2026/2027)
    const futureMatchRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId: season.id,
        opponentId: opponent.id,
        isOfficial: true,
        scheduledAt: "2035-12-25T15:00:00.000Z",
      },
    });

    // We observe and document the actual current implementation behavior:
    // Core C1 checks season existence via SELECT 1 FROM seasons WHERE id = $1,
    // but does NOT validate scheduledAt against season.starts_on and season.ends_on.
    // Rather than asserting an arbitrary preference, we verify and document the observed behavior.
    assert.ok(
      futureMatchRes.statusCode === 201 || futureMatchRes.statusCode === 400,
      "Response must be deterministic HTTP 201 or 400",
    );
    const observedBehavior = futureMatchRes.statusCode === 201 ? "ALLOWED" : "REJECTED";
    assert.equal(
      observedBehavior,
      "ALLOWED",
      "Documented observation: Core C1 currently accepts match scheduledAt outside season start/end bounds",
    );
  } finally {
    await app.close();
  }
});

test("5.4 Restart continuity: Service reboots and reloads existing DB state seamlessly", async () => {
  const db = createTestDatabase();

  // Istanza 1: Configura e pubblica
  const app1 = createApp({ logger: false, pool: db.pool, verifyAdminToken: adminVerifier });
  let seasonId: string;
  let matchId: string;

  try {
    const sRes = await app1.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    seasonId = sRes.json<{ id: string }>().id;

    await app1.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
        currentSeasonId: seasonId,
      },
    });
    await app1.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const opponentId = (
      await app1.inject({
        method: "POST",
        url: "/api/v1/admin/opponents",
        headers: adminHeaders,
        payload: realisticOpponentsFixture[1],
      })
    ).json<{ id: string }>().id;

    matchId = (
      await app1.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers: adminHeaders,
        payload: {
          seasonId,
          opponentId,
          isOfficial: true,
          scheduledAt: "2026-11-28T14:30:00.000Z",
        },
      })
    ).json<{ id: string }>().id;

    await app1.inject({ method: "POST", url: `/api/v1/admin/matches/${matchId}/publish`, headers: adminHeaders });
  } finally {
    await app1.close();
  }

  // Istanza 2: Riavvio del servizio con il medesimo pool / database
  const rebootedApp = createApp({ logger: false, pool: db.pool, verifyAdminToken: adminVerifier });
  try {
    const pubTeam = await rebootedApp.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(pubTeam.statusCode, 200);
    assert.equal(pubTeam.json().name, realisticTeamProfileFixture.name);
    assert.equal(pubTeam.json().currentSeason.id, seasonId);

    const pubMatches = await rebootedApp.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubMatches.statusCode, 200);
    const found = pubMatches.json().scheduled.find((m: any) => m.id === matchId);
    assert.ok(found, "Published match must persist across application reboot");
    assert.equal(found.opponentName, realisticOpponentsFixture[1].name);

    const adminTeam = await rebootedApp.inject({ method: "GET", url: "/api/v1/admin/team", headers: adminHeaders });
    assert.equal(adminTeam.statusCode, 200);
    assert.equal(adminTeam.json().name, realisticTeamProfileFixture.name);
  } finally {
    await rebootedApp.close();
  }
});
