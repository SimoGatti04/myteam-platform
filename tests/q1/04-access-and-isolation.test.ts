import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import {
  realisticCompetitionsFixture,
  realisticOpponentsFixture,
  realisticPlayersFixture,
  realisticSeasonFixture,
  realisticTeamProfileFixture,
} from "../fixtures/q1-realistic-fixtures.js";

async function setupIsolationContext() {
  const ctx = createTestApp();
  const { app, adminHeaders } = ctx;

  const sRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/seasons",
    headers: adminHeaders,
    payload: realisticSeasonFixture,
  });
  const seasonId = sRes.json<{ id: string }>().id;

  await app.inject({
    method: "PUT",
    url: "/api/v1/admin/team",
    headers: adminHeaders,
    payload: {
      name: realisticTeamProfileFixture.name,
      crestUrl: realisticTeamProfileFixture.crestUrl,
      currentSeasonId: seasonId,
    },
  });

  const opponentId = (
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/opponents",
      headers: adminHeaders,
      payload: realisticOpponentsFixture[0],
    })
  ).json<{ id: string }>().id;

  const competitionId = (
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/competitions",
      headers: adminHeaders,
      payload: realisticCompetitionsFixture[0],
    })
  ).json<{ id: string }>().id;

  const matchId = (
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-11-20T20:00:00.000Z",
      },
    })
  ).json<{ id: string }>().id;

  const playerId = (
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: realisticPlayersFixture[0].displayName },
    })
  ).json<{ id: string }>().id;

  await app.inject({
    method: "POST",
    url: "/api/v1/admin/roster-memberships",
    headers: adminHeaders,
    payload: {
      playerId,
      seasonId,
      jerseyNumber: 1,
      activeFrom: "2026-09-01",
    },
  });

  return { ...ctx, seasonId, opponentId, competitionId, matchId, playerId };
}

test("4.1 Access Control: All administrative routes require valid Bearer token", async () => {
  const { app, invalidTokenHeaders, unprivilegedHeaders, matchId, playerId, seasonId, opponentId } =
    await setupIsolationContext();
  try {
    const protectedRoutes: Array<{ method: "GET" | "POST" | "PUT" | "PATCH"; url: string; payload?: unknown }> = [
      { method: "GET", url: "/api/v1/admin/team" },
      { method: "PUT", url: "/api/v1/admin/team", payload: { name: "Hack" } },
      { method: "POST", url: "/api/v1/admin/team/publish" },
      { method: "POST", url: "/api/v1/admin/seasons", payload: realisticSeasonFixture },
      { method: "POST", url: "/api/v1/admin/players", payload: { displayName: "Hack" } },
      { method: "POST", url: "/api/v1/admin/roster-memberships", payload: { playerId, seasonId, activeFrom: "2026-09-01" } },
      { method: "POST", url: "/api/v1/admin/opponents", payload: { name: "Hack" } },
      { method: "POST", url: "/api/v1/admin/competitions", payload: { name: "Hack", category: "other", isOfficial: false } },
      { method: "POST", url: "/api/v1/admin/matches", payload: { seasonId, opponentId, isOfficial: true } },
      { method: "PATCH", url: `/api/v1/admin/matches/${matchId}/schedule`, payload: { status: "postponed" } },
      { method: "POST", url: `/api/v1/admin/matches/${matchId}/publish` },
    ];

    for (const route of protectedRoutes) {
      // 1. Missing authorization header -> 401
      const noAuth = await app.inject({ method: route.method, url: route.url, payload: route.payload as any });
      assert.equal(noAuth.statusCode, 401, `Expected 401 on missing auth for ${route.method} ${route.url}`);
      assert.equal(noAuth.json().error, "authentication_required");

      // 2. Invalid/malformed token -> 401
      const badToken = await app.inject({
        method: route.method,
        url: route.url,
        headers: invalidTokenHeaders,
        payload: route.payload as any,
      });
      assert.equal(badToken.statusCode, 401, `Expected 401 on invalid token for ${route.method} ${route.url}`);

      // 3. Unprivileged token (lacks platform:admin scope) -> 403
      const forbidden = await app.inject({
        method: route.method,
        url: route.url,
        headers: unprivilegedHeaders,
        payload: route.payload as any,
      });
      assert.equal(forbidden.statusCode, 403, `Expected 403 on unprivileged token for ${route.method} ${route.url}`);
    }
  } finally {
    await app.close();
  }
});

test("4.2 Content Isolation: Unpublished team isolates all public projections (404)", async () => {
  const { app } = await setupIsolationContext();
  try {
    const tRes = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(tRes.statusCode, 404);
    assert.equal(tRes.json().error, "public_team_not_found");

    const rRes = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(rRes.statusCode, 404);
    assert.equal(rRes.json().error, "public_team_not_found");

    const mRes = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(mRes.statusCode, 404);
    assert.equal(mRes.json().error, "public_team_not_found");
  } finally {
    await app.close();
  }
});

test("4.3 Content Isolation: Unpublished match is hidden even after team is published", async () => {
  const { app, adminHeaders } = await setupIsolationContext();
  try {
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const mRes = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(mRes.statusCode, 200);
    assert.deepEqual(mRes.json(), { scheduled: [], toBeScheduled: [] });
  } finally {
    await app.close();
  }
});

test("4.4 Data Minimization: Public team projection does not leak admin fields", async () => {
  const { app, adminHeaders } = await setupIsolationContext();
  try {
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const tRes = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(tRes.statusCode, 200);
    const team = tRes.json();

    const allowedKeys = new Set(["name", "crestUrl", "primaryColor", "secondaryColor", "currentSeason"]);
    for (const key of Object.keys(team)) {
      assert.ok(allowedKeys.has(key), `Forbidden leaked property in public team: ${key}`);
    }

    assert.equal((team as any).id, undefined, "Singleton DB id must not leak");
    assert.equal((team as any).publishedAt, undefined, "publishedAt timestamp must not leak");
    assert.equal((team as any).updated_at, undefined, "updated_at must not leak");
    assert.equal((team as any).actor_subject, undefined, "actor_subject must not leak");
  } finally {
    await app.close();
  }
});

test("4.5 Data Minimization: Public roster projection does not leak audit or membership internals", async () => {
  const { app, adminHeaders } = await setupIsolationContext();
  try {
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const rRes = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(rRes.statusCode, 200);
    const roster = rRes.json<{ season: Record<string, unknown>; players: Array<Record<string, unknown>> }>();

    assert.deepEqual(Object.keys(roster.season).sort(), ["id", "label"]);

    for (const player of roster.players) {
      const keys = Object.keys(player).sort();
      assert.deepEqual(keys, ["displayName", "id", "jerseyNumber"], `Player fields must be strictly minimized: ${keys}`);
      assert.equal(player.active_from, undefined);
      assert.equal(player.active_until, undefined);
      assert.equal(player.membership_id, undefined);
    }
  } finally {
    await app.close();
  }
});

test("4.6 Data Minimization: Public matches projection does not leak audit, reasons or unapproved stats", async () => {
  const { app, adminHeaders, matchId } = await setupIsolationContext();
  try {
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        scheduledAt: "2026-11-21T18:00:00.000Z",
        reason: "Internal note: Arbitro designato in ritardo",
      },
    });

    await app.inject({ method: "POST", url: `/api/v1/admin/matches/${matchId}/publish`, headers: adminHeaders });

    const mRes = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(mRes.statusCode, 200);
    const matches = mRes.json<{ scheduled: Array<Record<string, unknown>> }>();
    assert.equal(matches.scheduled.length, 1);
    const pubMatch = matches.scheduled[0];

    const allowedMatchKeys = new Set([
      "id",
      "seasonId",
      "opponentName",
      "competitionName",
      "isOfficial",
      "scheduledAt",
      "status",
    ]);

    for (const key of Object.keys(pubMatch)) {
      assert.ok(allowedMatchKeys.has(key), `Forbidden leaked property in public match: ${key}`);
    }

    assert.equal(pubMatch.reason, undefined, "Schedule change reason must remain private");
    assert.equal(pubMatch.actor_subject, undefined, "Audit actor must not leak");
    assert.equal(pubMatch.score, undefined, "Score must not be invented");
    assert.equal(pubMatch.goals, undefined, "Goals must not be invented");
    assert.equal(pubMatch.opponentId, undefined, "Opponent internal ID not required");
  } finally {
    await app.close();
  }
});
