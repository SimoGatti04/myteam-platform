import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { applyMigrations } from "../../src/persistence/migrate.js";
import { DomainError } from "../../src/platform/errors.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

type Method = "GET" | "POST" | "PUT" | "PATCH";

if (!testDatabaseUrl && process.env.REQUIRE_POSTGRES_INTEGRATION === "1") {
  throw new Error("TEST_DATABASE_URL is required; run `pnpm db:up` and copy .env.example to .env");
}

test(
  "PostgreSQL match result, events, audit and public privacy projection",
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
      assert.deepEqual(await applyMigrations(scopedPool), [
        "0001-platform-core.sql",
        "0002-match-results-and-events.sql",
      ]);
      assert.deepEqual(await applyMigrations(scopedPool), []);

      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (authorizationHeader) => {
          if (authorizationHeader === "Bearer denied") {
            throw new DomainError(403, "admin_permission_required");
          }
          if (authorizationHeader !== "Bearer admin") {
            throw new DomainError(401, "authentication_required");
          }
          return { subject: "admin-user" };
        },
      });
      const api = app;

      const call = (method: Method, url: string, payload?: object, authorization: string | null = "Bearer admin") =>
        api.inject({
          method,
          url,
          headers: authorization === null ? {} : { authorization },
          ...(payload === undefined ? {} : { payload }),
        });

      // ---- authenticated admin setup through the API ----
      const seasonResponse = await call("POST", "/api/v1/admin/seasons", {
        label: `C2 ${randomUUID().slice(0, 8)}`,
        startsOn: "2026-08-01",
        endsOn: "2027-05-31",
      });
      assert.equal(seasonResponse.statusCode, 201, seasonResponse.payload);
      const season = seasonResponse.json<{ id: string }>();

      const scorerResponse = await call("POST", "/api/v1/admin/players", { displayName: "Mario Rossi" });
      assert.equal(scorerResponse.statusCode, 201, scorerResponse.payload);
      const scorer = scorerResponse.json<{ id: string }>();
      const assistResponse = await call("POST", "/api/v1/admin/players", { displayName: "Luca Bianchi" });
      assert.equal(assistResponse.statusCode, 201, assistResponse.payload);
      const assist = assistResponse.json<{ id: string }>();

      const opponentResponse = await call("POST", "/api/v1/admin/opponents", { name: "Avversaria C2" });
      assert.equal(opponentResponse.statusCode, 201, opponentResponse.payload);
      const opponent = opponentResponse.json<{ id: string }>();

      const competitionResponse = await call("POST", "/api/v1/admin/competitions", {
        name: "Campionato C2",
        category: "league",
        isOfficial: true,
      });
      assert.equal(competitionResponse.statusCode, 201, competitionResponse.payload);
      const competition = competitionResponse.json<{ id: string }>();

      const teamResponse = await call("PUT", "/api/v1/admin/team", {
        name: "MyTeam C2",
        crestUrl: "https://example.com/crest.png",
        primaryColor: "#112233",
        secondaryColor: "#FFFFFF",
        currentSeasonId: season.id,
      });
      assert.equal(teamResponse.statusCode, 200, teamResponse.payload);
      const publishTeamResponse = await call("POST", "/api/v1/admin/team/publish");
      assert.equal(publishTeamResponse.statusCode, 200, publishTeamResponse.payload);

      const createMatch = async (scheduledAt: string) => {
        const response = await call("POST", "/api/v1/admin/matches", {
          seasonId: season.id,
          opponentId: opponent.id,
          competitionId: competition.id,
          isOfficial: true,
          scheduledAt,
        });
        assert.equal(response.statusCode, 201, response.payload);
        return response.json<{ id: string }>();
      };
      const match = await createMatch("2026-11-01T15:00:00.000Z");

      // ---- authorization and preconditions ----
      const unauthenticated = await call("GET", `/api/v1/admin/matches/${match.id}/result`, undefined, null);
      assert.equal(unauthenticated.statusCode, 401);
      assert.equal(unauthenticated.json<{ error: string }>().error, "authentication_required");

      const forbidden = await call("GET", `/api/v1/admin/matches/${match.id}/result`, undefined, "Bearer denied");
      assert.equal(forbidden.statusCode, 403);
      assert.equal(forbidden.json<{ error: string }>().error, "admin_permission_required");

      const missingResult = await call("GET", `/api/v1/admin/matches/${match.id}/result`);
      assert.equal(missingResult.statusCode, 404, missingResult.payload);
      assert.equal(missingResult.json<{ error: string }>().error, "match_result_not_found");

      const invalidScore = await call("PUT", `/api/v1/admin/matches/${match.id}/result`, {
        teamScore: -1,
        opponentScore: 0,
      });
      assert.equal(invalidScore.statusCode, 400, invalidScore.payload);
      assert.equal(invalidScore.json<{ error: string }>().error, "request_validation_failed");

      // ---- admin result write -> DB audit ----
      const resultResponse = await call("PUT", `/api/v1/admin/matches/${match.id}/result`, {
        teamScore: 2,
        opponentScore: 1,
        reason: "referto amministrativo",
      });
      assert.equal(resultResponse.statusCode, 200, resultResponse.payload);
      const result = resultResponse.json<{
        matchId: string;
        teamScore: number;
        opponentScore: number;
        recordedAt: string;
        updatedAt: string;
      }>();
      assert.equal(result.matchId, match.id);
      assert.equal(result.teamScore, 2);
      assert.equal(result.opponentScore, 1);
      assert.ok(!Number.isNaN(Date.parse(result.recordedAt)));

      const resultRow = (await scopedPool.query(
        `SELECT match_id, team_score, opponent_score, source_kind, recorded_by
         FROM match_results WHERE match_id = $1`,
        [match.id],
      )).rows[0];
      assert.deepEqual(resultRow, {
        match_id: match.id,
        team_score: 2,
        opponent_score: 1,
        source_kind: "admin_entry",
        recorded_by: "admin-user",
      });
      const completedRow = (await scopedPool.query(
        "SELECT status FROM matches WHERE id = $1",
        [match.id],
      )).rows[0];
      assert.equal(completedRow.status, "completed");
      const completionHistory = (await scopedPool.query(
        `SELECT status, source_kind, actor_subject, reason
         FROM match_schedule_history WHERE match_id = $1 ORDER BY recorded_at, id`,
        [match.id],
      )).rows;
      assert.deepEqual(completionHistory.at(-1), {
        status: "completed",
        source_kind: "admin_entry",
        actor_subject: "admin-user",
        reason: "referto amministrativo",
      });
      const createAudit = (await scopedPool.query(
        `SELECT operation, source_kind, actor_subject, changes
         FROM audit_events
         WHERE entity_type = 'match_result' AND entity_id = $1
         ORDER BY recorded_at, id`,
        [match.id],
      )).rows;
      assert.equal(createAudit.length, 1);
      assert.equal(createAudit[0].operation, "create");
      assert.equal(createAudit[0].source_kind, "admin_entry");
      assert.equal(createAudit[0].actor_subject, "admin-user");
      assert.deepEqual(createAudit[0].changes, {
        teamScore: { before: null, after: 2 },
        opponentScore: { before: null, after: 1 },
      });

      const readResult = await call("GET", `/api/v1/admin/matches/${match.id}/result`);
      assert.equal(readResult.statusCode, 200, readResult.payload);
      assert.equal(readResult.json<{ teamScore: number }>().teamScore, 2);

      // ---- idempotent event creation, conflicts and ordering ----
      const firstGoalPayload = {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 20,
        playerId: scorer.id,
        assistPlayerId: assist.id,
        clientEventId: "goal-first-half-20",
      };
      const firstGoal = await call("POST", `/api/v1/admin/matches/${match.id}/events`, firstGoalPayload);
      assert.equal(firstGoal.statusCode, 201, firstGoal.payload);
      const firstGoalEvent = firstGoal.json<{ id: string; player: { displayName: string } }>();
      assert.equal(firstGoalEvent.player.displayName, "Mario Rossi");

      const retriedGoal = await call("POST", `/api/v1/admin/matches/${match.id}/events`, firstGoalPayload);
      assert.equal(retriedGoal.statusCode, 200, retriedGoal.payload);
      assert.equal(retriedGoal.json<{ id: string }>().id, firstGoalEvent.id);

      const conflictingRetry = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        ...firstGoalPayload,
        minute: 19,
      });
      assert.equal(conflictingRetry.statusCode, 409, conflictingRetry.payload);
      assert.equal(conflictingRetry.json<{ error: string }>().error, "idempotency_key_conflict");

      const secondHalfGoal = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "goal",
        side: "team",
        period: 2,
        minute: 1,
        playerId: assist.id,
      });
      assert.equal(secondHalfGoal.statusCode, 201, secondHalfGoal.payload);

      const opponentCard = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "yellow_card",
        side: "opponent",
        period: 2,
        minute: 10,
      });
      assert.equal(opponentCard.statusCode, 201, opponentCard.payload);

      const missingScorer = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 3,
      });
      assert.equal(missingScorer.statusCode, 400, missingScorer.payload);
      assert.equal(missingScorer.json<{ error: string }>().error, "match_event_player_required");

      const wrongSideIdentity = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "goal",
        side: "opponent",
        period: 1,
        minute: 4,
        playerId: scorer.id,
      });
      assert.equal(wrongSideIdentity.statusCode, 400, wrongSideIdentity.payload);
      assert.equal(wrongSideIdentity.json<{ error: string }>().error, "match_event_player_not_allowed");

      const unknownPlayer = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 6,
        playerId: randomUUID(),
      });
      assert.equal(unknownPlayer.statusCode, 404, unknownPlayer.payload);
      assert.equal(unknownPlayer.json<{ error: string }>().error, "match_event_player_not_found");

      const unknownAssist = await call("POST", `/api/v1/admin/matches/${match.id}/events`, {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 7,
        playerId: scorer.id,
        assistPlayerId: randomUUID(),
      });
      assert.equal(unknownAssist.statusCode, 404, unknownAssist.payload);
      assert.equal(unknownAssist.json<{ error: string }>().error, "match_event_assist_player_not_found");

      const eventsResponse = await call("GET", `/api/v1/admin/matches/${match.id}/events`);
      assert.equal(eventsResponse.statusCode, 200, eventsResponse.payload);
      const adminEvents = eventsResponse.json<Array<{ id: string; period: number; minute: number; kind: string }>>();
      assert.deepEqual(
        adminEvents.map(({ period, minute, kind }) => [period, minute, kind]),
        [
          [1, 20, "goal"],
          [2, 1, "goal"],
          [2, 10, "yellow_card"],
        ],
        "events must sort by period first, then minute",
      );
      const eventCount = (await scopedPool.query(
        "SELECT count(*)::int AS count FROM match_events WHERE match_id = $1",
        [match.id],
      )).rows[0].count;
      assert.equal(eventCount, 3);
      const eventAuditCount = (await scopedPool.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE entity_type = 'match_event'",
      )).rows[0].count;
      assert.equal(eventAuditCount, 3);

      // ---- publication gate and public projection ----
      const unpublishedScoreboard = await call(
        "GET",
        `/api/v1/public/matches/${match.id}/scoreboard`,
        undefined,
        null,
      );
      assert.equal(unpublishedScoreboard.statusCode, 404, unpublishedScoreboard.payload);
      assert.equal(
        unpublishedScoreboard.json<{ error: string }>().error,
        "public_match_scoreboard_not_found",
      );

      const publishMatch = await call("POST", `/api/v1/admin/matches/${match.id}/publish`);
      assert.equal(publishMatch.statusCode, 200, publishMatch.payload);

      const scoreboardResponse = await call(
        "GET",
        `/api/v1/public/matches/${match.id}/scoreboard`,
        undefined,
        null,
      );
      assert.equal(scoreboardResponse.statusCode, 200, scoreboardResponse.payload);
      const scoreboard = scoreboardResponse.json<{
        matchId: string;
        status: string;
        teamScore: number;
        opponentScore: number;
        events: Array<{
          kind: string;
          side: string;
          period: number;
          minute: number;
          player: { displayName: string } | null;
          assist: { displayName: string } | null;
        }>;
      }>();
      assert.equal(scoreboard.matchId, match.id);
      assert.equal(scoreboard.status, "completed");
      assert.equal(scoreboard.teamScore, 2);
      assert.equal(scoreboard.opponentScore, 1);
      assert.deepEqual(
        scoreboard.events.map(({ period, minute, kind, side }) => [period, minute, kind, side]),
        [
          [1, 20, "goal", "team"],
          [2, 1, "goal", "team"],
          [2, 10, "yellow_card", "opponent"],
        ],
      );
      assert.equal(scoreboard.events.length, 3);
      assert.equal(scoreboard.events[0]!.player?.displayName, "Mario Rossi");
      assert.equal(scoreboard.events[0]!.assist?.displayName, "Luca Bianchi");
      assert.equal(scoreboard.events[2]!.player, null);
      const publicPayload = scoreboardResponse.payload;
      for (const forbiddenField of ["admin-user", "recordedBy", "sourceKind", "clientEventId", "audit"]) {
        assert.ok(!publicPayload.includes(forbiddenField), `public projection leaked ${forbiddenField}`);
      }

      const existingPublicMatch = await call(
        "GET",
        `/api/v1/public/matches/${match.id}`,
        undefined,
        null,
      );
      assert.equal(existingPublicMatch.statusCode, 200, existingPublicMatch.payload);
      const existingPublicBody = existingPublicMatch.json<Record<string, unknown>>();
      assert.ok(!("result" in existingPublicBody), "existing public match contract must stay unchanged");
      assert.ok(!("events" in existingPublicBody), "existing public match contract must stay unchanged");

      // ---- later admin correction is audited and projected ----
      const correction = await call("PUT", `/api/v1/admin/matches/${match.id}/result`, {
        teamScore: 3,
        opponentScore: 1,
        reason: "correzione referto",
      });
      assert.equal(correction.statusCode, 200, correction.payload);
      const updateAudit = (await scopedPool.query(
        `SELECT operation, reason, changes
         FROM audit_events
         WHERE entity_type = 'match_result' AND entity_id = $1
         ORDER BY recorded_at, id`,
        [match.id],
      )).rows;
      assert.equal(updateAudit.length, 2);
      assert.equal(updateAudit[1].operation, "update");
      assert.equal(updateAudit[1].reason, "correzione referto");
      assert.deepEqual(updateAudit[1].changes, {
        teamScore: { before: 2, after: 3 },
      });
      const correctedScoreboard = await call(
        "GET",
        `/api/v1/public/matches/${match.id}/scoreboard`,
        undefined,
        null,
      );
      assert.equal(correctedScoreboard.statusCode, 200, correctedScoreboard.payload);
      assert.equal(correctedScoreboard.json<{ teamScore: number }>().teamScore, 3);

      // ---- cancelled and unpublished matches fail closed ----
      const cancelledMatch = await createMatch("2026-11-08T15:00:00.000Z");
      const cancel = await call("PATCH", `/api/v1/admin/matches/${cancelledMatch.id}/schedule`, {
        status: "cancelled",
        reason: "rinviata",
      });
      assert.equal(cancel.statusCode, 200, cancel.payload);
      const cancelledResult = await call("PUT", `/api/v1/admin/matches/${cancelledMatch.id}/result`, {
        teamScore: 0,
        opponentScore: 0,
      });
      assert.equal(cancelledResult.statusCode, 409, cancelledResult.payload);
      assert.equal(cancelledResult.json<{ error: string }>().error, "cancelled_match_result_not_allowed");
      const cancelledEvent = await call("POST", `/api/v1/admin/matches/${cancelledMatch.id}/events`, {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 1,
        playerId: scorer.id,
      });
      assert.equal(cancelledEvent.statusCode, 409, cancelledEvent.payload);
      assert.equal(cancelledEvent.json<{ error: string }>().error, "cancelled_match_event_not_allowed");

      const unpublishedMatch = await createMatch("2026-11-15T15:00:00.000Z");
      const unpublishedResult = await call("PUT", `/api/v1/admin/matches/${unpublishedMatch.id}/result`, {
        teamScore: 1,
        opponentScore: 0,
      });
      assert.equal(unpublishedResult.statusCode, 200, unpublishedResult.payload);
      const stillPrivate = await call(
        "GET",
        `/api/v1/public/matches/${unpublishedMatch.id}/scoreboard`,
        undefined,
        null,
      );
      assert.equal(stillPrivate.statusCode, 404, stillPrivate.payload);

      const publishedMatchWithoutResult = await createMatch("2026-11-22T15:00:00.000Z");
      const publishWithoutResult = await call(
        "POST",
        `/api/v1/admin/matches/${publishedMatchWithoutResult.id}/publish`,
      );
      assert.equal(publishWithoutResult.statusCode, 200, publishWithoutResult.payload);
      const noResultScoreboard = await call(
        "GET",
        `/api/v1/public/matches/${publishedMatchWithoutResult.id}/scoreboard`,
        undefined,
        null,
      );
      assert.equal(noResultScoreboard.statusCode, 404, noResultScoreboard.payload);

      const missingMatchId = randomUUID();
      const missingMatchResult = await call("PUT", `/api/v1/admin/matches/${missingMatchId}/result`, {
        teamScore: 1,
        opponentScore: 0,
      });
      assert.equal(missingMatchResult.statusCode, 404, missingMatchResult.payload);
      assert.equal(missingMatchResult.json<{ error: string }>().error, "match_not_found");
      const missingMatchEvent = await call("POST", `/api/v1/admin/matches/${missingMatchId}/events`, {
        kind: "goal",
        side: "team",
        period: 1,
        minute: 1,
        playerId: scorer.id,
      });
      assert.equal(missingMatchEvent.statusCode, 404, missingMatchEvent.payload);
      assert.equal(missingMatchEvent.json<{ error: string }>().error, "match_not_found");
    } finally {
      await app?.close();
      await scopedPool?.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  },
);
