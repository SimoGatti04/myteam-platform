import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { MatchDto, OpponentDto, CompetitionDto } from '@myteam/contracts';
import {
  Calendar,
  PlusCircle,
  Trophy,
  Users,
  Shield,
  CheckCircle2,
  Clock,
  X,
  AlertCircle,
  Info,
  Globe,
  FileText,
  UploadCloud,
  RefreshCw
} from 'lucide-react';

export const AdminPartiteView: React.FC<{
  openModalWithMatchId?: string | null;
  onCloseModal?: () => void;
}> = ({ openModalWithMatchId, onCloseModal }) => {
  const { adminTeam, isDemoData } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'calendario' | 'avversari' | 'importazioni'>('calendario');
  const [matches, setMatches] = useState<MatchDto[]>([]);
  const [opponents, setOpponents] = useState<OpponentDto[]>([]);
  const [competitions, setCompetitions] = useState<CompetitionDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal creazione partita
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedOpponentMode, setSelectedOpponentMode] = useState<'existing' | 'new'>('existing');
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>('');
  const [newOpponentNameInput, setNewOpponentNameInput] = useState<string>('');
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string>('');
  const [scheduledDateInput, setScheduledDateInput] = useState<string>('');
  const [isOfficialInput, setIsOfficialInput] = useState<boolean>(true);
  const [submittingAction, setSubmittingAction] = useState<'draft' | 'publish' | null>(null);

  // Stato pubblicazione riga singola
  const [publishingMatchId, setPublishingMatchId] = useState<string | null>(null);

  // Modalità aggiunta avversario rapida da subtab
  const [newOpponentInlineName, setNewOpponentInlineName] = useState<string>('');
  const [creatingOpponent, setCreatingOpponent] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [isDemoData, adminTeam?.currentSeasonId]);

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);

    if (isDemoData) {
      const demoMatches = apiService.getDemoAdminMatches(adminTeam?.currentSeasonId || undefined);
      const demoOpponents = apiService.getDemoOpponents();
      const demoCompetitions = apiService.getDemoCompetitions();
      setMatches(demoMatches);
      setOpponents(demoOpponents);
      setCompetitions(demoCompetitions);
      if (demoOpponents.length > 0 && demoOpponents[0]) {
        setSelectedOpponentId(demoOpponents[0].id);
      }
    } else {
      // Caricamento gare admin (incluse bozze non pubblicate)
      const matchesRes = await apiService.getAdminMatches(adminTeam?.currentSeasonId ? { seasonId: adminTeam.currentSeasonId } : undefined);
      if (matchesRes.success) {
        setMatches(matchesRes.data);
      } else {
        setMatches([]);
      }

      // Caricamento avversari registrati
      const opponentsRes = await apiService.getAdminOpponents();
      if (opponentsRes.success) {
        setOpponents(opponentsRes.data);
        if (opponentsRes.data.length > 0 && opponentsRes.data[0]) {
          setSelectedOpponentId(opponentsRes.data[0].id);
          setSelectedOpponentMode('existing');
        } else {
          setSelectedOpponentMode('new');
        }
      } else {
        setOpponents([]);
        setSelectedOpponentMode('new');
      }

      // Caricamento competizioni
      const compsRes = await apiService.getAdminCompetitions();
      if (compsRes.success) {
        setCompetitions(compsRes.data);
      } else {
        setCompetitions([]);
      }
    }
    setLoading(false);
  };

  const opponentsMap = new Map<string, string>();
  for (const op of opponents) {
    opponentsMap.set(op.id, op.name);
  }

  const competitionsMap = new Map<string, string>();
  for (const cp of competitions) {
    competitionsMap.set(cp.id, cp.name);
  }

  // Creazione Partita: Salva Bozza OPPURE Salva e Pubblica
  const handleSaveMatch = async (e: React.FormEvent, shouldPublish: boolean) => {
    e.preventDefault();

    let targetOpponentId = selectedOpponentId;

    if (selectedOpponentMode === 'new') {
      if (!newOpponentNameInput.trim()) {
        setStatusMsg({ type: 'error', text: 'Inserisci il nome della squadra avversaria.' });
        return;
      }
    } else {
      if (!targetOpponentId) {
        setStatusMsg({ type: 'error', text: 'Seleziona una squadra avversaria esistente o creane una nuova.' });
        return;
      }
    }

    setSubmittingAction(shouldPublish ? 'publish' : 'draft');
    setStatusMsg(null);

    if (isDemoData) {
      // In modalità Demo locale
      const opponentName = selectedOpponentMode === 'new'
        ? newOpponentNameInput.trim()
        : (opponentsMap.get(targetOpponentId) || 'Squadra Avversaria');

      const mockMatchId = `demo-match-${Date.now()}`;
      const newMatch: MatchDto = {
        id: mockMatchId,
        seasonId: adminTeam?.currentSeasonId || '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        opponentId: targetOpponentId || 'op-demo',
        competitionId: selectedCompetitionId || null,
        isOfficial: isOfficialInput,
        scheduledAt: scheduledDateInput ? new Date(scheduledDateInput).toISOString() : null,
        status: scheduledDateInput ? 'scheduled' : 'to_be_scheduled',
        publishedAt: shouldPublish ? new Date().toISOString() : null,
      };

      setMatches(prev => [newMatch, ...prev]);
      setSubmittingAction(null);
      setIsModalOpen(false);
      if (onCloseModal) onCloseModal();
      setStatusMsg({
        type: 'success',
        text: shouldPublish
          ? `Partita vs ${opponentName} creata e contrassegnata come pubblicata (DEMO).`
          : `Partita vs ${opponentName} salvata come bozza non pubblicata (DEMO).`,
      });
      return;
    }

    if (!adminTeam?.currentSeasonId) {
      setSubmittingAction(null);
      setStatusMsg({
        type: 'error',
        text: 'Nessuna stagione attiva configurata. Imposta la stagione corrente in Impostazioni squadra prima di creare partite.',
      });
      return;
    }

    // Modalità REALE: crea avversario se richiesto 'new'
    if (selectedOpponentMode === 'new') {
      const oppRes = await apiService.createOpponent({
        name: newOpponentNameInput.trim(),
      });

      if (!oppRes.success) {
        setSubmittingAction(null);
        setStatusMsg({
          type: 'error',
          text: `Errore creazione squadra avversaria (${oppRes.status}): ${oppRes.message}`,
        });
        return;
      }

      targetOpponentId = oppRes.data.id;
      // Aggiorna anagrafica locale
      setOpponents(prev => [...prev, oppRes.data]);
    }

    // Crea la partita con POST /api/v1/admin/matches (sempre non pubblicata inizialmente)
    const matchRes = await apiService.createMatch({
      seasonId: adminTeam.currentSeasonId,
      opponentId: targetOpponentId,
      competitionId: selectedCompetitionId.trim() ? selectedCompetitionId : null,
      isOfficial: isOfficialInput,
      scheduledAt: scheduledDateInput ? new Date(scheduledDateInput).toISOString() : null,
      status: scheduledDateInput ? 'scheduled' : 'to_be_scheduled',
    });

    if (!matchRes.success) {
      setSubmittingAction(null);
      setStatusMsg({
        type: 'error',
        text: `Errore creazione partita (${matchRes.status}): ${matchRes.message}`,
      });
      return;
    }

    const createdMatchId = matchRes.data.id;
    const oppName = opponentsMap.get(targetOpponentId) || newOpponentNameInput.trim() || 'Avversaria';

    if (shouldPublish) {
      // Pubblicazione esplicita richiesta
      const pubRes = await apiService.publishMatch(createdMatchId);

      setSubmittingAction(null);
      setIsModalOpen(false);
      if (onCloseModal) onCloseModal();

      if (pubRes.success) {
        setStatusMsg({
          type: 'success',
          text: `Partita vs ${oppName} creata e PUBBLICATA con successo! Visibile sul sito pubblico.`,
        });
      } else {
        // NON comunicare pubblicata in caso di fallimento!
        setStatusMsg({
          type: 'error',
          text: `Partita vs ${oppName} salvata come bozza, ma la PUBBLICAZIONE è fallita (${pubRes.status}): ${pubRes.message}`,
        });
      }
    } else {
      // Salvataggio come Bozza (non pubblicata)
      setSubmittingAction(null);
      setIsModalOpen(false);
      if (onCloseModal) onCloseModal();
      setStatusMsg({
        type: 'success',
        text: `Partita vs ${oppName} salvata come BOZZA (non pubblicata sul sito pubblico).`,
      });
    }

    await loadData();
  };

  // Pubblicazione di una bozza esistente
  const handlePublishExistingMatch = async (matchId: string) => {
    setPublishingMatchId(matchId);
    setStatusMsg(null);

    if (isDemoData) {
      setMatches(prev => prev.map(m => m.id === matchId ? { ...m, publishedAt: new Date().toISOString() } : m));
      setPublishingMatchId(null);
      setStatusMsg({ type: 'success', text: 'Partita pubblicata nell\'anteprima dimostrativa (DEMO).' });
      return;
    }

    const res = await apiService.publishMatch(matchId);
    setPublishingMatchId(null);

    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: 'Partita pubblicata con successo! Ora è visibile nella sezione pubblica del sito.',
      });
      await loadData();
    } else {
      // Fallimento esplicito: non comunicare successo
      setStatusMsg({
        type: 'error',
        text: `Impossibile pubblicare la partita (${res.status}): ${res.message}`,
      });
    }
  };

  // Creazione rapida avversario da subtab Avversari
  const handleCreateOpponentInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOpponentInlineName.trim()) return;

    setCreatingOpponent(true);
    setStatusMsg(null);

    if (isDemoData) {
      const demoOp: OpponentDto = {
        id: `op-${Date.now()}`,
        name: newOpponentInlineName.trim(),
      };
      setOpponents(prev => [demoOp, ...prev]);
      setNewOpponentInlineName('');
      setCreatingOpponent(false);
      setStatusMsg({ type: 'success', text: 'Squadra avversaria aggiunta (DEMO).' });
      return;
    }

    const res = await apiService.createOpponent({ name: newOpponentInlineName.trim() });
    setCreatingOpponent(false);

    if (res.success) {
      setNewOpponentInlineName('');
      setStatusMsg({
        type: 'success',
        text: `Squadra avversaria "${res.data.name}" registrata con successo in anagrafica Core!`,
      });
      await loadData();
    } else {
      setStatusMsg({
        type: 'error',
        text: `Errore creazione avversario (${res.status}): ${res.message}`,
      });
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              Gestione Partite (Sezione Unica)
            </h2>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                DEMO MOCK
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Calendario, bozze non pubblicate e anagrafica avversari riutilizzabile (Opzione A approvata)
          </p>
        </div>

        <button
          onClick={() => {
            setIsModalOpen(true);
            setNewOpponentNameInput('');
            setScheduledDateInput('');
            setIsOfficialInput(true);
            if (opponents.length > 0 && opponents[0]) {
              setSelectedOpponentMode('existing');
              setSelectedOpponentId(opponents[0].id);
            } else {
              setSelectedOpponentMode('new');
            }
          }}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: 'var(--brand-secondary)',
            color: '#0f172a',
            border: 'none',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <PlusCircle size={16} /> Nuova Partita
        </button>
      </div>

      {!isDemoData && (
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
          borderRadius: '10px',
          padding: '12px 16px',
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Info size={16} color="var(--brand-secondary)" style={{ flexShrink: 0 }} />
          <span>
            <strong>Integrazione Core C1.1 Attiva:</strong> Lettura amministrativa <code>GET /api/v1/admin/matches</code> e anagrafica avversari <code>GET /api/v1/admin/opponents</code>. Separazione rigorosa tra salvataggio bozza e pubblicazione.
          </span>
        </div>
      )}

      {statusMsg && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${statusMsg.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: statusMsg.type === 'success' ? '#34d399' : '#fca5a5',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {statusMsg.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Sottosezioni Gestione Partite (Opzione A approvata) */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '8px',
      }}>
        <button
          onClick={() => setActiveSubTab('calendario')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'calendario' ? 700 : 500,
            backgroundColor: activeSubTab === 'calendario' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeSubTab === 'calendario' ? '#ffffff' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Calendario & Bozze ({matches.length})
        </button>
        <button
          onClick={() => setActiveSubTab('avversari')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'avversari' ? 700 : 500,
            backgroundColor: activeSubTab === 'avversari' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeSubTab === 'avversari' ? '#ffffff' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Squadre Avversarie ({opponents.length})
        </button>
        <button
          onClick={() => setActiveSubTab('importazioni')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'importazioni' ? 700 : 500,
            backgroundColor: activeSubTab === 'importazioni' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeSubTab === 'importazioni' ? '#ffffff' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Importazioni & CSI
        </button>
      </div>

      {activeSubTab === 'calendario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {matches.length > 0 ? (
            matches.map((match) => {
              const oppName = opponentsMap.get(match.opponentId) || 'Squadra Avversaria';
              const compName = match.competitionId ? competitionsMap.get(match.competitionId) : (match.isOfficial ? 'Gara Ufficiale' : 'Amichevole');
              const isPublished = Boolean(match.publishedAt);

              return (
                <div
                  key={match.id}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.72rem', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: 'var(--brand-secondary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                        {compName}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: isPublished ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: isPublished ? '#34d399' : '#f59e0b',
                      }}>
                        {isPublished ? 'PUBBLICATA' : 'BOZZA (NON PUBBLICATA)'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {match.status}
                      </span>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>
                      vs {oppName}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      {match.scheduledAt ? new Date(match.scheduledAt).toLocaleString('it-IT') : 'Data da programmare'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {!isPublished ? (
                      <button
                        onClick={() => handlePublishExistingMatch(match.id)}
                        disabled={publishingMatchId === match.id}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          color: '#34d399',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: publishingMatchId === match.id ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Globe size={14} />
                        {publishingMatchId === match.id ? 'Pubblicazione...' : 'Pubblica Partita'}
                      </button>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={14} /> Visibile sul sito
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px dashed var(--border-subtle)',
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}>
              Nessuna partita registrata. Clicca su "Nuova Partita" per creare una bozza o programmare una gara.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'avversari' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Form rapido aggiunta avversario */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
            padding: '18px',
          }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
              Registra Nuova Squadra Avversaria
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Le squadre avversarie sono entità permanenti riutilizzabili per tutte le partite e stagioni (<code>POST /api/v1/admin/opponents</code>).
            </p>
            <form onSubmit={handleCreateOpponentInline} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="es. Atletico Bovisa"
                value={newOpponentInlineName}
                onChange={(e) => setNewOpponentInlineName(e.target.value)}
                required
                style={{
                  flex: '1',
                  minWidth: '220px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={creatingOpponent || !newOpponentInlineName.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--brand-secondary)',
                  color: '#0f172a',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: creatingOpponent || !newOpponentInlineName.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingOpponent ? 'Creazione...' : 'Salva Avversario'}
              </button>
            </form>
          </div>

          {/* Elenco avversari censiti */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
              Anagrafica Squadre Avversarie Registrate ({opponents.length})
            </div>
            {opponents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {opponents.map((op) => (
                  <div
                    key={op.id}
                    style={{
                      padding: '12px 18px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.88rem' }}>
                      {op.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                      ID: {op.id}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Nessuna squadra avversaria registrata.
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'importazioni' && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
            Integrazione Calendario CSI & Import CSV
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            La funzione di importazione automatizzata da calendario CSI e file CSV è collocata nelle specifiche come modulo di automazione di Fase 2. Nessun falso successo o sincronizzazione fittizia viene simulata in questo checkpoint.
          </p>
        </div>
      )}

      {/* Modal Nuova Partita */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 100,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            width: '100%',
            maxWidth: '520px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff' }}>
                Programma Nuova Partita
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  if (onCloseModal) onCloseModal();
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Selezione Squadra Avversaria */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Squadra Avversaria *
                </label>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedOpponentMode('existing')}
                    disabled={opponents.length === 0}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: selectedOpponentMode === 'existing' ? 700 : 500,
                      backgroundColor: selectedOpponentMode === 'existing' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: selectedOpponentMode === 'existing' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                      border: selectedOpponentMode === 'existing' ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
                      cursor: opponents.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Scegli Esistente ({opponents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedOpponentMode('new')}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: selectedOpponentMode === 'new' ? 700 : 500,
                      backgroundColor: selectedOpponentMode === 'new' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      color: selectedOpponentMode === 'new' ? 'var(--brand-secondary)' : 'var(--text-muted)',
                      border: selectedOpponentMode === 'new' ? '1px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    + Crea Nuovo Avversario
                  </button>
                </div>

                {selectedOpponentMode === 'existing' && opponents.length > 0 ? (
                  <select
                    value={selectedOpponentId}
                    onChange={(e) => setSelectedOpponentId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    {opponents.map((op) => (
                      <option key={op.id} value={op.id} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                        {op.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="es. Polisportiva Aurora"
                    value={newOpponentNameInput}
                    onChange={(e) => setNewOpponentNameInput(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                )}
              </div>

              {/* Competizione */}
              {competitions.length > 0 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Competizione (Opzionale)
                  </label>
                  <select
                    value={selectedCompetitionId}
                    onChange={(e) => setSelectedCompetitionId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  >
                    <option value="" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                      -- Nessuna competizione specificata --
                    </option>
                    {competitions.map((c) => (
                      <option key={c.id} value={c.id} style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
                        {c.name} ({c.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Data e Ora */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Data e Ora di Inizio (Opzionale — lasciare vuoto per "Data da definire")
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDateInput}
                  onChange={(e) => setScheduledDateInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Ufficialità */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="isOfficial"
                  checked={isOfficialInput}
                  onChange={(e) => setIsOfficialInput(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="isOfficial" style={{ fontSize: '0.82rem', color: '#ffffff', cursor: 'pointer' }}>
                  Gara Ufficiale (valida ai fini di classifica e statistiche)
                </label>
              </div>

              {/* Azioni separate: Salva Bozza vs Salva e Pubblica */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    if (onCloseModal) onCloseModal();
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                  }}
                >
                  Annulla
                </button>

                <button
                  type="button"
                  disabled={Boolean(submittingAction)}
                  onClick={(e) => handleSaveMatch(e, false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: submittingAction ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingAction === 'draft' ? 'Salvataggio bozza...' : 'Salva come Bozza'}
                </button>

                <button
                  type="button"
                  disabled={Boolean(submittingAction)}
                  onClick={(e) => handleSaveMatch(e, true)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: submittingAction ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingAction === 'publish' ? 'Pubblicazione...' : 'Salva e Pubblica'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
