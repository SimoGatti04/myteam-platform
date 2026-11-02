import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import type { PublicRosterDto } from '@myteam/contracts';
import { Shield, ChevronRight, User, Award, Info, RefreshCw, AlertCircle } from 'lucide-react';

export const RosaView: React.FC = () => {
  const { publicTeam, setActiveTab, setSelectedPlayerId, dataMode, isDemoData } = useApp();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Real roster state
  const [realRoster, setRealRoster] = useState<PublicRosterDto | null>(null);

  // Demo roster state
  const [demoRosterMembers, setDemoRosterMembers] = useState<any[]>([]);

  useEffect(() => {
    loadRoster();
  }, [dataMode]);

  const loadRoster = async () => {
    setLoading(true);
    setErrorMsg(null);

    if (dataMode === 'demo') {
      const demo = apiService.getDemoRoster();
      setRealRoster(demo);
      // Extra info for demo
      setDemoRosterMembers(apiService.getDemoPlayerStats());
      setLoading(false);
      return;
    }

    const res = await apiService.getPublicRoster();
    if (res.success) {
      setRealRoster(res.data);
      setErrorMsg(null);
    } else {
      setRealRoster(null);
      if (res.status === 404) {
        setErrorMsg('Rosa non ancora pubblicata. Il profilo squadra o la rosa è attualmente in bozza.');
      } else {
        setErrorMsg(`${res.message} (HTTP ${res.status})`);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div>Caricamento rosa giocatori...</div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const players = realRoster?.players || [];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
            Rosa Ufficiale
          </h2>
          {isDemoData && (
            <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              DEMO MOCK
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Stagione {realRoster?.season?.label || publicTeam?.currentSeason?.label || '2026/2027'} • Giocatori tesserati
        </p>
      </div>

      {errorMsg && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '10px',
          padding: '14px 16px',
          fontSize: '0.85rem',
          color: '#fca5a5',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <AlertCircle size={18} />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Griglia Giocatori */}
      {players.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '16px',
        }}>
          {players.map((player) => (
            <div
              key={player.id}
              onClick={() => {
                if (isDemoData) {
                  setSelectedPlayerId(player.id);
                  setActiveTab('statistiche');
                }
              }}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: '14px',
                border: '1px solid var(--border-subtle)',
                padding: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                cursor: isDemoData ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Numero Maglia */}
              <div style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                backgroundColor: player.jerseyNumber !== null ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                color: player.jerseyNumber !== null ? 'var(--brand-secondary)' : 'var(--text-muted)',
                fontWeight: 900,
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: player.jerseyNumber !== null ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--border-subtle)',
                flexShrink: 0,
              }}>
                {player.jerseyNumber !== null ? player.jerseyNumber : '—'}
              </div>

              {/* Dettagli Anagrafici Reali */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: '#ffffff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {player.displayName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {isDemoData ? 'Visualizza scheda statistiche →' : 'Tesserato attivo'}
                </div>
              </div>
            </div>
          ))}
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
          Nessun giocatore registrato nella rosa per la stagione selezionata.
        </div>
      )}

      {/* Nota metodologica per Real Mode */}
      {!isDemoData && (
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          borderRadius: '10px',
          border: '1px solid var(--border-subtle)',
          padding: '14px 16px',
          fontSize: '0.78rem',
          color: 'var(--text-dim)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <Info size={16} color="var(--brand-secondary)" style={{ flexShrink: 0 }} />
          <span>
            I dati della rosa corrispondono fedelmente alle membership attive registrate nel backend Core (<code>GET /api/v1/public/roster</code>). Ruoli specifici e presenze individuali saranno collegati all'integrazione dei tabellini in C1.1/C2.
          </span>
        </div>
      )}
    </div>
  );
};
