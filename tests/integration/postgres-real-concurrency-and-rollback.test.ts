import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../../apps/api/src/app.js";
import { DomainError } from "../../apps/api/src/platform/errors.js";
import { createScopedPostgresContext, isEnvironmentalConnectionError } from "../helpers/pg-test-helper.js";
import { realisticSeasonFixture, realisticPlayersFixture, realisticOpponentsFixture } from "../fixtures/q1-realistic-fixtures.js";

const testDbUrl = process.env.TEST_DATABASE_URL;

test(
  "PostgreSQL Real: Concurrency serialization on roster membership via pg_advisory_xact_lock",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL concurrency test" : false },
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
      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (h) => {
          if (h === "Bearer pg-admin") return { subject: "pg-admin-user" };
          throw new DomainError(401, "authentication_required");
        },
      });

      const headers = { authorization: "Bearer pg-admin" };

      // 1. Create season and player
      const seasonRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: realisticSeasonFixture,
      });
      assert.equal(seasonRes.statusCode, 201);
      const season = seasonRes.json<{ id: string }>();

      const playerRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/players",
        headers,
        payload: { displayName: realisticPlayersFixture[0].displayName },
      });
      assert.equal(playerRes.statusCode, 201);
      const player = playerRes.json<{ id: string }>();

      // 2. Launch 2 simultaneous / concurrent requests attempting to insert overlapping roster memberships
      // Both start at the same time for the same player and season.
      // Under PostgreSQL, pg_advisory_xact_lock serializes these two transactions.
      const [res1, res2] = await Promise.all([
        app.inject({
          method: "POST",
          url: "/api/v1/admin/roster-memberships",
          headers,
          payload: {
            playerId: player.id,
            seasonId: season.id,
            jerseyNumber: 1,
            activeFrom: "2026-09-01",
            activeUntil: "2026-12-31",
          },
        }),
        app.inject({
          method: "POST",
          url: "/api/v1/admin/roster-memberships",
          headers,
          payload: {
            playerId: player.id,
            seasonId: season.id,
            jerseyNumber: 11,
            activeFrom: "2026-10-01",
            activeUntil: "2027-01-31",
          },
        }),
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // Exactly ONE must succeed (201) and ONE must fail with 409 conflict
      assert.deepEqual(
        statuses,
        [201, 409],
        `Concurrent memberships must be serialized by advisory lock: got ${res1.statusCode} and ${res2.statusCode}`,
      );

      const conflictRes = res1.statusCode === 409 ? res1 : res2;
      assert.equal(conflictRes.json().error, "roster_membership_period_overlaps");

      // Verify DB contains exactly 1 membership row
      const countRes = await scopedPool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM season_roster_memberships WHERE player_id = $1",
        [player.id],
      );
      assert.equal(countRes.rows[0].count, "1");
    } finally {
      if (app) await app.close();
      await cleanup();
    }
  },
);

test(
  "PostgreSQL Real: Atomic transaction rollback on constraint / business validation failure",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL rollback test" : false },
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
      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (h) => {
          if (h === "Bearer pg-admin") return { subject: "pg-admin-user" };
          throw new DomainError(401, "authentication_required");
        },
      });

      const headers = { authorization: "Bearer pg-admin" };

      // 1. Create initial valid season
      await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: { label: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-06-30" },
      });

      const initialAuditCount = Number(
        (await scopedPool.query<{ count: string }>("SELECT count(*)::text AS count FROM audit_events")).rows[0].count,
      );
      assert.equal(initialAuditCount, 1);

      // 2. Attempt duplicate season creation (triggers unique constraint 23505)
      const duplicateRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: { label: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-06-30" },
      });
      assert.equal(duplicateRes.statusCode, 409);
      assert.equal(duplicateRes.json().error, "season_label_exists");

      // Verify transaction rollback: audit_events MUST NOT have increased!
      const postRollbackAuditCount = Number(
        (await scopedPool.query<{ count: string }>("SELECT count(*)::text AS count FROM audit_events")).rows[0].count,
      );
      assert.equal(postRollbackAuditCount, 1, "Failed transaction must not leave orphan audit_events");

      // 3. Attempt match creation with invalid competitionId
      const badMatchRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId: "00000000-0000-0000-0000-000000000001",
          opponentId: "00000000-0000-0000-0000-000000000002",
          isOfficial: true,
        },
      });
      assert.equal(badMatchRes.statusCode, 404);

      // Verify no orphan rows in matches or match_schedule_history
      const matchCount = Number(
        (await scopedPool.query<{ count: string }>("SELECT count(*)::text AS count FROM matches")).rows[0].count,
      );
      const historyCount = Number(
        (await scopedPool.query<{ count: string }>("SELECT count(*)::text AS count FROM match_schedule_history"))
          .rows[0].count,
      );
      assert.equal(matchCount, 0, "No match row should exist after 404 rollback");
      assert.equal(historyCount, 0, "No match_schedule_history row should exist after 404 rollback");
    } finally {
      if (app) await app.close();
      await cleanup();
    }
  },
);

test(
  "PostgreSQL Real: Native check constraints and enum integrity",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL constraint test" : false },
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

    try {
      // 1. Database level CHECK (ends_on >= starts_on)
      await assert.rejects(
        scopedPool.query(
          "INSERT INTO seasons (id, label, starts_on, ends_on) VALUES (gen_random_uuid(), 'Inv', '2027-01-01', '2026-01-01')",
        ),
        /seasons_dates_valid/,
        "PostgreSQL must enforce seasons_dates_valid check constraint",
      );

      // 2. Database level CHECK (primary_color regex)
      await assert.rejects(
        scopedPool.query(
          "INSERT INTO team_profile (id, primary_color) VALUES (1, 'NOT_HEX')",
        ),
        /team_profile_primary_color_valid/,
        "PostgreSQL must enforce team_profile_primary_color_valid check constraint",
      );

      // 3. Database level CHECK (jersey_number BETWEEN 0 AND 99)
      const playerRes = await scopedPool.query<{ id: string }>(
        "INSERT INTO players (id, display_name) VALUES (gen_random_uuid(), 'Test Player') RETURNING id",
      );
      const seasonRes = await scopedPool.query<{ id: string }>(
        "INSERT INTO seasons (id, label, starts_on, ends_on) VALUES (gen_random_uuid(), '2026/27', '2026-09-01', '2027-06-30') RETURNING id",
      );

      await assert.rejects(
        scopedPool.query(
          "INSERT INTO season_roster_memberships (id, player_id, season_id, jersey_number, active_from) VALUES (gen_random_uuid(), $1, $2, 105, '2026-09-01')",
          [playerRes.rows[0].id, seasonRes.rows[0].id],
        ),
        /roster_membership_jersey_valid/,
        "PostgreSQL must enforce roster_membership_jersey_valid check constraint",
      );
    } finally {
      await cleanup();
    }
  },
);

test(
  "PostgreSQL Real: Completed match schedule immutability regression (CORE-BUG-01)",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL test" : false },
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
      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (h) => {
          if (h === "Bearer pg-admin") return { subject: "pg-admin-user" };
          throw new DomainError(401, "authentication_required");
        },
      });

      const headers = { authorization: "Bearer pg-admin" };

      // 1. Setup season and opponent
      const seasonRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/seasons",
        headers,
        payload: realisticSeasonFixture,
      });
      assert.equal(seasonRes.statusCode, 201);
      const seasonId = seasonRes.json<{ id: string }>().id;

      const oppRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/opponents",
        headers,
        payload: realisticOpponentsFixture[0],
      });
      assert.equal(oppRes.statusCode, 201);
      const opponentId = oppRes.json<{ id: string }>().id;

      // 2. Create match
      const originalTime = "2026-10-10T15:00:00.000Z";
      const matchRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: {
          seasonId,
          opponentId,
          isOfficial: true,
          scheduledAt: originalTime,
        },
      });
      assert.equal(matchRes.statusCode, 201);
      const matchId = matchRes.json<{ id: string }>().id;

      // 3. Mark completed directly in PostgreSQL
      await scopedPool.query("UPDATE matches SET status = 'completed' WHERE id = $1", [matchId]);

      // Count initial history and audit entries
      const initHist = await scopedPool.query("SELECT COUNT(*) as c FROM match_schedule_history WHERE match_id = $1", [matchId]);
      const initAudit = await scopedPool.query("SELECT COUNT(*) as c FROM audit_events WHERE entity_id = $1", [matchId]);

      // 4. Attempt PATCH /schedule on completed match
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/matches/${matchId}/schedule`,
        headers,
        payload: {
          status: "postponed",
          scheduledAt: "2026-10-25T15:00:00.000Z",
          reason: "Tentativo errato su gara terminata",
        },
      });

      // Verify HTTP 400 completed_match_schedule_is_immutable
      assert.equal(patchRes.statusCode, 400);
      assert.equal(patchRes.json().error, "completed_match_schedule_is_immutable");

      // Verify state and date in PG remain unchanged
      const current = await scopedPool.query<{ status: string; scheduled_at: string }>(
        "SELECT status, scheduled_at FROM matches WHERE id = $1",
        [matchId],
      );
      assert.equal(current.rows[0].status, "completed");

      // Verify no new history or audit rows were written
      const postHist = await scopedPool.query<{ c: string }>("SELECT COUNT(*) as c FROM match_schedule_history WHERE match_id = $1", [matchId]);
      const postAudit = await scopedPool.query<{ c: string }>("SELECT COUNT(*) as c FROM audit_events WHERE entity_id = $1", [matchId]);
      assert.equal(Number(postHist.rows[0].c), Number(initHist.rows[0].c));
      assert.equal(Number(postAudit.rows[0].c), Number(initAudit.rows[0].c));
    } finally {
      if (app) await app.close();
      await cleanup();
    }
  },
);

test(
  "PostgreSQL Real: non-completed match remains reschedulable after C1.2 guard (no regression)",
  { skip: !testDbUrl ? "TEST_DATABASE_URL not set; skipping real PostgreSQL test" : false },
  async (t) => {
    let ctx;
    try {
      ctx = await createScopedPostgresContext();
    } catch (err: any) {
      if (isEnvironmentalConnectionError(err)) {
        t.skip(`PostgreSQL unreachable in current sandbox environment (${err.code || err.message}); gate marked NOT RUN per protocol`);
        return;
      }
      throw err;
    }
    if (!ctx) return;

    const { scopedPool, cleanup } = ctx;
    let app: ReturnType<typeof createApp> | undefined;

    try {
      app = createApp({
        logger: false,
        pool: scopedPool,
        verifyAdminToken: async (h) => {
          if (h === "Bearer pg-admin") return { subject: "pg-admin-user" };
          throw new DomainError(401, "authentication_required");
        },
      });
      const headers = { authorization: "Bearer pg-admin" };

      const seasonRes = await app.inject({
        method: "POST", url: "/api/v1/admin/seasons", headers, payload: realisticSeasonFixture,
      });
      assert.equal(seasonRes.statusCode, 201);
      const seasonId = seasonRes.json<{ id: string }>().id;

      const oppRes = await app.inject({
        method: "POST", url: "/api/v1/admin/opponents", headers, payload: realisticOpponentsFixture[0],
      });
      assert.equal(oppRes.statusCode, 201);
      const opponentId = oppRes.json<{ id: string }>().id;

      const matchRes = await app.inject({
        method: "POST",
        url: "/api/v1/admin/matches",
        headers,
        payload: { seasonId, opponentId, isOfficial: true, scheduledAt: "2026-10-10T15:00:00.000Z" },
      });
      assert.equal(matchRes.statusCode, 201);
      const matchId = matchRes.json<{ id: string }>().id;

      // Una partita NON completata deve restare rinviabile: la guardia C1.2 non deve bloccare oltre.
      const patchRes = await app.inject({
        method: "PATCH",
        url: `/api/v1/admin/matches/${matchId}/schedule`,
        headers,
        payload: { status: "postponed", scheduledAt: "2026-10-25T15:00:00.000Z", reason: "Rinvio legittimo" },
      });
      assert.equal(patchRes.statusCode, 200, `rinvio di partita non completata deve riuscire, ottenuto ${patchRes.statusCode}`);

      const after = await scopedPool.query<{ status: string; scheduled_at: string }>(
        "SELECT status, scheduled_at FROM matches WHERE id = $1", [matchId],
      );
      assert.equal(after.rows[0].status, "postponed");
      assert.equal(new Date(after.rows[0].scheduled_at).toISOString(), "2026-10-25T15:00:00.000Z");

      const hist = await scopedPool.query<{ c: string }>(
        "SELECT COUNT(*) as c FROM match_schedule_history WHERE match_id = $1", [matchId],
      );
      assert.ok(Number(hist.rows[0].c) >= 1, "il rinvio legittimo deve produrre una riga di storico");
    } finally {
      if (app) await app.close();
      await cleanup();
    }
  },
);
