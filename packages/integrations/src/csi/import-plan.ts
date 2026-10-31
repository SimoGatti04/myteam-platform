import { diagnostic, sortDiagnostics, type Diagnostic } from "../diagnostics.js";
import type { CsiMatch, CsiSnapshot, CsiTeamRef } from "../types.js";
import type { SnapshotDiff } from "./diff.js";
import { matchKey, normalizedTeamKey } from "./ids.js";
import type { TeamMatcher } from "./matching.js";
import { canonicalJson, sha256Hex } from "./snapshot.js";

export type IntentAction =
  | "create"
  | "update"
  | "link"
  | "skip-protected"
  | "conflict"
  | "manual-review"
  | "noop";

/**
 * Publication gate applied by Core before any public projection is updated.
 * `blocked-unconfirmed` = import needs admin confirmation; `blocked-unofficial`
 * = result not homologated by the source (ADR-0008).
 */
export type PublicationGate = "allowed" | "blocked-unconfirmed" | "blocked-unofficial" | "none";

export interface ImportIntent {
  entity: "competition" | "team" | "match" | "standings";
  action: IntentAction;
  key: string;
  localId: string | null;
  csiId: string | null;
  publication: PublicationGate;
  reasons: string[];
  fields: Record<string, unknown>;
}

export interface ImportOverrides {
  /** Match keys protected by an administrative override. */
  protectedMatchKeys: readonly string[];
  /** Local team ids whose data override the provider. */
  protectedTeamLocalIds: readonly string[];
  /** When true the whole competition is admin-owned. */
  competitionLocked: boolean;
}

export interface ImportPlanInput {
  snapshot: CsiSnapshot;
  diff: SnapshotDiff;
  matcher: TeamMatcher;
  overrides?: Partial<ImportOverrides>;
}

export interface ImportPlan {
  planDigest: string;
  competition: ImportIntent;
  teams: ImportIntent[];
  matches: ImportIntent[];
  standings: ImportIntent;
  conflicts: number;
  requiresConfirmation: boolean;
  diagnostics: Diagnostic[];
}

function teamFields(team: CsiTeamRef): Record<string, unknown> {
  return { name: team.name, logoUrl: team.logoUrl, csiTeamId: team.csiTeamId };
}

function matchFields(match: CsiMatch): Record<string, unknown> {
  return {
    csiMatchId: match.csiMatchId,
    matchday: match.matchday,
    kickoff: match.kickoff,
    venue: match.venue,
    home: match.home.name,
    away: match.away.name,
    score: match.score,
    resultStatus: match.resultStatus,
  };
}

function protectedIntent(
  entity: ImportIntent["entity"],
  key: string,
  csiId: string | null,
  reason: string,
  extraReasons: string[] = [],
): ImportIntent {
  return {
    entity,
    action: "skip-protected",
    key,
    localId: null,
    csiId,
    publication: "none",
    reasons: [reason, ...extraReasons],
    fields: {},
  };
}

/**
 * Turns a snapshot + diff into reviewable intents.
 *
 * Invariants (ADR-0008):
 * - nothing is published until an admin confirms (`blocked-unconfirmed`);
 * - unofficial results are always `blocked-unofficial`;
 * - admin overrides win (`skip-protected`), never overwritten;
 * - removals are conflicts, never automatic deletes;
 * - an unchanged snapshot yields no intents at all (idempotency).
 */
export function buildImportPlan(input: ImportPlanInput): ImportPlan {
  const { snapshot, diff, matcher } = input;
  const overrides: ImportOverrides = {
    protectedMatchKeys: input.overrides?.protectedMatchKeys ?? [],
    protectedTeamLocalIds: input.overrides?.protectedTeamLocalIds ?? [],
    competitionLocked: input.overrides?.competitionLocked ?? false,
  };
  const diagnostics: Diagnostic[] = [];
  const protectedMatches = new Set(overrides.protectedMatchKeys);
  const protectedTeams = new Set(overrides.protectedTeamLocalIds);
  const byKey = new Map(snapshot.matches.map((match) => [matchKey(match), match] as const));

  const competition: ImportIntent = overrides.competitionLocked
    ? protectedIntent("competition", snapshot.locator.url, snapshot.locator.competitionSegment, "competition-locked-by-admin")
    : {
        entity: "competition",
        action: diff.identical ? "noop" : "update",
        key: snapshot.locator.url,
        localId: null,
        csiId: snapshot.locator.competitionSegment,
        publication: "none",
        reasons: diff.identical ? ["unchanged"] : [`standingsStatus=${snapshot.standingsStatus}`],
        fields: {
          seasonLabel: snapshot.locator.seasonLabel,
          regionSlug: snapshot.locator.regionSlug,
          committeeSlug: snapshot.locator.committeeSlug,
          disciplineSlug: snapshot.locator.disciplineSlug,
          competitionSegment: snapshot.locator.competitionSegment,
          groupLabel: snapshot.locator.groupLabel,
          title: snapshot.competitionTitle,
        },
      };

  // Teams: only those touched by this diff (new teams, or teams of added/updated matches).
  const allTeams = new Map<string, CsiTeamRef>();
  for (const team of snapshot.teams) allTeams.set(normalizedTeamKey(team), team);
  for (const match of snapshot.matches) {
    allTeams.set(normalizedTeamKey(match.home), match.home);
    allTeams.set(normalizedTeamKey(match.away), match.away);
  }
  for (const row of snapshot.standings) allTeams.set(normalizedTeamKey(row.team), row.team);

  const touchedTeamKeys = new Set<string>(diff.teamAdded);
  const touchedMatchKeys = [...diff.matchAdded, ...diff.matchUpdated.map((update) => update.key)];
  for (const key of touchedMatchKeys) {
    const match = byKey.get(key);
    if (match === undefined) continue;
    touchedTeamKeys.add(normalizedTeamKey(match.home));
    touchedTeamKeys.add(normalizedTeamKey(match.away));
  }

  const teams: ImportIntent[] = [];
  for (const [key, team] of [...allTeams.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    if (!touchedTeamKeys.has(key)) continue;
    const result = matcher.match(team);
    if (result.status === "matched") {
      if (protectedTeams.has(result.localId)) {
        teams.push({
          entity: "team",
          action: "skip-protected",
          key,
          localId: result.localId,
          csiId: team.csiTeamId,
          publication: "none",
          reasons: ["team-protected-by-admin"],
          fields: {},
        });
        continue;
      }
      teams.push({
        entity: "team",
        action: "link",
        key,
        localId: result.localId,
        csiId: team.csiTeamId,
        publication: "none",
        reasons: [`matched:${result.reason}`],
        fields: teamFields(team),
      });
      continue;
    }

    if (result.status === "ambiguous") {
      diagnostics.push(
        diagnostic("team_ambiguous", "warning", "Team name matches multiple local identities", {
          path: `teams.${key}`,
          value: result.candidates.map((candidate) => candidate.localId).join(","),
        }),
      );
      teams.push({
        entity: "team",
        action: "conflict",
        key,
        localId: null,
        csiId: team.csiTeamId,
        publication: "blocked-unconfirmed",
        reasons: [
          "ambiguous-local-team",
          ...result.candidates.map((candidate) => `candidate:${candidate.localId}@${candidate.score}`),
        ],
        fields: teamFields(team),
      });
      continue;
    }

    const reasons = ["unconfirmed-new-team"];
    if (team.csiTeamId === null) reasons.push("no-stable-identifier");
    teams.push({
      entity: "team",
      action: "create",
      key,
      localId: null,
      csiId: team.csiTeamId,
      publication: "blocked-unconfirmed",
      reasons,
      fields: teamFields(team),
    });
  }

  const matches: ImportIntent[] = [];

  for (const key of diff.matchAdded) {
    const match = byKey.get(key);
    if (match === undefined) continue;
    if (overrides.competitionLocked) {
      matches.push(protectedIntent("match", key, match.csiMatchId, "competition-locked-by-admin", ["new-match"]));
      continue;
    }
    const reasons = ["new-match", "requires-admin-confirmation"];
    if (match.resultStatus === "unofficial") reasons.push("result-not-homologated");
    if (match.idConfidence === "derived") reasons.push("derived-match-identifier");
    matches.push({
      entity: "match",
      action: "create",
      key,
      localId: null,
      csiId: match.csiMatchId,
      publication: match.resultStatus === "official" ? "blocked-unconfirmed" : "blocked-unofficial",
      reasons,
      fields: matchFields(match),
    });
  }

  for (const key of diff.matchRemoved) {
    if (overrides.competitionLocked) {
      matches.push(protectedIntent("match", key, null, "competition-locked-by-admin", ["removed-from-source"]));
      continue;
    }
    matches.push({
      entity: "match",
      action: "conflict",
      key,
      localId: null,
      csiId: null,
      publication: "none",
      reasons: ["removed-from-source", "never-delete-automatically"],
      fields: {},
    });
  }

  for (const update of diff.matchUpdated) {
    const match = byKey.get(update.key);
    if (match === undefined) continue;
    if (protectedMatches.has(update.key) || overrides.competitionLocked) {
      matches.push(
        protectedIntent(
          "match",
          update.key,
          match.csiMatchId,
          protectedMatches.has(update.key) ? "match-protected-by-admin" : "competition-locked-by-admin",
          update.changes.map((change) => `change:${change}`),
        ),
      );
      continue;
    }
    const reasonSet = new Set<string>(update.changes.map((change) => `change:${change}`));
    let action: IntentAction = "update";
    if (update.changes.includes("status-regressed") || update.changes.includes("teams-reassigned")) {
      action = "manual-review";
      reasonSet.add("requires-manual-review");
    }
    matches.push({
      entity: "match",
      action,
      key: update.key,
      localId: null,
      csiId: match.csiMatchId,
      publication: match.resultStatus === "official" ? "blocked-unconfirmed" : "blocked-unofficial",
      reasons: [...reasonSet].sort(),
      fields: matchFields(match),
    });
  }

  matches.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));

  let standings: ImportIntent;
  if (snapshot.standingsStatus === "absent" || snapshot.standings.length === 0) {
    standings = {
      entity: "standings",
      action: "noop",
      key: "standings",
      localId: null,
      csiId: null,
      publication: "none",
      reasons: ["standings-absent"],
      fields: {},
    };
  } else if (overrides.competitionLocked) {
    standings = protectedIntent("standings", "standings", null, "competition-locked-by-admin");
  } else if (snapshot.standingsStatus === "official") {
    standings = {
      entity: "standings",
      action: diff.standingsChanged ? "update" : "noop",
      key: "standings",
      localId: null,
      csiId: null,
      publication: diff.standingsChanged ? "blocked-unconfirmed" : "none",
      reasons: diff.standingsChanged ? ["official-standings", "requires-admin-confirmation"] : ["unchanged"],
      fields: { rows: snapshot.standings.length },
    };
  } else if (!diff.standingsChanged) {
    standings = {
      entity: "standings",
      action: "noop",
      key: "standings",
      localId: null,
      csiId: null,
      publication: "none",
      reasons: ["unchanged"],
      fields: { rows: snapshot.standings.length },
    };
  } else {
    standings = {
      entity: "standings",
      action: "manual-review",
      key: "standings",
      localId: null,
      csiId: null,
      publication: "blocked-unofficial",
      reasons: [`standings-${snapshot.standingsStatus}`],
      fields: { rows: snapshot.standings.length },
    };
  }

  const intents = [competition, ...teams, ...matches, standings];
  const actionable = intents.filter((intent) => intent.action !== "noop");
  const planDigest = `sha256:${sha256Hex(canonicalJson(actionable))}`;
  const conflicts = actionable.filter((intent) => intent.action === "conflict" || intent.action === "manual-review").length;
  const requiresConfirmation = actionable.some((intent) =>
    ["create", "update", "link", "manual-review", "conflict"].includes(intent.action),
  );

  return {
    planDigest,
    competition,
    teams,
    matches,
    standings,
    conflicts,
    requiresConfirmation,
    diagnostics: sortDiagnostics(diagnostics),
  };
}
