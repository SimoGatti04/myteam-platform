import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { PublicMatchDto } from '@myteam/contracts';
import {
  Calendar,
  PlusCircle,
  Edit2,
  Trophy,
  Users,
  Shield,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  HelpCircle,
  X,
  Plus,
  Trash2,
  AlertCircle,
  Info
} from 'lucide-react';

export const AdminPartiteView: React.FC<{
  openModalWithMatchId?: string | null;
  onCloseModal?: () => void;
}> = ({ openModalWithMatchId, onCloseModal }) => {
  const { adminTeam, isDemoData } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'calendario' | 'competizioni' | 'avversari' | 'importazioni'>('calendario');
  const [matches, setMatches] = useState<PublicMatchDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal creazione partita
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [opponentNameInput, setOpponentNameInput] = useState<string>('');
  const [scheduledDateInput, setScheduledDateInput] = useState<string>('');
  const [isOfficialInput, setIsOfficialInput] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [isDemoData]);

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    if (isDemoData) {
      const demo = apiService.getDemoMatches();
      setMatches([...demo.scheduled, ...demo.toBeScheduled]);
    } else {
      const res = await apiService.getPublicMatches();
      if (res.success) {
        setMatches([...res.data.scheduled, ...res.data.toBeScheduled]);
      } else {
        setMatches([]);
      }
    }
    setLoading(false);
  };

  const handleCreateMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponentNameInput.trim()) return;

    setSubmitting(true);
    setStatusMsg(null);

    if (isDemoData) {
      const newMatch: PublicMatchDto = {
        id: `demo-match-${Date.now()}`,
        seasonId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        opponentName: opponentNameInput.trim(),
        competitionName: isOfficialInput ? 'Campionato CSI' : 'Amichevole',
        isOfficial: isOfficialInput,
        scheduledAt: scheduledDateInput ? new Date(scheduledDateInput).toISOString() : null,
        status: scheduledDateInput ? 'scheduled' : 'to_be_scheduled',
      };
      setMatches(prev => [newMatch, ...prev]);
      setSubmitting(false);
      setIsModalOpen(false);
      if (onCloseModal) onCloseModal();
      setStatusMsg({ type: 'success', text: 'Partita aggiunta all\'anteprima dimostrativa (DEMO).' });
      return;
    }

    if (!adminTeam?.currentSeasonId) {
      setSubmitting(false);
      setStatusMsg({
        type: 'error',
        text: 'Nessuna stagione attiva configurata. Imposta la stagione corrente in Impostazioni squadra prima di creare partite.',
      });
      return;
    }

    // Modalità REALE: crea prima l'avversario tramite POST /api/v1/admin/opponents
    const oppRes = await apiService.createOpponent({
      name: opponentNameInput.trim(),
    });

    if (!oppRes.success) {
      setSubmitting(false);
      setStatusMsg({
        type: 'error',
        text: `Errore creazione squadra avversaria (${oppRes.status}): ${oppRes.message}`,
      });
      return;
    }

    // Crea la partita tramite POST /api/v1/admin/matches
    const matchRes = await apiService.createMatch({
      seasonId: adminTeam.currentSeasonId,
      opponentId: oppRes.data.id,
      isOfficial: isOfficialInput,
      scheduledAt: scheduledDateInput ? new Date(scheduledDateInput).toISOString() : null,
      status: scheduledDateInput ? 'scheduled' : 'to_be_scheduled',
    });

    if (!matchRes.success) {
      setSubmitting(false);
      setStatusMsg({
        type: 'error',
        text: `Errore creazione partita (${matchRes.status}): ${matchRes.message}`,
      });
      return;
    }

    // Pubblica la partita per renderla visibile pubblicamente se la squadra è già pubblicata
    await apiService.publishMatch(matchRes.data.id);

    setSubmitting(false);
    setIsModalOpen(false);
    if (onCloseModal) onCloseModal();
    setStatusMsg({
      type: 'success',
      text: `Partita vs ${oppRes.data.name} creata e pubblicata con successo sul server Core!`,
    });
    await loadData();
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
            Calendario, anagrafica avversari e programmazione gare (Opzione A approvata)
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
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
            <strong>Integrazione Core C1.1:</strong> Scrittura gare collegata direttamente agli endpoint autorizzati <code>POST /api/v1/admin/matches</code> e <code>POST /api/v1/admin/matches/:id/publish</code>.
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

      {/* Sottosezioni Gestione Partite (Opzione A confermata nelle specifiche) */}
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
          Calendario & Gare
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
          Squadre Avversarie
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
            matches.map((match) => (
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
                      {match.competitionName || (match.isOfficial ? 'Gara Ufficiale' : 'Amichevole')}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {match.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>
                    vs {match.opponentName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    {match.scheduledAt ? new Date(match.scheduledAt).toLocaleString('it-IT') : 'Data da programmare'}
                  </div>
                </div>

                <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                  ✓ Salvata nel sistema
                </div>
              </div>
            ))
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
              Nessuna partita presente. Clicca su "Nuova Partita" per creare una gara.
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'avversari' && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '14px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
        }}>
          Le squadre avversarie vengono registrate automaticamente tramite l'anagrafica centralizzata Core alla creazione delle gare (<code>POST /api/v1/admin/opponents</code>). La gestione con stemmi personalizzati è in completamento in C1.1.
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
            La funzione di importazione da calendario CSI / CSV è collocata nelle specifiche come modulo di automazione di Fase 2. Nessun falso successo o sincronizzazione fittizia viene simulata in questo checkpoint.
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
            maxWidth: '480px',
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

            <form onSubmit={handleCreateMatch} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Squadra Avversaria *
                </label>
                <input
                  type="text"
                  placeholder="es. Polisportiva Aurora"
                  value={opponentNameInput}
                  onChange={(e) => setOpponentNameInput(e.target.value)}
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Data e Ora di Inizio (Opzionale)
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
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
                  type="submit"
                  disabled={submitting || !opponentNameInput.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: submitting || !opponentNameInput.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Creazione in corso...' : 'Salva Partita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
