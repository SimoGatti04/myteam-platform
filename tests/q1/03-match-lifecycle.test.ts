import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import {
  realisticCompetitionsFixture,
  realisticOpponentsFixture,
  realisticSeasonFixture,
  realisticTeamProfileFixture,
} from "../fixtures/q1-realistic-fixtures.js";

async function setupMatchContext() {
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
  await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

  const oRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/opponents",
    headers: adminHeaders,
    payload: realisticOpponentsFixture[0],
  });
  const opponentId = oRes.json<{ id: string }>().id;

  const cRes = await app.inject({
    method: "POST",
    url: "/api/v1/admin/competitions",
    headers: adminHeaders,
    payload: realisticCompetitionsFixture[0],
  });
  const competitionId = cRes.json<{ id: string }>().id;

  return { ...ctx, seasonId, opponentId, competitionId };
}

test("3.1 Create match in draft state with date and official status", async () => {
  const { app, adminHeaders, seasonId, opponentId, competitionId } = await setupMatchContext();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-10-18T15:00:00.000Z",
      },
    });
    assert.equal(res.statusCode, 201);
    const match = res.json<{
      id: string;
      seasonId: string;
      opponentId: string;
      competitionId: string | null;
      isOfficial: boolean;
      scheduledAt: string | null;
      status: string;
      publishedAt: string | null;
    }>();

    assert.ok(match.id);
    assert.equal(match.status, "scheduled");
    assert.equal(match.isOfficial, true);
    assert.equal(match.scheduledAt, "2026-10-18T15:00:00.000Z");
    assert.equal(match.publishedAt, null, "Match must start in draft/unpublished state");
  } finally {
    await app.close();
  }
});

test("3.2 Draft match is isolated and NOT visible in public matches list", async () => {
  const { app, adminHeaders, seasonId, opponentId, competitionId } = await setupMatchContext();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-10-18T15:00:00.000Z",
      },
    });

    const publicRes = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(publicRes.statusCode, 200);
    const data = publicRes.json<{ scheduled: unknown[]; toBeScheduled: unknown[] }>();
    assert.equal(data.scheduled.length, 0, "Draft scheduled match must NOT be visible to public");
    assert.equal(data.toBeScheduled.length, 0, "Draft TBD match must NOT be visible to public");
  } finally {
    await app.close();
  }
});

test("3.3 Create match without date requires to_be_scheduled status", async () => {
  const { app, adminHeaders, seasonId, opponentId } = await setupMatchContext();
  try {
    // Tentativo status=scheduled senza data -> 400
    const badScheduled = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        status: "scheduled",
        scheduledAt: null,
        isOfficial: true,
      },
    });
    assert.equal(badScheduled.statusCode, 400);
    assert.equal(badScheduled.json().error, "scheduled_match_requires_date");

    // Tentativo status=to_be_scheduled con data -> 400
    const badTbd = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        status: "to_be_scheduled",
        scheduledAt: "2026-10-18T15:00:00.000Z",
        isOfficial: true,
      },
    });
    assert.equal(badTbd.statusCode, 400);
    assert.equal(badTbd.json().error, "to_be_scheduled_match_must_not_have_date");

    // Valido to_be_scheduled
    const validTbd = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        status: "to_be_scheduled",
        isOfficial: true,
      },
    });
    assert.equal(validTbd.statusCode, 201);
    assert.equal(validTbd.json<{ status: string }>().status, "to_be_scheduled");
    assert.equal(validTbd.json<{ scheduledAt: string | null }>().scheduledAt, null);
  } finally {
    await app.close();
  }
});

test("3.4 Reschedule match updates history, logs audit, and handles postponed state", async () => {
  const { app, db, adminHeaders, seasonId, opponentId } = await setupMatchContext();
  try {
    const mRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        isOfficial: true,
        scheduledAt: "2026-10-25T15:00:00.000Z",
      },
    });
    const matchId = mRes.json<{ id: string }>().id;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        status: "postponed",
        scheduledAt: "2026-11-01T20:30:00.000Z",
        reason: "Maltempo / pioggia intensa",
      },
    });
    assert.equal(patchRes.statusCode, 200);
    const updated = patchRes.json<{ status: string; scheduledAt: string }>();
    assert.equal(updated.status, "postponed");
    assert.equal(updated.scheduledAt, "2026-11-01T20:30:00.000Z");

    const history = db.getScheduleHistory(matchId);
    assert.ok(history.length >= 2, "History must have initial entry plus reschedule");
    const latestEntry = history[history.length - 1];
    assert.equal(latestEntry.status, "postponed");
    assert.equal(latestEntry.reason, "Maltempo / pioggia intensa");
    assert.equal(latestEntry.actor_subject, "admin-user-q1");
  } finally {
    await app.close();
  }
});

test("3.5 Completed match schedule is immutable and transitions to completed are guarded (CORE-BUG-01)", async () => {
  const { app, db, adminHeaders, seasonId, opponentId } = await setupMatchContext();
  try {
    const originalTime = "2026-10-10T15:00:00.000Z";
    const mRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        isOfficial: true,
        scheduledAt: originalTime,
      },
    });
    const matchId = mRes.json<{ id: string }>().id;

    // Tentativo di impostare completed via schedule patch ritorna 400
    const attemptDirectComplete = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: { status: "completed" },
    });
    assert.equal(attemptDirectComplete.statusCode, 400);
    assert.equal(attemptDirectComplete.json().error, "completed_match_schedule_is_immutable");

    // Partita già completata a DB rifiuta qualsiasi aggiornamento di orario o stato
    await db.pool.query("UPDATE matches SET status = 'completed' WHERE id = $1", [matchId]);

    const initialHistoryLength = db.getScheduleHistory(matchId).length;
    const initialAuditCount = db.getAuditEvents().filter((e) => e.entity_id === matchId).length;

    const attemptRescheduleCompleted = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        status: "postponed",
        scheduledAt: "2026-10-25T15:00:00.000Z",
        reason: "Tentativo errato su gara terminata",
      },
    });
    assert.equal(attemptRescheduleCompleted.statusCode, 400);
    assert.equal(attemptRescheduleCompleted.json().error, "completed_match_schedule_is_immutable");

    // Verifica che stato e data nel DB siano rimasti intatti
    const currentDbMatch = (await db.pool.query<{ status: string; scheduled_at: string }>(
      "SELECT status, scheduled_at FROM matches WHERE id = $1",
      [matchId],
    )).rows[0];
    assert.equal(currentDbMatch.status, "completed");
    assert.equal(currentDbMatch.scheduled_at, originalTime);

    // Verifica assenza di nuovi eventi audit o storico
    const newHistoryLength = db.getScheduleHistory(matchId).length;
    assert.equal(newHistoryLength, initialHistoryLength, "No new schedule history on rejected completed reschedule");

    const newAuditCount = db.getAuditEvents().filter((e) => e.entity_id === matchId).length;
    assert.equal(newAuditCount, initialAuditCount, "No new audit log on rejected completed reschedule");
  } finally {
    await app.close();
  }
});

test("3.6 Publishing matches exposes them in public list separated by scheduled vs toBeScheduled", async () => {
  const { app, adminHeaders, seasonId, opponentId, competitionId } = await setupMatchContext();
  try {
    const m1 = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers: adminHeaders,
        payload: {
          seasonId,
          opponentId,
          competitionId,
          isOfficial: true,
          scheduledAt: "2026-11-15T15:00:00.000Z",
        },
      })
    ).json<{ id: string }>();

    const m2 = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers: adminHeaders,
        payload: {
          seasonId,
          opponentId,
          competitionId,
          isOfficial: true,
          status: "to_be_scheduled",
        },
      })
    ).json<{ id: string }>();

    await app.inject({ method: "POST", url: `/api/v1/admin/matches/${m1.id}/publish`, headers: adminHeaders });
    await app.inject({ method: "POST", url: `/api/v1/admin/matches/${m2.id}/publish`, headers: adminHeaders });

    const pubRes = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
    assert.equal(pubRes.statusCode, 200);
    const data = pubRes.json<{
      scheduled: Array<{ id: string; scheduledAt: string | null; opponentName: string; competitionName: string | null }>;
      toBeScheduled: Array<{ id: string; scheduledAt: string | null; opponentName: string; competitionName: string | null }>;
    }>();

    const foundScheduled = data.scheduled.find((m) => m.id === m1.id);
    assert.ok(foundScheduled, "Published scheduled match must appear in scheduled list");
    assert.equal(foundScheduled.opponentName, realisticOpponentsFixture[0].name);
    assert.equal(foundScheduled.competitionName, realisticCompetitionsFixture[0].name);
    assert.ok(foundScheduled.scheduledAt);

    const foundTbd = data.toBeScheduled.find((m) => m.id === m2.id);
    assert.ok(foundTbd, "Published TBD match must appear in toBeScheduled list");
    assert.equal(foundTbd.scheduledAt, null);
  } finally {
    await app.close();
  }
});

test("3.7 Match Detail: Single public match detail endpoint GET /api/v1/public/matches/:id status and contract", async () => {
  const { app, adminHeaders, seasonId, opponentId, competitionId } = await setupMatchContext();
  try {
    // 1. Partita pubblicata -> 200 con DTO completo minimizzato
    const mRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-11-15T15:00:00.000Z",
      },
    });
    const matchId = mRes.json<{ id: string }>().id;
    await app.inject({ method: "POST", url: `/api/v1/admin/matches/${matchId}/publish`, headers: adminHeaders });

    const detailRes = await app.inject({ method: "GET", url: `/api/v1/public/matches/${matchId}` });
    assert.equal(detailRes.statusCode, 200, "Published match must return HTTP 200 on GET /public/matches/:id");

    const match = detailRes.json<{
      id: string;
      seasonId: string;
      opponentName: string;
      competitionName: string | null;
      isOfficial: boolean;
      scheduledAt: string | null;
      status: string;
    }>();

    assert.equal(match.id, matchId);
    assert.equal(match.seasonId, seasonId);
    assert.equal(match.opponentName, realisticOpponentsFixture[0].name);
    assert.equal(match.competitionName, realisticCompetitionsFixture[0].name);
    assert.equal(match.isOfficial, true);
    assert.equal(match.status, "scheduled");
    assert.equal(match.scheduledAt, "2026-11-15T15:00:00.000Z");

    // Data minimization: nessun campo amministrativo esposto
    const rawKeys = Object.keys(detailRes.json());
    assert.ok(!rawKeys.includes("publishedAt"), "publishedAt must not be exposed");
    assert.ok(!rawKeys.includes("createdAt"), "createdAt must not be exposed");
    assert.ok(!rawKeys.includes("updatedAt"), "updatedAt must not be exposed");
    assert.ok(!rawKeys.includes("opponentId"), "opponentId must not be exposed");
    assert.ok(!rawKeys.includes("competitionId"), "competitionId must not be exposed");

    // 2. Partita non pubblicata (bozza) -> 404 public_match_not_found
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        isOfficial: true,
        scheduledAt: "2026-11-20T15:00:00.000Z",
      },
    });
    const draftId = draftRes.json<{ id: string }>().id;
    const draftDetail = await app.inject({ method: "GET", url: `/api/v1/public/matches/${draftId}` });
    assert.equal(draftDetail.statusCode, 404, "Draft match must return 404 on public detail route");
    assert.equal(draftDetail.json().error, "public_match_not_found");

    // 3. Partita inesistente -> 404 public_match_not_found
    const notFoundRes = await app.inject({
      method: "GET",
      url: "/api/v1/public/matches/00000000-0000-0000-0000-000000000000",
    });
    assert.equal(notFoundRes.statusCode, 404);
    assert.equal(notFoundRes.json().error, "public_match_not_found");
  } finally {
    await app.close();
  }
});

test("3.8 Match reschedule chain preserves stable match UUID identity across multiple changes", async () => {
  const { app, db, adminHeaders, seasonId, opponentId, competitionId } = await setupMatchContext();
  try {
    // Creazione iniziale
    const initialRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/matches",
      headers: adminHeaders,
      payload: {
        seasonId,
        opponentId,
        competitionId,
        isOfficial: true,
        scheduledAt: "2026-10-18T15:00:00.000Z",
      },
    });
    const matchId = initialRes.json<{ id: string }>().id;

    // Transizione 1: Postponed
    const patch1 = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        status: "postponed",
        scheduledAt: "2026-10-25T15:00:00.000Z",
        reason: "Maltempo e pioggia forte",
      },
    });
    assert.equal(patch1.statusCode, 200);
    assert.equal(patch1.json<{ id: string }>().id, matchId, "UUID must remain stable");

    // Transizione 2: Rimessa to_be_scheduled
    const patch2 = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        status: "to_be_scheduled",
        scheduledAt: null,
        reason: "Indisponibilità campo a data da destinarsi",
      },
    });
    assert.equal(patch2.statusCode, 200);
    assert.equal(patch2.json<{ id: string }>().id, matchId, "UUID must remain stable");

    // Transizione 3: Riprogrammata con data definitiva
    const patch3 = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/matches/${matchId}/schedule`,
      headers: adminHeaders,
      payload: {
        status: "scheduled",
        scheduledAt: "2026-11-20T20:45:00.000Z",
        reason: "Accordo recupero infrasettimanale",
      },
    });
    assert.equal(patch3.statusCode, 200);
    assert.equal(patch3.json<{ id: string }>().id, matchId, "UUID must remain stable");

    // Verifica cronologia completa e cumulativa
    const history = db.getScheduleHistory(matchId);
    assert.equal(history.length, 4, "Match schedule history must contain 4 sequential entries");
    assert.equal(history[0].status, "scheduled");
    assert.equal(history[0].reason, null);
    assert.equal(history[1].status, "postponed");
    assert.equal(history[1].reason, "Maltempo e pioggia forte");
    assert.equal(history[2].status, "to_be_scheduled");
    assert.equal(history[2].reason, "Indisponibilità campo a data da destinarsi");
    assert.equal(history[3].status, "scheduled");
    assert.equal(history[3].reason, "Accordo recupero infrasettimanale");

    // Verifica che l'identità del match in tabella matches corrisponda allo stato finale
    const finalRow = (await db.pool.query("SELECT * FROM matches WHERE id = $1", [matchId])).rows[0];
    assert.equal(finalRow.id, matchId);
    assert.equal(finalRow.status, "scheduled");
  } finally {
    await app.close();
  }
});
