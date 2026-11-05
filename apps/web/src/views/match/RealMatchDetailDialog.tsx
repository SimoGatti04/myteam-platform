import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Goal,
  Info,
  RefreshCw,
  Shield,
  Square,
  Trophy,
  X,
} from 'lucide-react';
import type { PublicMatchDto, PublicMatchScoreboardDto, MatchEventDto } from '@myteam/contracts';
import { apiService } from '../../services/api';

interface RealMatchDetailDialogProps {
  matchId: string;
  onClose: () => void;
}

/**
 * Il contratto C2 non espone ancora la sede: il lato squadra e' sempre "MAPI"
 * contro l'avversario, senza inferire casa/trasferta.
 */
const TEAM_LABEL = 'MAPI';

type ViewState =
  | { status: 'loading' }
  | { status: 'not_found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; meta: PublicMatchDto; scoreboard: PublicMatchScoreboardDto };

const EVENT_LABELS: Record<MatchEventDto['kind'], string> = {
  goal: 'Gol',
  yellow_card: 'Ammonizione',
  red_card: 'Espulsione',
};

function periodLabel(period: 1 | 2): string {
  return period === 1 ? '1° tempo' : '2° tempo';
}

function groupByPeriod(events: MatchEventDto[]) {
  return ([1, 2] as const)
    .map((period) => ({
      period,
      label: periodLabel(period),
      items: events
        .filter((event) => event.period === period)
        .sort((a, b) => a.minute - b.minute),
    }))
    .filter((group) => group.items.length > 0);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Data da definire';
  try {
    return new Date(iso).toLocaleString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function eventIcon(kind: MatchEventDto['kind']) {
  if (kind === 'goal') return <Goal size={17} aria-hidden="true" />;
  return <Square size={15} fill="currentColor" aria-hidden="true" />;
}

function eventClass(kind: MatchEventDto['kind']): string {
  return kind === 'goal' ? 'is-goal' : kind === 'yellow_card' ? 'is-yellow' : 'is-red';
}

export const RealMatchDetailDialog: React.FC<RealMatchDetailDialogProps> = ({ matchId, onClose }) => {
  const [state, setState] = useState<ViewState>({ status: 'loading' });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const load = React.useCallback(async () => {
    setState({ status: 'loading' });
    const metaResult = await apiService.getPublicMatch(matchId);
    if (!metaResult.success) {
      if (metaResult.status === 404) {
        setState({ status: 'not_found' });
        return;
      }
      setState({ status: 'error', message: metaResult.message });
      return;
    }

    const scoreboardResult = await apiService.getPublicMatchScoreboard(matchId);
    if (!scoreboardResult.success) {
      if (scoreboardResult.status === 404) {
        setState({ status: 'not_found' });
        return;
      }
      setState({ status: 'error', message: scoreboardResult.message });
      return;
    }

    setState({ status: 'ready', meta: metaResult.data, scoreboard: scoreboardResult.data });
  }, [matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const opponentName = state.status === 'ready' ? state.meta.opponentName : null;
  const groups = state.status === 'ready' ? groupByPeriod(state.scoreboard.events) : [];
  const eventCount = state.status === 'ready' ? state.scoreboard.events.length : 0;

  return (
    <div
      className="w4-detail-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="w4-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="w5-real-match-title"
        data-data-source="server"
        data-preview-state={state.status}
      >
        <header className="w4-detail__header">
          <div className="w4-detail__badges">
            <span className="w4-badge w4-badge--competition">
              {state.status === 'ready'
                ? state.meta.competitionName || (state.meta.isOfficial ? 'Gara ufficiale' : 'Amichevole')
                : 'Risultato gara'}
            </span>
            <span className="w4-badge w4-badge--server">DATI DAL SERVER</span>
          </div>
          <button type="button" className="w4-icon-button" onClick={onClose} aria-label="Chiudi dettaglio partita">
            <X size={20} />
          </button>
        </header>

        {state.status === 'loading' && (
          <div className="w4-skeleton" aria-label="Caricamento risultato partita">
            <div className="w4-skeleton__score">
              <span className="w4-skeleton__block w4-skeleton__block--crest" />
              <span className="w4-skeleton__block w4-skeleton__block--score" />
              <span className="w4-skeleton__block w4-skeleton__block--crest" />
            </div>
            <span className="w4-skeleton__block w4-skeleton__block--line" />
            <span className="w4-skeleton__block w4-skeleton__block--line w4-skeleton__block--short" />
          </div>
        )}

        {state.status === 'not_found' && (
          <div className="w4-state">
            <div className="w4-state__icon"><Clock size={30} /></div>
            <h2 id="w5-real-match-title">Risultato non pubblicato</h2>
            <p>
              Questa partita non ha ancora un risultato pubblicato oppure non esiste. Il risultato compare
              qui solo dopo che la gara è completata e pubblicata dal backend.
            </p>
            <div className="w4-state__actions">
              <button type="button" className="w4-button w4-button--primary" onClick={() => void load()}>
                <RefreshCw size={15} /> Ricontrolla
              </button>
              <button type="button" className="w4-button" onClick={onClose}>Chiudi</button>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="w4-state w4-state--error" role="alert">
            <div className="w4-state__icon"><AlertCircle size={30} /></div>
            <h2 id="w5-real-match-title">Risultato non disponibile</h2>
            <p>{state.message}</p>
            <div className="w4-state__actions">
              <button type="button" className="w4-button w4-button--primary" onClick={() => void load()}>
                <RefreshCw size={15} /> Riprova
              </button>
              <button type="button" className="w4-button" onClick={onClose}>Chiudi</button>
            </div>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="w4-detail__body">
            <div className="w4-scoreboard">
              <div className="w4-team w4-team--home">
                <div className="w4-team__crest" aria-hidden="true">MAPI</div>
                <div className="w4-team__name">{TEAM_LABEL}</div>
              </div>

              <div className="w4-scoreboard__center">
                <div className="w4-scoreboard__score">
                  {state.scoreboard.teamScore} - {state.scoreboard.opponentScore}
                </div>
                <div className="w4-scoreboard__status">
                  <CheckCircle2 size={13} /> Terminata
                </div>
              </div>

              <div className="w4-team w4-team--away">
                <div className="w4-team__crest" aria-hidden="true">AVV</div>
                <div className="w4-team__name">{opponentName}</div>
              </div>
            </div>

            <div className="w4-meta">
              <span><Calendar size={14} /> {formatDateTime(state.meta.scheduledAt)}</span>
              {state.meta.competitionName && <span><Trophy size={14} /> {state.meta.competitionName}</span>}
            </div>

            <div className="w4-summary" aria-label="Riepilogo eventi">
              <span className="w4-summary__item">
                <Goal size={15} /> {state.scoreboard.events.filter((event) => event.kind === 'goal').length} gol
              </span>
              <span className="w4-summary__item w4-summary__item--yellow">
                <Square size={12} fill="currentColor" /> {state.scoreboard.events.filter((event) => event.kind === 'yellow_card').length} ammonizioni
              </span>
              <span className="w4-summary__item w4-summary__item--red">
                <Square size={12} fill="currentColor" /> {state.scoreboard.events.filter((event) => event.kind === 'red_card').length} espulsioni
              </span>
            </div>

            <div className="w4-timeline">
              <div className="w4-timeline__heading">
                <div>
                  <h2 id="w5-real-match-title">Cronologia del referto</h2>
                  <p>Eventi registrati dal backend, raggruppati per tempo.</p>
                </div>
              </div>

              {eventCount === 0 ? (
                <div className="w4-empty">
                  <div className="w4-empty__icon"><ClipboardList size={28} /></div>
                  <h3>Nessun evento registrato</h3>
                  <p>Il risultato è pubblicato, ma non sono stati ancora registrati gol o cartellini.</p>
                </div>
              ) : (
                <div className="w4-periods">
                  {groups.map((group) => (
                    <div className="w4-period" key={group.period}>
                      <div className="w4-period__label"><span>{group.period}</span> {group.label}</div>
                      {group.items.map((event) => {
                        const isTeam = event.side === 'team';
                        // Classi solo posizionali (sinistra/destra): il contratto usa side team/opponent.
                        const layoutSide = isTeam ? 'home' : 'away';
                        const sideName = isTeam ? TEAM_LABEL : opponentName;
                        return (
                          <div className={`w4-event w4-event--${layoutSide}`} key={event.id}>
                            <div className="w4-event__body">
                              <div className={`w4-event__icon ${eventClass(event.kind)}`}>
                                {eventIcon(event.kind)}
                              </div>
                              <div className="w4-event__content">
                                <div className="w4-event__headline">
                                  <span>{EVENT_LABELS[event.kind]}</span>
                                  <span className="w4-event__team">{sideName}</span>
                                </div>
                                <div className="w4-event__player">
                                  {event.player?.displayName ?? sideName}
                                </div>
                                {event.kind === 'goal' && event.assist && (
                                  <div className="w4-event__assist">
                                    <Shield size={12} /> Assist: {event.assist.displayName}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="w4-event__minute">{event.minute}&apos;</div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <footer className="w4-detail__footer">
          <p className="w4-fidelity-note">
            <Info size={14} />
            Dati letti da <code>/api/v1/public/matches/:id/scoreboard</code>. Nessun dato demo viene mostrato
            in modalità reale.
          </p>
        </footer>
      </section>
    </div>
  );
};
