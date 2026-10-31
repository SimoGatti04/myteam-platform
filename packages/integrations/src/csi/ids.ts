import type { CsiMatch, CsiTeamRef } from "../types.js";
import { normalizeTeamName } from "./normalize.js";

/**
 * Identifier handling for CSI.
 *
 * CSI identifiers observed in public links (`/S192/`, `/P2025203BA0102/`) are
 * treated as *opaque, observed* keys: they are used for provenance and
 * deduplication, never as the sole join key and never parsed for semantics.
 */
export const DEFAULT_TEAM_ID_PATTERN = "/(S\\d{1,8})\\b";
export const DEFAULT_MATCH_ID_PATTERN = "\\b(P\\d{6,24})\\b";

export function extractIdentifier(value: string, pattern: string): string | null {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return null;
  }
  const match = regex.exec(value);
  if (match === null) return null;
  return match[1] ?? match[0];
}

/** True when an identifier carries a season-like prefix, e.g. `P2025…`. */
export function matchIdSeasonHint(matchId: string, pattern: string): string | null {
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    return null;
  }
  const result = regex.exec(matchId);
  return result?.[1] ?? null;
}

export function normalizedTeamKey(team: CsiTeamRef): string {
  return team.csiTeamId ?? `name:${normalizeTeamName(team.name)}`;
}

/**
 * Stable within a snapshot. Prefers the observed match id; otherwise falls back
 * to a composite of matchday + team names, which is weaker and is flagged by
 * `idConfidence`.
 */
export function matchKey(match: CsiMatch): string {
  if (match.csiMatchId !== null) return `id:${match.csiMatchId}`;
  return [
    "cmp",
    match.matchday === null ? "?" : String(match.matchday),
    normalizedTeamKey(match.home),
    normalizedTeamKey(match.away),
  ].join("|");
}
