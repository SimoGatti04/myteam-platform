import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Goal,
  Info,
  PlusCircle,
  RotateCcw,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { MatchDetail, MatchDetailEvent } from '../../types/domain';

export interface ReportRosterPlayer {
  id: string;
  displayName: string;
  jerseyNumber: number | null;
}

interface AdminMatchReportPanelProps {
  match: MatchDetail;
  roster: ReportRosterPlayer[];
  hasLocalEdits: boolean;
  onClose: () => void;
  onSaved: (match: MatchDetail) => void;
  onViewPublic: (matchId: string) => void;
  onResetFixture: () => void;
}

type EventType = MatchDetailEvent['type'];
type EventTeam = MatchDetailEvent['team'];
type EventPeriod = MatchDetailEvent['period'];

interface EventFormState {
  type: EventType;
  team: EventTeam;
  period: EventPeriod;
  minute: string;
  playerName: string;
  assistPlayerName: string;
}

interface FormErrors {
  score?: string;
  minute?: string;
  playerName?: string;
  assistPlayerName?: string;
}

const EMPTY_FORM: EventFormState = {
  type: 'goal',
  team: 'home',
  period: '1T',
  minute: '',
  playerName: '',
  assistPlayerName: '',
};

function cloneMatch(match: MatchDetail): MatchDetail {
  return {
    ...match,
    events: (match.events ?? []).map((event) => ({ ...event })),
  };
}

function sortEvents(events: MatchDetailEvent[]): MatchDetailEvent[] {
  const periodOrder = { '1T': 0, '2T': 1 };
  return [...events].sort((a, b) => periodOrder[a.period] - periodOrder[b.period] || a.minute - b.minute);
}

function eventLabel(type: EventType): string {
  return type === 'goal' ? 'Gol' : type === 'yellow_card' ? 'Ammonizione' : 'Espulsione';
}

function eventIcon(type: EventType) {
  if (type === 'goal') return <Goal size={16} />;
  return <Square size={14} fill="currentColor" />;
}

export const AdminMatchReportPanel: React.FC<AdminMatchReportPanelProps> = ({
  match,
  roster,
  hasLocalEdits,
  onClose,
  onSaved,
  onViewPublic,
  onResetFixture,
}) => {
  const [draft, setDraft] = useState<MatchDetail>(() => cloneMatch(match));
  const [homeScore, setHomeScore] = useState<string>(match.homeScore === null || match.homeScore === undefined ? '' : String(match.homeScore));
  const [awayScore, setAwayScore] = useState<string>(match.awayScore === null || match.awayScore === undefined ? '' : String(match.awayScore));
  const [form, setForm] = useState<EventFormState>(() => ({ ...EMPTY_FORM, team: match.isHome ? 'home' : 'away' }));
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDraft(cloneMatch(match));
    setHomeScore(match.homeScore === null || match.homeScore === undefined ? '' : String(match.homeScore));
    setAwayScore(match.awayScore === null || match.awayScore === undefined ? '' : String(match.awayScore));
    setForm({ ...EMPTY_FORM, team: match.isHome ? 'home' : 'away' });
    setEditingEventId(null);
    setErrors({});
    setFeedback(null);
  }, [match]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const ourSide: EventTeam = match.isHome ? 'home' : 'away';
  const events = sortEvents(draft.events ?? []);

  const updateForm = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'type' && value !== 'goal' ? { assistPlayerName: '' } : {}),
    }));
    setErrors((current) => ({ ...current, [key === 'playerName' ? 'playerName' : key === 'minute' ? 'minute' : 'assistPlayerName']: undefined }));
    setFeedback(null);
  };

  const validateEvent = (): boolean => {
    const next: FormErrors = {};
    const minute = Number(form.minute);
    if (!form.minute.trim() || !Number.isInteger(minute) || minute < 1 || minute > 130) {
      next.minute = 'Inserisci un minuto intero tra 1 e 130.';
    }
    if (!form.playerName.trim()) {
      next.playerName = 'Indica il giocatore protagonista dell’evento.';
    }
    if (form.type === 'goal' && form.assistPlayerName.trim() && form.assistPlayerName.trim().toLowerCase() === form.playerName.trim().toLowerCase()) {
      next.assistPlayerName = 'Il marcatore non può essere anche l’assistman.';
    }
    setErrors((current) => ({ ...current, ...next }));
    return Object.keys(next).length === 0;
  };

  const commitEvent = () => {
    if (!validateEvent()) return;
    const event: MatchDetailEvent = {
      id: editingEventId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      minute: Number(form.minute),
      period: form.period,
      type: form.type,
      playerName: form.playerName.trim(),
      team: form.team,
      ...(form.type === 'goal' && form.assistPlayerName.trim() ? { assistPlayerName: form.assistPlayerName.trim() } : {}),
    };

    setDraft((current) => {
      const currentEvents = current.events ?? [];
      const nextEvents = editingEventId
        ? currentEvents.map((item) => (item.id === editingEventId ? event : item))
        : [...currentEvents, event];
      return { ...current, events: sortEvents(nextEvents) };
    });
    setFeedback(editingEventId ? 'Evento aggiornato nel referto locale.' : 'Evento aggiunto al referto locale.');
    setForm({ ...EMPTY_FORM, team: ourSide });
    setEditingEventId(null);
    setErrors({});
  };

  const editEvent = (event: MatchDetailEvent) => {
    setEditingEventId(event.id);
    setForm({
      type: event.type,
      team: event.team,
      period: event.period,
      minute: String(event.minute),
      playerName: event.playerName,
      assistPlayerName: event.assistPlayerName ?? '',
    });
    setErrors({});
    setFeedback(null);
  };

  const cancelEdit = () => {
    setEditingEventId(null);
    setForm({ ...EMPTY_FORM, team: ourSide });
    setErrors({});
  };

  const removeEvent = (id: string) => {
    setDraft((current) => ({ ...current, events: (current.events ?? []).filter((event) => event.id !== id) }));
    if (editingEventId === id) cancelEdit();
    setFeedback('Evento rimosso dal referto locale.');
  };

  const validateScore = (): boolean => {
    const home = Number(homeScore);
    const away = Number(awayScore);
    if (homeScore.trim() === '' || awayScore.trim() === '' || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
      setErrors((current) => ({ ...current, score: 'Inserisci due punteggi interi tra 0 e 99.' }));
      return false;
    }
    setErrors((current) => ({ ...current, score: undefined }));
    return true;
  };

  const buildUpdatedMatch = (): MatchDetail | null => {
    if (!validateScore()) return null;
    const updated: MatchDetail = {
      ...draft,
      homeScore: Number(homeScore),
      awayScore: Number(awayScore),
      events: sortEvents(draft.events ?? []),
    };
    return updated;
  };

  const saveLocal = () => {
    const updated = buildUpdatedMatch();
    if (!updated) return;
    onSaved(updated);
    setFeedback('Referto salvato solo in sessionStorage. Nessun dato è stato inviato al backend.');
  };

  const saveAndPreview = () => {
    const updated = buildUpdatedMatch();
    if (!updated) return;
    onSaved(updated);
    onViewPublic(updated.id);
  };

  return (
    <div className="w4-admin-overlay">
      <section className="w4-admin-report" role="dialog" aria-modal="true" aria-labelledby="w4-admin-report-title">
        <header className="w4-admin-report__header">
          <div>
            <div className="w4-detail__badges">
              <span className="w4-badge w4-badge--competition">{draft.competitionName || 'Gara ufficiale'}</span>
              <span className="w4-badge w4-badge--demo">DEMO · REFERTO LOCALE</span>
              {hasLocalEdits && <span className="w4-badge w4-badge--local">MODIFICHE NON SALVATE</span>}
            </div>
            <h2 id="w4-admin-report-title">Referto partita</h2>
            <p>{draft.homeTeamName} vs {draft.awayTeamName} · {draft.round || 'Turno non specificato'}</p>
          </div>
          <button type="button" className="w4-icon-button" onClick={onClose} aria-label="Chiudi referto">
            <X size={20} />
          </button>
        </header>

        <div className="w4-admin-notice">
          <Info size={17} />
          <div>
            <strong>Anteprima operativa, non backend.</strong>
            <p>
              Questo pannello serve a validare il flusso di inserimento. Salva soltanto in <code>sessionStorage</code>:
              non esiste ancora il contratto Core C2 per risultati e tabellino. Non considerare questo test un E2E reale.
            </p>
          </div>
        </div>

        <div className="w4-admin-report__body">
          <section className="w4-report-card" aria-labelledby="w4-score-heading">
            <div className="w4-report-card__heading">
              <h3 id="w4-score-heading">Risultato finale</h3>
              <span className="w4-report-card__hint">Casa / trasferta come nella scheda pubblica</span>
            </div>
            <div className="w4-score-form">
              <label>
                <span>{draft.homeTeamName}</span>
                <input
                  className="w4-input"
                  type="number"
                  min={0}
                  max={99}
                  value={homeScore}
                  onChange={(event) => { setHomeScore(event.target.value); setFeedback(null); }}
                  aria-label={`Punteggio ${draft.homeTeamName}`}
                />
              </label>
              <span className="w4-score-form__dash">–</span>
              <label>
                <span>{draft.awayTeamName}</span>
                <input
                  className="w4-input"
                  type="number"
                  min={0}
                  max={99}
                  value={awayScore}
                  onChange={(event) => { setAwayScore(event.target.value); setFeedback(null); }}
                  aria-label={`Punteggio ${draft.awayTeamName}`}
                />
              </label>
            </div>
            {errors.score && <p className="w4-field-error" role="alert"><AlertCircle size={14} /> {errors.score}</p>}
          </section>

          <section className="w4-report-card" aria-labelledby="w4-events-heading">
            <div className="w4-report-card__heading">
              <h3 id="w4-events-heading">Gol, assist e cartellini <span className="w4-count">{events.length}</span></h3>
              <span className="w4-report-card__hint">Eventi ordinati per tempo e minuto</span>
            </div>

            {events.length === 0 ? (
              <div className="w4-admin-empty">
                <ClipboardList size={28} />
                <div>
                  <strong>Referto vuoto</strong>
                  <p>Aggiungi il primo evento con il modulo qui sotto. La scheda pubblica mostrerà lo stato “nessun evento”.</p>
                </div>
              </div>
            ) : (
              <ul className="w4-report-events">
                {events.map((event) => (
                  <li key={event.id} className={`w4-report-event w4-report-event--${event.type}`}>
                    <div className="w4-report-event__minute">{event.period} {event.minute}'</div>
                    <div className={`w4-report-event__icon ${event.type === 'goal' ? 'is-goal' : event.type === 'yellow_card' ? 'is-yellow' : 'is-red'}`}>
                      {eventIcon(event.type)}
                    </div>
                    <div className="w4-report-event__main">
                      <strong>{event.playerName}</strong>
                      <span>{eventLabel(event.type)} · {event.team === 'home' ? draft.homeTeamName : draft.awayTeamName}</span>
                      {event.assistPlayerName && <em>Assist: {event.assistPlayerName}</em>}
                    </div>
                    <div className="w4-report-event__actions">
                      <button type="button" className="w4-text-button" onClick={() => editEvent(event)}>Modifica</button>
                      <button type="button" className="w4-icon-button w4-icon-button--danger" onClick={() => removeEvent(event.id)} aria-label={`Rimuovi ${eventLabel(event.type)} di ${event.playerName}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="w4-event-form">
              <div className="w4-event-form__title">
                <strong>{editingEventId ? 'Modifica evento' : 'Aggiungi evento'}</strong>
                {editingEventId && <button type="button" className="w4-text-button" onClick={cancelEdit}>Annulla modifica</button>}
              </div>

              <div className="w4-segmented" role="group" aria-label="Tipo evento">
                {(['goal', 'yellow_card', 'red_card'] as EventType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`w4-segmented__button${form.type === type ? ' is-active' : ''}`}
                    onClick={() => updateForm('type', type)}
                    aria-pressed={form.type === type}
                  >
                    {eventIcon(type)} {eventLabel(type)}
                  </button>
                ))}
              </div>

              <div className="w4-form-grid">
                <label>
                  <span>Squadra</span>
                  <select className="w4-input" value={form.team} onChange={(event) => updateForm('team', event.target.value as EventTeam)}>
                    <option value="home">{draft.homeTeamName}</option>
                    <option value="away">{draft.awayTeamName}</option>
                  </select>
                </label>
                <label>
                  <span>Tempo</span>
                  <select className="w4-input" value={form.period} onChange={(event) => updateForm('period', event.target.value as EventPeriod)}>
                    <option value="1T">Primo tempo</option>
                    <option value="2T">Secondo tempo</option>
                  </select>
                </label>
                <label>
                  <span>Minuto</span>
                  <input
                    className="w4-input"
                    type="number"
                    min={1}
                    max={130}
                    value={form.minute}
                    onChange={(event) => updateForm('minute', event.target.value)}
                    aria-label="Minuto"
                    aria-invalid={Boolean(errors.minute)}
                  />
                  {errors.minute && <em className="w4-field-error">{errors.minute}</em>}
                </label>
                <label>
                  <span>{form.type === 'goal' ? 'Marcatore' : 'Giocatore'}</span>
                  <input
                    className="w4-input"
                    list="w4-report-roster"
                    value={form.playerName}
                    onChange={(event) => updateForm('playerName', event.target.value)}
                    placeholder={form.team === ourSide ? 'Cerca in rosa o digita' : 'Nome avversario'}
                    aria-label={form.type === 'goal' ? 'Marcatore' : 'Giocatore'}
                    aria-invalid={Boolean(errors.playerName)}
                  />
                  <datalist id="w4-report-roster">
                    {roster.map((player) => (
                      <option key={player.id} value={player.displayName}>
                        {player.jerseyNumber !== null ? `#${player.jerseyNumber}` : ''}
                      </option>
                    ))}
                  </datalist>
                  {errors.playerName && <em className="w4-field-error">{errors.playerName}</em>}
                </label>
                {form.type === 'goal' && (
                  <label className="w4-form-grid__wide">
                    <span>Assist (opzionale)</span>
                    <input
                      className="w4-input"
                      list="w4-report-roster"
                      value={form.assistPlayerName}
                      onChange={(event) => updateForm('assistPlayerName', event.target.value)}
                      placeholder="Nome assistman"
                      aria-label="Assist (opzionale)"
                      aria-invalid={Boolean(errors.assistPlayerName)}
                    />
                    {errors.assistPlayerName && <em className="w4-field-error">{errors.assistPlayerName}</em>}
                  </label>
                )}
              </div>

              <button type="button" className="w4-button w4-button--primary w4-button--block" onClick={commitEvent}>
                <PlusCircle size={16} /> {editingEventId ? 'Aggiorna evento' : 'Aggiungi al referto'}
              </button>
            </div>
          </section>
        </div>

        <footer className="w4-admin-report__footer">
          <div className="w4-feedback" role="status" aria-live="polite">
            {feedback && <><CheckCircle2 size={15} /> {feedback}</>}
          </div>
          <div className="w4-admin-report__actions">
            <button type="button" className="w4-button w4-button--danger-ghost" onClick={onResetFixture}>
              <RotateCcw size={15} /> Ripristina fixture
            </button>
            <button type="button" className="w4-button" onClick={onClose}>Annulla</button>
            <button type="button" className="w4-button w4-button--outline" onClick={saveLocal}>
              <Save size={15} /> Salva bozza locale
            </button>
            <button type="button" className="w4-button w4-button--primary" onClick={saveAndPreview}>
              <CheckCircle2 size={15} /> Applica e vedi anteprima
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
