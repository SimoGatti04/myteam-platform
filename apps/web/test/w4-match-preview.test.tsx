import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEMO_MATCH_DETAILS, DEMO_ROSTER_MEMBERS } from '../src/fixtures/demoData';
import {
  MATCH_PREVIEW_STORAGE_KEY,
  applyMatchPreview,
  resetMatchPreview,
  savePreviewMatch,
} from '../src/services/matchPreviewStore';
import { MatchDetailDialog } from '../src/views/match/MatchDetailDialog';
import { AdminMatchReportPanel } from '../src/views/admin/AdminMatchReportPanel';

const fixture = DEMO_MATCH_DETAILS[0]!;
const roster = DEMO_ROSTER_MEMBERS.filter((player) => player.isActive).map((player) => ({
  id: player.playerId,
  displayName: player.displayName,
  jerseyNumber: player.jerseyNumber,
}));

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('W4 preview store — local mock only', () => {
  it('merges a local edit over the committed fixture without touching the source', () => {
    const edited = { ...fixture, homeScore: 4, events: [...(fixture.events ?? [])] };
    savePreviewMatch(edited);

    const merged = applyMatchPreview(DEMO_MATCH_DETAILS);
    expect(merged[0]?.homeScore).toBe(4);
    expect(fixture.homeScore).toBe(3);
    expect(sessionStorage.getItem(MATCH_PREVIEW_STORAGE_KEY)).toContain(fixture.id);
  });

  it('resets every local edit back to the fixture', () => {
    savePreviewMatch({ ...fixture, homeScore: 9 });
    resetMatchPreview();
    expect(applyMatchPreview(DEMO_MATCH_DETAILS)[0]?.homeScore).toBe(3);
    expect(sessionStorage.getItem(MATCH_PREVIEW_STORAGE_KEY)).toBeNull();
  });
});

describe('W4 public match detail preview', () => {
  it('renders score, goals, assists and cards from explicit demo fixtures', () => {
    render(
      <MatchDetailDialog
        match={fixture}
        isDemo
        onClose={() => undefined}
      />
    );

    expect(screen.getByText('3 - 2')).toBeTruthy();
    expect(screen.getByText('Davide Moretti')).toBeTruthy();
    expect(screen.getAllByText(/Assist: Simone Gatti/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Assist: Lorenzo Fontana/)).toBeTruthy();
    expect(document.querySelector('.w4-summary__item--yellow')?.textContent).toContain('4 ammonizioni');
    expect(document.querySelector('.w4-summary__item--red')?.textContent).toContain('1 espulsioni');
    expect(screen.getByText(/ANTEPRIMA LOCALE/)).toBeTruthy();
  });

  it('renders the empty, loading and error review states without inventing data', () => {
    const { rerender } = render(
      <MatchDetailDialog match={fixture} isDemo previewState="empty" onClose={() => undefined} />
    );
    expect(screen.getByText('Nessun evento registrato')).toBeTruthy();

    rerender(<MatchDetailDialog match={fixture} isDemo previewState="loading" onClose={() => undefined} />);
    expect(screen.getByLabelText('Caricamento dettaglio partita')).toBeTruthy();

    rerender(<MatchDetailDialog match={fixture} isDemo previewState="error" onClose={() => undefined} />);
    expect(screen.getByText('Dettaglio partita non disponibile')).toBeTruthy();
    expect(screen.getByText(/Nessun dato sostitutivo è stato inventato/)).toBeTruthy();
  });

  it('marks scheduled matches without events as not played', () => {
    const scheduled = DEMO_MATCH_DETAILS.find((match) => match.id === 'm-next')!;
    render(<MatchDetailDialog match={scheduled} isDemo onClose={() => undefined} />);
    expect(screen.getByText('Partita non ancora giocata')).toBeTruthy();
  });
});

describe('W4 admin report workflow — local preview', () => {
  it('validates the event form and adds a goal locally without calling fetch', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onSaved = vi.fn();

    render(
      <AdminMatchReportPanel
        match={fixture}
        roster={roster}
        hasLocalEdits={false}
        onClose={() => undefined}
        onSaved={onSaved}
        onViewPublic={() => undefined}
        onResetFixture={() => undefined}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Aggiungi al referto/i }));
    expect(screen.getByText('Inserisci un minuto intero tra 1 e 130.')).toBeTruthy();
    expect(screen.getByText('Indica il giocatore protagonista dell’evento.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Minuto'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Marcatore'), { target: { value: 'Luca Sala' } });
    fireEvent.change(screen.getByLabelText('Assist (opzionale)'), { target: { value: 'Marco Villa' } });
    fireEvent.click(screen.getByRole('button', { name: /Aggiungi al referto/i }));

    expect(screen.getByText('Luca Sala')).toBeTruthy();
    expect(screen.getByText('Assist: Marco Villa')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('saves the report only through the provided local callback', () => {
    const onSaved = vi.fn();
    render(
      <AdminMatchReportPanel
        match={fixture}
        roster={roster}
        hasLocalEdits={false}
        onClose={() => undefined}
        onSaved={onSaved}
        onViewPublic={() => undefined}
        onResetFixture={() => undefined}
      />
    );

    fireEvent.change(screen.getByLabelText(`Punteggio ${fixture.homeTeamName}`), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /Salva bozza locale/i }));

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0]?.[0]?.homeScore).toBe(4);
    expect(screen.getByText(/Referto salvato solo in sessionStorage/)).toBeTruthy();
    expect(sessionStorage.getItem(MATCH_PREVIEW_STORAGE_KEY)).toBeNull();
  });
});
