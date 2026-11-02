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

test("API Integrated Pipeline (Fastify Inject + Memory DB): Admin writes -> Persistence -> Public API", async () => {
  const { app, adminHeaders } = createTestApp();
  try {
    // 1. Setup Season via Admin API
    const sRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    assert.equal(sRes.statusCode, 201);
    const seasonId = sRes.json<{ id: string }>().id;

    // 2. Setup Team Profile via Admin API
    const teamRes = await app.inject({
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
    assert.equal(teamRes.statusCode, 200);

    // Prima di pubblicare il team, le API pubbliche rispondono 404
    const pubPreTeam = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(pubPreTeam.statusCode, 404);

    // 3. Pubblicazione del Team
    const pubTeamRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/team/publish",
      headers: adminHeaders,
    });
    assert.equal(pubTeamRes.statusCode, 200);

    // Verifica endpoint pubblico team
    const pubTeam = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(pubTeam.statusCode, 200);
    const pubTeamData = pubTeam.json<{ name: string; crestUrl: string; primaryColor: string }>();
    assert.equal(pubTeamData.name, realisticTeamProfileFixture.name);
    assert.equal(pubTeamData.crestUrl, realisticTeamProfileFixture.crestUrl);

    // 4. Inserimento giocatori e rosa
    const pRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: realisticPlayersFixture[0].displayName },
    });
    assert.equal(pRes.statusCode, 201);
    const playerId = pRes.json<{ id: string }>().id;

    const memRes = await app.inject({
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
    assert.equal(memRes.statusCode, 201);

    // Verifica endpoint pubblico roster
    const pubRoster = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(pubRoster.statusCode, 200);
    const rosterData = pubRoster.json<{ players: Array<{ id: string; displayName: string; jerseyNumber: number }> }>();
    assert.equal(rosterData.players.length, 1);
    assert.equal(rosterData.players[0].displayName, realisticPlayersFixture[0].displayName);

    // 5. Creazione avversario e competizione
    const oppRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/opponents",
      headers: adminHeaders,
      payload: realisticOpponentsFixture[0],
    });
    const opponentId = oppRes.json<{ id: string }>().id;

    const compRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/competitions",
      headers: adminHeaders,
      payload: realisticCompetitionsFixture[0],
    });
    const competitionId = compRes.json<{ id: string }>().id;

    // 6. Creazione partita (DRAFT)
    const matchRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-11-20T20:30:00.000Z",
      },
    });
    assert.equal(matchRes.statusCode, 201);
    const matchId = matchRes.json<{ id: string }>().id;

    // In stato bozza: pubblico 404 sia su lista che su dettaglio
    const pubMatchesPre = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubMatchesPre.statusCode, 200);
    const preIds = pubMatchesPre.json<{ scheduled: Array<{ id: string }> }>().scheduled.map((m) => m.id);
    assert.ok(!preIds.includes(matchId));

    const pubDetailPre = await app.inject({ method: "GET", url: `/api/v1/public/matches/${matchId}` });
    assert.equal(pubDetailPre.statusCode, 404);

    // 7. Pubblicazione partita
    const pubMatchRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/matches/${matchId}/publish`,
      headers: adminHeaders,
    });
    assert.equal(pubMatchRes.statusCode, 200);

    // Verifica visibilità pubblica su lista e su dettaglio
    const pubMatchesPost = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubMatchesPost.statusCode, 200);
    const postIds = pubMatchesPost.json<{ scheduled: Array<{ id: string }> }>().scheduled.map((m) => m.id);
    assert.ok(postIds.includes(matchId));

    const pubDetailPost = await app.inject({ method: "GET", url: `/api/v1/public/matches/${matchId}` });
    assert.equal(pubDetailPost.statusCode, 200);
    const matchDetail = pubDetailPost.json<{ id: string; opponentName: string; status: string }>();
    assert.equal(matchDetail.id, matchId);
    assert.equal(matchDetail.opponentName, realisticOpponentsFixture[0].name);
    assert.equal(matchDetail.status, "scheduled");

    // 8. Immutabilità su completata (CORE-BUG-01)
    const { db } = createTestApp();
    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: { status: "completed" },
    }); // 400

    // Forzando a DB lo stato completed:
    // (Nel nostro test app in memoria possiamo farlo via query)
    // qualsiasi reschedule DEVE restituire 400 completed_match_schedule_is_immutable
  } finally {
    await app.close();
  }
});
