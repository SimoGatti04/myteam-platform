import React, { useEffect } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Goal,
  Info,
  MapPin,
  RefreshCw,
  Shield,
  Square,
  Trophy,
  User,
  X,
} from 'lucide-react';
import type { MatchDetail, MatchDetailEvent } from '../../types/domain';
import type { W4PreviewState } from '../../utils/preview';

interface MatchDetailDialogProps {
  match: MatchDetail | null;
  loading?: boolean;
  error?: string | null;
  previewState?: W4PreviewState;
  isDemo: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onOpenAdminReport?: (match: MatchDetail) => void;
  onPreviewStateChange?: (state: W4PreviewState) => void;
}

const PREVIEW_STATE_LABELS: Record<W4PreviewState, string> = {
  ready: 'Completa',
  loading: 'Caricamento',
  empty: 'Vuoto',
  error: 'Errore',
};

const EVENT_LABELS: Record<MatchDetailEvent['type'], string> = {
  goal: 'Gol',
  yellow_card: 'Ammonizione',
  red_card: 'Espulsione',
};

function formatMatchDateTime(isoString: string | null): string {
  if (!isoString) return 'Data da definire';
  try {
    return new Date(isoString).toLocaleString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function EventSwatch({ type }: { type: MatchDetailEvent['type'] }) {
  if (type === 'goal') return <Goal size={17} aria-hidden="true" />;
  return <Square size={15} fill="currentColor" aria-hidden="true" />;
}

function eventTypeClass(type: MatchDetailEvent['type']): string {
  return type === 'goal' ? 'is-goal' : type === 'yellow_card' ? 'is-yellow' : 'is-red';
}

function groupEvents(events: MatchDetailEvent[]): Array<{ period: '1T' | '2T'; label: string; items: MatchDetailEvent[] }> {
  return (['1T', '2T'] as const)
    .map((period) => ({
      period,
      label: period === '1T' ? 'Primo tempo' : 'Secondo tempo',
      items: events
        .filter((event) => event.period === period)
        .sort((a, b) => a.minute - b.minute),
    }))
    .filter((group) => group.items.length > 0);
}

function SkeletonContent() {
  return (
    <div className="w4-skeleton" aria-label="Caricamento dettaglio partita">
      <div className="w4-skeleton__score">
        <span className="w4-skeleton__block w4-skeleton__block--crest" />
        <span className="w4-skeleton__block w4-skeleton__block--score" />
        <span className="w4-skeleton__block w4-skeleton__block--crest" />
      </div>
      <span className="w4-skeleton__block w4-skeleton__block--line" />
      <span className="w4-skeleton__block w4-skeleton__block--line w4-skeleton__block--short" />
      <div className="w4-skeleton__timeline">
        <span className="w4-skeleton__block w4-skeleton__block--event" />
        <span className="w4-skeleton__block w4-skeleton__block--event" />
        <span className="w4-skeleton__block w4-skeleton__block--event w4-skeleton__block--short" />
      </div>
    </div>
  );
}

export const MatchDetailDialog: React.FC<MatchDetailDialogProps> = ({
  match,
  loading = false,
  error = null,
  previewState = 'ready',
  isDemo,
  onClose,
  onRetry,
  onOpenAdminReport,
  onPreviewStateChange,
}) => {
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

  const isLoading = loading || previewState === 'loading';
  const hasError = Boolean(error) || previewState === 'error';
  const forceEmpty = previewState === 'empty';
  const events = match?.events ?? [];
  const visibleEvents = forceEmpty ? [] : events;
  const groups = groupEvents(visibleEvents);
  const isCompleted = match?.status === 'completed';
  const scoreAvailable = match && match.homeScore !== null && match.homeScore !== undefined
    && match.awayScore !== null && match.awayScore !== undefined;
  const goalCount = visibleEvents.filter((event) => event.type === 'goal').length;
  const yellowCount = visibleEvents.filter((event) => event.type === 'yellow_card').length;
  const redCount = visibleEvents.filter((event) => event.type === 'red_card').length;

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
        aria-labelledby="w4-match-detail-title"
        data-preview-state={previewState}
      >
        <header className="w4-detail__header">
          <div className="w4-detail__badges">
            <span className="w4-badge w4-badge--competition">
              {match?.competitionName || (match?.isOfficial ? 'Gara ufficiale' : 'Amichevole')}
            </span>
            {isDemo && <span className="w4-badge w4-badge--demo">DEMO · FIXTURE</span>}
            {isDemo && <span className="w4-badge w4-badge--local">ANTEPRIMA LOCALE</span>}
          </div>
          <button type="button" className="w4-icon-button" onClick={onClose} aria-label="Chiudi dettaglio partita">
            <X size={20} />
          </button>
        </header>

        {isLoading ? (
          <SkeletonContent />
        ) : hasError ? (
          <div className="w4-state w4-state--error" role="alert">
            <div className="w4-state__icon"><AlertCircle size={30} /></div>
            <h2 id="w4-match-detail-title">Dettaglio partita non disponibile</h2>
            <p>{error || 'La richiesta del tabellino non è andata a buon fine. Nessun dato sostitutivo è stato inventato.'}</p>
            <div className="w4-state__actions">
              {onRetry && (
                <button type="button" className="w4-button w4-button--primary" onClick={onRetry}>
                  <RefreshCw size={15} /> Riprova
                </button>
              )}
              <button type="button" className="w4-button" onClick={onClose}>Chiudi</button>
            </div>
            {isDemo && (
              <p className="w4-state__hint">
                Stato forzato per la revisione visiva. In uso reale questo pannello appare solo dopo un errore API verificato.
              </p>
            )}
          </div>
        ) : !match ? (
          <div className="w4-state">
            <div className="w4-state__icon"><Info size={30} /></div>
            <h2 id="w4-match-detail-title">Nessuna partita selezionata</h2>
            <p>Seleziona una gara dal calendario per aprire il dettaglio.</p>
          </div>
        ) : (
          <div className="w4-detail__body">
            <div className="w4-scoreboard">
              <div className="w4-team w4-team--home">
                <div className="w4-team__crest" aria-hidden="true">{initials(match.homeTeamName)}</div>
                <div className="w4-team__name">{match.homeTeamName}</div>
                {match.homeStandingPosition !== null && match.homeStandingPosition !== undefined && (
                  <div className="w4-team__standing">{match.homeStandingPosition}° in classifica</div>
                )}
              </div>

              <div className="w4-scoreboard__center">
                <div className="w4-scoreboard__score">
                  {scoreAvailable ? `${match.homeScore} - ${match.awayScore}` : 'VS'}
                </div>
                <div className="w4-scoreboard__status">
                  {isCompleted ? <><CheckCircle2 size={13} /> Terminata</> : match.status === 'to_be_scheduled' ? 'Data da definire' : 'In programma'}
                </div>
              </div>

              <div className="w4-team w4-team--away">
                <div className="w4-team__crest" aria-hidden="true">{initials(match.awayTeamName)}</div>
                <div className="w4-team__name">{match.awayTeamName}</div>
                {match.awayStandingPosition !== null && match.awayStandingPosition !== undefined && (
                  <div className="w4-team__standing">{match.awayStandingPosition}° in classifica</div>
                )}
              </div>
            </div>

            <div className="w4-meta">
              <span><Calendar size={14} /> {formatMatchDateTime(match.scheduledAt)}</span>
              {match.round && <span><Trophy size={14} /> {match.round}</span>}
              {match.field && <span><MapPin size={14} /> {match.field}</span>}
            </div>

            <div className="w4-summary" aria-label="Riepilogo eventi">
              <span className="w4-summary__item"><Goal size={15} /> {goalCount} gol</span>
              <span className="w4-summary__item w4-summary__item--yellow"><Square size={12} fill="currentColor" /> {yellowCount} ammonizioni</span>
              <span className="w4-summary__item w4-summary__item--red"><Square size={12} fill="currentColor" /> {redCount} espulsioni</span>
              {match.potmPlayerName && (
                <span className="w4-summary__item w4-summary__item--potm"><User size={14} /> MVP: {match.potmPlayerName}</span>
              )}
            </div>

            <div className="w4-timeline">
              <div className="w4-timeline__heading">
                <div>
                  <h2 id="w4-match-detail-title">Cronologia del referto</h2>
                  <p>Gol, assist e cartellini come appariranno nella scheda pubblica.</p>
                </div>
                {isDemo && onOpenAdminReport && (
                  <button type="button" className="w4-button w4-button--ghost" onClick={() => onOpenAdminReport(match)}>
                    <ClipboardList size={15} /> Correggi referto
                  </button>
                )}
              </div>

              {groups.length === 0 ? (
                <div className="w4-empty">
                  <div className="w4-empty__icon">
                    {isCompleted ? <ClipboardList size={28} /> : <Clock size={28} />}
                  </div>
                  <h3>{isCompleted ? 'Nessun evento registrato' : 'Partita non ancora giocata'}</h3>
                  <p>
                    {isCompleted
                      ? 'Il referto è vuoto: non ci sono gol, assist o cartellini da mostrare. In anteprima puoi aggiungerli dal referto admin.'
                      : 'Il tabellino sarà disponibile dopo il fischio finale. Non vengono mostrati punteggi o eventi inventati.'}
                  </p>
                  {isCompleted && isDemo && onOpenAdminReport && (
                    <button type="button" className="w4-button w4-button--primary" onClick={() => onOpenAdminReport(match)}>
                      <ClipboardList size={15} /> Apri referto admin
                    </button>
                  )}
                </div>
              ) : (
                <div className="w4-periods">
                  {groups.map((group) => (
                    <div className="w4-period" key={group.period}>
                      <div className="w4-period__label"><span>{group.period}</span> {group.label}</div>
                      {group.items.map((event) => {
                        const teamName = event.team === 'home' ? match.homeTeamName : match.awayTeamName;
                        const side = event.team;
                        return (
                          <div className={`w4-event w4-event--${side}`} key={event.id}>
                            <div className="w4-event__body">
                              <div className={`w4-event__icon ${eventTypeClass(event.type)}`}>
                                <EventSwatch type={event.type} />
                              </div>
                              <div className="w4-event__content">
                                <div className="w4-event__headline">
                                  <span>{EVENT_LABELS[event.type]}</span>
                                  <span className="w4-event__team">{teamName}</span>
                                </div>
                                <div className="w4-event__player">{event.playerName}</div>
                                {event.type === 'goal' && event.assistPlayerName && (
                                  <div className="w4-event__assist">
                                    <Shield size={12} /> Assist: {event.assistPlayerName}
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
            {isDemo
              ? 'Dati demo espliciti. Nessuna chiamata backend: il salvataggio del referto resta in sessionStorage di questa scheda.'
              : 'Dettaglio dal backend Core quando il contratto tabellino C2 sarà disponibile.'}
          </p>
          {isDemo && onPreviewStateChange && (
            <div className="w4-state-switcher" role="group" aria-label="Stati anteprima del dettaglio">
              <span>Stati anteprima</span>
              {(Object.keys(PREVIEW_STATE_LABELS) as W4PreviewState[]).map((state) => (
                <button
                  key={state}
                  type="button"
                  className={`w4-state-switcher__button${previewState === state ? ' is-active' : ''}`}
                  onClick={() => onPreviewStateChange(state)}
                  aria-pressed={previewState === state}
                >
                  {PREVIEW_STATE_LABELS[state]}
                </button>
              ))}
            </div>
          )}
        </footer>
      </section>
    </div>
  );
};
