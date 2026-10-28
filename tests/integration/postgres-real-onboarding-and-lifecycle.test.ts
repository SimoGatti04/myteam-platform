import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../../apps/api/src/app.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createScopedPostgresContext, isEnvironmentalConnectionError } from "../helpers/pg-test-helper.js";
import {
  realisticSeasonFixture,
  realisticTeamProfileFixture,
  realisticOpponentsFixture,
} from "../fixtures/q1-realistic-fixtures.js";

const testDbUrl = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL Real: Complete Onboarding & Match Lifecycle (12-step path)",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL lifecycle test" : false },
  async (t) => {
    let ctx;
    try {
      ctx = await createScopedPostgresContext();
    } catch (err: any) {
      if (isEnvironmentalConnectionError(err)) {
        t.skip(`PostgreSQL unreachable in current sandbox environment (${err.code || err.message}); gate marked NOT RUN per protocol`);
        return;
      }
      throw err; // SQL, schema, or migration failure must fail the test!
    }
    if (!ctx) return;

    const { scopedPool, cleanup } = ctx;
    let app: ReturnType<typeof createApp> | undefined;

    try {
      const headers = { authorization: "Bearer pg-admin-onboarding" };
      const verifyToken = async (header: string | undefined) => {
        if (!header) throw new DomainError(401, "authentication_required");
        if (header === "Bearer pg-admin-onboarding") return { subject: "pg-admin-user" };
        throw new DomainError(403, "insufficient_permissions");
      };

      app = createApp({ logger: false, pool: scopedPool, verifyAdminToken: verifyToken });

      // Step 1: Database di test inizialmente vuoto
      const initTeam = await app.inject({ method: "GET", url: "/api/v1/admin/team", headers });
      assert.equal(initTeam.statusCode, 200);
      assert.equal(initTeam.json(), null, "Initial team profile must be null on empty PG schema");

      const initSeasons = await app.inject({ method: "GET", url: "/api/v1/admin/seasons", headers });
      assert.equal(initSeasons.statusCode, 200);
      assert.deepEqual(initSeasons.json(), [], "Initial seasons list must be empty array on empty PG schema");

      // Step 2: Accesso amministrativo autorizzato (già verificato con headers)
      // Step 3 & 4: Creazione prima stagione
      const sRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: {
          label: "2026/2027",
          startsOn: "2026-09-01",
          endsOn: "2027-06-30",
        },
      });
      assert.equal(sRes.statusCode, 201);
      const season = sRes.json<{ id: string; label: string }>();
      assert.equal(season.label, "2026/2027");

      // Step 5: Selezione e salvataggio come stagione corrente + configurazione squadra
      const teamConfigRes = await app.inject({
        method: "PUT",
        url: "/api/v1/admin/team",
        headers,
        payload: {
          name: realisticTeamProfileFixture.name,
          crestUrl: realisticTeamProfileFixture.crestUrl,
          primaryColor: "#1E3A8A",
          secondaryColor: "#38BDF8",
          currentSeasonId: season.id,
        },
      });
      assert.equal(teamConfigRes.statusCode, 200);
      const configuredTeam = teamConfigRes.json<{ currentSeasonId: string; publishedAt: string | null }>();
      assert.equal(configuredTeam.currentSeasonId, season.id);
      assert.equal(configuredTeam.publishedAt, null, "Team starts in draft");

      // Step 6: Pubblicazione della squadra
      const pubTeamRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/team/publish",
        headers,
      });
      assert.equal(pubTeamRes.statusCode, 200);
      assert.ok(pubTeamRes.json<{ publishedAt: string }>().publishedAt);

      // Step 7: Creazione di un'avversaria
      const oppRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/opponents",
        headers,
        payload: realisticOpponentsFixture[0],
      });
      assert.equal(oppRes.statusCode, 201);
      const opponent = oppRes.json<{ id: string; name: string }>();
      assert.equal(opponent.name, realisticOpponentsFixture[0].name);

      // Step 8: Creazione di una partita come BOZZA (senza publishedAt)
      const matchRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId: season.id,
          opponentId: opponent.id,
          isOfficial: true,
          scheduledAt: "2026-10-15T15:00:00.000Z",
        },
      });
      assert.equal(matchRes.statusCode, 201);
      const match = matchRes.json<{ id: string; status: string; publishedAt: string | null }>();
      assert.equal(match.status, "scheduled");
      assert.equal(match.publishedAt, null, "Match is created as a draft");

      // Step 9: Verifica che la partita NON sia pubblica (né in lista né in dettaglio)
      const pubMatchesPre = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
      assert.equal(pubMatchesPre.statusCode, 200);
      const scheduledIds = pubMatchesPre.json<{ scheduled: Array<{ id: string }> }>().scheduled.map((m) => m.id);
      assert.ok(!scheduledIds.includes(match.id), "Draft match must not appear in public scheduled list");

      const pubDetailPre = await app.inject({ method: "GET", url: `/api/v1/public/matches/${match.id}` });
      assert.equal(pubDetailPre.statusCode, 404, "Draft match detail must return 404 on public route");
      assert.equal(pubDetailPre.json().error, "public_match_not_found");

      // Step 10: Pubblicazione esplicita della partita
      const pubMatchRes = await app.inject({
        method: "POST",
        url: `/api/v1/admin/matches/${match.id}/publish`,
        headers,
      });
      assert.equal(pubMatchRes.statusCode, 200);

      // Step 11: Verifica della sua comparsa nel sito pubblico (lista e dettaglio)
      const pubMatchesPost = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
      assert.equal(pubMatchesPost.statusCode, 200);
      const postIds = pubMatchesPost.json<{ scheduled: Array<{ id: string }> }>().scheduled.map((m) => m.id);
      assert.ok(postIds.includes(match.id), "Published match must appear in public scheduled list");

      const pubDetailPost = await app.inject({ method: "GET", url: `/api/v1/public/matches/${match.id}` });
      assert.equal(pubDetailPost.statusCode, 200);
      const detail = pubDetailPost.json<{ id: string; opponentName: string; status: string }>();
      assert.equal(detail.id, match.id);
      assert.equal(detail.opponentName, opponent.name);
      assert.equal(detail.status, "scheduled");

      // Step 12: Riavvio backend e verifica della persistenza
      await app.close();
      // Ricreiamo una nuova istanza di Fastify connessa allo STESSO schema PostgreSQL
      const restartedApp = createApp({ logger: false, pool: scopedPool, verifyAdminToken: verifyToken });
      try {
        const restartedTeam = await restartedApp.inject({ method: "GET", url: "/api/v1/public/team" });
        assert.equal(restartedTeam.statusCode, 200);
        assert.equal(restartedTeam.json<{ name: string }>().name, realisticTeamProfileFixture.name);

        const restartedMatchDetail = await restartedApp.inject({ method: "GET", url: `/api/v1/public/matches/${match.id}` });
        assert.equal(restartedMatchDetail.statusCode, 200);
        assert.equal(restartedMatchDetail.json<{ opponentName: string }>().opponentName, opponent.name);
      } finally {
        await restartedApp.close();
      }
    } finally {
      if (app) await app.close();
      await cleanup();
    }
  },
);
