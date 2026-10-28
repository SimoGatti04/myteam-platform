import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import type { TeamSeasonStats, PlayerStats } from '../types/domain';
import {
  BarChart2,
  Trophy,
  Award,
  ChevronLeft,
  Flame,
  Shield,
  HelpCircle,
  Filter,
  CheckCircle2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const StatisticheView: React.FC = () => {
  const { selectedPlayerId, setSelectedPlayerId, dataMode, setDataMode, isDemoData } = useApp();

  const [isOfficialOnly, setIsOfficialOnly] = useState<boolean>(true);
  const [teamStats, setTeamStats] = useState<TeamSeasonStats | null>(null);
  const [playersStats, setPlayersStats] = useState<PlayerStats[]>([]);

  useEffect(() => {
    if (isDemoData) {
      setTeamStats(apiService.getDemoTeamStats(isOfficialOnly));
      setPlayersStats(apiService.getDemoPlayerStats());
    }
  }, [isOfficialOnly, isDemoData]);

  // Se siamo in Real Mode, mostriamo lo stato onesto di assenza dati API senza inventare nulla
  if (!isDemoData) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '16px' }}>
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '40px 24px',
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: 'var(--brand-secondary)',
          }}>
            <BarChart2 size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
            Statistiche non ancora disponibili nelle API Core
          </h2>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
            I contratti attuali di Core Platform (C0/C1) coprono anagrafica squadra, rosa e calendario partite. Il motore di calcolo per statistiche di squadra (rendimento casa/trasferta, serie utili) e individuali (marcatori, presenze, minuti giocati) è pianificato per le prossime release (Fase 2).
          </p>

          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            border: '1px dashed rgba(245, 158, 11, 0.3)',
            borderRadius: '12px',
            padding: '16px 20px',
            maxWidth: '500px',
            margin: '0 auto',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700 }}>
              <Sparkles size={16} /> Vuoi vedere come sarà l'interfaccia?
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Puoi attivare la <strong>Modalità Demo</strong> per testare i componenti grafici delle schede rendimento e dei profili giocatore con dati mock di sviluppo.
            </p>
            <button
              onClick={() => setDataMode('demo')}
              style={{
                alignSelf: 'flex-start',
                marginTop: '4px',
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fef3c7',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              Attiva Modalità Demo <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  // MODALITÀ DIMOSTRATIVA: Visualizzazione Mockup Approvati per W1
  // -----------------------------------------------------------------

  const selectedPlayer = selectedPlayerId
    ? playersStats.find(p => p.id === selectedPlayerId)
    : null;

  if (selectedPlayer) {
    return (
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <button
          onClick={() => setSelectedPlayerId(null)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            color: 'var(--brand-secondary)',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            alignSelf: 'flex-start',
          }}
        >
          <ChevronLeft size={16} /> Torna a tutte le statistiche
        </button>

        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              SCHEDA DIMOSTRATIVA (DEMO)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '14px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: 'var(--brand-secondary)',
              fontWeight: 900,
              fontSize: '1.6rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}>
              {selectedPlayer.jerseyNumber !== null ? selectedPlayer.jerseyNumber : '—'}
            </div>
            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff' }}>
                {selectedPlayer.displayName}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {selectedPlayer.isGoalkeeper ? 'Portiere' : 'Giocatore di Movimento'} • Stagione 2026/2027
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>{selectedPlayer.appearances}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Presenze</div>
            </div>
            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--brand-secondary)' }}>{selectedPlayer.goals}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gol Totali</div>
            </div>
            <div style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24' }}>{selectedPlayer.potmCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>POTM Vinti</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              Statistiche Generali
            </h2>
            <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              DEMO MOCK
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Rendimento squadra e statistiche individuali
          </p>
        </div>

        {/* Filtro Ufficiali / Tutte */}
        <div style={{
          display: 'flex',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '10px',
          padding: '4px',
          border: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={() => setIsOfficialOnly(true)}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.8rem',
              fontWeight: isOfficialOnly ? 700 : 500,
              backgroundColor: isOfficialOnly ? 'var(--brand-secondary)' : 'transparent',
              color: isOfficialOnly ? '#0f172a' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Solo Gare Ufficiali
          </button>
          <button
            onClick={() => setIsOfficialOnly(false)}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              fontSize: '0.8rem',
              fontWeight: !isOfficialOnly ? 700 : 500,
              backgroundColor: !isOfficialOnly ? 'var(--brand-secondary)' : 'transparent',
              color: !isOfficialOnly ? '#0f172a' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Tutte le Gare
          </button>
        </div>
      </div>

      {/* Box Rendimento Squadra Demo */}
      {teamStats && (
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
        }}>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ffffff' }}>{teamStats.played}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Giocate</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34d399' }}>{teamStats.won}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vinte</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fbbf24' }}>{teamStats.drawn}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nulle</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#f87171' }}>{teamStats.lost}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Perse</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--brand-secondary)' }}>{teamStats.goalsFor}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gol Fatti</div>
          </div>
          <div style={{ textAlign: 'center', padding: '12px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-dim)' }}>{teamStats.goalsAgainst}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gol Subiti</div>
          </div>
        </div>
      )}

      {/* Classifica Marcatori Demo */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
          Classifica Marcatori (Demo)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...playersStats].sort((a, b) => b.goals - a.goals).map((pl, idx) => (
            <div
              key={pl.id}
              onClick={() => setSelectedPlayerId(pl.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 700, color: idx === 0 ? 'var(--brand-secondary)' : 'var(--text-muted)', width: '20px' }}>
                  {idx + 1}°
                </span>
                <span style={{ fontWeight: 600, color: '#ffffff' }}>{pl.displayName}</span>
                {pl.jerseyNumber !== null && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>#{pl.jerseyNumber}</span>
                )}
              </div>
              <div style={{ fontWeight: 800, color: 'var(--brand-secondary)' }}>
                {pl.goals} gol
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
