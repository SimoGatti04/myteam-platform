import type { AcquiredDocument, DocumentClient } from "../acquire/client.js";
import { IntegrationError } from "../errors.js";
import type { CsiSourceConfig } from "../types.js";
import type { CsiLocator, CsiSnapshot } from "../types.js";
import { validateSourceUrl } from "../security/url-policy.js";
import { policyFromConfig } from "../source-config.js";
import { diffSnapshots, type SnapshotDiff } from "./diff.js";
import { buildImportPlan, type ImportOverrides, type ImportPlan } from "./import-plan.js";
import { createTeamMatcher, type TeamMatcher } from "./matching.js";
import { parseCompetitionPage, snapshotFromParsed, type ParsedCompetition } from "./parse.js";
import { CSI_PROFILE_V0, type CsiExtractionProfile } from "./profile.js";
import { createSnapshot } from "./snapshot.js";

export interface RunCsiSyncInput {
  client: DocumentClient;
  config: CsiSourceConfig;
  locator: CsiLocator;
  profile?: CsiExtractionProfile;
  previous?: CsiSnapshot | null;
  matcher?: TeamMatcher;
  overrides?: Partial<ImportOverrides>;
  now?: Date;
  forceRefresh?: boolean;
}

export interface RunCsiSyncOutput {
  snapshot: CsiSnapshot;
  parsed: ParsedCompetition;
  diff: SnapshotDiff;
  plan: ImportPlan;
  acquisition: Pick<AcquiredDocument, "url" | "fetchedAt" | "fromCache">;
}

/** Prevents two sync runs for the same configured source at the same time. */
export interface SourceGuard {
  run<T>(sourceId: string, task: () => Promise<T>): Promise<T>;
}

export function createSourceGuard(): SourceGuard {
  const running = new Set<string>();
  return {
    async run<T>(sourceId: string, task: () => Promise<T>): Promise<T> {
      if (running.has(sourceId)) {
        throw new IntegrationError("concurrent_sync", `A sync is already running for source ${sourceId}`, {
          details: { sourceId },
        });
      }
      running.add(sourceId);
      try {
        return await task();
      } finally {
        running.delete(sourceId);
      }
    },
  };
}

/**
 * Full pipeline: acquire → parse → snapshot → diff → import plan.
 *
 * No persistence, no scheduling, no publishing: the output is an auditable
 * preview the admin must confirm. Live execution only happens when the caller
 * supplies a `DocumentClient`; tests use fixtures.
 */
export async function runCsiSync(input: RunCsiSyncInput): Promise<RunCsiSyncOutput> {
  const profile = input.profile ?? CSI_PROFILE_V0;
  const now = input.now ?? new Date();
  const policy = policyFromConfig(input.config);

  const url = validateSourceUrl(input.locator.url, policy);
  const acquisition = await input.client.acquire(url.toString(), {
    ...(input.forceRefresh === undefined ? {} : { forceRefresh: input.forceRefresh }),
  });

  const referenceDate = now.toISOString().slice(0, 10);
  const parsed = parseCompetitionPage(acquisition.body, {
    profile,
    baseUrl: acquisition.url,
    timeZone: input.config.timeZone,
    referenceDate,
    locator: { ...input.locator, sourceId: input.config.id },
  });

  const snapshot = createSnapshot(snapshotFromParsed(parsed, {
    profile,
    baseUrl: acquisition.url,
    timeZone: input.config.timeZone,
    referenceDate,
    locator: { ...input.locator, sourceId: input.config.id },
  }, acquisition.fetchedAt));

  const diff = diffSnapshots(input.previous ?? null, snapshot);
  const matcher = input.matcher ?? createTeamMatcher([]);
  const plan = buildImportPlan({
    snapshot,
    diff,
    matcher,
    ...(input.overrides === undefined ? {} : { overrides: input.overrides }),
  });

  return {
    snapshot,
    parsed,
    diff,
    plan,
    acquisition: { url: acquisition.url, fetchedAt: acquisition.fetchedAt, fromCache: acquisition.fromCache },
  };
}
