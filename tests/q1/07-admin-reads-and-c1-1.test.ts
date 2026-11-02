import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import {
  realisticSeasonFixture,
  realisticTeamProfileFixture,
  realisticPlayersFixture,
  realisticOpponentsFixture,
  realisticCompetitionsFixture,
} from "../fixtures/q1-realistic-fixtures.js";

async function setupFullContext() {
  const ctx = createTestApp();
  const { app, adminHeaders } = ctx;

  // 1. Season 1
  const s1Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/seasons",
    headers: adminHeaders,
    payload: realisticSeasonFixture,
  });
  const season1Id = s1Res.json<{ id: string }>().id;

  // 2. Season 2 (future)
  const s2Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/seasons",
    headers: adminHeaders,
    payload: { label: "2027/2028", startsOn: "2027-09-01", endsOn: "2028-06-30" },
  });
  const season2Id = s2Res.json<{ id: string }>().id;

  // 3. Team Profile
  await app.inject({
    method: "PUT",
    url: "/api/v1/admin/team",
    headers: adminHeaders,
    payload: {
      name: realisticTeamProfileFixture.name,
      crestUrl: realisticTeamProfileFixture.crestUrl,
      currentSeasonId: season1Id,
    },
  });

  // 4. Players
  const p1Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/players",
    headers: adminHeaders,
    payload: { displayName: realisticPlayersFixture[0].displayName },
  });
  const player1Id = p1Res.json<{ id: string }>().id;

  const p2Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/players",
    headers: adminHeaders,
    payload: { displayName: realisticPlayersFixture[1].displayName },
  });
  const player2Id = p2Res.json<{ id: string }>().id;

  // 5. Memberships
  const m1Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/roster-memberships",
    headers: adminHeaders,
    payload: { playerId: player1Id, seasonId: season1Id, jerseyNumber: 1, activeFrom: "2026-09-01" },
  });
  const membership1Id = m1Res.json<{ id: string }>().id;

  const m2Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/roster-memberships",
    headers: adminHeaders,
    payload: { playerId: player2Id, seasonId: season1Id, jerseyNumber: 5, activeFrom: "2026-09-01" },
  });
  const membership2Id = m2Res.json<{ id: string }>().id;

  // 6. Opponents
  const o1Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/opponents",
    headers: adminHeaders,
    payload: realisticOpponentsFixture[0],
  });
  const opponent1Id = o1Res.json<{ id: string }>().id;

  const o2Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/opponents",
    headers: adminHeaders,
    payload: realisticOpponentsFixture[1],
  });
  const opponent2Id = o2Res.json<{ id: string }>().id;

  // 7. Competitions
  const c1Res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    headers: adminHeaders,
    payload: realisticCompetitionsFixture[0],
  });
  const competition1Id = c1Res.json<{ id: string }>().id;

  // 8. Matches (draft and published)
  const draftMatchRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/matches",
    headers: adminHeaders,
    payload: {
      seasonId: season1Id,
      opponentId: opponent1Id,
      competitionId: competition1Id,
      isOfficial: true,
      scheduledAt: "2026-10-20T18:00:00.000Z",
    },
  });
  const draftMatchId = draftMatchRes.json<{ id: string }>().id;

  const pubMatchRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/matches",
    headers: adminHeaders,
    payload: {
      seasonId: season1Id,
      opponentId: opponent2Id,
      competitionId: competition1Id,
      isOfficial: true,
      scheduledAt: "2026-10-25T15:00:00.000Z",
    },
  });
  const pubMatchId = pubMatchRes.json<{ id: string }>().id;
  await app.inject({ method: "POST", url: `/api/v1/admin/matches/${pubMatchId}/publish`, headers: adminHeaders });

  return {
    ...ctx,
    season1Id,
    season2Id,
    player1Id,
    player2Id,
    membership1Id,
    membership2Id,
    opponent1Id,
    opponent2Id,
    competition1Id,
    draftMatchId,
    pubMatchId,
  };
}

test("7.1 Admin Read Endpoints: 401 Unauthorized without token", async () => {
  const { app } = await setupFullContext();
  try {
    const endpoints = [
      "/api/v1/admin/team",
      "/api/v1/admin/seasons",
      "/api/v1/admin/players",
      "/api/v1/admin/roster-memberships",
      "/api/v1/admin/opponents",
      "/api/v1/admin/competitions",
      "/api/v1/admin/matches",
    ];

    for (const url of endpoints) {
      const res = await app.inject({ method: "GET", url });
      assert.equal(res.statusCode, 401, `GET ${url} must return 401 without auth`);
      assert.equal(res.json().error, "authentication_required");
    }
  } finally {
    await app.close();
  }
});

test("7.2 Admin Read Endpoints: 403 Forbidden with unprivileged token", async () => {
  const { app, unprivilegedHeaders } = await setupFullContext();
  try {
    const endpoints = [
      "/api/v1/admin/team",
      "/api/v1/admin/seasons",
      "/api/v1/admin/players",
      "/api/v1/admin/roster-memberships",
      "/api/v1/admin/opponents",
      "/api/v1/admin/competitions",
      "/api/v1/admin/matches",
    ];

    for (const url of endpoints) {
      const res = await app.inject({ method: "GET", url, headers: unprivilegedHeaders });
      assert.equal(res.statusCode, 403, `GET ${url} must return 403 with unprivileged token`);
      assert.equal(res.json().error, "insufficient_permissions");
    }
  } finally {
    await app.close();
  }
});

test("7.3 Admin Reads: GET /admin/team returns full administrative team DTO", async () => {
  const { app, adminHeaders, season1Id } = await setupFullContext();
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/team", headers: adminHeaders });
    assert.equal(res.statusCode, 200);
    const body = res.json<{
      id: number;
      name: string;
      crestUrl: string;
      primaryColor: string | null;
      secondaryColor: string | null;
      currentSeasonId: string;
      publishedAt: string | null;
    }>();
    assert.equal(body.id, 1);
    assert.equal(body.name, realisticTeamProfileFixture.name);
    assert.equal(body.crestUrl, realisticTeamProfileFixture.crestUrl);
    assert.equal(body.currentSeasonId, season1Id);
    assert.equal(body.publishedAt, null);
  } finally {
    await app.close();
  }
});

test("7.4 Admin Reads: GET /admin/seasons returns ordered seasons array", async () => {
  const { app, adminHeaders, season1Id, season2Id } = await setupFullContext();
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/seasons", headers: adminHeaders });
    assert.equal(res.statusCode, 200);
    const seasons = res.json<Array<{ id: string; label: string; startsOn: string; endsOn: string }>>();
    assert.ok(Array.isArray(seasons));
    assert.ok(seasons.length >= 2);
    // startsOn DESC order: 2027/2028 should precede 2026/2027
    assert.equal(seasons[0].id, season2Id);
    assert.equal(seasons[1].id, season1Id);
  } finally {
    await app.close();
  }
});

test("7.5 Admin Reads: GET /admin/players returns ordered players array", async () => {
  const { app, adminHeaders, player1Id, player2Id } = await setupFullContext();
  try {
    const res = await app.inject({ method: "GET", url: "/api/v1/admin/players", headers: adminHeaders });
    assert.equal(res.statusCode, 200);
    const players = res.json<Array<{ id: string; displayName: string }>>();
    assert.ok(Array.isArray(players));
    assert.ok(players.length >= 2);
    const ids = players.map((p) => p.id);
    assert.ok(ids.includes(player1Id));
    assert.ok(ids.includes(player2Id));
  } finally {
    await app.close();
  }
});

test("7.6 Admin Reads: GET /admin/roster-memberships supports seasonId and playerId query filters", async () => {
  const { app, adminHeaders, season1Id, season2Id, player1Id, player2Id } = await setupFullContext();
  try {
    // 1. Without filter: returns all memberships
    const allRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
    });
    assert.equal(allRes.statusCode, 200);
    const all = allRes.json<Array<{ id: string; playerId: string; seasonId: string; jerseyNumber: number }>>();
    assert.equal(all.length, 2);

    // 2. Filter by seasonId
    const s1Res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/roster-memberships?seasonId=${season1Id}`,
      headers: adminHeaders,
    });
    assert.equal(s1Res.statusCode, 200);
    assert.equal(s1Res.json<Array<unknown>>().length, 2);

    const s2Res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/roster-memberships?seasonId=${season2Id}`,
      headers: adminHeaders,
    });
    assert.equal(s2Res.statusCode, 200);
    assert.equal(s2Res.json<Array<unknown>>().length, 0);

    // 3. Filter by playerId
    const p1FilterRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/roster-memberships?playerId=${player1Id}`,
      headers: adminHeaders,
    });
    assert.equal(p1FilterRes.statusCode, 200);
    const p1List = p1FilterRes.json<Array<{ playerId: string }>>();
    assert.equal(p1List.length, 1);
    assert.equal(p1List[0].playerId, player1Id);

    // 4. Invalid UUID filter returns 400
    const invalidRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/roster-memberships?seasonId=invalid-uuid",
      headers: adminHeaders,
    });
    assert.equal(invalidRes.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("7.7 Admin Reads: GET /admin/opponents and GET /admin/competitions", async () => {
  const { app, adminHeaders, opponent1Id, opponent2Id, competition1Id } = await setupFullContext();
  try {
    // Opponents
    const oppRes = await app.inject({ method: "GET", url: "/api/v1/admin/opponents", headers: adminHeaders });
    assert.equal(oppRes.statusCode, 200);
    const opps = oppRes.json<Array<{ id: string; name: string }>>();
    assert.ok(opps.length >= 2);
    const oppIds = opps.map((o) => o.id);
    assert.ok(oppIds.includes(opponent1Id));
    assert.ok(oppIds.includes(opponent2Id));

    // Competitions
    const compRes = await app.inject({ method: "GET", url: "/api/v1/admin/competitions", headers: adminHeaders });
    assert.equal(compRes.statusCode, 200);
    const comps = compRes.json<Array<{ id: string; name: string; category: string; isOfficial: boolean }>>();
    assert.ok(comps.length >= 1);
    const c1 = comps.find((c) => c.id === competition1Id);
    assert.ok(c1);
    assert.equal(c1.category, "league");
    assert.equal(c1.isOfficial, true);
  } finally {
    await app.close();
  }
});

test("7.8 Admin Reads: GET /admin/matches includes DRAFTS and respects seasonId filter", async () => {
  const { app, adminHeaders, season1Id, season2Id, draftMatchId, pubMatchId } = await setupFullContext();
  try {
    // 1. Without filter: includes BOTH draft and published matches
    const allMatchesRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
    });
    assert.equal(allMatchesRes.statusCode, 200);
    const allMatches = allMatchesRes.json<Array<{ id: string; publishedAt: string | null; status: string }>>();
    assert.equal(allMatches.length, 2);

    const draftInAdmin = allMatches.find((m) => m.id === draftMatchId);
    assert.ok(draftInAdmin, "Draft match must be visible in admin list");
    assert.equal(draftInAdmin.publishedAt, null);

    const pubInAdmin = allMatches.find((m) => m.id === pubMatchId);
    assert.ok(pubInAdmin, "Published match must be visible in admin list");
    assert.ok(pubInAdmin.publishedAt !== null);

    // 2. Filter by seasonId
    const s1Res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/matches?seasonId=${season1Id}`,
      headers: adminHeaders,
    });
    assert.equal(s1Res.statusCode, 200);
    assert.equal(s1Res.json<Array<unknown>>().length, 2);

    const s2Res = await app.inject({
      method: "GET",
      url: `/api/v1/admin/matches?seasonId=${season2Id}`,
      headers: adminHeaders,
    });
    assert.equal(s2Res.statusCode, 200);
    assert.equal(s2Res.json<Array<unknown>>().length, 0);

    // 3. Documented constraint: status filter is NOT supported on GET /admin/matches
    // Sending status query parameter does not break or filter by status unexpectedly
    const withStatusRes = await app.inject({
      method: "GET",
      url: `/api/v1/admin/matches?seasonId=${season1Id}&status=scheduled`,
      headers: adminHeaders,
    });
    assert.equal(withStatusRes.statusCode, 200);
  } finally {
    await app.close();
  }
});
