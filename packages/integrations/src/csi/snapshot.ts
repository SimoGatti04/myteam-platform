import { createHash } from "node:crypto";
import type { CsiSnapshot } from "../types.js";

/** JSON with recursively sorted object keys and stable arrays. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export type SnapshotPayload = Omit<CsiSnapshot, "digest">;

/**
 * Content digest. Acquisition time is deliberately excluded so that repeated
 * acquisition of unchanged source content produces the same digest and the
 * import stays idempotent.
 */
export function snapshotDigest(payload: SnapshotPayload): string {
  const content = {
    schemaVersion: payload.schemaVersion,
    sourceId: payload.sourceId,
    locator: payload.locator,
    competitionTitle: payload.competitionTitle,
    teams: payload.teams,
    matches: payload.matches,
    standings: payload.standings,
    standingsStatus: payload.standingsStatus,
    parserProfile: payload.parserProfile,
  };
  return `sha256:${sha256Hex(canonicalJson(content))}`;
}

export function createSnapshot(payload: SnapshotPayload): CsiSnapshot {
  return { ...payload, digest: snapshotDigest(payload) };
}
