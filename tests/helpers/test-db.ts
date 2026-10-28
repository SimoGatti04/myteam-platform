import { DatabaseSync } from "node:sqlite";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * SQLite In-Memory Test Double
 *
 * IMPORTANT QA NOTICE:
 * This in-memory SQLite adapter is a lightweight test double designed ONLY for fast,
 * isolated unit and contract tests in environments where external databases are unavailable.
 *
 * IT IS NOT EQUIVALENT TO POSTGRESQL 16:
 * 1. Concurrency & Locks: SQLite is single-process; `pg_advisory_xact_lock` and `FOR UPDATE`
 *    are stubbed as no-ops. Real race-condition serialization tests MUST run on PostgreSQL.
 * 2. Constraints & Regex: PostgreSQL check constraints with POSIX regex (`~ '^#[0-9A-Fa-f]{6}$'`)
 *    and strict foreign keys (`ON DELETE RESTRICT`) are not natively enforced here.
 * 3. Data Types: `timestamptz`, `date` (including `'infinity'::date`), `uuid`, and `jsonb`
 *    are stored as plain TEXT/INTEGER without native type semantics.
 * 4. Transactions: Basic BEGIN/COMMIT/ROLLBACK are executed sequentially on a single handle,
 *    not across real pooled client connections.
 * 5. Migrations: DDL files in `db/migrations/` cannot run directly without SQL translation.
 *
 * For true persistence, transaction rollback, and concurrency verification, use the real
 * PostgreSQL integration suite (`tests/integration/`).
 */

export interface TestDatabase {
  pool: Pool;
  getRawDb(): DatabaseSync;
  getAuditEvents(): Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    source_kind: string;
    actor_subject: string;
    reason: string | null;
    changes: string;
    recorded_at: string;
  }>;
  getScheduleHistory(matchId?: string): Array<{
    id: string;
    match_id: string;
    scheduled_at: string | null;
    status: string;
    source_kind: string;
    actor_subject: string;
    reason: string | null;
    recorded_at: string;
  }>;
}

export function createTestDatabase(): TestDatabase {
  const db = new DatabaseSync(":memory:");

  db.function("now", () => new Date().toISOString());
  db.function("pg_advisory_xact_lock", { varargs: true }, (..._args) => 1);
  db.function("hashtextextended", { varargs: true }, (..._args) => 1);

  db.exec(`
    CREATE TABLE seasons (
      id TEXT PRIMARY KEY,
      label TEXT UNIQUE NOT NULL,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      created_at TEXT DEFAULT (now())
    );

    CREATE TABLE team_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      crest_url TEXT,
      primary_color TEXT,
      secondary_color TEXT,
      current_season_id TEXT,
      published_at TEXT,
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE players (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at TEXT DEFAULT (now()),
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE season_roster_memberships (
      id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      season_id TEXT NOT NULL,
      jersey_number INTEGER,
      active_from TEXT NOT NULL,
      active_until TEXT,
      created_at TEXT DEFAULT (now()),
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE opponents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (now()),
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE competitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      is_official INTEGER NOT NULL,
      created_at TEXT DEFAULT (now()),
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE matches (
      id TEXT PRIMARY KEY,
      season_id TEXT NOT NULL,
      opponent_id TEXT NOT NULL,
      competition_id TEXT,
      is_official INTEGER NOT NULL,
      scheduled_at TEXT,
      status TEXT NOT NULL,
      published_at TEXT,
      created_at TEXT DEFAULT (now()),
      updated_at TEXT DEFAULT (now())
    );

    CREATE TABLE match_schedule_history (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      scheduled_at TEXT,
      status TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      actor_subject TEXT NOT NULL,
      reason TEXT,
      recorded_at TEXT DEFAULT (now())
    );

    CREATE TABLE audit_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      actor_subject TEXT NOT NULL,
      reason TEXT,
      changes TEXT,
      recorded_at TEXT DEFAULT (now())
    );
  `);

  function translateSql(sql: string): string {
    return sql
      .replace(/::date/g, "")
      .replace(/::text/g, "")
      .replace(/::jsonb/g, "")
      .replaceAll("'infinity'", "'9999-12-31'")
      .replace(/FOR UPDATE/g, "")
      .replaceAll(/\$(\d+)/g, "?$1");
  }

  function executeQuery<R extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): QueryResult<R> {
    const trimmed = sql.trim();
    if (trimmed === "BEGIN" || trimmed === "COMMIT" || trimmed === "ROLLBACK") {
      db.exec(trimmed);
      return { rows: [] as R[], rowCount: 0, command: trimmed, oid: 0, fields: [] };
    }

    const cleanSql = translateSql(trimmed);
    const cleanParams = params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p));

    try {
      const stmt = db.prepare(cleanSql);
      const isSelect = /^\s*(SELECT|WITH)/i.test(cleanSql);
      const isReturning = /RETURNING/i.test(cleanSql);

      if (isSelect || isReturning) {
        const rows = (stmt.all(...cleanParams) as unknown[]).map((r) => {
          const row = { ...(r as Record<string, unknown>) };
          if ("is_official" in row && row.is_official !== null && row.is_official !== undefined) {
            row.is_official = Boolean(row.is_official);
          }
          return row as R;
        });
        return { rows, rowCount: rows.length, command: isSelect ? "SELECT" : "INSERT", oid: 0, fields: [] };
      }

      const info = stmt.run(...cleanParams);
      return { rows: [] as R[], rowCount: info.changes, command: "UPDATE", oid: 0, fields: [] };
    } catch (err: unknown) {
      const error = err as { message?: string; code?: string };
      if (error.message?.includes("UNIQUE constraint failed")) {
        error.code = "23505";
      }
      throw error;
    }
  }

  const client: PoolClient = {
    query: async <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) =>
      executeQuery<R>(sql, params),
    release: () => {},
  } as unknown as PoolClient;

  const pool: Pool = {
    query: async <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) =>
      executeQuery<R>(sql, params),
    connect: async () => client,
    end: async () => {},
  } as unknown as Pool;

  return {
    pool,
    getRawDb: () => db,
    getAuditEvents: () =>
      db.prepare("SELECT * FROM audit_events ORDER BY recorded_at ASC, id ASC").all() as any,
    getScheduleHistory: (matchId?: string) => {
      if (matchId) {
        return db
          .prepare("SELECT * FROM match_schedule_history WHERE match_id = ? ORDER BY recorded_at ASC")
          .all(matchId) as any;
      }
      return db.prepare("SELECT * FROM match_schedule_history ORDER BY recorded_at ASC").all() as any;
    },
  };
}
