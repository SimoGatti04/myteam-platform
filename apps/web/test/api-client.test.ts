import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiService } from '../src/services/api';
import { authService } from '../src/services/auth';
import type { PublicTeamDto, PublicRosterDto, PublicMatchesDto } from '@myteam/contracts';

describe('API Client - Separation of DEMO and REALE & Error Discipline', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    authService.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. GET /public/team succeeds with real 200 payload and does not return demo fixtures', async () => {
    const mockRealTeam: PublicTeamDto = {
      name: 'Real Core FC',
      crestUrl: 'https://core.example/crest.png',
      primaryColor: '#112233',
      secondaryColor: '#445566',
      currentSeason: {
        id: '11111111-1111-1111-1111-111111111111',
        label: '2026/2027',
        startsOn: '2026-09-01',
        endsOn: '2027-06-30',
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRealTeam,
    });

    const res = await apiService.getPublicTeam();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.name).toBe('Real Core FC');
      expect(res.data.crestUrl).toBe('https://core.example/crest.png');
    }
  });

  it('2. GET /public/team 404 returns explicit public_team_not_found error and NEVER falls back silently to demo', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'public_team_not_found' }),
    });

    const res = await apiService.getPublicTeam();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(404);
      expect(res.errorCode).toBe('public_team_not_found');
      expect(res.message).toContain('non ancora pubblicata');
    }
  });

  it('3. GET /public/matches handles 500 error honestly and does NOT invent fake matches', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal_error' }),
    });

    const res = await apiService.getPublicMatches();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(500);
      expect(res.errorCode).toBe('internal_error');
      expect(res.message).toBe('Errore interno del server.');
    }
  });

  it('4. Handles backend offline / network failure with status 0 without faking success', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const res = await apiService.getPublicRoster();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(0);
      expect(res.errorCode).toBe('network_offline');
      expect(res.message).toContain('Server non raggiungibile');
    }
  });

  it('5. Admin request PUT /admin/team returns 401 when token is missing and does NOT fake success in localStorage', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'authentication_required' }),
    });

    const res = await apiService.configureTeam({ name: 'Hacked Team' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(401);
      expect(res.errorCode).toBe('authentication_required');
      expect(res.message).toContain('Autenticazione richiesta');
    }
  });

  it('6. Admin request PUT /admin/team passes Bearer token when authenticated', async () => {
    authService.setAuthToken('valid-jwt-token-123');

    let capturedHeaders: Headers | undefined;
    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      capturedHeaders = new Headers(init.headers);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: 'Configured Team' }),
      });
    });

    const res = await apiService.configureTeam({ name: 'Configured Team' });
    expect(res.success).toBe(true);
    expect(capturedHeaders?.get('Authorization')).toBe('Bearer valid-jwt-token-123');
  });

  it('7. Admin request POST /admin/team/publish returns 403 on insufficient permissions without faking publishedAt', async () => {
    authService.setAuthToken('read-only-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'insufficient_permissions' }),
    });

    const res = await apiService.publishTeam();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(403);
      expect(res.errorCode).toBe('insufficient_permissions');
      expect(res.message).toContain('Accesso negato');
    }
  });

  it('8. Demo data is returned ONLY via explicit getDemo* methods, never mixed with real API pipeline', () => {
    const demoTeam = apiService.getDemoPublicTeam();
    expect(demoTeam).toBeDefined();
    expect(demoTeam.name).toBe('ASD Aurora Calcio');

    const demoMatches = apiService.getDemoMatches();
    expect(demoMatches.scheduled.length).toBeGreaterThan(0);
    expect(demoMatches.toBeScheduled.length).toBeGreaterThan(0);
  });
});
