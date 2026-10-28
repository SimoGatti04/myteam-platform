import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { applyMigrations } from "../../src/persistence/migrate.js";
import { DomainError } from "../../src/platform/errors.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl && process.env.REQUIRE_POSTGRES_INTEGRATION === "1") {
  throw new Error("TEST_DATABASE_URL is required; run `pnpm db:up` and copy .env.example to .env");
}

test(
  "PostgreSQL migration and public platform flow",
  { skip: !testDatabaseUrl ? "Set TEST_DATABASE_URL to a local *_test database" : false },
  async () => {
    const databaseUrl = new URL(testDatabaseUrl!);
    const hostname = databaseUrl.hostname.replace(/^\[|\]$/g, "");
    const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
    assert.ok(["localhost", "127.0.0.1", "::1"].includes(hostname), "integration DB must be local");
    assert.ok(databaseName.endsWith("_test"), "integration DB name must end in _test");

    const adminPool = new Pool({ connectionString: testDatabaseUrl });
    const schema = `test_${randomUUID().replaceAll("-", "")}`;
    let scopedPool: Pool | undefined;
    let app: Awaited<ReturnType<typeof createApp>> | undefined;
    try {
      await adminPool.query(`CREATE SCHEMA "${schema}"`);
      scopedPool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}` });
      assert.deepEqual(await applyMigrations(scopedPool), ["0001-platform-core.sql"]);
      assert.deepEqual(await applyMigrations(scopedPool), []);

      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (authorizationHeader) => {
          if (authorizationHeader !== "Bearer integration-admin") {
            throw new DomainError(401, "authentication_required");
          }
          return { subject: "integration-admin" };
        },
      });

      const publicTeamBefore = await app.inject({ method: "GET", url: "/api/v1/public/team" });
      assert.equal(publicTeamBefore.statusCode, 404);
      assert.deepEqual(publicTeamBefore.json(), { error: "public_team_not_found" });

      const unauthenticatedWrite = await app.inject({
        method: "PUT",
        url: "/api/v1/admin/team",
        payload: { name: "MAPI" },
      });
      assert.equal(unauthenticatedWrite.statusCode, 401);

      const headers = { authorization: "Bearer integration-admin" };
      const seasonResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: { label: "2026/2027", startsOn: "2026-08-01", endsOn: "2027-07-31" },
      });
      assert.equal(seasonResponse.statusCode, 201, seasonResponse.payload);
      const season = seasonResponse.json<{ id: string }>();

      const teamConfig = await app.inject({
        method: "PUT",
        url: "/api/v1/admin/team",
        headers,
        payload: {
          name: "MAPI GROUP",
          crestUrl: "https://example.test/crest.png",
          currentSeasonId: season.id,
        },
      });
      assert.equal(teamConfig.statusCode, 200, teamConfig.payload);

      const playerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers,
        payload: { displayName: "Ada Lovelace" },
      });
      assert.equal(playerResponse.statusCode, 201, playerResponse.payload);
      const player = playerResponse.json<{ id: string }>();

      const membershipResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: { playerId: player.id, seasonId: season.id, jerseyNumber: 10, activeFrom: "2026-08-01" },
      });
      assert.equal(membershipResponse.statusCode, 201, membershipResponse.payload);
      const overlappingMembership = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: {
          playerId: player.id,
          seasonId: season.id,
          activeFrom: "2026-09-01",
          activeUntil: "2026-09-03",
        },
      });
      assert.equal(overlappingMembership.statusCode, 409);
      assert.deepEqual(overlappingMembership.json(), { error: "roster_membership_period_overlaps" });

      const formerPlayerResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers,
        payload: { displayName: "Former Player" },
      });
      const formerPlayer = formerPlayerResponse.json<{ id: string }>();
      const formerMembership = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: {
          playerId: formerPlayer.id,
          seasonId: season.id,
          activeFrom: "2025-08-01",
          activeUntil: "2025-08-31",
        },
      });
      assert.equal(formerMembership.statusCode, 201, formerMembership.payload);

      const opponentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/opponents",
        headers,
        payload: { name: "Away Club" },
      });
      const opponent = opponentResponse.json<{ id: string }>();
      const competitionResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/competitions",
        headers,
        payload: { name: "League", category: "league", isOfficial: true },
      });
      const competition = competitionResponse.json<{ id: string }>();

      const matchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId: season.id,
          opponentId: opponent.id,
          competitionId: competition.id,
          isOfficial: true,
          scheduledAt: "2026-11-01T15:00:00.000Z",
        },
      });
      assert.equal(matchResponse.statusCode, 201, matchResponse.payload);
      const match = matchResponse.json<{ id: string }>();

      const publicMatchesBeforePublish = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
      assert.equal(publicMatchesBeforePublish.statusCode, 404);

      const teamPublish = await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers });
      assert.equal(teamPublish.statusCode, 200, teamPublish.payload);
      const firstPublishedAt = teamPublish.json<{ publishedAt: string }>().publishedAt;
      const repeatedTeamPublish = await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers });
      assert.equal(repeatedTeamPublish.json<{ publishedAt: string }>().publishedAt, firstPublishedAt);

      const clearPublishedTeamName = await app.inject({
        method: "PUT",
        url: "/api/v1/admin/team",
        headers,
        payload: { name: null },
      });
      assert.equal(clearPublishedTeamName.statusCode, 400);
      assert.deepEqual(clearPublishedTeamName.json(), { error: "team_name_and_crest_required_when_published" });

      const hiddenMatches = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
      assert.equal(hiddenMatches.statusCode, 200, hiddenMatches.payload);
      assert.deepEqual(hiddenMatches.json(), { scheduled: [], toBeScheduled: [] });

      const matchPublish = await app.inject({
        method: "POST",
        url: `/api/v1/admin/matches/${match.id}/publish`,
        headers,
      });
      assert.equal(matchPublish.statusCode, 200, matchPublish.payload);

      const reschedule = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/matches/${match.id}/schedule`,
        headers,
        payload: { scheduledAt: "2026-11-08T15:00:00.000Z", reason: "Calendar correction" },
      });
      assert.equal(reschedule.statusCode, 200, reschedule.payload);
      const noOpReschedule = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/matches/${match.id}/schedule`,
        headers,
        payload: { scheduledAt: "2026-11-08T15:00:00.000Z", status: "scheduled", reason: "No state change" },
      });
      assert.equal(noOpReschedule.statusCode, 200, noOpReschedule.payload);

      const publicTeam = await app.inject({ method: "GET", url: "/api/v1/public/team" });
      assert.equal(publicTeam.statusCode, 200, publicTeam.payload);
      assert.equal(publicTeam.json<{ currentSeason: { id: string } }>().currentSeason.id, season.id);

      const publicRoster = await app.inject({ method: "GET", url: "/api/v1/public/roster" });
      assert.equal(publicRoster.statusCode, 200, publicRoster.payload);
      assert.deepEqual(
        publicRoster.json<{ players: Array<{ id: string }> }>().players.map(({ id }) => id),
        [player.id],
      );

      const publicMatches = await app.inject({ method: "GET", url: "/api/v1/public/matches" });
      assert.equal(publicMatches.statusCode, 200, publicMatches.payload);
      assert.equal(publicMatches.json<{ scheduled: Array<{ id: string; scheduledAt: string }> }>().scheduled[0]?.id, match.id);
      assert.equal(
        publicMatches.json<{ scheduled: Array<{ scheduledAt: string }> }>().scheduled[0]?.scheduledAt,
        "2026-11-08T15:00:00.000Z",
      );

      const history = await scopedPool.query<{ scheduled_at: Date | null; status: string; reason: string | null }>(
        `SELECT scheduled_at, status, reason FROM match_schedule_history WHERE match_id = $1 ORDER BY recorded_at, id`,
        [match.id],
      );
      assert.equal(history.rowCount, 2);
      assert.equal(history.rows[0]?.reason, null);
      assert.equal(history.rows[1]?.reason, "Calendar correction");

      const teamAudit = await scopedPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM audit_events WHERE entity_type = 'team' AND entity_id = '1'",
      );
      assert.ok(Number(teamAudit.rows[0]?.count) >= 1, "singleton team audit event is persisted");
    } finally {
      if (app) await app.close();
      if (scopedPool) await scopedPool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  },
);
