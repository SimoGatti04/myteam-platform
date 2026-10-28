import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import { Users, PlusCircle, Edit2, Shield, UserCheck, UserX, X, AlertCircle, CheckCircle2, RefreshCw, Info } from 'lucide-react';

export const AdminRosaView: React.FC<{
  openNewPlayerModal?: boolean;
  onCloseNewPlayerModal?: () => void;
}> = ({ openNewPlayerModal, onCloseNewPlayerModal }) => {
  const { adminTeam, publicTeam, isDemoData } = useApp();
  const [roster, setRoster] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Player Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [newJerseyNumber, setNewJerseyNumber] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadRoster();
  }, [isDemoData]);

  useEffect(() => {
    if (openNewPlayerModal) {
      setIsModalOpen(true);
    }
  }, [openNewPlayerModal]);

  const loadRoster = async () => {
    setLoading(true);
    setStatusMsg(null);
    if (isDemoData) {
      const demo = apiService.getDemoRoster();
      setRoster(demo.players);
    } else {
      const res = await apiService.getPublicRoster();
      if (res.success) {
        setRoster(res.data.players);
      } else {
        setRoster([]);
      }
    }
    setLoading(false);
  };

  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDisplayName.trim()) return;

    setSubmitting(true);
    setStatusMsg(null);

    if (isDemoData) {
      // In demo mode: aggiunta locale simulata
      const newPlayer = {
        id: `demo-${Date.now()}`,
        displayName: newDisplayName.trim(),
        jerseyNumber: newJerseyNumber ? parseInt(newJerseyNumber, 10) : null,
      };
      setRoster(prev => [newPlayer, ...prev]);
      setSubmitting(false);
      setIsModalOpen(false);
      if (onCloseNewPlayerModal) onCloseNewPlayerModal();
      setStatusMsg({ type: 'success', text: 'Giocatore aggiunto all\'anteprima dimostrativa (DEMO).' });
      return;
    }

    // Modalità REALE: chiamata a POST /api/v1/admin/players
    const playerRes = await apiService.createPlayer({
      displayName: newDisplayName.trim(),
    });

    if (!playerRes.success) {
      setSubmitting(false);
      setStatusMsg({
        type: 'error',
        text: `Errore creazione anagrafica giocatore (${playerRes.status}): ${playerRes.message}`,
      });
      return;
    }

    // Se la squadra ha una stagione corrente, registra la membership
    if (adminTeam?.currentSeasonId) {
      const memRes = await apiService.createRosterMembership({
        playerId: playerRes.data.id,
        seasonId: adminTeam.currentSeasonId,
        jerseyNumber: newJerseyNumber ? parseInt(newJerseyNumber, 10) : null,
        activeFrom: new Date().toISOString().split('T')[0]!,
      });

      if (!memRes.success) {
        setSubmitting(false);
        setStatusMsg({
          type: 'error',
          text: `Anagrafica creata, ma membership non registrata (${memRes.status}): ${memRes.message}`,
        });
        return;
      }
    }

    setSubmitting(false);
    setIsModalOpen(false);
    if (onCloseNewPlayerModal) onCloseNewPlayerModal();
    setStatusMsg({
      type: 'success',
      text: `Giocatore "${playerRes.data.displayName}" registrato con successo sul server Core!`,
    });
    await loadRoster();
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              Gestione Rosa & Tesserati
            </h2>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                DEMO MOCK
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Anagrafica giocatori e numeri di maglia per la stagione
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
          <PlusCircle size={16} /> Aggiungi Giocatore
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
            <strong>Integrazione Core C1.1:</strong> L'endpoint di scrittura <code>POST /api/v1/admin/players</code> e <code>POST /api/v1/admin/roster-memberships</code> è attivo e verificato. Le letture amministrative avanzate sono in completamento nel checkpoint C1.1.
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

      {/* Tabella / Elenco Tesserati */}
      {roster.length > 0 ? (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
                <th style={{ padding: '12px 16px', width: '60px' }}>N°</th>
                <th style={{ padding: '12px 16px' }}>Nome Giocatore</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((player) => (
                <tr key={player.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 800, color: player.jerseyNumber !== null ? 'var(--brand-secondary)' : 'var(--text-muted)' }}>
                    {player.jerseyNumber !== null ? `#${player.jerseyNumber}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#ffffff' }}>
                    {player.displayName}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{
                      fontSize: '0.72rem',
                      backgroundColor: 'rgba(16, 185, 129, 0.15)',
                      color: '#34d399',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 600,
                    }}>
                      Attivo
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px dashed var(--border-subtle)',
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
        }}>
          Nessun giocatore registrato in rosa. Clicca su "Aggiungi Giocatore" per creare il primo tesserato.
        </div>
      )}

      {/* Modal Aggiungi Giocatore */}
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
                Aggiungi Giocatore alla Rosa
              </h3>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  if (onCloseNewPlayerModal) onCloseNewPlayerModal();
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePlayer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Nome Cognome / Nome d'Arte *
                </label>
                <input
                  type="text"
                  placeholder="es. Mario Rossi"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
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
                  Numero di Maglia (Opzionale, 0-99)
                </label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  placeholder="10"
                  value={newJerseyNumber}
                  onChange={(e) => setNewJerseyNumber(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    if (onCloseNewPlayerModal) onCloseNewPlayerModal();
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
                  disabled={submitting || !newDisplayName.trim()}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: submitting || !newDisplayName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Salvataggio...' : 'Crea e Tessera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
