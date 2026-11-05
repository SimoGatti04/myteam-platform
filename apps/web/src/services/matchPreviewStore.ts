import type { MatchDetail } from '../types/domain';

/**
 * W4 PREVIEW STORE — LOCAL, DISPOSABLE, MOCK-ONLY.
 *
 * Scope: early owner review of match results/goals/cards and the admin reporting
 * workflow while Core C2 contracts are not yet available.
 *
 * This store is deliberately browser-session scoped. It never calls the API and it
 * must not be mistaken for backend persistence. Resetting the preview (or closing
 * the tab) discards every edit.
 */
export const MATCH_PREVIEW_STORAGE_KEY = 'myteam_w4_match_preview_v1';

type PreviewMatchMap = Record<string, MatchDetail>;
type Listener = () => void;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function readMap(): PreviewMatchMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(MATCH_PREVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as PreviewMatchMap;
  } catch {
    return {};
  }
}

function writeMap(map: PreviewMatchMap): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(MATCH_PREVIEW_STORAGE_KEY, JSON.stringify(map));
  notify();
}

/** Merge base fixtures with any local preview edits, preserving fixture order. */
export function applyMatchPreview(base: MatchDetail[]): MatchDetail[] {
  const overrides = readMap();
  if (Object.keys(overrides).length === 0) return base;
  return base.map((match) => overrides[match.id] ?? match);
}

/** Return the current preview version of a match, if it exists. */
export function getPreviewMatch(base: MatchDetail[], id: string): MatchDetail | undefined {
  return applyMatchPreview(base).find((match) => match.id === id);
}

/** Persist a single edited match in sessionStorage only. Throws if storage is unavailable. */
export function savePreviewMatch(match: MatchDetail): void {
  const map = readMap();
  map[match.id] = match;
  writeMap(map);
}

/** Remove every local edit and restore the committed fixtures. */
export function resetMatchPreview(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MATCH_PREVIEW_STORAGE_KEY);
  } catch {
    // Storage unavailable: base fixtures are still the effective source.
  }
  notify();
}

export function subscribeMatchPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasLocalPreviewEdits(): boolean {
  return Object.keys(readMap()).length > 0;
}
