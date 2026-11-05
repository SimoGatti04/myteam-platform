import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  MatchEventDto,
  MatchResultDto,
  PlayerDto,
  RosterMembershipDto,
} from '@myteam/contracts';
import { apiService } from '../src/services/api';
import { authService } from '../src/services/auth';
import { RealMatchDetailDialog } from '../src/views/match/RealMatchDetailDialog';
import { RealMatchReportPanel } from '../src/views/admin/RealMatchReportPanel';

const MATCH_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PLAYER_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const ASSIST_ID = 'cccccccc-3333-4333-8333-333333333333';

const result: MatchResultDto = {
  matchId: MATCH_ID,
  teamScore: 2,
  opponentScore: 1,
  recordedAt: '2026-11-01T18:00:00.000Z',
  updatedAt: '2026-11-01T18:00:00.000Z',
};

const savedEvent: MatchEventDto = {
  id: 'dddddddd-4444-4444-8444-444444444444',
  matchId: MATCH_ID,
  kind: 'goal',
  side: 'team',
  period: 1,
  minute: 12,
  player: { id: PLAYER_ID, displayName: 'Giocatore Reale Uno' },
  assist: { id: ASSIST_ID, displayName: 'Giocatore Reale Due' },
};

const players: PlayerDto[] = [
  { id: PLAYER_ID, displayName: 'Giocatore Reale Uno' },
  { id: ASSIST_ID, displayName: 'Giocatore Reale Due' },
];

const memberships: RosterMembershipDto[] = [
  {
    id: 'eeeeeeee-5555-4555-8555-555555555555',
    playerId: PLAYER_ID,
    seasonId: 'ffffffff-6666-4666-8666-666666666666',
    jerseyNumber: 9,
    activeFrom: '2026-09-01',
    activeUntil: null,
  },
];

const publicMatch = {
  id: MATCH_ID,
  seasonId: 'ffffffff-6666-4666-8666-666666666666',
  opponentName: 'Avversario Reale',
  competitionName: 'Campionato Reale',
  isOfficial: true,
  scheduledAt: '2026-11-01T15:00:00.000Z',
  status: 'completed' as const,
};

const scoreboard = {
  matchId: MATCH_ID,
  status: 'completed' as const,
  teamScore: 2,
  opponentScore: 1,
  events: [savedEvent],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('W5 real-mode ApiService (C2 contract)', () => {
  const fetchMock = () => vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock());
  });

  it('reads the admin result with the Bearer token, and never on public routes', async () => {
    vi.spyOn(authService, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer test-token' });
    await apiService.getAdminMatchResult(MATCH_ID);
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/v1/admin/matches/${MATCH_ID}/result`);
    expect((init as RequestInit).method).toBeUndefined();
    expect(new Headers((init as RequestInit).headers).get('Authorization')).toBe('Bearer test-token');

    await apiService.getPublicMatchScoreboard(MATCH_ID);
    const [, publicInit] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(new Headers((publicInit as RequestInit).headers).get('Authorization')).toBeNull();
  });

  it('puts the score with the exact C2 payload', async () => {
    await apiService.upsertMatchResult(MATCH_ID, { teamScore: 2, opponentScore: 1 });
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/v1/admin/matches/${MATCH_ID}/result`);
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ teamScore: 2, opponentScore: 1 });
  });

  it('posts an event with clientEventId and never free-text identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(savedEvent), { status: 201 })));
    await apiService.createMatchEvent(MATCH_ID, {
      kind: 'goal',
      side: 'team',
      period: 1,
      minute: 12,
      playerId: PLAYER_ID,
      assistPlayerId: null,
      clientEventId: 'client-1',
    });
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/v1/admin/matches/${MATCH_ID}/events`);
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toEqual({
      kind: 'goal',
      side: 'team',
      period: 1,
      minute: 12,
      playerId: PLAYER_ID,
      assistPlayerId: null,
      clientEventId: 'client-1',
    });
    expect(body).not.toHaveProperty('playerName');
  });

  it('maps a public scoreboard 404 to an unpublished result, without auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'public_match_scoreboard_not_found' }), { status: 404 }))
    );
    const res = await apiService.getPublicMatchScoreboard(MATCH_ID);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.status).toBe(404);
      expect(res.errorCode).toBe('public_match_scoreboard_not_found');
      expect(res.message).toContain('non pubblicato');
    }
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`/api/v1/public/matches/${MATCH_ID}/scoreboard`);
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('Authorization')).toBeNull();
  });
});

describe('W5 real public scoreboard dialog', () => {
  it('renders server scoreboard with MAPI/opponent labels and no demo data', async () => {
    vi.spyOn(apiService, 'getPublicMatch').mockResolvedValue({ success: true, data: publicMatch });
    vi.spyOn(apiService, 'getPublicMatchScoreboard').mockResolvedValue({ success: true, data: scoreboard });

    render(<RealMatchDetailDialog matchId={MATCH_ID} onClose={() => undefined} />);

    await screen.findByText('2 - 1');
    expect(screen.getByText('Avversario Reale')).toBeTruthy();
    expect(screen.getAllByText('MAPI').length).toBeGreaterThan(0);
    expect(screen.getByText('DATI DAL SERVER')).toBeTruthy();
    expect(screen.queryByText(/DEMO/)).toBeNull();
    expect(screen.queryByText('ASD Aurora Calcio')).toBeNull();
    expect(screen.getByText('Giocatore Reale Uno')).toBeTruthy();
    expect(screen.getByText(/Assist: Giocatore Reale Due/)).toBeTruthy();
    expect(screen.getByText(/1° tempo/)).toBeTruthy();
  });

  it('shows the unpublished/not-found state for a 404 scoreboard', async () => {
    vi.spyOn(apiService, 'getPublicMatch').mockResolvedValue({ success: true, data: publicMatch });
    vi.spyOn(apiService, 'getPublicMatchScoreboard').mockResolvedValue({
      success: false,
      status: 404,
      errorCode: 'public_match_scoreboard_not_found',
      message: 'Risultato non pubblicato: la partita non è ancora completata o pubblicata.',
    });

    render(<RealMatchDetailDialog matchId={MATCH_ID} onClose={() => undefined} />);
    await screen.findByText('Risultato non pubblicato');
    expect(screen.queryByText('2 - 1')).toBeNull();
  });

  it('shows a retryable error for non-404 failures', async () => {
    vi.spyOn(apiService, 'getPublicMatch').mockResolvedValue({
      success: false,
      status: 503,
      errorCode: 'network_offline',
      message: 'Server non raggiungibile.',
    });

    render(<RealMatchDetailDialog matchId={MATCH_ID} onClose={() => undefined} />);
    await screen.findByText('Risultato non disponibile');
    expect(screen.getByText('Server non raggiungibile.')).toBeTruthy();
  });
});

describe('W5 real admin report panel', () => {
  function mockLoad(options?: { resultMissing?: boolean }) {
    vi.spyOn(apiService, 'getAdminPlayers').mockResolvedValue({ success: true, data: players });
    vi.spyOn(apiService, 'getAdminRosterMemberships').mockResolvedValue({ success: true, data: memberships });
    vi.spyOn(apiService, 'getAdminMatchResult').mockResolvedValue(
      options?.resultMissing
        ? { success: false, status: 404, errorCode: 'match_result_not_found', message: 'Nessun risultato registrato per questa partita.' }
        : { success: true, data: result }
    );
    vi.spyOn(apiService, 'getAdminMatchEvents').mockResolvedValue({ success: true, data: [savedEvent] });
  }

  it('loads server state and makes saved events immutable', async () => {
    mockLoad();
    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    expect(screen.getByText('salvato')).toBeTruthy();
    expect(screen.getByText(/non espone PATCH\/DELETE/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Modifica/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Rimuovi gol/i })).toBeNull();
    expect(screen.queryByText('Davide Moretti')).toBeNull();
    expect(screen.queryByText(/DEMO/)).toBeNull();
  });

  it('saves the result via PUT and refetches server state', async () => {
    mockLoad();
    const upsert = vi.spyOn(apiService, 'upsertMatchResult').mockResolvedValue({ success: true, data: result });
    const refetch = vi.spyOn(apiService, 'getAdminMatchResult');

    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    fireEvent.change(screen.getByLabelText('Punteggio MAPI'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva risultato/i }));

    await waitFor(() => expect(upsert).toHaveBeenCalledWith(MATCH_ID, { teamScore: 3, opponentScore: 1 }));
    await screen.findByText(/Risultato salvato dal server/);
    expect(refetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('validates the draft before adding: no free-text identity, 1..120 minute', async () => {
    mockLoad();
    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi bozza locale/i }));
    expect(screen.getByText(/Minuto intero tra 1 e 120/)).toBeTruthy();
    expect(screen.getByText(/Seleziona il giocatore della rosa/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Minuto nel tempo'), { target: { value: '121' } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi bozza locale/i }));
    expect(screen.getByText(/Minuto intero tra 1 e 120/)).toBeTruthy();
  });

  it('posts only draft rows, with a stable clientEventId, then refetches', async () => {
    mockLoad();
    const created: MatchEventDto = { ...savedEvent, id: '99999999-7777-4777-8777-777777777777', minute: 30 };
    const create = vi.spyOn(apiService, 'createMatchEvent').mockResolvedValue({ success: true, data: created });
    const refetchEvents = vi.spyOn(apiService, 'getAdminMatchEvents');

    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    fireEvent.change(screen.getByLabelText('Minuto nel tempo'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Marcatore'), { target: { value: PLAYER_ID } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi bozza locale/i }));
    await screen.findByText('Bozze non inviate');

    fireEvent.click(screen.getByRole('button', { name: /Invia 1 eventi/i }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));

    const payload = create.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.playerId).toBe(PLAYER_ID);
    expect(payload.side).toBe('team');
    expect(payload.period).toBe(1);
    expect(payload.minute).toBe(30);
    expect(typeof payload.clientEventId).toBe('string');
    expect(payload).not.toHaveProperty('playerName');
    expect(refetchEvents.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('handles partial failure: failed draft stays retryable with the same clientEventId', async () => {
    mockLoad();
    let attempt = 0;
    const create = vi.spyOn(apiService, 'createMatchEvent').mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        return { success: false, status: 500, errorCode: 'http_500', message: 'Errore server simulato.' };
      }
      return { success: true, data: savedEvent };
    });

    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    fireEvent.change(screen.getByLabelText('Minuto nel tempo'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Marcatore'), { target: { value: PLAYER_ID } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi bozza locale/i }));
    fireEvent.click(screen.getByRole('button', { name: /Invia 1 eventi/i }));

    await screen.findByText(/0 inviati, 1 falliti/);
    const firstPayload = create.mock.calls[0]?.[1] as Record<string, unknown>;
    const retryButton = await screen.findByRole('button', { name: /Riaccoda/i });
    fireEvent.click(retryButton);
    fireEvent.click(screen.getByRole('button', { name: /Invia 1 eventi/i }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    const secondPayload = create.mock.calls[1]?.[1] as Record<string, unknown>;
    expect(secondPayload.clientEventId).toBe(firstPayload.clientEventId);
    await screen.findByText(/1 eventi inviati e confermati/);
  });

  it('shows an explicit empty result state instead of inventing a score', async () => {
    mockLoad({ resultMissing: true });
    render(
      <RealMatchReportPanel
        matchId={MATCH_ID}
        opponentName="Avversario Reale"
        seasonId={publicMatch.seasonId}
        onClose={() => undefined}
        onViewPublic={() => undefined}
      />
    );

    await screen.findByText('Giocatore Reale Uno');
    expect(screen.getByText('Nessun risultato')).toBeTruthy();
    expect((screen.getByLabelText('Punteggio MAPI') as HTMLInputElement).value).toBe('');
  });
});
