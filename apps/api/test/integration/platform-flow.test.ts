import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { applyMigrations } from "../../src/persistence/migrate.js";
import { DomainError } from "../../src/platform/errors.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

type InjectResponse = Awaited<ReturnType<Awaited<ReturnType<typeof createApp>>["inject"]>>;

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

      for (const url of [
        "/api/v1/admin/seasons",
        "/api/v1/admin/players",
        "/api/v1/admin/roster-memberships",
        "/api/v1/admin/opponents",
        "/api/v1/admin/competitions",
        "/api/v1/admin/matches",
      ]) {
        const unauthorizedRead: InjectResponse = await app.inject({ method: "GET", url });
        assert.equal(unauthorizedRead.statusCode, 401, `${url} must require admin authorization`);
      }

      const headers = { authorization: "Bearer integration-admin" };
      const seasonResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: { label: "2026/2027", startsOn: "2026-08-01", endsOn: "2027-07-31" },
      });
      assert.equal(seasonResponse.statusCode, 201, seasonResponse.payload);
      const season = seasonResponse.json<{ id: string }>();
      const initialSeasons = await app.inject({ method: "GET", url: "/api/v1/admin/seasons", headers });
      assert.equal(initialSeasons.statusCode, 200, initialSeasons.payload);
      assert.deepEqual(initialSeasons.json<Array<{ id: string }>>().map(({ id }) => id), [season.id]);

      const historicalSeasonResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: { label: "2024/2025", startsOn: "2024-08-01", endsOn: "2025-07-31" },
      });
      assert.equal(historicalSeasonResponse.statusCode, 201, historicalSeasonResponse.payload);
      const historicalSeason = historicalSeasonResponse.json<{ id: string }>();

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
      const adminPlayers = await app.inject({ method: "GET", url: "/api/v1/admin/players", headers });
      assert.equal(adminPlayers.statusCode, 200, adminPlayers.payload);
      assert.deepEqual(adminPlayers.json<Array<{ id: string }>>().map(({ id }) => id), [player.id]);

      const outsideSeasonStart = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: { playerId: player.id, seasonId: season.id, activeFrom: "2026-07-31" },
      });
      assert.equal(outsideSeasonStart.statusCode, 400);
      assert.deepEqual(outsideSeasonStart.json(), { error: "roster_membership_outside_season" });
      const outsideSeasonEnd = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: { playerId: player.id, seasonId: season.id, activeFrom: "2027-08-01" },
      });
      assert.equal(outsideSeasonEnd.statusCode, 400);
      assert.deepEqual(outsideSeasonEnd.json(), { error: "roster_membership_outside_season" });

      const membershipResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: { playerId: player.id, seasonId: season.id, jerseyNumber: 10, activeFrom: "2026-08-01" },
      });
      assert.equal(membershipResponse.statusCode, 201, membershipResponse.payload);
      const membership = membershipResponse.json<{ id: string }>();
      const invalidMembershipEnd = await app.inject({
        method: "POST",
        url: `/api/v1/admin/roster-memberships/${membership.id}/end`,
        headers,
        payload: { activeUntil: "2027-08-01" },
      });
      assert.equal(invalidMembershipEnd.statusCode, 400);
      assert.deepEqual(invalidMembershipEnd.json(), { error: "roster_membership_outside_season" });

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

      const endMembership = await app.inject({
        method: "POST",
        url: `/api/v1/admin/roster-memberships/${membership.id}/end`,
        headers,
        payload: { activeUntil: "2026-09-30", reason: "Temporary departure" },
      });
      assert.equal(endMembership.statusCode, 200, endMembership.payload);
      const reentryMembership = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: {
          playerId: player.id,
          seasonId: season.id,
          jerseyNumber: 10,
          activeFrom: "2026-10-01",
        },
      });
      assert.equal(reentryMembership.statusCode, 201, reentryMembership.payload);
      const inclusiveOverlap = await app.inject({
        method: "POST",
        url: "/api/v1/admin/roster-memberships",
        headers,
        payload: {
          playerId: player.id,
          seasonId: season.id,
          activeFrom: "2026-09-30",
          activeUntil: "2026-10-02",
        },
      });
      assert.equal(inclusiveOverlap.statusCode, 409);
      assert.deepEqual(inclusiveOverlap.json(), { error: "roster_membership_period_overlaps" });

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
          seasonId: historicalSeason.id,
          activeFrom: "2025-02-01",
          activeUntil: "2025-02-28",
        },
      });
      assert.equal(formerMembership.statusCode, 201, formerMembership.payload);

      const seasonsWithHistory = await app.inject({ method: "GET", url: "/api/v1/admin/seasons", headers });
      assert.equal(seasonsWithHistory.statusCode, 200, seasonsWithHistory.payload);
      assert.deepEqual(
        seasonsWithHistory.json<Array<{ label: string }>>().map(({ label }) => label),
        ["2026/2027", "2024/2025"],
      );
      const currentSeasonMemberships = await app.inject({
        method: "GET",
        url: `/api/v1/admin/roster-memberships?seasonId=${season.id}`,
        headers,
      });
      assert.equal(currentSeasonMemberships.statusCode, 200, currentSeasonMemberships.payload);
      assert.equal(currentSeasonMemberships.json<unknown[]>().length, 2);
      const playerMemberships = await app.inject({
        method: "GET",
        url: `/api/v1/admin/roster-memberships?playerId=${player.id}`,
        headers,
      });
      assert.equal(playerMemberships.statusCode, 200, playerMemberships.payload);
      assert.equal(playerMemberships.json<unknown[]>().length, 2);
      const invalidMembershipFilter = await app.inject({
        method: "GET",
        url: "/api/v1/admin/roster-memberships?seasonId=invalid",
        headers,
      });
      assert.equal(invalidMembershipFilter.statusCode, 400);

      const opponentResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/opponents",
        headers,
        payload: { name: "Away Club" },
      });
      const opponent = opponentResponse.json<{ id: string }>();
      const listedOpponents = await app.inject({ method: "GET", url: "/api/v1/admin/opponents", headers });
      assert.equal(listedOpponents.statusCode, 200, listedOpponents.payload);
      assert.deepEqual(listedOpponents.json<Array<{ id: string }>>().map(({ id }) => id), [opponent.id]);
      const competitionResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/competitions",
        headers,
        payload: { name: "League", category: "league", isOfficial: true },
      });
      const competition = competitionResponse.json<{ id: string }>();
      const listedCompetitions = await app.inject({ method: "GET", url: "/api/v1/admin/competitions", headers });
      assert.equal(listedCompetitions.statusCode, 200, listedCompetitions.payload);
      assert.deepEqual(listedCompetitions.json<Array<{ id: string }>>().map(({ id }) => id), [competition.id]);

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

      const beyondSeasonMatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId: season.id,
          opponentId: opponent.id,
          competitionId: competition.id,
          isOfficial: true,
          scheduledAt: "2027-08-01T15:00:00.000Z",
        },
      });
      assert.equal(beyondSeasonMatchResponse.statusCode, 201, beyondSeasonMatchResponse.payload);
      const beyondSeasonMatch = beyondSeasonMatchResponse.json<{ id: string }>();
      const draftMatchResponse = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId: season.id,
          opponentId: opponent.id,
          competitionId: competition.id,
          isOfficial: true,
          status: "to_be_scheduled",
        },
      });
      assert.equal(draftMatchResponse.statusCode, 201, draftMatchResponse.payload);
      const draftMatch = draftMatchResponse.json<{ id: string }>();

      const adminMatchesBeforePublish = await app.inject({ method: "GET", url: "/api/v1/admin/matches", headers });
      assert.equal(adminMatchesBeforePublish.statusCode, 200, adminMatchesBeforePublish.payload);
      const listedAdminMatches = adminMatchesBeforePublish.json<Array<{ id: string; publishedAt: string | null; status: string }>>();
      assert.equal(listedAdminMatches.length, 3);
      assert.ok(listedAdminMatches.every(({ publishedAt }) => publishedAt === null));
      assert.ok(listedAdminMatches.some(({ id }) => id === draftMatch.id && listedAdminMatches.find((item) => item.id === id)?.status === "to_be_scheduled"));
      const seasonMatches = await app.inject({
        method: "GET",
        url: `/api/v1/admin/matches?seasonId=${season.id}`,
        headers,
      });
      assert.equal(seasonMatches.statusCode, 200, seasonMatches.payload);
      assert.equal(seasonMatches.json<unknown[]>().length, 3);
      const invalidMatchFilter = await app.inject({
        method: "GET",
        url: "/api/v1/admin/matches?seasonId=invalid",
        headers,
      });
      assert.equal(invalidMatchFilter.statusCode, 400);

      const unavailablePublicDetail = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${match.id}`,
      });
      assert.equal(unavailablePublicDetail.statusCode, 404);
      assert.deepEqual(unavailablePublicDetail.json(), { error: "public_team_not_found" });
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
      const unpublishedDetail = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${match.id}`,
      });
      assert.equal(unpublishedDetail.statusCode, 404);
      assert.deepEqual(unpublishedDetail.json(), { error: "public_match_not_found" });

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

      // Seed a completed record directly in PostgreSQL: result-entry workflows are not part of this slice.
      await scopedPool.query(
        `UPDATE matches SET status = 'completed', scheduled_at = $2 WHERE id = $1`,
        [draftMatch.id, "2026-12-01T15:00:00.000Z"],
      );
      const completedBeforeResult = await scopedPool.query<{ scheduled_at: Date | null; status: string }>(
        "SELECT scheduled_at, status FROM matches WHERE id = $1",
        [draftMatch.id],
      );
      const completedBefore = completedBeforeResult.rows[0];
      assert.ok(completedBefore, "completed fixture must exist in PostgreSQL");
      assert.equal(completedBefore.status, "completed");
      assert.equal(completedBefore.scheduled_at?.toISOString(), "2026-12-01T15:00:00.000Z");
      const completedHistoryBefore = await scopedPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM match_schedule_history WHERE match_id = $1",
        [draftMatch.id],
      );

      const mutateCompletedMatch = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/matches/${draftMatch.id}/schedule`,
        headers,
        payload: {
          scheduledAt: "2026-12-08T15:00:00.000Z",
          status: "postponed",
          reason: "Must not change a completed match",
        },
      });
      assert.equal(mutateCompletedMatch.statusCode, 400);
      assert.deepEqual(mutateCompletedMatch.json(), { error: "completed_match_schedule_is_immutable" });

      const completedAfterResult = await scopedPool.query<{ scheduled_at: Date | null; status: string }>(
        "SELECT scheduled_at, status FROM matches WHERE id = $1",
        [draftMatch.id],
      );
      const completedAfter = completedAfterResult.rows[0];
      assert.ok(completedAfter, "completed fixture must still exist in PostgreSQL");
      assert.equal(completedAfter.status, "completed");
      assert.equal(completedAfter.scheduled_at?.toISOString(), completedBefore.scheduled_at?.toISOString());
      const completedHistoryAfter = await scopedPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM match_schedule_history WHERE match_id = $1",
        [draftMatch.id],
      );
      assert.equal(completedHistoryAfter.rows[0]?.count, completedHistoryBefore.rows[0]?.count);

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
      const publicMatchDetail = await app.inject({
        method: "GET",
        url: `/api/v1/public/matches/${match.id}`,
      });
      assert.equal(publicMatchDetail.statusCode, 200, publicMatchDetail.payload);
      assert.deepEqual(publicMatchDetail.json(), {
        id: match.id,
        seasonId: season.id,
        opponentName: "Away Club",
        competitionName: "League",
        isOfficial: true,
        scheduledAt: "2026-11-08T15:00:00.000Z",
        status: "scheduled",
      });
      for (const unpublishedId of [beyondSeasonMatch.id, draftMatch.id]) {
        const hiddenDetail: InjectResponse = await app.inject({
          method: "GET",
          url: `/api/v1/public/matches/${unpublishedId}`,
        });
        assert.equal(hiddenDetail.statusCode, 404);
        assert.deepEqual(hiddenDetail.json(), { error: "public_match_not_found" });
      }
      const allAdminMatches = await app.inject({ method: "GET", url: "/api/v1/admin/matches", headers });
      assert.equal(allAdminMatches.statusCode, 200, allAdminMatches.payload);
      assert.equal(allAdminMatches.json<unknown[]>().length, 3);

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
