/**
 * W4 preview deep links are intentionally limited to development/demo builds.
 * They never activate in production because callers gate them on demoAllowed.
 */
export type W4PreviewState = 'ready' | 'loading' | 'empty' | 'error';
export type W4PreviewView = 'match-detail' | 'admin-report';

export interface W4PreviewIntent {
  view: W4PreviewView;
  matchId: string;
  state: W4PreviewState;
}

function normalizeState(value: string | null): W4PreviewState {
  return value === 'loading' || value === 'empty' || value === 'error' ? value : 'ready';
}

export function readW4PreviewIntent(): W4PreviewIntent | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo');
  if (demo !== 'true' && demo !== '1') return null;

  const view = params.get('preview');
  if (view !== 'match-detail' && view !== 'admin-report') return null;

  return {
    view,
    matchId: params.get('match') || 'm-last',
    state: normalizeState(params.get('previewState')),
  };
}

export function readW4PreviewState(): W4PreviewState {
  return readW4PreviewIntent()?.state ?? 'ready';
}
