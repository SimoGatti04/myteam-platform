import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import {
  formerPlayerFixture,
  futurePlayerFixture,
  realisticPlayersFixture,
  realisticSeasonFixture,
  realisticTeamProfileFixture,
} from "../fixtures/q1-realistic-fixtures.js";

async function setupRosterContext() {
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

  return { ...ctx, seasonId };
}

test("2.1 Player creation generates stable UUID identity and rejects invalid names", async () => {
  const { app, adminHeaders } = await setupRosterContext();
  try {
    const p1Res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: realisticPlayersFixture[0].displayName },
    });
    assert.equal(p1Res.statusCode, 201);
    const p1 = p1Res.json<{ id: string; displayName: string }>();
    assert.match(p1.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(p1.displayName, realisticPlayersFixture[0].displayName);

    // Reject empty or blank display name
    const emptyRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "   " },
    });
    assert.equal(emptyRes.statusCode, 400);
    assert.equal(emptyRes.json().error, "player_name_required");
  } finally {
    await app.close();
  }
});

test("2.2 Create multiple players and verify unique stable IDs", async () => {
  const { app, adminHeaders } = await setupRosterContext();
  try {
    const ids: string[] = [];
    for (const player of realisticPlayersFixture) {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: player.displayName },
      });
      assert.equal(res.statusCode, 201);
      const p = res.json<{ id: string }>();
      assert.ok(!ids.includes(p.id), "Player ID must be unique");
      ids.push(p.id);
    }
    assert.equal(ids.length, realisticPlayersFixture.length);
  } finally {
    await app.close();
  }
});

test("2.3 Add players to season roster with jersey numbers", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    for (const player of realisticPlayersFixture) {
      const pRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: player.displayName },
      });
      const pId = pRes.json<{ id: string }>().id;

      const mRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers: adminHeaders,
        payload: {
          playerId: pId,
          seasonId,
          jerseyNumber: player.jerseyNumber,
          activeFrom: "2026-09-01",
        },
      });
      assert.equal(mRes.statusCode, 201);
      const m = mRes.json<{ id: string; jerseyNumber: number; playerId: string }>();
      assert.equal(m.playerId, pId);
      assert.equal(m.jerseyNumber, player.jerseyNumber);
    }
  } finally {
    await app.close();
  }
});

test("2.4 Reject membership with non-existent player or season", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    const pRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "Existing Player" },
    });
    const pId = pRes.json<{ id: string }>().id;

    const badPlayer = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: "00000000-0000-0000-0000-000000000000",
        seasonId,
        activeFrom: "2026-09-01",
      },
    });
    assert.equal(badPlayer.statusCode, 404);
    assert.equal(badPlayer.json().error, "player_not_found");

    const badSeason = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: pId,
        seasonId: "00000000-0000-0000-0000-000000000000",
        activeFrom: "2026-09-01",
      },
    });
    assert.equal(badSeason.statusCode, 404);
    assert.equal(badSeason.json().error, "season_not_found");
  } finally {
    await app.close();
  }
});

test("2.5 Reject invalid jersey numbers (<0 or >99)", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    const pRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "Existing Player" },
    });
    const pId = pRes.json<{ id: string }>().id;

    const badJersey = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: pId,
        seasonId,
        jerseyNumber: 150,
        activeFrom: "2026-09-01",
      },
    });
    assert.equal(badJersey.statusCode, 400);
    assert.equal(badJersey.json().error, "request_validation_failed");
  } finally {
    await app.close();
  }
});

test("2.6 Overlap prevention: reject duplicate active membership for same player in same season", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    const pRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/players",
      headers: adminHeaders,
      payload: { displayName: "Overlap Player" },
    });
    const pId = pRes.json<{ id: string }>().id;

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: pId,
        seasonId,
        jerseyNumber: 7,
        activeFrom: "2026-09-01",
      },
    });
    assert.equal(first.statusCode, 201);

    const overlapRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: pId,
        seasonId,
        jerseyNumber: 12,
        activeFrom: "2026-10-01",
      },
    });
    assert.equal(overlapRes.statusCode, 409);
    assert.equal(overlapRes.json().error, "roster_membership_period_overlaps");
  } finally {
    await app.close();
  }
});

test("2.7 Ending a membership and verifying overlap validation respects end dates", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    const tempP = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: "Temp Player" },
      })
    ).json<{ id: string }>();

    // Add membership active from 2026-09-01 (ongoing)
    const mRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: tempP.id,
        seasonId,
        activeFrom: "2026-09-01",
      },
    });
    assert.equal(mRes.statusCode, 201);
    const membershipId = mRes.json<{ id: string }>().id;

    // End membership on 2026-09-30
    const endRes = await app.inject({
      method: "POST",
      url: `/api/v1/admin/roster-memberships/${membershipId}/end`,
      headers: adminHeaders,
      payload: { activeUntil: "2026-09-30" },
    });
    assert.equal(endRes.statusCode, 200);
    assert.equal(endRes.json<{ activeUntil: string }>().activeUntil, "2026-09-30");

    // Re-ending the membership causes 409
    const reEnd = await app.inject({
      method: "POST",
      url: `/api/v1/admin/roster-memberships/${membershipId}/end`,
      headers: adminHeaders,
      payload: { activeUntil: "2026-10-15" },
    });
    assert.equal(reEnd.statusCode, 409);
    assert.equal(reEnd.json().error, "roster_membership_already_ended");

    // Now a new membership starting AFTER 2026-09-30 must succeed
    const newPeriod = await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: tempP.id,
        seasonId,
        activeFrom: "2026-10-01",
        activeUntil: "2026-12-31",
      },
    });
    assert.equal(newPeriod.statusCode, 201);
  } finally {
    await app.close();
  }
});

test("2.8 Public roster returns only currently active players, sorted by jersey number", async () => {
  const { app, adminHeaders, seasonId } = await setupRosterContext();
  try {
    // Prima della pubblicazione del team -> 404
    const prePub = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(prePub.statusCode, 404);

    // Pubblica il team
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    // Aggiungi 2 giocatori attivi con numeri di maglia
    const p1 = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: "Attivo Dieci" },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: { playerId: p1.id, seasonId, jerseyNumber: 10, activeFrom: "2026-09-01" },
    });

    const p2 = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: "Attivo Due" },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: { playerId: p2.id, seasonId, jerseyNumber: 2, activeFrom: "2026-09-01" },
    });

    // Aggiungi giocatore storico (chiuso nel passato)
    const formerP = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: formerPlayerFixture.displayName },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: formerP.id,
        seasonId,
        jerseyNumber: formerPlayerFixture.jerseyNumber,
        activeFrom: formerPlayerFixture.activeFrom,
        activeUntil: formerPlayerFixture.activeUntil,
      },
    });

    // Aggiungi giocatore futuro (valido solo dal 2028)
    const futureP = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: futurePlayerFixture.displayName },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: futureP.id,
        seasonId,
        jerseyNumber: futurePlayerFixture.jerseyNumber,
        activeFrom: futurePlayerFixture.activeFrom,
        activeUntil: futurePlayerFixture.activeUntil,
      },
    });

    // Giocatore senza numero di maglia (NULLS LAST)
    const noJerseyP = (
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers: adminHeaders,
        payload: { displayName: "Zeno SenzaNumero" },
      })
    ).json<{ id: string }>();
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/roster-memberships",
      headers: adminHeaders,
      payload: {
        playerId: noJerseyP.id,
        seasonId,
        activeFrom: "2026-09-01",
      },
    });

    // Recupera roster pubblico
    const res = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
    assert.equal(res.statusCode, 200);
    const data = res.json<{
      season: { id: string; label: string };
      players: Array<{ id: string; displayName: string; jerseyNumber: number | null }>;
    }>();

    assert.equal(data.season.id, seasonId);

    // Non devono comparire né lo storico né il futuro
    const names = data.players.map((p) => p.displayName);
    assert.ok(!names.includes(formerPlayerFixture.displayName), "Former player must NOT be in public roster");
    assert.ok(!names.includes(futurePlayerFixture.displayName), "Future player must NOT be in public roster");

    // Ordinamento: maglia 2, poi 10, poi null (Zeno SenzaNumero)
    assert.equal(data.players[0].jerseyNumber, 2);
    assert.equal(data.players[1].jerseyNumber, 10);
    assert.equal(data.players[2].displayName, "Zeno SenzaNumero");
    assert.equal(data.players[2].jerseyNumber, null, "Null jersey must be sorted LAST");
  } finally {
    await app.close();
  }
});
