import { getTeamDisplayName } from '../utils/branding';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import type { PublicMatchDto, PublicMatchesDto } from '@myteam/contracts';
import type { MatchDetail, StandingRow } from '../types/domain';
import {
  Calendar,
  Clock,
  MapPin,
  Trophy,
  ChevronRight,
  Vote,
  Download,
  Flame,
  Award,
  Sparkles,
  Info,
  AlertTriangle,
  RefreshCw,
  Shield,
  HelpCircle
} from 'lucide-react';

export const HomeView: React.FC = () => {
  const {
    publicTeam,
    publicTeamState,
    refreshPublicTeam,
    dataMode,
    isDemoData,
    setActiveTab,
    setSelectedMatchId,
    showPwaBanner,
    dismissPwaBanner,
    isPwaInstallable,
    installPwa,
    themeTokens,
  } = useApp();

  const [loadingMatches, setLoadingMatches] = useState<boolean>(true);
  const [matchesError, setMatchesError] = useState<string | null>(null);

  // Per Real Mode: DTO contratti Core
  const [realMatches, setRealMatches] = useState<PublicMatchesDto | null>(null);

  // Per Demo Mode: MatchDetail completi di tabellini grafici
  const [demoMatches, setDemoMatches] = useState<MatchDetail[]>([]);
  const [demoStandings, setDemoStandings] = useState<StandingRow[]>([]);

  useEffect(() => {
    loadHomeData();
  }, [dataMode]);

  const loadHomeData = async () => {
    setLoadingMatches(true);
    setMatchesError(null);

    if (dataMode === 'demo') {
      setDemoMatches(apiService.getDemoMatchDetails());
      setDemoStandings(apiService.getDemoStandings());
      setLoadingMatches(false);
      return;
    }

    // Modalità REALE: Lettura da endpoint Core Platform
    const res = await apiService.getPublicMatches();
    if (res.success) {
      setRealMatches(res.data);
      setMatchesError(null);
    } else {
      setRealMatches(null);
      if (res.status === 404) {
        setMatchesError('Calendario partite non ancora pubblicato.');
      } else {
        setMatchesError(`${res.message} (HTTP ${res.status})`);
      }
    }
    setLoadingMatches(false);
  };

  // Se la squadra non è pubblicata o c'è errore nella lettura squadra in Real Mode
  if (!isDemoData && publicTeamState.status === 'error') {
    return (
      <div style={{ maxWidth: '900px', margin: '40px auto', padding: '16px' }}>
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '36px 24px',
          textAlign: 'center',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
            color: '#ef4444',
          }}>
            <AlertTriangle size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
            {publicTeamState.error?.status === 404
              ? 'Squadra non ancora pubblicata'
              : 'Servizio non disponibile'}
          </h2>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
            {publicTeamState.error?.status === 404
              ? 'La squadra non è ancora stata pubblicata dall\'amministratore su questa installazione. Quando il profilo verrà pubblicato sul server Core, tutti i contenuti saranno visibili qui.'
              : `${publicTeamState.error?.message} Verificare che il backend sia attivo sulla porta 3000.`}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => refreshPublicTeam()}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                backgroundColor: 'var(--brand-secondary)',
                color: '#0f172a',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={16} /> Riprova connessione
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (publicTeamState.status === 'loading' || loadingMatches) {
    return (
      <div style={{ padding: '80px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
        <div>Caricamento dati ufficiali della squadra...</div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ----------------------------------------------------
  // LOGICA SELEZIONE PARTITE (DEMO vs REALE)
  // ----------------------------------------------------
  let mainScheduledMatch: PublicMatchDto | null = null;
  let secondaryMatch: PublicMatchDto | null = null;

  if (isDemoData) {
    // In Demo usiamo l'algoritmo di ordinamento temporale sulle fixture demo
    const dated = demoMatches.filter(m => m.scheduledAt);
    if (dated.length > 0) {
      mainScheduledMatch = dated[0] || null;
      if (dated.length > 1) secondaryMatch = dated[1] || null;
    }
  } else if (realMatches) {
    // In Real Mode usiamo scheduled e toBeScheduled da Core Platform
    if (realMatches.scheduled.length > 0) {
      mainScheduledMatch = realMatches.scheduled[0] || null;
      if (realMatches.scheduled.length > 1) {
        secondaryMatch = realMatches.scheduled[1] || null;
      } else if (realMatches.toBeScheduled.length > 0) {
        secondaryMatch = realMatches.toBeScheduled[0] || null;
      }
    } else if (realMatches.toBeScheduled.length > 0) {
      mainScheduledMatch = realMatches.toBeScheduled[0] || null;
      if (realMatches.toBeScheduled.length > 1) {
        secondaryMatch = realMatches.toBeScheduled[1] || null;
      }
    }
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '32px' }}>

      {/* 1. Hero Compatto dell'Identità di Squadra */}
      <section style={{
        background: themeTokens.heroBg,
        borderRadius: '20px',
        border: '1px solid var(--border-subtle)',
        padding: '32px 24px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
      }}>
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '12px',
        }}>
          {publicTeam?.crestUrl ? (
            <img
              src={publicTeam.crestUrl}
              alt={publicTeam.name}
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.5))',
              }}
            />
          ) : (
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '20px',
              backgroundColor: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-secondary)',
              border: '2px solid var(--brand-secondary)',
            }}>
              <Shield size={44} />
            </div>
          )}

          <div>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              lineHeight: 1.1,
              marginBottom: '6px',
            }}>
              {getTeamDisplayName(publicTeam?.name, isDemoData)}
            </h1>
            <p style={{
              fontSize: '0.9rem',
              color: 'var(--brand-secondary)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}>
              {publicTeam?.currentSeason ? `Stagione ${publicTeam.currentSeason.label}` : 'Stagione 2026/2027'}
            </p>
          </div>

          {themeTokens.isNeutralDefault && (
            <div style={{
              fontSize: '0.75rem',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              padding: '4px 12px',
              borderRadius: '9999px',
              color: 'var(--text-muted)',
            }}>
              Stile tecnico neutro (colori ufficiali squadra non ancora configurati)
            </div>
          )}
        </div>
      </section>

      {/* 2. Main Match Card: Prossima Partita o Risultato Recente */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={20} color="var(--brand-secondary)" />
            In Primo Piano
          </h2>
          <button
            onClick={() => setActiveTab('partite')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand-secondary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Tutte le partite <ChevronRight size={14} />
          </button>
        </div>

        {mainScheduledMatch ? (
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--brand-secondary)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                {mainScheduledMatch.competitionName || (mainScheduledMatch.isOfficial ? 'Gara Ufficiale' : 'Amichevole')}
              </span>

              <span style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: mainScheduledMatch.status === 'scheduled' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: mainScheduledMatch.status === 'scheduled' ? '#34d399' : 'var(--text-muted)',
              }}>
                {formatMatchStatus(mainScheduledMatch.status)}
              </span>
            </div>

            {/* Confronto Squadre */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 0',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffffff' }}>
                  {getTeamDisplayName(publicTeam?.name, isDemoData)}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Squadra Ufficiale</div>
              </div>

              <div style={{ textAlign: 'center', padding: '0 12px' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--brand-secondary)' }}>
                  VS
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffffff' }}>
                  {mainScheduledMatch.opponentName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Avversario</div>
              </div>
            </div>

            {/* Data e Orario reale */}
            <div style={{
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              padding: '12px 16px',
              borderRadius: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.85rem',
              color: 'var(--text-dim)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="var(--brand-secondary)" />
                <span>
                  {mainScheduledMatch.scheduledAt
                    ? formatDateTime(mainScheduledMatch.scheduledAt)
                    : 'Data e orario da definire'}
                </span>
              </div>
              <button
                onClick={() => {
                  setSelectedMatchId(mainScheduledMatch!.id);
                  setActiveTab('partite');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand-secondary)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Dettaglio gara <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            border: '1px dashed var(--border-subtle)',
            padding: '32px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
          }}>
            Nessuna partita programmata al momento nel calendario ufficiale.
          </div>
        )}
      </section>

      {/* 3. Card Secondaria: Ultimo Risultato o Partita Successiva */}
      {secondaryMatch && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-dim)' }}>
            Prossimo impegno in programma
          </h3>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {secondaryMatch.competitionName || (secondaryMatch.isOfficial ? 'Gara Ufficiale' : 'Amichevole')} • {formatMatchStatus(secondaryMatch.status)}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>
                {getTeamDisplayName(publicTeam?.name, isDemoData)} vs {secondaryMatch.opponentName}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--brand-secondary)', marginTop: '2px' }}>
                {secondaryMatch.scheduledAt ? formatDateTime(secondaryMatch.scheduledAt) : 'Data da definire'}
              </div>
            </div>

            <button
              onClick={() => {
                setSelectedMatchId(secondaryMatch!.id);
                setActiveTab('partite');
              }}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: '1px solid var(--border-subtle)',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Vedi scheda
            </button>
          </div>
        </section>
      )}

      {/* 4. Anteprima Classifica & Statistiche (Separazione Rigida REALE vs DEMO) */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Box Classifica */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#ffffff' }}>
              <Trophy size={18} color="var(--brand-secondary)" />
              Classifica Campionato
            </div>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px' }}>
                DEMO MOCK
              </span>
            )}
          </div>

          {isDemoData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {demoStandings.slice(0, 4).map((row) => (
                <div
                  key={row.position}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    backgroundColor: row.isOurTeam ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    border: row.isOurTeam ? '1px solid var(--brand-secondary)' : 'none',
                    fontSize: '0.82rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, width: '18px', color: row.isOurTeam ? 'var(--brand-secondary)' : 'var(--text-muted)' }}>
                      {row.position}°
                    </span>
                    <span style={{ fontWeight: row.isOurTeam ? 700 : 500, color: row.isOurTeam ? '#ffffff' : 'var(--text-dim)' }}>
                      {row.teamName}
                    </span>
                  </div>
                  <span style={{ fontWeight: 800, color: '#ffffff' }}>{row.points} pt</span>
                </div>
              ))}
              <button
                onClick={() => setActiveTab('partite')}
                style={{
                  marginTop: '8px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand-secondary)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                Vedi classifica completa →
              </button>
            </div>
          ) : (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              lineHeight: '1.4',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', marginBottom: '4px', fontWeight: 600 }}>
                <Info size={14} /> Dati non ancora disponibili
              </div>
              Il server Core (C1.1/C2) non ha ancora pubblicato le API di classifica per la stagione attiva.
            </div>
          )}
        </div>

        {/* Box Modulo Votazioni (Roadmap Fase 2) */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: '#ffffff' }}>
              <Vote size={18} color="var(--brand-secondary)" />
              Player of the Match (POTM)
            </div>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px' }}>
                DEMO MOCK
              </span>
            )}
          </div>

          {isDemoData ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
              <p style={{ margin: '0 0 10px 0' }}>
                Ultima votazione demo attiva per la gara ufficiale. Esprimi la tua preferenza per eleggere il migliore in campo.
              </p>
              <button
                onClick={() => setActiveTab('votazioni')}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid var(--brand-secondary)',
                  color: 'var(--brand-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Vai alle votazioni demo
              </button>
            </div>
          ) : (
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              lineHeight: '1.4',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--brand-secondary)', marginBottom: '4px', fontWeight: 600 }}>
                <Sparkles size={14} /> Roadmap Fase 2
              </div>
              Il servizio di voto POTM certificato verrà attivato nelle successive tappe di rilascio del backend.
            </div>
          )}
        </div>
      </section>

      {/* 5. Banner PWA per Installazione da Dispositivo Mobile/Desktop */}
      {showPwaBanner && (
        <section style={{
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '14px',
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-secondary)',
            }}>
              <Download size={20} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>
                Installa l'App sul tuo dispositivo
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Accesso istantaneo alla squadra direttamente dalla schermata Home (PWA).
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={installPwa}
              style={{
                backgroundColor: 'var(--brand-secondary)',
                color: '#0f172a',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Installa
            </button>
            <button
              onClick={dismissPwaBanner}
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Più tardi
            </button>
          </div>
        </section>
      )}
    </div>
  );
};

function formatMatchStatus(status: string): string {
  switch (status) {
    case 'scheduled':
      return 'In programma';
    case 'to_be_scheduled':
      return 'Data da definire';
    case 'postponed':
      return 'Rinviata';
    case 'cancelled':
      return 'Annullata';
    case 'completed':
      return 'Terminata';
    default:
      return status;
  }
}

function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}
