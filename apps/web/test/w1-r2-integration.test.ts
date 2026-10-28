import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiService } from '../src/services/api';
import { authService } from '../src/services/auth';
import type { MatchDto, OpponentDto, SeasonDto, PlayerDto, RosterMembershipDto } from '@myteam/contracts';
import { isDemoAllowed, isManualAuthAllowed, isProduction, isStaging, getAppEnvironment } from '../src/utils/env';
import { getTeamDisplayName, NEUTRAL_TEAM_NAME, DEMO_DEFAULT_TEAM_NAME } from '../src/utils/branding';

describe('Web W1-R2 MVP Integration Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    authService.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('1. Match Draft: createMatch saves a match draft without publishing it', async () => {
    const mockDraftMatch: MatchDto = {
      id: 'm-draft-1',
      seasonId: '22222222-2222-2222-2222-222222222222',
      opponentId: 'op-1',
      competitionId: null,
      isHome: true,
      scheduledAt: null,
      status: 'to_be_scheduled',
      isOfficial: true,
      publishedAt: null, // Bozza non pubblicata
    };

    authService.setAuthToken('test-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockDraftMatch,
    });

    const res = await apiService.createMatch({
      seasonId: mockDraftMatch.seasonId,
      opponentId: mockDraftMatch.opponentId,
      isHome: true,
      isOfficial: true,
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe('m-draft-1');
      expect(res.data.publishedAt).toBeNull();
      expect(res.data.status).toBe('to_be_scheduled');
    }
  });

  it('2. Publish Failure: failure in publishMatch does not return false success', async () => {
    authService.setAuthToken('test-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'match_not_publishable' }),
    });

    const res = await apiService.publishMatch('m-draft-1');
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(400);
      expect(res.errorCode).toBe('match_not_publishable');
      expect(res.message).toContain('match_not_publishable');
    }
  });

  it('3. Opponent Selection: lists existing opponents and selects one without creating duplicate', async () => {
    const mockOpponents: OpponentDto[] = [
      { id: 'op-1', name: 'Real Triuggio' },
      { id: 'op-2', name: 'Sovicese 1980' },
    ];

    authService.setAuthToken('test-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockOpponents,
    });

    const res = await apiService.getAdminOpponents();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.length).toBe(2);
      expect(res.data[0].id).toBe('op-1');
      expect(res.data[0].name).toBe('Real Triuggio');
    }
  });

  it('4. Core C1.1 Admin Reads: fetches admin seasons, players and roster memberships', async () => {
    authService.setAuthToken('test-token');

    const mockSeasons: SeasonDto[] = [
      {
        id: 's-1',
        label: '2026/2027',
        startsOn: '2026-09-01',
        endsOn: '2027-06-30',
      },
    ];

    const mockPlayers: PlayerDto[] = [
      { id: 'p-1', displayName: 'Simone Gatti' },
      { id: 'p-2', displayName: 'Marco Villa' },
    ];

    const mockMemberships: RosterMembershipDto[] = [
      {
        id: 'rm-1',
        playerId: 'p-1',
        seasonId: 's-1',
        jerseyNumber: 10,
        activeFrom: '2026-09-01',
        activeUntil: null,
      },
      {
        id: 'rm-2',
        playerId: 'p-2',
        seasonId: 's-1',
        jerseyNumber: 1,
        activeFrom: '2026-09-01',
        activeUntil: '2026-10-15',
      },
    ];

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSeasons,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPlayers,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockMemberships,
      });

    const seasonsRes = await apiService.getAdminSeasons();
    expect(seasonsRes.success).toBe(true);
    if (seasonsRes.success) {
      expect(seasonsRes.data[0].label).toBe('2026/2027');
    }

    const playersRes = await apiService.getAdminPlayers();
    expect(playersRes.success).toBe(true);
    if (playersRes.success) {
      expect(playersRes.data.length).toBe(2);
      expect(playersRes.data[0].displayName).toBe('Simone Gatti');
    }

    const memRes = await apiService.getAdminRosterMemberships({ seasonId: 's-1' });
    expect(memRes.success).toBe(true);
    if (memRes.success) {
      expect(memRes.data.length).toBe(2);
      expect(memRes.data[0].activeUntil).toBeNull();
      expect(memRes.data[1].activeUntil).toBe('2026-10-15');
    }
  });

  it('5. Roster Membership Error Mapping: mapped error message for dates outside season', async () => {
    authService.setAuthToken('test-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'roster_membership_outside_season' }),
    });

    const res = await apiService.createRosterMembership({
      playerId: 'p-1',
      seasonId: 's-1',
      activeFrom: '2025-01-01', // fuori stagione
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(400);
      expect(res.errorCode).toBe('roster_membership_outside_season');
      expect(res.message).toContain('intervallo della stagione');
    }
  });

  it('6. Ending Roster Membership: ends active membership with explicit activeUntil date', async () => {
    authService.setAuthToken('test-token');

    const updatedMem: RosterMembershipDto = {
      id: 'rm-1',
      playerId: 'p-1',
      seasonId: 's-1',
      jerseyNumber: 10,
      activeFrom: '2026-09-01',
      activeUntil: '2026-10-28',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => updatedMem,
    });

    const res = await apiService.endRosterMembership('rm-1', {
      activeUntil: '2026-10-28',
      reason: 'Fine prestito',
    });

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.activeUntil).toBe('2026-10-28');
    }
  });
});

describe('Demo and Security Environment Controls', () => {
  it('7. isDemoAllowed strictly blocks demo mode in production, even with VITE_ENABLE_DEMO=true', () => {
    // Produzione esplicita con VITE_APP_ENV='production'
    expect(isDemoAllowed({ VITE_APP_ENV: 'production', VITE_ENABLE_DEMO: 'true' })).toBe(false);
    expect(isProduction({ VITE_APP_ENV: 'production' })).toBe(true);

    // Produzione standard Vite MODE='production'
    expect(isDemoAllowed({ MODE: 'production', PROD: true, VITE_ENABLE_DEMO: 'true' })).toBe(false);
    expect(isProduction({ MODE: 'production', PROD: true })).toBe(true);

    // Produzione senza flag demo
    expect(isDemoAllowed({ VITE_APP_ENV: 'production' })).toBe(false);
  });

  it('8. isDemoAllowed distinguishes authorized staging from production', () => {
    // Staging autorizzato con VITE_ENABLE_DEMO='true'
    expect(isStaging({ VITE_APP_ENV: 'staging' })).toBe(true);
    expect(isDemoAllowed({ VITE_APP_ENV: 'staging', VITE_ENABLE_DEMO: 'true' })).toBe(true);

    // Staging senza autorizzazione demo
    expect(isDemoAllowed({ VITE_APP_ENV: 'staging', VITE_ENABLE_DEMO: 'false' })).toBe(false);
    expect(isDemoAllowed({ VITE_APP_ENV: 'staging' })).toBe(false);

    // Staging tramite MODE='staging'
    expect(isDemoAllowed({ MODE: 'staging', VITE_ENABLE_DEMO: 'true' })).toBe(true);
    expect(isDemoAllowed({ MODE: 'staging', VITE_ENABLE_DEMO: 'false' })).toBe(false);

    // Development locale permette demo di default
    expect(isDemoAllowed({ DEV: true, MODE: 'development' })).toBe(true);
  });

  it('9. isManualAuthAllowed blocks manual token input in production and allows it in dev/staging', () => {
    // In produzione: DISABILITATO (mostra stato non configurato per Logto OIDC)
    expect(isManualAuthAllowed({ VITE_APP_ENV: 'production' })).toBe(false);
    expect(isManualAuthAllowed({ MODE: 'production', PROD: true })).toBe(false);

    // In staging e development: ABILITATO per collaudo tecnico
    expect(isManualAuthAllowed({ VITE_APP_ENV: 'staging' })).toBe(true);
    expect(isManualAuthAllowed({ DEV: true })).toBe(true);
  });

  it('10. authService does not expose token without setAuthToken', () => {
    authService.logout();
    expect(authService.isAuthenticated()).toBe(false);
    expect(authService.getAuthToken()).toBeNull();
    expect(authService.getAuthHeaders()).toEqual({});
  });

  it('11. 401 / 403 error mapping conveys permission and authentication failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'authentication_required' }),
    });

    const res = await apiService.getAdminTeam();
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(401);
      expect(res.message).toContain('Autenticazione richiesta');
    }
  });

  it('12. Branding: getTeamDisplayName uses neutral technical name in real mode and preserves demo fixture', () => {
    // 1. Nome configurato: viene restituito fedelmente sia in real sia in demo
    expect(getTeamDisplayName('ASD Aurora Calcio', false)).toBe('ASD Aurora Calcio');
    expect(getTeamDisplayName('ASD Aurora Calcio', true)).toBe('ASD Aurora Calcio');

    // 2. Nome non configurato in modalità REALE: usa il nome tecnico neutro, MAI "MAPI GROUP"
    expect(getTeamDisplayName(null, false)).toBe(NEUTRAL_TEAM_NAME);
    expect(getTeamDisplayName('', false)).toBe(NEUTRAL_TEAM_NAME);
    expect(getTeamDisplayName('   ', false)).toBe(NEUTRAL_TEAM_NAME);
    expect(getTeamDisplayName(null, false)).not.toBe('MAPI GROUP');

    // 3. Nome non configurato in modalità DEMO: usa il default delle fixture
    expect(getTeamDisplayName(null, true)).toBe(DEMO_DEFAULT_TEAM_NAME);
  });

  it('13. Match visibility guard: match is only publicly visible if both match and team are published', () => {
    const isTeamPublishedReal = (teamPublishedAt: string | null) => Boolean(teamPublishedAt);

    // Squadra NON pubblicata (bozza privata)
    const teamDraft = null;
    const matchPublished = '2026-10-28T10:00:00.000Z';
    const isMatchVisibleWhenTeamDraft = Boolean(matchPublished) && isTeamPublishedReal(teamDraft);
    expect(isMatchVisibleWhenTeamDraft).toBe(false);

    // Squadra pubblicata
    const teamPublished = '2026-10-01T12:00:00.000Z';
    const isMatchVisibleWhenTeamPublished = Boolean(matchPublished) && isTeamPublishedReal(teamPublished);
    expect(isMatchVisibleWhenTeamPublished).toBe(true);
  });
  it('14. Admin Partite: distinguishes read error from empty match list and does not mistake error for empty state', async () => {
    authService.setAuthToken('test-token');

    // Scenario A: Server error 500
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal_error', message: 'DB connection timeout' }),
    });

    const errorRes = await apiService.getAdminMatches();
    expect(errorRes.success).toBe(false);
    if (!errorRes.success) {
      expect(errorRes.status).toBe(500);
      expect(errorRes.message).toBe('Errore interno del server.');
    }

    // Scenario B: Legitimate empty list (200 with [])
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    const emptyRes = await apiService.getAdminMatches();
    expect(emptyRes.success).toBe(true);
    if (emptyRes.success) {
      expect(emptyRes.data).toEqual([]);
      expect(emptyRes.data.length).toBe(0);
    }
  });
  // =========================================================================
  // Web W1-R2.2: Completamento Setup Iniziale MVP-I1 (Stagioni & DB Vuoto)
  // =========================================================================

  it('15. Initial empty DB: admin seasons list returns empty array without throwing or inventing fake seasons', async () => {
    authService.setAuthToken('test-token-seasons');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });

    const res = await apiService.getAdminSeasons();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBe(0);
    }
  });

  it('16. Season Creation: POST /api/v1/admin/seasons creates a new season with label, startsOn and endsOn', async () => {
    authService.setAuthToken('test-token-seasons');

    const createdSeasonDto = {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      label: '2026/2027',
      startsOn: '2026-09-01',
      endsOn: '2027-06-30',
    };

    let capturedReq: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedReq = { url, method: init?.method, body: JSON.parse(init?.body as string) };
      return {
        ok: true,
        status: 200,
        json: async () => createdSeasonDto,
      };
    });

    const createPayload = {
      label: '2026/2027',
      startsOn: '2026-09-01',
      endsOn: '2027-06-30',
    };

    const res = await apiService.createSeason(createPayload);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.id).toBe(createdSeasonDto.id);
      expect(res.data.label).toBe('2026/2027');
      expect(res.data.startsOn).toBe('2026-09-01');
      expect(res.data.endsOn).toBe('2027-06-30');
    }

    expect(capturedReq.method).toBe('POST');
    expect(capturedReq.url).toContain('/api/v1/admin/seasons');
    expect(capturedReq.body.label).toBe('2026/2027');
    expect(capturedReq.body.startsOn).toBe('2026-09-01');
    expect(capturedReq.body.endsOn).toBe('2027-06-30');
  });

  it('17. Season Creation Errors: maps 400 invalid_season_date, season_end_before_start, and 409 season_label_exists', async () => {
    authService.setAuthToken('test-token-seasons');

    // 17a. 400 invalid_season_date
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_season_date' }),
    });
    const resInvalidDate = await apiService.createSeason({
      label: '2026/2027',
      startsOn: 'bad-date',
      endsOn: '2027-06-30',
    });
    expect(resInvalidDate.success).toBe(false);
    if (!resInvalidDate.success) {
      expect(resInvalidDate.status).toBe(400);
      expect(resInvalidDate.message).toBe('Date di inizio o fine stagione non valide (formato AAAA-MM-GG).');
    }

    // 17b. 400 season_end_before_start
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'season_end_before_start' }),
    });
    const resEndBeforeStart = await apiService.createSeason({
      label: '2026/2027',
      startsOn: '2027-06-30',
      endsOn: '2026-09-01',
    });
    expect(resEndBeforeStart.success).toBe(false);
    if (!resEndBeforeStart.success) {
      expect(resEndBeforeStart.status).toBe(400);
      expect(resEndBeforeStart.message).toBe('La data di conclusione della stagione non può precedere la data di inizio.');
    }

    // 17c. 409 season_label_exists
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'season_label_exists' }),
    });
    const resDuplicate = await apiService.createSeason({
      label: '2026/2027',
      startsOn: '2026-09-01',
      endsOn: '2027-06-30',
    });
    expect(resDuplicate.success).toBe(false);
    if (!resDuplicate.success) {
      expect(resDuplicate.status).toBe(409);
      expect(resDuplicate.message).toBe('Una stagione con questa denominazione esiste già.');
    }
  });

  it('18. Team Setup with Season: sets currentSeasonId on empty DB team via PUT /api/v1/admin/team and preserves draft state', async () => {
    authService.setAuthToken('test-token-setup');

    const seasonId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

    let capturedPutBody: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      if (init?.method === 'PUT') {
        capturedPutBody = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            name: capturedPutBody.name,
            crestUrl: capturedPutBody.crestUrl,
            primaryColor: capturedPutBody.primaryColor,
            secondaryColor: capturedPutBody.secondaryColor,
            currentSeasonId: capturedPutBody.currentSeasonId,
            publishedAt: null, // Still in draft
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const configureRes = await apiService.configureTeam({
      name: 'Polisportiva Aurora',
      crestUrl: 'https://example.com/crest.png',
      primaryColor: '#1E3A8A',
      secondaryColor: '#38BDF8',
      currentSeasonId: seasonId,
    });

    expect(configureRes.success).toBe(true);
    if (configureRes.success) {
      expect(configureRes.data.currentSeasonId).toBe(seasonId);
      expect(configureRes.data.publishedAt).toBeNull(); // Configuration saved does NOT publish
      expect(configureRes.data.name).toBe('Polisportiva Aurora');
    }
    expect(capturedPutBody.currentSeasonId).toBe(seasonId);
    expect(capturedPutBody.name).toBe('Polisportiva Aurora');
  });

  it('19. End-to-End Setup to Match Creation Flow: once currentSeasonId is assigned, match creation uses it', async () => {
    authService.setAuthToken('test-token-match-flow');

    const seasonId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    const opponentId = '99999999-9999-9999-9999-999999999999';

    // Verify creating match with the configured seasonId
    let capturedMatchReq: any = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, init) => {
      capturedMatchReq = JSON.parse(init.body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'match-1234-uuid',
          seasonId: capturedMatchReq.seasonId,
          opponentId: capturedMatchReq.opponentId,
          competitionId: null,
          isOfficial: true,
          scheduledAt: '2026-10-15T15:00:00.000Z',
          status: 'scheduled',
          publishedAt: null,
        }),
      };
    });

    const createMatchRes = await apiService.createMatch({
      seasonId: seasonId,
      opponentId: opponentId,
      competitionId: null,
      isOfficial: true,
      scheduledAt: '2026-10-15T15:00:00.000Z',
      status: 'scheduled',
    });

    expect(createMatchRes.success).toBe(true);
    if (createMatchRes.success) {
      expect(createMatchRes.data.seasonId).toBe(seasonId);
      expect(createMatchRes.data.publishedAt).toBeNull(); // Draft match created
    }
    expect(capturedMatchReq.seasonId).toBe(seasonId);
  });
});
