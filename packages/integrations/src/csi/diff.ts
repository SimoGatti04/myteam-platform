import { diagnostic, type Diagnostic } from "../diagnostics.js";
import type { CsiSnapshot } from "../types.js";
import { matchKey, normalizedTeamKey } from "./ids.js";
import { canonicalJson, sha256Hex } from "./snapshot.js";

export type MatchChangeKind =
  | "score"
  | "status-promoted"
  | "status-regressed"
  | "status-changed"
  | "rescheduled"
  | "venue"
  | "matchday"
  | "teams-reassigned";

export interface MatchUpdate {
  key: string;
  csiMatchId: string | null;
  changes: MatchChangeKind[];
}

export interface SnapshotDiff {
  /** True when the two snapshots carry identical content (idempotent re-import). */
  identical: boolean;
  matchAdded: string[];
  matchRemoved: string[];
  matchUpdated: MatchUpdate[];
  teamAdded: string[];
  teamRemoved: string[];
  standingsChanged: boolean;
  diagnostics: Diagnostic[];
}

function sameScore(a: CsiSnapshot["matches"][number]["score"], b: CsiSnapshot["matches"][number]["score"]): boolean {
  if (a === null || b === null) return a === b;
  return a.home === b.home && a.away === b.away;
}

function sameKickoff(a: CsiSnapshot["matches"][number]["kickoff"], b: CsiSnapshot["matches"][number]["kickoff"]): boolean {
  if (a === null || b === null) return a === b;
  return a.iso === b.iso && a.date === b.date && a.time === b.time;
}

export function diffSnapshots(previous: CsiSnapshot | null, next: CsiSnapshot): SnapshotDiff {
  const diagnostics: Diagnostic[] = [];
  if (previous === null) {
    return {
      identical: next.matches.length === 0 && next.teams.length === 0,
      matchAdded: next.matches.map(matchKey).sort(),
      matchRemoved: [],
      matchUpdated: [],
      teamAdded: next.teams.map(normalizedTeamKey).sort(),
      teamRemoved: [],
      standingsChanged: next.standings.length > 0,
      diagnostics: [diagnostic("baseline_snapshot", "info", "No previous snapshot: every item is new")],
    };
  }

  if (previous.locator.url !== next.locator.url || previous.sourceId !== next.sourceId) {
    diagnostics.push(
      diagnostic("snapshot_locator_changed", "error", "Snapshots belong to different sources or competition URLs", {
        value: `${previous.locator.url} -> ${next.locator.url}`,
      }),
    );
  }

  const previousMatches = new Map(previous.matches.map((match) => [matchKey(match), match]));
  const nextMatches = new Map(next.matches.map((match) => [matchKey(match), match]));

  const matchAdded = [...nextMatches.keys()].filter((key) => !previousMatches.has(key)).sort();
  const matchRemoved = [...previousMatches.keys()].filter((key) => !nextMatches.has(key)).sort();

  const matchUpdated: MatchUpdate[] = [];
  for (const [key, before] of previousMatches) {
    const after = nextMatches.get(key);
    if (after === undefined) continue;
    const changes: MatchChangeKind[] = [];

    if (!sameScore(before.score, after.score)) changes.push("score");
    if (!sameKickoff(before.kickoff, after.kickoff)) changes.push("rescheduled");
    if ((before.venue ?? "") !== (after.venue ?? "")) changes.push("venue");
    if (before.matchday !== after.matchday) changes.push("matchday");
    if (before.home.csiTeamId !== after.home.csiTeamId || before.away.csiTeamId !== after.away.csiTeamId) {
      changes.push("teams-reassigned");
    }

    if (before.resultStatus !== after.resultStatus) {
      if (before.resultStatus === "unofficial" && after.resultStatus === "official") changes.push("status-promoted");
      else if (before.resultStatus === "official" && after.resultStatus === "unofficial") {
        changes.push("status-regressed");
        diagnostics.push(
          diagnostic("official_result_reverted", "error", "A homologated result reverted to unofficial", {
            path: key,
            value: `${before.resultStatus} -> ${after.resultStatus}`,
          }),
        );
      } else changes.push("status-changed");
    }

    if (changes.length > 0) {
      matchUpdated.push({ key, csiMatchId: after.csiMatchId, changes: changes.sort() });
    }
  }
  matchUpdated.sort((left, right) => (left.key < right.key ? -1 : 1));

  const previousTeams = new Set(previous.teams.map(normalizedTeamKey));
  const nextTeams = new Set(next.teams.map(normalizedTeamKey));
  const teamAdded = [...nextTeams].filter((key) => !previousTeams.has(key)).sort();
  const teamRemoved = [...previousTeams].filter((key) => !nextTeams.has(key)).sort();

  const standingsShape = (snapshot: CsiSnapshot): string =>
    sha256Hex(canonicalJson({ status: snapshot.standingsStatus, rows: snapshot.standings }));
  const standingsChanged = standingsShape(previous) !== standingsShape(next);

  if (matchRemoved.length > 0) {
    diagnostics.push(
      diagnostic("matches_disappeared", "warning", "Matches present in the previous snapshot are missing now; never delete automatically", {
        value: matchRemoved.join(","),
      }),
    );
  }
  if (teamRemoved.length > 0) {
    diagnostics.push(
      diagnostic("teams_disappeared", "warning", "Teams present in the previous snapshot are missing now", {
        value: teamRemoved.join(","),
      }),
    );
  }

  const identical =
    matchAdded.length === 0 &&
    matchRemoved.length === 0 &&
    matchUpdated.length === 0 &&
    teamAdded.length === 0 &&
    teamRemoved.length === 0 &&
    !standingsChanged;

  return { identical, matchAdded, matchRemoved, matchUpdated, teamAdded, teamRemoved, standingsChanged, diagnostics };
}
