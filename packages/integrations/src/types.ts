import type { Diagnostic } from "./diagnostics.js";

/**
 * Domain model of a CSI competition snapshot.
 *
 * These types are intentionally provider-shaped: they describe what the source
 * publishes, not the local database model. Mapping to platform entities happens
 * in `import-plan.ts` and is subject to ADR-0008 source hierarchy.
 */

export type CsiResultStatus =
  | "scheduled"
  | "unofficial"
  | "official"
  | "postponed"
  | "cancelled"
  | "unknown";

export type IdConfidence = "observed" | "derived";

export interface CsiTeamRef {
  /** Identifier observed in the source (e.g. `/S192/`). Null when the page has none. */
  csiTeamId: string | null;
  name: string;
  /** Absolute URL when the source publishes a crest; never fetched automatically. */
  logoUrl: string | null;
}

export interface CsiKickoff {
  /** `YYYY-MM-DD` as published. */
  date: string;
  /** `HH:MM` as published, null when the source only gives a date. */
  time: string | null;
  /** IANA zone used to build `iso`. */
  timeZone: string;
  /** ISO-8601 with offset, derived from date + time + zone. Null if not derivable. */
  iso: string | null;
}

export interface CsiScore {
  home: number;
  away: number;
}

export interface CsiMatch {
  /** Source match id (`P…`) when published; null otherwise. */
  csiMatchId: string | null;
  idConfidence: IdConfidence;
  matchday: number | null;
  kickoff: CsiKickoff | null;
  venue: string | null;
  home: CsiTeamRef;
  away: CsiTeamRef;
  score: CsiScore | null;
  resultStatus: CsiResultStatus;
  /** Raw class/attribute hints used to derive the status, for auditing. */
  statusHints: string[];
}

export interface CsiStandingRow {
  position: number | null;
  team: CsiTeamRef;
  points: number | null;
  played: number | null;
  won: number | null;
  drawn: number | null;
  lost: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDifference: number | null;
}

/** Locator of a competition/group page. All fields are source data, none is team-specific. */
export interface CsiLocator {
  /** Configured source instance id, e.g. `csi-live`. */
  sourceId: string;
  /** Season label as published, e.g. `2025/26`. */
  seasonLabel: string;
  /** Source path segment for the season, e.g. `25`. */
  seasonSegment: string | null;
  regionSlug: string | null;
  committeeSlug: string | null;
  disciplineSlug: string | null;
  /** Opaque competition segment observed in URLs, e.g. `C203`. Not a stable API id. */
  competitionSegment: string | null;
  /** Group label as published, e.g. `Dilettanti A 5 Gruppo C / B`. */
  groupLabel: string | null;
  /** Canonical page URL used for acquisition. */
  url: string;
}

export type CsiStandingsStatus = "official" | "unofficial" | "unknown" | "absent";

export interface CsiSnapshot {
  schemaVersion: 1;
  /** Deterministic content digest (sha256 hex, prefixed `sha256:`). */
  digest: string;
  sourceId: string;
  /** Acquisition timestamp (ISO-8601, UTC). */
  fetchedAt: string;
  locator: CsiLocator;
  competitionTitle: string | null;
  teams: CsiTeamRef[];
  matches: CsiMatch[];
  standings: CsiStandingRow[];
  standingsStatus: CsiStandingsStatus;
  parserProfile: { id: string; version: string };
  warnings: Diagnostic[];
}

/**
 * Persisted source configuration. Produced by the admin wizard and stored by
 * Core; the prototype only validates and normalises it.
 */
export interface CsiSourceConfig {
  id: string;
  enabled: boolean;
  /** Allowlisted host policy for this source. */
  allowedHosts: string[];
  /** Base URL (https, allowlisted). */
  baseUrl: string;
  /** Season segment convention used to build the human label. */
  seasonLabelConvention: "start-year" | "end-year" | "explicit";
  /** Optional explicit segment → label mapping for seasons not following the convention. */
  seasonLabelOverrides: Record<string, string>;
  /** IANA zone used to interpret published dates/times. */
  timeZone: string;
  /** Conservative acquisition limits. */
  limits: {
    timeoutMs: number;
    maxBytes: number;
    maxRedirects: number;
    requestsPerMinute: number;
    cacheTtlMs: number;
  };
}
