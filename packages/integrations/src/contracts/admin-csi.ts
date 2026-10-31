/**
 * PROPOSED admin contracts for the CSI integration.
 *
 * These are TypeScript shapes only: CSI-S2 does not add Fastify routes nor
 * modify `packages/contracts`. A follow-up Core checkpoint is required to
 * express them as TypeBox schemas and wire them to the admin API.
 *
 * Security invariants:
 * - Every mutation requires an authenticated admin and an idempotency key.
 * - The server re-validates every URL; client-provided URLs are never trusted.
 * - Discovery and preview results are cached server-side; a preview token binds
 *   the imported data to the exact snapshot the admin reviewed.
 */

export interface CsiLimitsView {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  requestsPerMinute: number;
  cacheTtlMs: number;
}

export interface CsiSourceUpsertRequest {
  enabled: boolean;
  baseUrl: string;
  allowedHosts: string[];
  seasonLabelConvention: "start-year" | "end-year" | "explicit";
  seasonLabelOverrides: Record<string, string>;
  timeZone: string;
  limits: CsiLimitsView;
}

export interface CsiSyncRunSummary {
  runId: string;
  status: "succeeded" | "failed" | "blocked";
  startedAt: string;
  finishedAt: string | null;
  snapshotDigest: string | null;
  matchesAdded: number;
  matchesUpdated: number;
  matchesRemoved: number;
  conflicts: number;
  errorCode: string | null;
}

export interface CsiSourceView extends CsiSourceUpsertRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  lastRun: CsiSyncRunSummary | null;
}

export interface CsiDiscoveryRequest {
  sourceId: string;
  /** Optional parent page; when absent the configured baseUrl is used. */
  parentUrl?: string;
}

export interface CsiDiscoveryOptionView {
  label: string;
  value: string | null;
  href: string | null;
}

export interface CsiDiscoveryResponse {
  sourceId: string;
  fetchedAt: string;
  fromCache: boolean;
  options: CsiDiscoveryOptionView[];
  diagnostics: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
}

export interface CsiPreviewRequest {
  sourceId: string;
  competitionUrl: string;
}

export interface CsiPreviewTeamView {
  csiTeamId: string | null;
  name: string;
  localTeamId: string | null;
  matchStatus: "matched" | "ambiguous" | "unmatched";
  candidates: Array<{ localId: string; score: number }>;
}

export interface CsiPreviewMatchView {
  csiMatchId: string | null;
  matchKey: string;
  matchday: number | null;
  kickoffIso: string | null;
  home: string;
  away: string;
  score: string | null;
  resultStatus: "scheduled" | "unofficial" | "official" | "postponed" | "cancelled" | "unknown";
  protectedByAdmin: boolean;
  plannedAction: string;
}

export interface CsiPreviewResponse {
  /** Opaque token binding this preview to snapshotDigest + planDigest. */
  previewToken: string;
  fetchedAt: string;
  fromCache: boolean;
  snapshotDigest: string;
  planDigest: string;
  competition: {
    seasonLabel: string;
    committee: string | null;
    discipline: string | null;
    groupLabel: string | null;
    title: string | null;
    standingsStatus: "official" | "unofficial" | "unknown" | "absent";
  };
  teams: CsiPreviewTeamView[];
  matches: CsiPreviewMatchView[];
  summary: {
    matchesAdded: number;
    matchesUpdated: number;
    matchesRemoved: number;
    conflicts: number;
    requiresConfirmation: boolean;
  };
  diagnostics: Array<{ code: string; severity: "info" | "warning" | "error"; message: string }>;
}

export interface CsiTeamBindingInput {
  csiTeamId: string;
  /** null = create a new local team; the admin confirms the creation. */
  localTeamId: string | null;
}

export interface CsiImportRequest {
  previewToken: string;
  /** Client-generated; replays with the same key return the original result. */
  idempotencyKey: string;
  teamBindings: CsiTeamBindingInput[];
  /** Explicit confirmation of new teams and of unofficial results. */
  confirm: true;
}

export interface CsiImportResponse {
  runId: string;
  status: "applied" | "partial" | "rejected";
  applied: { matches: number; teams: number; standings: boolean };
  skipped: { protectedItems: number; unofficialItems: number };
  conflicts: Array<{ key: string; reason: string }>;
}

/** Routes to be implemented by a coordinated Core checkpoint. */
export const CSI_ADMIN_ROUTES = {
  listSources: "GET /api/v1/admin/integrations/csi/sources",
  upsertSource: "PUT /api/v1/admin/integrations/csi/sources/:sourceId",
  discover: "POST /api/v1/admin/integrations/csi/discover",
  preview: "POST /api/v1/admin/integrations/csi/preview",
  importSnapshot: "POST /api/v1/admin/integrations/csi/import",
  listRuns: "GET /api/v1/admin/integrations/csi/sources/:sourceId/runs",
} as const;
