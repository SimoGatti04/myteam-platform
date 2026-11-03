import { getTeamDisplayName } from '../utils/branding';
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiService } from '../services/api';
import type { PublicMatchDto, PublicMatchesDto } from '@myteam/contracts';
import type { MatchDetail, StandingRow } from '../types/domain';
import { MatchDetailDialog } from './match/MatchDetailDialog';
import { readW4PreviewState, type W4PreviewState } from '../utils/preview';
import {
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Filter,
  ChevronLeft,
  ChevronRight,
  Award,
  AlertCircle,
  HelpCircle,
  Info,
  Sparkles,
  RefreshCw,
  X
} from 'lucide-react';

export const PartiteView: React.FC = () => {
  const { publicTeam, selectedMatchId, setSelectedMatchId, dataMode, isDemoData } = useApp();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Real data state
  const [realMatches, setRealMatches] = useState<PublicMatchesDto | null>(null);

  // Demo data state
  const [demoMatches, setDemoMatches] = useState<MatchDetail[]>([]);
  const [demoStandings, setDemoStandings] = useState<StandingRow[]>([]);

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'calendario' | 'classifica'>('calendario');
  const [selectedComp, setSelectedComp] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [previewState, setPreviewState] = useState<W4PreviewState>(() => (isDemoData ? readW4PreviewState() : 'ready'));

  useEffect(() => {
    loadPartiteData();
  }, [dataMode]);

  const loadPartiteData = async () => {
    setLoading(true);
    setErrorMsg(null);

    if (dataMode === 'demo') {
      setDemoMatches(apiService.getDemoMatchDetails());
      setDemoStandings(apiService.getDemoStandings());
      setLoading(false);
      return;
    }

    const res = await apiService.getPublicMatches();
    if (res.success) {
      setRealMatches(res.data);
      setErrorMsg(null);
    } else {
      setRealMatches(null);
      if (res.status === 404) {
        setErrorMsg('Partite non ancora pubblicate. Il calendario è attualmente in bozza.');
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
        <div>Caricamento calendario partite...</div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Costruzione lista unificata delle partite
  const allMatchesList: Array<{
    id: string;
    opponentName: string;
    competitionName: string | null;
    isOfficial: boolean;
    scheduledAt: string | null;
    status: string;
    isDemo: boolean;
    // campi extra solo per demo
    demoDetail?: MatchDetail;
  }> = [];

  if (isDemoData) {
    for (const m of demoMatches) {
      allMatchesList.push({
        id: m.id,
        opponentName: m.isHome ? m.awayTeamName : m.homeTeamName,
        competitionName: m.competitionName || null,
        isOfficial: m.isOfficial,
        scheduledAt: m.scheduledAt,
        status: m.status,
        isDemo: true,
        demoDetail: m,
      });
    }
  } else if (realMatches) {
    // Ordine cronologico delle gare programmate
    const sortedScheduled = [...realMatches.scheduled].sort((a, b) => {
      if (!a.scheduledAt) return 1;
      if (!b.scheduledAt) return -1;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });

    for (const m of sortedScheduled) {
      allMatchesList.push({ ...m, isDemo: false });
    }
    for (const m of realMatches.toBeScheduled) {
      allMatchesList.push({ ...m, isDemo: false });
    }
  }

  // Filtraggio
  const filteredMatches = allMatchesList.filter(m => {
    if (selectedComp !== 'all' && (m.competitionName || 'Altro') !== selectedComp) {
      return false;
    }
    if (statusFilter === 'scheduled' && m.status !== 'scheduled' && m.status !== 'to_be_scheduled') {
      return false;
    }
    if (statusFilter === 'completed' && m.status !== 'completed') {
      return false;
    }
    return true;
  });

  // Competizioni disponibili per il filtro
  const competitionOptions = Array.from(new Set(allMatchesList.map(m => m.competitionName || 'Altro')));

  // Partita selezionata per dettaglio
  const activeSelectedMatch = selectedMatchId
    ? allMatchesList.find(m => m.id === selectedMatchId)
    : null;

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header & Sub-Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
            Partite & Calendario
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Gare ufficiali e amichevoli della stagione {publicTeam?.currentSeason?.label || '2026/2027'}
          </p>
        </div>

        {/* Toggle Sottosezioni: Calendario vs Classifica */}
        <div style={{
          display: 'flex',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '10px',
          padding: '4px',
          border: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={() => setActiveTab('calendario')}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'calendario' ? 700 : 500,
              backgroundColor: activeTab === 'calendario' ? 'var(--brand-secondary)' : 'transparent',
              color: activeTab === 'calendario' ? '#0f172a' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Calendar size={14} /> Calendario
          </button>
          <button
            onClick={() => setActiveTab('classifica')}
            style={{
              padding: '6px 16px',
              borderRadius: '7px',
              fontSize: '0.82rem',
              fontWeight: activeTab === 'classifica' ? 700 : 500,
              backgroundColor: activeTab === 'classifica' ? 'var(--brand-secondary)' : 'transparent',
              color: activeTab === 'classifica' ? '#0f172a' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Trophy size={14} /> Classifica
          </button>
        </div>
      </div>

      {/* VISTA 1: CALENDARIO PARTITE */}
      {activeTab === 'calendario' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Filtri */}
          <div style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            alignItems: 'center',
            backgroundColor: 'var(--bg-card)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <Filter size={14} /> Filtra per:
            </div>

            {/* Filtro Competizione */}
            <select
              value={selectedComp}
              onChange={(e) => setSelectedComp(e.target.value)}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                color: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            >
              <option value="all">Tutte le competizioni</option>
              {competitionOptions.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Filtro Stato */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                color: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '0.8rem',
                outline: 'none',
              }}
            >
              <option value="all">Tutti gli stati</option>
              <option value="scheduled">In programma</option>
              <option value="completed">Completate</option>
            </select>

            <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {filteredMatches.length} partite trovate
            </div>
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

          {/* Elenco Cronologico Partite */}
          {filteredMatches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredMatches.map((match) => (
                <div
                  key={match.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedMatchId(match.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedMatchId(match.id);
                    }
                  }}
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '14px',
                    border: '1px solid var(--border-subtle)',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(59, 130, 246, 0.15)',
                        color: 'var(--brand-secondary)',
                      }}>
                        {match.competitionName || (match.isOfficial ? 'Gara Ufficiale' : 'Amichevole')}
                      </span>
                      {match.isDemo && (
                        <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 6px', borderRadius: '4px' }}>
                          DEMO
                        </span>
                      )}
                    </div>

                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: match.status === 'scheduled' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                      color: match.status === 'scheduled' ? '#34d399' : 'var(--text-muted)',
                    }}>
                      {formatMatchStatus(match.status)}
                    </span>
                  </div>

                  {/* Informazioni Squadre e Risultato (Onesto: Niente punteggi fittizi in Real Mode) */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 0',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#ffffff' }}>
                      {getTeamDisplayName(publicTeam?.name, isDemoData)} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>vs</span> {match.opponentName}
                    </div>

                    {match.isDemo && match.demoDetail?.homeScore !== undefined ? (
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--brand-secondary)' }}>
                        {match.demoDetail.homeScore} - {match.demoDetail.awayScore}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {match.status === 'completed' ? 'Terminata' : 'In programma'}
                      </div>
                    )}
                  </div>

                  {/* Data e Dettagli */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    color: 'var(--text-dim)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    paddingTop: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} color="var(--brand-secondary)" />
                      <span>{match.scheduledAt ? formatDateTime(match.scheduledAt) : 'Data da definire'}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-secondary)', fontWeight: 600 }}>
                      Scheda partita <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '14px',
              border: '1px dashed var(--border-subtle)',
              padding: '36px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}>
              Nessuna partita corrisponde ai criteri di filtro selezionati.
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: CLASSIFICA (Rigidamente isolata da dati falsi) */}
      {activeTab === 'classifica' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isDemoData ? (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                  Classifica Campionato (Dimostrativa)
                </h3>
                <span style={{ fontSize: '0.7rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px' }}>
                  DEMO MOCK
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '8px' }}>Pos</th>
                      <th style={{ padding: '8px' }}>Squadra</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>G</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>V</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>N</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>P</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>GF</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>GS</th>
                      <th style={{ padding: '8px', textAlign: 'center' }}>Pt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demoStandings.map((row) => (
                      <tr
                        key={row.position}
                        style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          backgroundColor: row.isOurTeam ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: row.isOurTeam ? 'var(--brand-secondary)' : '#ffffff' }}>
                          {row.position}°
                        </td>
                        <td style={{ padding: '10px 8px', fontWeight: row.isOurTeam ? 700 : 500, color: '#ffffff' }}>
                          {row.teamName} {row.isOurTeam && <span style={{ fontSize: '0.7rem', color: 'var(--brand-secondary)' }}>(Noi)</span>}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.played}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.won}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.drawn}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.lost}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.goalsFor}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--text-dim)' }}>{row.goalsAgainst}</td>
                        <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 800, color: '#ffffff' }}>{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '36px 24px',
              textAlign: 'center',
            }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: 'var(--brand-secondary)',
              }}>
                <Trophy size={28} />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                Classifica non ancora pubblicata
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto', lineHeight: '1.5' }}>
                Il server Core (C1.1/C2) non ha ancora reso disponibili le API per la pubblicazione della classifica di campionato. I dati ufficiali appariranno qui automaticamente appena integrati.
              </p>
            </div>
          )}
        </div>
      )}

      {/* DETTAGLIO PARTITA — componente riusabile con stati anteprima */}
      {activeSelectedMatch && (
        <MatchDetailDialog
          match={activeSelectedMatch.isDemo ? activeSelectedMatch.demoDetail ?? null : null}
          error={
            activeSelectedMatch.isDemo
              ? null
              : 'Il dettaglio del tabellino richiede il contratto Core C2 (risultati ed eventi), non ancora pubblicato. Nessun dato è stato simulato in modalità reale.'
          }
          previewState={isDemoData ? previewState : 'ready'}
          isDemo={activeSelectedMatch.isDemo}
          onClose={() => setSelectedMatchId(null)}
          onRetry={loadPartiteData}
          onPreviewStateChange={isDemoData ? setPreviewState : undefined}
          onOpenAdminReport={activeSelectedMatch.isDemo ? (match) => {
            window.location.assign(`?demo=true&preview=admin-report&match=${encodeURIComponent(match.id)}`);
          } : undefined}
        />
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
