import { randomUUID } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  AdminMatchesQuery,
  AdminRosterMembershipsQuery,
  CompetitionCreateRequest,
  CompetitionDto,
  MatchCreateRequest,
  MatchDto,
  MatchSchedulePatchRequest,
  MatchStatus,
  OpponentCreateRequest,
  OpponentDto,
  PlayerCreateRequest,
  PlayerDto,
  PublicMatchDto,
  PublicMatchesDto,
  PublicRosterDto,
  PublicTeamDto,
  RosterMembershipCreateRequest,
  RosterMembershipDto,
  RosterMembershipEndRequest,
  SeasonCreateRequest,
  SeasonDto,
  TeamConfigurationRequest,
  AdminTeamDto,
} from "@myteam/contracts";
import { DomainError, isPostgresErrorCode } from "./errors.js";

export interface AdminActor {
  subject: string;
}

interface SeasonRow extends QueryResultRow {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
}

interface TeamRow extends QueryResultRow {
  id: number;
  name: string | null;
  crest_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  current_season_id: string | null;
  published_at: Date | string | null;
}

interface PlayerRow extends QueryResultRow {
  id: string;
  display_name: string;
}

interface MembershipRow extends QueryResultRow {
  id: string;
  player_id: string;
  season_id: string;
  jersey_number: number | null;
  active_from: string;
  active_until: string | null;
}

interface OpponentRow extends QueryResultRow {
  id: string;
  name: string;
}

interface CompetitionRow extends QueryResultRow {
  id: string;
  name: string;
  category: CompetitionDto["category"];
  is_official: boolean;
}

interface MatchRow extends QueryResultRow {
  id: string;
  season_id: string;
  opponent_id: string;
  competition_id: string | null;
  is_official: boolean;
  scheduled_at: Date | string | null;
  status: MatchStatus;
  published_at: Date | string | null;
}

interface PublicMatchRow extends QueryResultRow {
  id: string;
  season_id: string;
  opponent_name: string;
  competition_name: string | null;
  is_official: boolean;
  scheduled_at: Date | string | null;
  status: MatchStatus;
}

interface AuditChange {
  before: unknown;
  after: unknown;
}

type AuditChanges = Record<string, AuditChange>;

async function inTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toDateTime(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function textOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function validateHttpsUrl(value: string | null | undefined): string | null {
  const normalized = textOrNull(value);
  if (normalized === null) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid URL");
  } catch {
    throw new DomainError(400, "crest_url_must_be_https");
  }
  return normalized;
}

function validateMatchSchedule(scheduledAt: string | null, status: MatchStatus): void {
  if (status === "scheduled" && scheduledAt === null) {
    throw new DomainError(400, "scheduled_match_requires_date");
  }
  if (status === "to_be_scheduled" && scheduledAt !== null) {
    throw new DomainError(400, "to_be_scheduled_match_must_not_have_date");
  }
  if (scheduledAt !== null && Number.isNaN(Date.parse(scheduledAt))) {
    throw new DomainError(400, "invalid_scheduled_at");
  }
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateMembershipWithinSeason(
  activeFrom: string,
  activeUntil: string | null,
  seasonStartsOn: string,
  seasonEndsOn: string,
): void {
  if (
    activeFrom < seasonStartsOn ||
    activeFrom > seasonEndsOn ||
    (activeUntil !== null && activeUntil > seasonEndsOn)
  ) {
    throw new DomainError(400, "roster_membership_outside_season");
  }
}

function changesBetween(before: Record<string, unknown>, after: Record<string, unknown>): AuditChanges {
  const changes: AuditChanges = {};
  for (const [field, nextValue] of Object.entries(after)) {
    const previousValue = before[field];
    if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
      changes[field] = { before: previousValue ?? null, after: nextValue ?? null };
    }
  }
  return changes;
}

async function appendAudit(
  client: PoolClient,
  actor: AdminActor,
  entityType: string,
  entityId: string,
  operation: string,
  changes: AuditChanges,
  reason: string | null = null,
): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  await client.query(
    `INSERT INTO audit_events
      (id, entity_type, entity_id, operation, source_kind, actor_subject, reason, changes)
     VALUES ($1, $2, $3, $4, 'admin_entry', $5, $6, $7::jsonb)`,
    [randomUUID(), entityType, entityId, operation, actor.subject, reason, JSON.stringify(changes)],
  );
}

function seasonDto(row: SeasonRow): SeasonDto {
  return { id: row.id, label: row.label, startsOn: row.starts_on, endsOn: row.ends_on };
}

function adminTeamDto(row: TeamRow): AdminTeamDto {
  return {
    id: 1,
    name: row.name,
    crestUrl: row.crest_url,
    primaryColor: row.primary_color?.trim() ?? null,
    secondaryColor: row.secondary_color?.trim() ?? null,
    currentSeasonId: row.current_season_id,
    publishedAt: toDateTime(row.published_at),
  };
}

function membershipDto(row: MembershipRow): RosterMembershipDto {
  return {
    id: row.id,
    playerId: row.player_id,
    seasonId: row.season_id,
    jerseyNumber: row.jersey_number,
    activeFrom: row.active_from,
    activeUntil: row.active_until,
  };
}

function publicMatchDto(row: PublicMatchRow): PublicMatchDto {
  return {
    id: row.id,
    seasonId: row.season_id,
    opponentName: row.opponent_name,
    competitionName: row.competition_name,
    isOfficial: row.is_official,
    scheduledAt: toDateTime(row.scheduled_at),
    status: row.status,
  };
}

function matchDto(row: MatchRow): MatchDto {
  return {
    id: row.id,
    seasonId: row.season_id,
    opponentId: row.opponent_id,
    competitionId: row.competition_id,
    isOfficial: row.is_official,
    scheduledAt: toDateTime(row.scheduled_at),
    status: row.status,
    publishedAt: toDateTime(row.published_at),
  };
}

export class PlatformService {
  constructor(private readonly pool: Pool) {}

  async listAdminSeasons(): Promise<SeasonDto[]> {
    const result = await this.pool.query<SeasonRow>(
      `SELECT id, label, starts_on::text, ends_on::text
       FROM seasons
       ORDER BY starts_on DESC, ends_on DESC, lower(label), label, id`,
    );
    return result.rows.map(seasonDto);
  }

  async listAdminPlayers(): Promise<PlayerDto[]> {
    const result = await this.pool.query<PlayerRow>(
      `SELECT id, display_name
       FROM players
       ORDER BY lower(display_name), display_name, id`,
    );
    return result.rows.map((row) => ({ id: row.id, displayName: row.display_name }));
  }

  async listAdminRosterMemberships(query: AdminRosterMembershipsQuery): Promise<RosterMembershipDto[]> {
    const result = await this.pool.query<MembershipRow>(
      `SELECT id, player_id, season_id, jersey_number, active_from::text, active_until::text
       FROM season_roster_memberships
       WHERE ($1::uuid IS NULL OR season_id = $1::uuid)
         AND ($2::uuid IS NULL OR player_id = $2::uuid)
       ORDER BY season_id, active_from, id`,
      [query.seasonId ?? null, query.playerId ?? null],
    );
    return result.rows.map(membershipDto);
  }

  async listAdminOpponents(): Promise<OpponentDto[]> {
    const result = await this.pool.query<OpponentRow>(
      `SELECT id, name
       FROM opponents
       ORDER BY lower(name), name, id`,
    );
    return result.rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async listAdminCompetitions(): Promise<CompetitionDto[]> {
    const result = await this.pool.query<CompetitionRow>(
      `SELECT id, name, category, is_official
       FROM competitions
       ORDER BY lower(name), name, category, id`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      isOfficial: row.is_official,
    }));
  }

  async listAdminMatches(query: AdminMatchesQuery): Promise<MatchDto[]> {
    const result = await this.pool.query<MatchRow>(
      `SELECT id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at
       FROM matches
       WHERE ($1::uuid IS NULL OR season_id = $1::uuid)
       ORDER BY scheduled_at ASC NULLS LAST, id`,
      [query.seasonId ?? null],
    );
    return result.rows.map(matchDto);
  }

  async createSeason(input: SeasonCreateRequest, actor: AdminActor): Promise<SeasonDto> {
    if (!isValidDate(input.startsOn) || !isValidDate(input.endsOn)) {
      throw new DomainError(400, "invalid_season_date");
    }
    if (input.endsOn < input.startsOn) throw new DomainError(400, "season_end_before_start");
    const id = randomUUID();
    try {
      return await inTransaction(this.pool, async (client) => {
        const result = await client.query<SeasonRow>(
          `INSERT INTO seasons (id, label, starts_on, ends_on)
           VALUES ($1, $2, $3, $4)
           RETURNING id, label, starts_on::text, ends_on::text`,
          [id, input.label.trim(), input.startsOn, input.endsOn],
        );
        const row = result.rows[0];
        if (!row) throw new Error("Season insert returned no row");
        await appendAudit(client, actor, "season", id, "create", {
          label: { before: null, after: row.label },
          startsOn: { before: null, after: row.starts_on },
          endsOn: { before: null, after: row.ends_on },
        });
        return seasonDto(row);
      });
    } catch (error) {
      if (isPostgresErrorCode(error, "23505")) throw new DomainError(409, "season_label_exists");
      throw error;
    }
  }

  async getAdminTeam(): Promise<AdminTeamDto | null> {
    const result = await this.pool.query<TeamRow>(
      `SELECT id, name, crest_url, primary_color, secondary_color, current_season_id, published_at
       FROM team_profile WHERE id = 1`,
    );
    const row = result.rows[0];
    return row ? adminTeamDto(row) : null;
  }

  async configureTeam(input: TeamConfigurationRequest, actor: AdminActor): Promise<AdminTeamDto> {
    return inTransaction(this.pool, async (client) => {
      // Create the singleton row before locking it so concurrent first writes serialize too.
      await client.query("INSERT INTO team_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
      const currentRow = (await client.query<TeamRow>(
        `SELECT id, name, crest_url, primary_color, secondary_color, current_season_id, published_at
         FROM team_profile WHERE id = 1 FOR UPDATE`,
      )).rows[0];
      const base = currentRow
        ? adminTeamDto(currentRow)
        : {
            id: 1 as const,
            name: null,
            crestUrl: null,
            primaryColor: null,
            secondaryColor: null,
            currentSeasonId: null,
            publishedAt: null,
          };
      const next = {
        name: Object.hasOwn(input, "name") ? textOrNull(input.name) : base.name,
        crestUrl: Object.hasOwn(input, "crestUrl") ? validateHttpsUrl(input.crestUrl) : base.crestUrl,
        primaryColor: Object.hasOwn(input, "primaryColor") ? textOrNull(input.primaryColor)?.toUpperCase() ?? null : base.primaryColor,
        secondaryColor: Object.hasOwn(input, "secondaryColor") ? textOrNull(input.secondaryColor)?.toUpperCase() ?? null : base.secondaryColor,
        currentSeasonId: Object.hasOwn(input, "currentSeasonId") ? input.currentSeasonId ?? null : base.currentSeasonId,
      };

      if (base.publishedAt !== null && (!next.name || !next.crestUrl)) {
        throw new DomainError(400, "team_name_and_crest_required_when_published");
      }

      if (next.currentSeasonId !== null) {
        const season = await client.query("SELECT 1 FROM seasons WHERE id = $1", [next.currentSeasonId]);
        if (season.rowCount === 0) throw new DomainError(404, "season_not_found");
      }

      const result = await client.query<TeamRow>(
        `INSERT INTO team_profile
          (id, name, crest_url, primary_color, secondary_color, current_season_id)
         VALUES (1, $1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          crest_url = EXCLUDED.crest_url,
          primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color,
          current_season_id = EXCLUDED.current_season_id,
          updated_at = now()
         RETURNING id, name, crest_url, primary_color, secondary_color, current_season_id, published_at`,
        [next.name, next.crestUrl, next.primaryColor, next.secondaryColor, next.currentSeasonId],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Team configuration upsert returned no row");
      const changes = changesBetween(
        {
          name: base.name,
          crestUrl: base.crestUrl,
          primaryColor: base.primaryColor,
          secondaryColor: base.secondaryColor,
          currentSeasonId: base.currentSeasonId,
        },
        next,
      );
      await appendAudit(client, actor, "team", "1", "configure", changes);
      return adminTeamDto(row);
    });
  }

  async publishTeam(actor: AdminActor): Promise<AdminTeamDto> {
    return inTransaction(this.pool, async (client) => {
      const current = (await client.query<TeamRow>(
        `SELECT id, name, crest_url, primary_color, secondary_color, current_season_id, published_at
         FROM team_profile WHERE id = 1 FOR UPDATE`,
      )).rows[0];
      if (!current) throw new DomainError(404, "team_not_configured");
      if (current.published_at !== null) return adminTeamDto(current);
      const name = textOrNull(current.name);
      const crestUrl = validateHttpsUrl(current.crest_url);
      if (!name) throw new DomainError(400, "team_name_required_for_publication");
      if (!crestUrl) throw new DomainError(400, "team_crest_required_for_publication");

      const result = await client.query<TeamRow>(
        `UPDATE team_profile SET published_at = now(), updated_at = now()
         WHERE id = 1
         RETURNING id, name, crest_url, primary_color, secondary_color, current_season_id, published_at`,
      );
      const row = result.rows[0];
      if (!row) throw new Error("Team publication returned no row");
      const publishedAt = toDateTime(row.published_at);
      await appendAudit(client, actor, "team", "1", "publish", {
        publishedAt: { before: toDateTime(current.published_at), after: publishedAt },
      });
      return adminTeamDto(row);
    });
  }

  async createPlayer(input: PlayerCreateRequest, actor: AdminActor): Promise<PlayerDto> {
    const displayName = input.displayName.trim();
    if (!displayName) throw new DomainError(400, "player_name_required");
    const id = randomUUID();
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<PlayerRow>(
        `INSERT INTO players (id, display_name) VALUES ($1, $2) RETURNING id, display_name`,
        [id, displayName],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Player insert returned no row");
      await appendAudit(client, actor, "player", id, "create", {
        displayName: { before: null, after: row.display_name },
      });
      return { id: row.id, displayName: row.display_name };
    });
  }

  async createRosterMembership(
    input: RosterMembershipCreateRequest,
    actor: AdminActor,
  ): Promise<RosterMembershipDto> {
    if (
      !isValidDate(input.activeFrom) ||
      (input.activeUntil !== undefined && input.activeUntil !== null && !isValidDate(input.activeUntil))
    ) {
      throw new DomainError(400, "invalid_membership_date");
    }
    if (input.activeUntil && input.activeUntil < input.activeFrom) {
      throw new DomainError(400, "membership_end_before_start");
    }
    const id = randomUUID();
    return inTransaction(this.pool, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `roster:${input.playerId}:${input.seasonId}`,
      ]);
      const player = await client.query("SELECT 1 FROM players WHERE id = $1", [input.playerId]);
      if (player.rowCount === 0) throw new DomainError(404, "player_not_found");
      const season = await client.query<{ starts_on: string; ends_on: string }>(
        "SELECT starts_on::text, ends_on::text FROM seasons WHERE id = $1",
        [input.seasonId],
      );
      const seasonBounds = season.rows[0];
      if (!seasonBounds) throw new DomainError(404, "season_not_found");
      validateMembershipWithinSeason(
        input.activeFrom,
        input.activeUntil ?? null,
        seasonBounds.starts_on,
        seasonBounds.ends_on,
      );

      const overlap = await client.query(
        `SELECT 1 FROM season_roster_memberships
         WHERE player_id = $1 AND season_id = $2
           AND active_from <= COALESCE($4::date, 'infinity'::date)
           AND COALESCE(active_until, 'infinity'::date) >= $3::date
         LIMIT 1`,
        [input.playerId, input.seasonId, input.activeFrom, input.activeUntil ?? null],
      );
      if (overlap.rowCount !== 0) throw new DomainError(409, "roster_membership_period_overlaps");

      const result = await client.query<MembershipRow>(
        `INSERT INTO season_roster_memberships
          (id, player_id, season_id, jersey_number, active_from, active_until)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, player_id, season_id, jersey_number, active_from::text, active_until::text`,
        [id, input.playerId, input.seasonId, input.jerseyNumber ?? null, input.activeFrom, input.activeUntil ?? null],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Roster membership insert returned no row");
      await appendAudit(client, actor, "roster_membership", id, "create", {
        playerId: { before: null, after: row.player_id },
        seasonId: { before: null, after: row.season_id },
        jerseyNumber: { before: null, after: row.jersey_number },
        activeFrom: { before: null, after: row.active_from },
        activeUntil: { before: null, after: row.active_until },
      });
      return membershipDto(row);
    });
  }

  async endRosterMembership(
    id: string,
    input: RosterMembershipEndRequest,
    actor: AdminActor,
  ): Promise<RosterMembershipDto> {
    if (!isValidDate(input.activeUntil)) throw new DomainError(400, "invalid_membership_date");
    return inTransaction(this.pool, async (client) => {
      const current = (await client.query<MembershipRow>(
        `SELECT id, player_id, season_id, jersey_number, active_from::text, active_until::text
         FROM season_roster_memberships WHERE id = $1 FOR UPDATE`,
        [id],
      )).rows[0];
      if (!current) throw new DomainError(404, "roster_membership_not_found");
      if (input.activeUntil < current.active_from) throw new DomainError(400, "membership_end_before_start");
      const seasonBounds = (
        await client.query<{ starts_on: string; ends_on: string }>(
          "SELECT starts_on::text, ends_on::text FROM seasons WHERE id = $1",
          [current.season_id],
        )
      ).rows[0];
      if (!seasonBounds) throw new Error("Roster membership references a missing season");
      validateMembershipWithinSeason(
        current.active_from,
        input.activeUntil,
        seasonBounds.starts_on,
        seasonBounds.ends_on,
      );
      if (current.active_until && current.active_until !== input.activeUntil) {
        throw new DomainError(409, "roster_membership_already_ended");
      }

      const result = await client.query<MembershipRow>(
        `UPDATE season_roster_memberships SET active_until = $2
         WHERE id = $1
         RETURNING id, player_id, season_id, jersey_number, active_from::text, active_until::text`,
        [id, input.activeUntil],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Roster membership update returned no row");
      await appendAudit(
        client,
        actor,
        "roster_membership",
        id,
        "end_period",
        { activeUntil: { before: current.active_until, after: row.active_until } },
        textOrNull(input.reason),
      );
      return membershipDto(row);
    });
  }

  async createOpponent(input: OpponentCreateRequest, actor: AdminActor): Promise<OpponentDto> {
    const name = input.name.trim();
    if (!name) throw new DomainError(400, "opponent_name_required");
    const id = randomUUID();
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<OpponentRow>(
        `INSERT INTO opponents (id, name) VALUES ($1, $2) RETURNING id, name`,
        [id, name],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Opponent insert returned no row");
      await appendAudit(client, actor, "opponent", id, "create", {
        name: { before: null, after: row.name },
      });
      return { id: row.id, name: row.name };
    });
  }

  async createCompetition(input: CompetitionCreateRequest, actor: AdminActor): Promise<CompetitionDto> {
    const name = input.name.trim();
    if (!name) throw new DomainError(400, "competition_name_required");
    const id = randomUUID();
    return inTransaction(this.pool, async (client) => {
      const result = await client.query<CompetitionRow>(
        `INSERT INTO competitions (id, name, category, is_official)
         VALUES ($1, $2, $3, $4) RETURNING id, name, category, is_official`,
        [id, name, input.category, input.isOfficial],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Competition insert returned no row");
      await appendAudit(client, actor, "competition", id, "create", {
        name: { before: null, after: row.name },
        category: { before: null, after: row.category },
        isOfficial: { before: null, after: row.is_official },
      });
      return { id: row.id, name: row.name, category: row.category, isOfficial: row.is_official };
    });
  }

  async createMatch(input: MatchCreateRequest, actor: AdminActor): Promise<MatchDto> {
    const scheduledAt = input.scheduledAt ?? null;
    const status = input.status ?? (scheduledAt === null ? "to_be_scheduled" : "scheduled");
    if (status !== "scheduled" && status !== "to_be_scheduled") {
      throw new DomainError(400, "new_match_must_start_scheduled_or_to_be_scheduled");
    }
    validateMatchSchedule(scheduledAt, status);
    const id = randomUUID();

    return inTransaction(this.pool, async (client) => {
      const season = await client.query("SELECT 1 FROM seasons WHERE id = $1", [input.seasonId]);
      if (season.rowCount === 0) throw new DomainError(404, "season_not_found");
      const opponent = await client.query("SELECT 1 FROM opponents WHERE id = $1", [input.opponentId]);
      if (opponent.rowCount === 0) throw new DomainError(404, "opponent_not_found");
      if (input.competitionId) {
        const competition = await client.query("SELECT 1 FROM competitions WHERE id = $1", [input.competitionId]);
        if (competition.rowCount === 0) throw new DomainError(404, "competition_not_found");
      }

      const result = await client.query<MatchRow>(
        `INSERT INTO matches
          (id, season_id, opponent_id, competition_id, is_official, scheduled_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at`,
        [id, input.seasonId, input.opponentId, input.competitionId ?? null, input.isOfficial, scheduledAt, status],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Match insert returned no row");
      await client.query(
        `INSERT INTO match_schedule_history
          (id, match_id, scheduled_at, status, source_kind, actor_subject)
         VALUES ($1, $2, $3, $4, 'admin_entry', $5)`,
        [randomUUID(), id, scheduledAt, status, actor.subject],
      );
      await appendAudit(client, actor, "match", id, "create", {
        seasonId: { before: null, after: row.season_id },
        opponentId: { before: null, after: row.opponent_id },
        competitionId: { before: null, after: row.competition_id },
        isOfficial: { before: null, after: row.is_official },
        scheduledAt: { before: null, after: toDateTime(row.scheduled_at) },
        status: { before: null, after: row.status },
      });
      return matchDto(row);
    });
  }

  async updateMatchSchedule(
    id: string,
    input: MatchSchedulePatchRequest,
    actor: AdminActor,
  ): Promise<MatchDto> {
    if (!Object.hasOwn(input, "scheduledAt") && !Object.hasOwn(input, "status")) {
      throw new DomainError(400, "schedule_change_required");
    }
    const reason = textOrNull(input.reason);
    return inTransaction(this.pool, async (client) => {
      const current = (await client.query<MatchRow>(
        `SELECT id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at
         FROM matches WHERE id = $1 FOR UPDATE`,
        [id],
      )).rows[0];
      if (!current) throw new DomainError(404, "match_not_found");

      const nextScheduledAt = Object.hasOwn(input, "scheduledAt")
        ? input.scheduledAt ?? null
        : toDateTime(current.scheduled_at);
      const nextStatus = input.status ?? current.status;
      if (nextStatus === "completed") throw new DomainError(400, "completed_match_schedule_is_immutable");
      validateMatchSchedule(nextScheduledAt, nextStatus);
      if (nextScheduledAt === toDateTime(current.scheduled_at) && nextStatus === current.status) {
        return matchDto(current);
      }

      const result = await client.query<MatchRow>(
        `UPDATE matches SET scheduled_at = $2, status = $3, updated_at = now()
         WHERE id = $1
         RETURNING id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at`,
        [id, nextScheduledAt, nextStatus],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Match schedule update returned no row");
      await client.query(
        `INSERT INTO match_schedule_history
          (id, match_id, scheduled_at, status, source_kind, actor_subject, reason)
         VALUES ($1, $2, $3, $4, 'admin_entry', $5, $6)`,
        [randomUUID(), id, row.scheduled_at, row.status, actor.subject, reason],
      );
      await appendAudit(
        client,
        actor,
        "match",
        id,
        "reschedule",
        changesBetween(
          { scheduledAt: toDateTime(current.scheduled_at), status: current.status },
          { scheduledAt: toDateTime(row.scheduled_at), status: row.status },
        ),
        reason,
      );
      return matchDto(row);
    });
  }

  async publishMatch(id: string, actor: AdminActor): Promise<MatchDto> {
    return inTransaction(this.pool, async (client) => {
      const current = (await client.query<MatchRow>(
        `SELECT id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at
         FROM matches WHERE id = $1 FOR UPDATE`,
        [id],
      )).rows[0];
      if (!current) throw new DomainError(404, "match_not_found");
      if (current.published_at !== null) return matchDto(current);
      validateMatchSchedule(toDateTime(current.scheduled_at), current.status);

      const result = await client.query<MatchRow>(
        `UPDATE matches SET published_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING id, season_id, opponent_id, competition_id, is_official, scheduled_at, status, published_at`,
        [id],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Match publication returned no row");
      await appendAudit(client, actor, "match", id, "publish", {
        publishedAt: { before: null, after: toDateTime(row.published_at) },
      });
      return matchDto(row);
    });
  }

  async getPublicTeam(): Promise<PublicTeamDto> {
    const result = await this.pool.query<TeamRow & { season_label: string | null; season_starts_on: string | null; season_ends_on: string | null }>(
      `SELECT t.id, t.name, t.crest_url, t.primary_color, t.secondary_color,
              t.current_season_id, t.published_at,
              s.label AS season_label, s.starts_on::text AS season_starts_on, s.ends_on::text AS season_ends_on
       FROM team_profile t
       LEFT JOIN seasons s ON s.id = t.current_season_id
       WHERE t.id = 1 AND t.published_at IS NOT NULL`,
    );
    const row = result.rows[0];
    if (!row || !row.name || !row.crest_url) throw new DomainError(404, "public_team_not_found");
    return {
      name: row.name,
      crestUrl: row.crest_url,
      primaryColor: row.primary_color?.trim() ?? null,
      secondaryColor: row.secondary_color?.trim() ?? null,
      currentSeason: row.current_season_id && row.season_label && row.season_starts_on && row.season_ends_on
        ? { id: row.current_season_id, label: row.season_label, startsOn: row.season_starts_on, endsOn: row.season_ends_on }
        : null,
    };
  }

  async getPublicRoster(): Promise<PublicRosterDto> {
    const team = (await this.pool.query<{ current_season_id: string | null }>(
      `SELECT current_season_id FROM team_profile WHERE id = 1 AND published_at IS NOT NULL`,
    )).rows[0];
    if (!team) throw new DomainError(404, "public_team_not_found");
    if (!team.current_season_id) return { season: null, players: [] };

    const season = (await this.pool.query<{ id: string; label: string }>(
      `SELECT id, label FROM seasons WHERE id = $1`,
      [team.current_season_id],
    )).rows[0];
    if (!season) return { season: null, players: [] };
    const players = await this.pool.query<{ id: string; display_name: string; jersey_number: number | null }>(
      `SELECT p.id, p.display_name, m.jersey_number
       FROM season_roster_memberships m
       JOIN players p ON p.id = m.player_id
       WHERE m.season_id = $1 AND m.active_from <= CURRENT_DATE
         AND (m.active_until IS NULL OR m.active_until >= CURRENT_DATE)
       ORDER BY m.jersey_number NULLS LAST, p.display_name, p.id`,
      [team.current_season_id],
    );
    return {
      season: { id: season.id, label: season.label },
      players: players.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        jerseyNumber: row.jersey_number,
      })),
    };
  }

  async getPublicMatch(id: string): Promise<PublicMatchDto> {
    const publishedTeam = await this.pool.query("SELECT 1 FROM team_profile WHERE id = 1 AND published_at IS NOT NULL");
    if (publishedTeam.rowCount === 0) throw new DomainError(404, "public_team_not_found");

    const result = await this.pool.query<PublicMatchRow>(
      `SELECT m.id, m.season_id, o.name AS opponent_name, c.name AS competition_name,
              m.is_official, m.scheduled_at, m.status
       FROM matches m
       JOIN opponents o ON o.id = m.opponent_id
       LEFT JOIN competitions c ON c.id = m.competition_id
       WHERE m.id = $1 AND m.published_at IS NOT NULL`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new DomainError(404, "public_match_not_found");
    return publicMatchDto(row);
  }

  async getPublicMatches(): Promise<PublicMatchesDto> {
    const publishedTeam = await this.pool.query("SELECT 1 FROM team_profile WHERE id = 1 AND published_at IS NOT NULL");
    if (publishedTeam.rowCount === 0) throw new DomainError(404, "public_team_not_found");
    const result = await this.pool.query<PublicMatchRow>(
      `SELECT m.id, m.season_id, o.name AS opponent_name, c.name AS competition_name,
              m.is_official, m.scheduled_at, m.status
       FROM matches m
       JOIN opponents o ON o.id = m.opponent_id
       LEFT JOIN competitions c ON c.id = m.competition_id
       WHERE m.published_at IS NOT NULL
       ORDER BY m.scheduled_at NULLS LAST, m.id`,
    );
    const scheduled: PublicMatchesDto["scheduled"] = [];
    const toBeScheduled: PublicMatchesDto["toBeScheduled"] = [];
    for (const row of result.rows) {
      const dto = publicMatchDto(row);
      if (dto.scheduledAt === null) toBeScheduled.push(dto);
      else scheduled.push(dto);
    }
    return { scheduled, toBeScheduled };
  }
}
