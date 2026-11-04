import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Goal,
  Info,
  Lock,
  PlusCircle,
  RefreshCw,
  Save,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AdminMatchEventsDto,
  MatchEventCreateRequest,
  MatchEventDto,
  MatchResultDto,
  PlayerDto,
  RosterMembershipDto,
} from '@myteam/contracts';
import { apiService } from '../../services/api';

export interface RealMatchReportPanelProps {
  matchId: string;
  opponentName: string;
  seasonId: string | null;
  onClose: () => void;
  onViewPublic: (matchId: string) => void;
}

type EventKind = MatchEventCreateRequest['kind'];
type EventSide = MatchEventCreateRequest['side'];
type EventPeriod = MatchEventCreateRequest['period'];

interface DraftEvent {
  clientEventId: string;
  kind: EventKind;
  side: EventSide;
  period: EventPeriod;
  minute: number;
  playerId: string | null;
  assistPlayerId: string | null;
  playerLabel: string;
  assistLabel: string | null;
  status: 'pending' | 'sending' | 'error';
  error?: string;
}

interface EventFormState {
  kind: EventKind;
  side: EventSide;
  period: EventPeriod;
  minute: string;
  playerId: string;
  assistPlayerId: string;
}

interface FormErrors {
  score?: string;
  minute?: string;
  player?: string;
  assist?: string;
}

const EMPTY_FORM: EventFormState = {
  kind: 'goal',
  side: 'team',
  period: 1,
  minute: '',
  playerId: '',
  assistPlayerId: '',
};

const KIND_LABELS: Record<EventKind, string> = {
  goal: 'Gol',
  yellow_card: 'Ammonizione',
  red_card: 'Espulsione',
};

function newClientEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function kindIcon(kind: EventKind) {
  return kind === 'goal' ? <Goal size={16} /> : <Square size={14} fill="currentColor" />;
}

function kindClass(kind: EventKind): string {
  return kind === 'goal' ? 'is-goal' : kind === 'yellow_card' ? 'is-yellow' : 'is-red';
}

export const RealMatchReportPanel: React.FC<RealMatchReportPanelProps> = ({
  matchId,
  opponentName,
  seasonId,
  onClose,
  onViewPublic,
}) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResultDto | null>(null);
  const [resultMissing, setResultMissing] = useState(false);
  const [savedEvents, setSavedEvents] = useState<MatchEventDto[]>([]);
  const [players, setPlayers] = useState<PlayerDto[]>([]);
  const [memberships, setMemberships] = useState<RosterMembershipDto[]>([]);

  const [teamScore, setTeamScore] = useState('');
  const [opponentScore, setOpponentScore] = useState('');
  const [savingResult, setSavingResult] = useState(false);
  const [resultFeedback, setResultFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const [drafts, setDrafts] = useState<DraftEvent[]>([]);
  const [form, setForm] = useState<EventFormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sendingDrafts, setSendingDrafts] = useState(false);
  const [eventsFeedback, setEventsFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const refreshResult = useCallback(async () => {
    const res = await apiService.getAdminMatchResult(matchId);
    if (res.success) {
      setResult(res.data);
      setResultMissing(false);
      setTeamScore(String(res.data.teamScore));
      setOpponentScore(String(res.data.opponentScore));
      return;
    }
    if (res.status === 404 && res.errorCode === 'match_result_not_found') {
      setResult(null);
      setResultMissing(true);
      return;
    }
    setResultFeedback({ type: 'error', text: res.message });
  }, [matchId]);

  const refreshEvents = useCallback(async () => {
    const res = await apiService.getAdminMatchEvents(matchId);
    if (res.success) {
      setSavedEvents(res.data);
      return;
    }
    setEventsFeedback({ type: 'error', text: res.message });
  }, [matchId]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const playersRes = await apiService.getAdminPlayers();
    if (!playersRes.success) {
      setLoadError(playersRes.message);
      setLoading(false);
      return;
    }
    setPlayers(playersRes.data);

    const membershipsRes = await apiService.getAdminRosterMemberships(
      seasonId ? { seasonId } : undefined
    );
    if (membershipsRes.success) {
      setMemberships(membershipsRes.data);
    }

    await Promise.all([refreshResult(), refreshEvents()]);
    setLoading(false);
  }, [seasonId, refreshResult, refreshEvents]);

  useEffect(() => {
    void load();
  }, [load]);

  const playerById = useMemo(() => {
    const map = new Map<string, { displayName: string; jerseyNumber: number | null }>();
    for (const player of players) {
      map.set(player.id, { displayName: player.displayName, jerseyNumber: null });
    }
    for (const membership of memberships) {
      const existing = map.get(membership.playerId);
      if (existing) {
        map.set(membership.playerId, {
          displayName: existing.displayName,
          jerseyNumber: membership.jerseyNumber,
        });
      }
    }
    return map;
  }, [players, memberships]);

  const rosterOptions = useMemo(
    () =>
      [...playerById.entries()]
        .map(([id, info]) => ({ id, ...info }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [playerById]
  );

  const updateForm = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'side' && value === 'opponent'
        ? { playerId: '', assistPlayerId: '' }
        : {}),
      ...(key === 'kind' && value !== 'goal' ? { assistPlayerId: '' } : {}),
    }));
    setErrors({});
  };

  const validateScore = (): boolean => {
    const teamValue = Number(teamScore);
    const opponentValue = Number(opponentScore);
    if (
      teamScore.trim() === '' ||
      opponentScore.trim() === '' ||
      !Number.isInteger(teamValue) ||
      !Number.isInteger(opponentValue) ||
      teamValue < 0 ||
      opponentValue < 0 ||
      teamValue > 99 ||
      opponentValue > 99
    ) {
      setErrors((current) => ({ ...current, score: 'Inserisci due punteggi interi tra 0 e 99.' }));
      return false;
    }
    setErrors((current) => ({ ...current, score: undefined }));
    return true;
  };

  const saveResult = async () => {
    if (!validateScore()) return;
    setSavingResult(true);
    setResultFeedback(null);
    const res = await apiService.upsertMatchResult(matchId, {
      teamScore: Number(teamScore),
      opponentScore: Number(opponentScore),
    });
    if (res.success) {
      setResult(res.data);
      setResultMissing(false);
      setResultFeedback({
        type: 'ok',
        text: `Risultato salvato dal server (aggiornato ${new Date(res.data.updatedAt).toLocaleString('it-IT')}).`,
      });
      await refreshResult();
    } else {
      setResultFeedback({ type: 'error', text: res.message });
    }
    setSavingResult(false);
  };

  const validateDraft = (): boolean => {
    const next: FormErrors = {};
    const minute = Number(form.minute);
    if (!form.minute.trim() || !Number.isInteger(minute) || minute < 1 || minute > 120) {
      next.minute = 'Minuto intero tra 1 e 120, relativo al tempo selezionato.';
    }
    if (form.side === 'team' && !form.playerId) {
      next.player = 'Seleziona il giocatore della rosa: l’identità deve essere un UUID salvato.';
    }
    if (form.kind === 'goal' && form.side === 'team' && form.assistPlayerId && form.assistPlayerId === form.playerId) {
      next.assist = 'Il marcatore non può essere anche l’assistman.';
    }
    if (form.assistPlayerId && (form.kind !== 'goal' || form.side !== 'team')) {
      next.assist = 'L’assist è ammesso solo per un gol della squadra.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const addDraft = () => {
    if (!validateDraft()) return;
    const playerId = form.side === 'team' ? form.playerId : null;
    const assistPlayerId =
      form.kind === 'goal' && form.side === 'team' && form.assistPlayerId ? form.assistPlayerId : null;
    const draft: DraftEvent = {
      clientEventId: newClientEventId(),
      kind: form.kind,
      side: form.side,
      period: form.period,
      minute: Number(form.minute),
      playerId,
      assistPlayerId,
      playerLabel: playerId ? playerById.get(playerId)?.displayName ?? 'Giocatore' : opponentName,
      assistLabel: assistPlayerId ? playerById.get(assistPlayerId)?.displayName ?? null : null,
      status: 'pending',
    };
    setDrafts((current) => [...current, draft]);
    setForm({ ...EMPTY_FORM, side: form.side });
    setErrors({});
    setEventsFeedback({ type: 'ok', text: 'Evento in bozza locale: non ancora inviato al server.' });
  };

  const removeDraft = (clientEventId: string) => {
    setDrafts((current) => current.filter((draft) => draft.clientEventId !== clientEventId));
  };

  const sendDrafts = async () => {
    const pending = drafts.filter((draft) => draft.status !== 'sending');
    if (pending.length === 0 || sendingDrafts) return;

    setSendingDrafts(true);
    setEventsFeedback(null);
    let sent = 0;
    let failed = 0;

    for (const draft of pending) {
      setDrafts((current) =>
        current.map((item) =>
          item.clientEventId === draft.clientEventId ? { ...item, status: 'sending', error: undefined } : item
        )
      );
      const payload: MatchEventCreateRequest = {
        kind: draft.kind,
        side: draft.side,
        period: draft.period,
        minute: draft.minute,
        playerId: draft.playerId,
        assistPlayerId: draft.assistPlayerId,
        clientEventId: draft.clientEventId,
      };
      const res = await apiService.createMatchEvent(matchId, payload);
      if (res.success) {
        sent += 1;
        setDrafts((current) => current.filter((item) => item.clientEventId !== draft.clientEventId));
      } else {
        failed += 1;
        setDrafts((current) =>
          current.map((item) =>
            item.clientEventId === draft.clientEventId
              ? { ...item, status: 'error', error: res.message }
              : item
          )
        );
      }
    }

    // Explicit server refetch: local state must not be treated as persisted truth.
    await refreshEvents();
    await refreshResult();

    if (failed === 0) {
      setEventsFeedback({ type: 'ok', text: `${sent} eventi inviati e confermati dal server.` });
    } else {
      setEventsFeedback({
        type: 'error',
        text: `${sent} inviati, ${failed} falliti. Gli eventi falliti restano in bozza con lo stesso clientEventId: puoi ritentare senza duplicati.`,
      });
    }
    setSendingDrafts(false);
  };

  const retryDraft = async (clientEventId: string) => {
    setDrafts((current) =>
      current.map((item) =>
        item.clientEventId === clientEventId ? { ...item, status: 'pending', error: undefined } : item
      )
    );
    setEventsFeedback(null);
  };

  const sortedSaved = useMemo(
    () =>
      [...savedEvents].sort(
        (a, b) => a.period - b.period || a.minute - b.minute || a.id.localeCompare(b.id)
      ),
    [savedEvents]
  );

  return (
    <div className="w4-admin-overlay">
      <section className="w4-admin-report" role="dialog" aria-modal="true" aria-labelledby="w5-real-report-title">
        <header className="w4-admin-report__header">
          <div>
            <div className="w4-detail__badges">
              <span className="w4-badge w4-badge--server">DATI DAL SERVER</span>
              {drafts.length > 0 && <span className="w4-badge w4-badge--local">{drafts.length} IN BOZZA</span>}
            </div>
            <h2 id="w5-real-report-title">Referto partita</h2>
            <p>MAPI · {opponentName}</p>
          </div>
          <button type="button" className="w4-icon-button" onClick={onClose} aria-label="Chiudi referto">
            <X size={20} />
          </button>
        </header>

        <div className="w4-admin-notice">
          <Info size={17} />
          <div>
            <strong>Risultato ed eventi sono due transazioni separate.</strong>
            <p>
              Il salvataggio del punteggio non invia eventi e viceversa. Dopo ogni invio lo stato viene riletto
              dal server. Core C2 non espone modifica o cancellazione degli eventi già salvati.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="w4-skeleton" aria-label="Caricamento referto">
            <span className="w4-skeleton__block w4-skeleton__block--line" />
            <span className="w4-skeleton__block w4-skeleton__block--line w4-skeleton__block--short" />
            <span className="w4-skeleton__block w4-skeleton__block--event" />
          </div>
        ) : loadError ? (
          <div className="w4-state w4-state--error" role="alert">
            <div className="w4-state__icon"><AlertCircle size={30} /></div>
            <h3>Impossibile caricare il referto</h3>
            <p>{loadError}</p>
            <div className="w4-state__actions">
              <button type="button" className="w4-button w4-button--primary" onClick={() => void load()}>
                <RefreshCw size={15} /> Riprova
              </button>
            </div>
          </div>
        ) : (
          <div className="w4-admin-report__body">
            <section className="w4-report-card" aria-labelledby="w5-result-heading">
              <div className="w4-report-card__heading">
                <h3 id="w5-result-heading">Risultato finale</h3>
                <span className="w4-report-card__hint">
                  {result ? `Salvato ${new Date(result.updatedAt).toLocaleString('it-IT')}` : 'Nessun risultato'}
                </span>
              </div>
              <div className="w4-score-form">
                <label>
                  <span>MAPI</span>
                  <input
                    className="w4-input"
                    type="number"
                    min={0}
                    max={99}
                    value={teamScore}
                    onChange={(event) => { setTeamScore(event.target.value); setResultFeedback(null); }}
                    aria-label="Punteggio MAPI"
                  />
                </label>
                <span className="w4-score-form__dash">–</span>
                <label>
                  <span>{opponentName}</span>
                  <input
                    className="w4-input"
                    type="number"
                    min={0}
                    max={99}
                    value={opponentScore}
                    onChange={(event) => { setOpponentScore(event.target.value); setResultFeedback(null); }}
                    aria-label={`Punteggio ${opponentName}`}
                  />
                </label>
              </div>
              {errors.score && <p className="w4-field-error" role="alert"><AlertCircle size={14} /> {errors.score}</p>}
              {resultFeedback && (
                <p className={resultFeedback.type === 'ok' ? 'w4-inline-ok' : 'w4-field-error'} role="status">
                  {resultFeedback.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {resultFeedback.text}
                </p>
              )}
              <button
                type="button"
                className="w4-button w4-button--primary w4-button--block"
                onClick={() => void saveResult()}
                disabled={savingResult}
              >
                <Save size={16} /> {savingResult ? 'Salvataggio…' : 'Salva risultato'}
              </button>
            </section>

            <section className="w4-report-card" aria-labelledby="w5-events-heading">
              <div className="w4-report-card__heading">
                <h3 id="w5-events-heading">
                  Eventi salvati <span className="w4-count">{sortedSaved.length}</span>
                </h3>
                <span className="w4-report-card__hint">Sola lettura: nessuna correzione disponibile</span>
              </div>

              {sortedSaved.length === 0 ? (
                <div className="w4-admin-empty">
                  <ClipboardList size={28} />
                  <div>
                    <strong>Nessun evento salvato</strong>
                    <p>Gli eventi compaiono qui solo dopo una POST confermata dal server.</p>
                  </div>
                </div>
              ) : (
                <ul className="w4-report-events" aria-label="Eventi salvati sul server">
                  {sortedSaved.map((event) => (
                    <li key={event.id} className={`w4-report-event w4-report-event--${event.kind}`}>
                      <div className="w4-report-event__minute">{event.period}° {event.minute}&apos;</div>
                      <div className={`w4-report-event__icon ${kindClass(event.kind)}`}>{kindIcon(event.kind)}</div>
                      <div className="w4-report-event__main">
                        <strong>{event.player?.displayName ?? (event.side === 'team' ? 'MAPI' : opponentName)}</strong>
                        <span>
                          {KIND_LABELS[event.kind]} · {event.side === 'team' ? 'MAPI' : opponentName}
                        </span>
                        {event.assist && <em>Assist: {event.assist.displayName}</em>}
                      </div>
                      <div className="w4-report-event__actions">
                        <span className="w4-immutable-tag" title="Core C2 non espone PATCH/DELETE">
                          <Lock size={12} /> salvato
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="w4-immutable-note">
                <Info size={13} /> Gli eventi salvati sono immutabili in questa versione: Core C2 non espone
                PATCH/DELETE. Per una correzione serve una decisione di prodotto/Core.
              </p>

              <div className="w4-event-form">
                <div className="w4-event-form__title">
                  <strong>Nuovo evento</strong>
                </div>

                <div className="w4-segmented" role="group" aria-label="Tipo evento">
                  {(['goal', 'yellow_card', 'red_card'] as EventKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className={`w4-segmented__button${form.kind === kind ? ' is-active' : ''}`}
                      onClick={() => updateForm('kind', kind)}
                      aria-pressed={form.kind === kind}
                    >
                      {kindIcon(kind)} {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>

                <div className="w4-form-grid">
                  <label>
                    <span>Lato</span>
                    <select
                      className="w4-input"
                      value={form.side}
                      onChange={(event) => updateForm('side', event.target.value as EventSide)}
                    >
                      <option value="team">MAPI</option>
                      <option value="opponent">{opponentName}</option>
                    </select>
                  </label>
                  <label>
                    <span>Tempo</span>
                    <select
                      className="w4-input"
                      value={form.period}
                      onChange={(event) => updateForm('period', Number(event.target.value) === 2 ? 2 : 1)}
                    >
                      <option value={1}>1° tempo</option>
                      <option value={2}>2° tempo</option>
                    </select>
                  </label>
                  <label>
                    <span>Minuto nel tempo</span>
                    <input
                      className="w4-input"
                      type="number"
                      min={1}
                      max={120}
                      value={form.minute}
                      onChange={(event) => updateForm('minute', event.target.value)}
                      aria-label="Minuto nel tempo"
                      aria-invalid={Boolean(errors.minute)}
                    />
                    {errors.minute && <em className="w4-field-error">{errors.minute}</em>}
                  </label>
                  {form.side === 'team' && (
                    <label>
                      <span>{form.kind === 'goal' ? 'Marcatore' : 'Giocatore'}</span>
                      <select
                        className="w4-input"
                        value={form.playerId}
                        onChange={(event) => updateForm('playerId', event.target.value)}
                        aria-label={form.kind === 'goal' ? 'Marcatore' : 'Giocatore'}
                        aria-invalid={Boolean(errors.player)}
                      >
                        <option value="">Seleziona dalla rosa…</option>
                        {rosterOptions.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.jerseyNumber !== null ? `#${player.jerseyNumber} ` : ''}{player.displayName}
                          </option>
                        ))}
                      </select>
                      {errors.player && <em className="w4-field-error">{errors.player}</em>}
                    </label>
                  )}
                  {form.kind === 'goal' && form.side === 'team' && (
                    <label className="w4-form-grid__wide">
                      <span>Assist (opzionale)</span>
                      <select
                        className="w4-input"
                        value={form.assistPlayerId}
                        onChange={(event) => updateForm('assistPlayerId', event.target.value)}
                        aria-label="Assist (opzionale)"
                        aria-invalid={Boolean(errors.assist)}
                      >
                        <option value="">Nessun assist</option>
                        {rosterOptions.map((player) => (
                          <option key={player.id} value={player.id}>
                            {player.jerseyNumber !== null ? `#${player.jerseyNumber} ` : ''}{player.displayName}
                          </option>
                        ))}
                      </select>
                      {errors.assist && <em className="w4-field-error">{errors.assist}</em>}
                    </label>
                  )}
                </div>

                <button type="button" className="w4-button w4-button--outline w4-button--block" onClick={addDraft}>
                  <PlusCircle size={16} /> Aggiungi bozza locale
                </button>

                {drafts.length > 0 && (
                  <div className="w4-draft-list">
                    <div className="w4-draft-list__heading">
                      <strong>Bozze non inviate</strong>
                      <span>Non ancora salvate sul server</span>
                    </div>
                    <ul>
                      {drafts.map((draft) => (
                        <li key={draft.clientEventId} className={`w4-draft w4-draft--${draft.status}`}>
                          <div className="w4-report-event__minute">{draft.period}° {draft.minute}&apos;</div>
                          <div className={`w4-report-event__icon ${kindClass(draft.kind)}`}>{kindIcon(draft.kind)}</div>
                          <div className="w4-report-event__main">
                            <strong>{draft.playerLabel}</strong>
                            <span>{KIND_LABELS[draft.kind]} · {draft.side === 'team' ? 'MAPI' : opponentName}</span>
                            {draft.assistLabel && <em>Assist: {draft.assistLabel}</em>}
                            {draft.error && <em className="w4-field-error">{draft.error}</em>}
                          </div>
                          <div className="w4-report-event__actions">
                            {draft.status === 'error' && (
                              <button type="button" className="w4-text-button" onClick={() => void retryDraft(draft.clientEventId)}>
                                Riaccoda
                              </button>
                            )}
                            <button
                              type="button"
                              className="w4-icon-button w4-icon-button--danger"
                              onClick={() => removeDraft(draft.clientEventId)}
                              aria-label={`Rimuovi bozza ${KIND_LABELS[draft.kind]}`}
                              disabled={draft.status === 'sending'}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className="w4-button w4-button--primary w4-button--block"
                      onClick={() => void sendDrafts()}
                      disabled={sendingDrafts}
                    >
                      <Send size={16} /> {sendingDrafts ? 'Invio in corso…' : `Invia ${drafts.length} eventi`}
                    </button>
                    <p className="w4-draft-note">
                      <Clock size={13} /> Ogni bozza conserva lo stesso <code>clientEventId</code> anche in caso di
                      retry: il server non crea duplicati.
                    </p>
                  </div>
                )}

                {eventsFeedback && (
                  <p className={eventsFeedback.type === 'ok' ? 'w4-inline-ok' : 'w4-field-error'} role="status">
                    {eventsFeedback.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {eventsFeedback.text}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="w4-admin-report__footer">
          <div className="w4-feedback" role="status" aria-live="polite">
            {resultMissing && <><Info size={14} /> Nessun risultato sul server: il punteggio mostrato parte vuoto.</>}
          </div>
          <div className="w4-admin-report__actions">
            <button type="button" className="w4-button" onClick={onClose}>Chiudi</button>
            <button type="button" className="w4-button w4-button--outline" onClick={() => onViewPublic(matchId)}>
              Vedi scheda pubblica
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
};
