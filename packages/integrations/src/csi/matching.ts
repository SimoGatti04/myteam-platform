import type { CsiTeamRef } from "../types.js";
import { normalizeTeamName, tokenSimilarity } from "./normalize.js";

export interface LocalTeam {
  localId: string;
  name: string;
  aliases?: readonly string[];
}

export interface TeamCandidate {
  localId: string;
  score: number;
  reason: "csi-id" | "alias" | "exact" | "similar";
}

export type TeamMatchResult =
  | { status: "matched"; localId: string; reason: TeamCandidate["reason"] }
  | { status: "ambiguous"; candidates: TeamCandidate[] }
  | { status: "unmatched" };

export interface TeamMatcherOptions {
  /** Confirmed bindings CSI team id → local team id (admin-confirmed, persisted by Core). */
  csiIdMap?: Readonly<Record<string, string>>;
}

export interface TeamMatcher {
  match(team: CsiTeamRef): TeamMatchResult;
}

const SIMILAR_THRESHOLD = 0.9;
const CANDIDATE_THRESHOLD = 0.6;

function sortCandidates(candidates: TeamCandidate[]): TeamCandidate[] {
  return candidates.sort((left, right) =>
    right.score - left.score || (left.localId < right.localId ? -1 : left.localId > right.localId ? 1 : 0),
  );
}

/**
 * Resolves a CSI team to a local identity.
 *
 * Auto-match only on a confirmed binding, an explicit alias, or an unambiguous
 * exact normalised name. Anything weaker returns `ambiguous` so the admin must
 * decide; the importer must never guess between homonymous clubs.
 */
export function createTeamMatcher(localTeams: readonly LocalTeam[], options: TeamMatcherOptions = {}): TeamMatcher {
  const byNormalizedName = new Map<string, LocalTeam[]>();
  const byAlias = new Map<string, LocalTeam[]>();
  const byId = new Map(localTeams.map((team) => [team.localId, team] as const));

  for (const team of localTeams) {
    const name = normalizeTeamName(team.name);
    const existing = byNormalizedName.get(name) ?? [];
    existing.push(team);
    byNormalizedName.set(name, existing);

    for (const alias of team.aliases ?? []) {
      const key = normalizeTeamName(alias);
      const list = byAlias.get(key) ?? [];
      list.push(team);
      byAlias.set(key, list);
    }
  }

  const csiIdMap = options.csiIdMap ?? {};

  return {
    match(team: CsiTeamRef): TeamMatchResult {
      if (team.csiTeamId !== null) {
        const localId = csiIdMap[team.csiTeamId];
        if (localId !== undefined && byId.has(localId)) {
          return { status: "matched", localId, reason: "csi-id" };
        }
      }

      const name = normalizeTeamName(team.name);

      const aliasHits = byAlias.get(name) ?? [];
      if (aliasHits.length === 1) {
        const hit = aliasHits[0];
        if (hit !== undefined) return { status: "matched", localId: hit.localId, reason: "alias" };
      }
      if (aliasHits.length > 1) {
        return {
          status: "ambiguous",
          candidates: sortCandidates(
            aliasHits.map((hit) => ({ localId: hit.localId, score: 1, reason: "alias" as const })),
          ),
        };
      }

      const exactHits = byNormalizedName.get(name) ?? [];
      if (exactHits.length === 1) {
        const hit = exactHits[0];
        if (hit !== undefined) return { status: "matched", localId: hit.localId, reason: "exact" };
      }
      if (exactHits.length > 1) {
        return {
          status: "ambiguous",
          candidates: sortCandidates(
            exactHits.map((hit) => ({ localId: hit.localId, score: 1, reason: "exact" as const })),
          ),
        };
      }

      const scored: TeamCandidate[] = [];
      for (const local of localTeams) {
        const score = tokenSimilarity(team.name, local.name);
        if (score >= CANDIDATE_THRESHOLD) {
          scored.push({ localId: local.localId, score: Number(score.toFixed(3)), reason: score >= SIMILAR_THRESHOLD ? "similar" : "exact" });
        }
      }
      const sorted = sortCandidates(scored);
      const best = sorted[0];
      const second = sorted[1];

      if (best !== undefined && best.score >= SIMILAR_THRESHOLD && (second === undefined || second.score < SIMILAR_THRESHOLD)) {
        return { status: "matched", localId: best.localId, reason: "similar" };
      }
      if (sorted.length > 0) return { status: "ambiguous", candidates: sorted.slice(0, 5) };
      return { status: "unmatched" };
    },
  };
}
