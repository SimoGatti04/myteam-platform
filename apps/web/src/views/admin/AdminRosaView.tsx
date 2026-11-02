import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { SeasonDto, PlayerDto, RosterMembershipDto } from '@myteam/contracts';
import {
  Users,
  PlusCircle,
  Shield,
  UserCheck,
  UserX,
  X,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Info,
  Calendar,
  Clock,
  ChevronDown
} from 'lucide-react';

export const AdminRosaView: React.FC<{
  openNewPlayerModal?: boolean;
  onCloseNewPlayerModal?: () => void;
}> = ({ openNewPlayerModal, onCloseNewPlayerModal }) => {
  const { adminTeam, isDemoData } = useApp();

  const [activeSubTab, setActiveSubTab] = useState<'appartenenze' | 'anagrafiche'>('appartenenze');
  const [seasons, setSeasons] = useState<SeasonDto[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');
  const [players, setPlayers] = useState<PlayerDto[]>([]);
  const [memberships, setMemberships] = useState<RosterMembershipDto[]>([]);
  const [membershipFilter, setMembershipFilter] = useState<'all' | 'active' | 'ended'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Membership / Player Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<'new' | 'existing'>('new');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [newDisplayName, setNewDisplayName] = useState<string>('');
  const [modalSeasonId, setModalSeasonId] = useState<string>('');
  const [newJerseyNumber, setNewJerseyNumber] = useState<string>('');
  const [activeFromDate, setActiveFromDate] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // End Membership Dialog State
  const [endingMembership, setEndingMembership] = useState<RosterMembershipDto | null>(null);
  const [endDateInput, setEndDateInput] = useState<string>('');
  const [endingSubmitting, setEndingSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [isDemoData, adminTeam?.currentSeasonId]);

  useEffect(() => {
    if (openNewPlayerModal) {
      openModal();
    }
  }, [openNewPlayerModal]);

  const loadData = async (preserveStatus = false) => {
    setLoading(true);
    if (!preserveStatus) {
      setStatusMsg(null);
    }

    if (isDemoData) {
      const demoSeasons = apiService.getDemoSeasons();
      const demoPlayers = apiService.getDemoPlayers();
      const currentSId = adminTeam?.currentSeasonId || demoSeasons[0]?.id || '';
      const demoMemberships = apiService.getDemoRosterMemberships(currentSId);

      setSeasons(demoSeasons);
      setSelectedSeasonId(currentSId);
      setModalSeasonId(currentSId);
      setPlayers(demoPlayers);
      setMemberships(demoMemberships);
    } else {
      // 1. Carica stagioni registrate
      const seasonsRes = await apiService.getAdminSeasons();
      let loadedSeasons: SeasonDto[] = [];
      if (seasonsRes.success) {
        loadedSeasons = seasonsRes.data;
        setSeasons(loadedSeasons);
      } else {
        setSeasons([]);
      }

      // Imposta stagione selezionata iniziale: currentSeason della squadra o prima disponibile
      const initialSeasonId = adminTeam?.currentSeasonId || (loadedSeasons.length > 0 ? loadedSeasons[0]!.id : '');
      setSelectedSeasonId(initialSeasonId);
      setModalSeasonId(initialSeasonId);

      // 2. Carica anagrafica giocatori registrati
      const playersRes = await apiService.getAdminPlayers();
      if (playersRes.success) {
        setPlayers(playersRes.data);
      } else {
        setPlayers([]);
      }

      // 3. Carica appartenenze della stagione corrente (o tutte se non impostata)
      await loadMembershipsForSeason(initialSeasonId || undefined);
    }

    setLoading(false);
  };

  const loadMembershipsForSeason = async (seasonId?: string) => {
    if (isDemoData) {
      const demo = apiService.getDemoRosterMemberships(seasonId);
      setMemberships(demo);
      return;
    }

    const memRes = await apiService.getAdminRosterMemberships(seasonId ? { seasonId } : undefined);
    if (memRes.success) {
      setMemberships(memRes.data);
    } else {
      setMemberships([]);
      setStatusMsg({
        type: 'error',
        text: `Errore caricamento tesseramenti (${memRes.status}): ${memRes.message}`,
      });
    }
  };

  const handleSeasonChange = async (newSeasonId: string) => {
    setSelectedSeasonId(newSeasonId);
    await loadMembershipsForSeason(newSeasonId || undefined);
  };

  const openModal = () => {
    setIsModalOpen(true);
    setStatusMsg(null);
    setNewDisplayName('');
    setNewJerseyNumber('');

    const targetSeason = seasons.find(s => s.id === modalSeasonId) || seasons[0];
    if (targetSeason) {
      setModalSeasonId(targetSeason.id);
      const today = new Date().toISOString().split('T')[0]!;
      if (today >= targetSeason.startsOn && today <= targetSeason.endsOn) {
        setActiveFromDate(today);
      } else {
        setActiveFromDate(targetSeason.startsOn);
      }
    } else {
      setActiveFromDate(new Date().toISOString().split('T')[0]!);
    }

    if (players.length > 0 && players[0]) {
      setPlayerMode('existing');
      setSelectedPlayerId(players[0].id);
    } else {
      setPlayerMode('new');
      setSelectedPlayerId('');
    }
  };

  const handleModalSeasonChange = (sId: string) => {
    setModalSeasonId(sId);
    const targetSeason = seasons.find(s => s.id === sId);
    if (targetSeason) {
      const today = new Date().toISOString().split('T')[0]!;
      if (today >= targetSeason.startsOn && today <= targetSeason.endsOn) {
        setActiveFromDate(today);
      } else {
        setActiveFromDate(targetSeason.startsOn);
      }
    }
  };

  const handleCreateOrAddMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSeasonId) {
      setStatusMsg({ type: 'error', text: 'Seleziona una stagione per il tesseramento.' });
      return;
    }

    if (!activeFromDate) {
      setStatusMsg({ type: 'error', text: 'La data di inizio tesseramento (activeFrom) è obbligatoria.' });
      return;
    }

    const jerseyNum = newJerseyNumber.trim() ? parseInt(newJerseyNumber.trim(), 10) : null;
    if (jerseyNum !== null && (isNaN(jerseyNum) || jerseyNum < 0 || jerseyNum > 99)) {
      setStatusMsg({ type: 'error', text: 'Il numero di maglia deve essere compreso tra 0 e 99.' });
      return;
    }

    setSubmitting(true);
    setStatusMsg(null);

    let targetPlayerId = selectedPlayerId;
    let targetDisplayName = '';

    if (playerMode === 'new') {
      const trimmedName = newDisplayName.trim();
      if (!trimmedName) {
        setSubmitting(false);
        setStatusMsg({ type: 'error', text: 'Inserisci il nome del nuovo giocatore.' });
        return;
      }
      targetDisplayName = trimmedName;
    } else {
      if (!targetPlayerId) {
        setSubmitting(false);
        setStatusMsg({ type: 'error', text: 'Seleziona un giocatore registrato in anagrafica.' });
        return;
      }
      const existing = players.find(p => p.id === targetPlayerId);
      targetDisplayName = existing?.displayName || 'Giocatore';
    }

    if (isDemoData) {
      // Demo mock locale
      if (playerMode === 'new') {
        const mockPlayerId = `demo-player-${Date.now()}`;
        const newP: PlayerDto = { id: mockPlayerId, displayName: targetDisplayName };
        setPlayers(prev => [newP, ...prev]);
        targetPlayerId = mockPlayerId;
      }

      const newMem: RosterMembershipDto = {
        id: `demo-mem-${Date.now()}`,
        playerId: targetPlayerId,
        seasonId: modalSeasonId,
        jerseyNumber: jerseyNum,
        activeFrom: activeFromDate,
        activeUntil: null,
      };

      setMemberships(prev => [newMem, ...prev]);
      setSubmitting(false);
      setIsModalOpen(false);
      if (onCloseNewPlayerModal) onCloseNewPlayerModal();
      setStatusMsg({
        type: 'success',
        text: `Giocatore "${targetDisplayName}" tesserato con successo nella rosa (DEMO).`,
      });
      return;
    }

    // Modalità REALE: se playerMode === 'new', chiama POST /api/v1/admin/players
    if (playerMode === 'new') {
      const createPlayerRes = await apiService.createPlayer({
        displayName: targetDisplayName,
      });

      if (!createPlayerRes.success) {
        setSubmitting(false);
        setStatusMsg({
          type: 'error',
          text: `Errore creazione anagrafica giocatore (${createPlayerRes.status}): ${createPlayerRes.message}`,
        });
        return;
      }

      targetPlayerId = createPlayerRes.data.id;
      targetDisplayName = createPlayerRes.data.displayName;
      setPlayers(prev => [createPlayerRes.data, ...prev]);
    }

    // Crea appartenenza con POST /api/v1/admin/roster-memberships
    const membershipRes = await apiService.createRosterMembership({
      playerId: targetPlayerId,
      seasonId: modalSeasonId,
      jerseyNumber: jerseyNum,
      activeFrom: activeFromDate,
    });

    setSubmitting(false);

    if (membershipRes.success) {
      setIsModalOpen(false);
      if (onCloseNewPlayerModal) onCloseNewPlayerModal();
      setStatusMsg({
        type: 'success',
        text: `Giocatore "${targetDisplayName}" tesserato con successo nella rosa per la stagione selezionata!`,
      });
      await loadMembershipsForSeason(selectedSeasonId || undefined);
    } else {
      setStatusMsg({
        type: 'error',
        text: `Errore creazione tesseramento (${membershipRes.status}): ${membershipRes.message}`,
      });
    }
  };

  const openEndMembershipDialog = (membership: RosterMembershipDto) => {
    setEndingMembership(membership);
    const today = new Date().toISOString().split('T')[0]!;
    setEndDateInput(today);
  };

  const handleEndMembershipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endingMembership || !endDateInput) return;

    setEndingSubmitting(true);
    setStatusMsg(null);

    if (isDemoData) {
      setMemberships(prev => prev.map(m => {
        if (m.id === endingMembership.id) {
          return { ...m, activeUntil: endDateInput };
        }
        return m;
      }));
      setEndingSubmitting(false);
      setEndingMembership(null);
      setStatusMsg({
        type: 'success',
        text: 'Tesseramento concluso con successo (DEMO).',
      });
      return;
    }

    // Chiamata REALE: POST /api/v1/admin/roster-memberships/:id/end
    const res = await apiService.endRosterMembership(endingMembership.id, {
      activeUntil: endDateInput,
    });

    setEndingSubmitting(false);

    if (res.success) {
      setEndingMembership(null);
      setStatusMsg({
        type: 'success',
        text: 'Tesseramento concluso con successo nel database Core!',
      });
      await loadMembershipsForSeason(selectedSeasonId || undefined);
    } else {
      setStatusMsg({
        type: 'error',
        text: `Errore conclusione tesseramento (${res.status}): ${res.message}`,
      });
    }
  };

  // Mappa giocatori e stagioni per visualizzazione immediata
  const playerNameMap = new Map<string, string>();
  for (const p of players) {
    playerNameMap.set(p.id, p.displayName);
  }

  const seasonMap = new Map<string, SeasonDto>();
  for (const s of seasons) {
    seasonMap.set(s.id, s);
  }

  const filteredMemberships = memberships.filter(m => {
    if (membershipFilter === 'active') return m.activeUntil === null;
    if (membershipFilter === 'ended') return m.activeUntil !== null;
    return true;
  });

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              Gestione Rosa & Tesseramenti
            </h2>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                DEMO MOCK
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Anagrafica atleti, appartenenze stagionali, numeri di maglia e storico uscite
          </p>
        </div>

        <div>
          <button
            onClick={openModal}
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
            <PlusCircle size={16} /> Tessera Giocatore
          </button>
        </div>
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
            <strong>Integrazione Core C1.1:</strong> Gestione tesseramenti stagionali <code>GET /api/v1/admin/roster-memberships</code>, creazione atleti <code>POST /api/v1/admin/players</code> e conclusione tesseramento <code>POST .../end</code> con preservazione storico.
          </span>
        </div>
      )}

      {/* Sottosezioni Rosa (Appartenenze vs Anagrafica atleti) */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '8px',
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => setActiveSubTab('appartenenze')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'appartenenze' ? 700 : 500,
            backgroundColor: activeSubTab === 'appartenenze' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            color: activeSubTab === 'appartenenze' ? '#ffffff' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={16} /> Rosa Stagionale & Tesseramenti ({memberships.length})
        </button>
        <button
          onClick={() => setActiveSubTab('anagrafiche')}
          style={{
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'anagrafiche' ? 700 : 500,
            backgroundColor: activeSubTab === 'anagrafiche' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeSubTab === 'anagrafiche' ? '#60a5fa' : 'var(--text-muted)',
            border: activeSubTab === 'anagrafiche' ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Shield size={16} /> Anagrafica Giocatori ({players.length})
        </button>
      </div>

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

      {/* VISTA 1: APPARTENENZE E TESSERAMENTI */}
      {activeSubTab === 'appartenenze' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Barra Filtri: Selezione Stagione & Filtro Stato */}
          <div style={{
            backgroundColor: 'var(--bg-card)',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                Stagione:
              </label>
              <select
                value={selectedSeasonId}
                onChange={(e) => handleSeasonChange(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  color: '#ffffff',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="">Tutte le stagioni</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.startsOn} - {s.endsOn}) {s.id === adminTeam?.currentSeasonId ? '★ Corrente' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'active', 'ended'] as const).map(tabKey => (
                <button
                  key={tabKey}
                  onClick={() => setMembershipFilter(tabKey)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: membershipFilter === tabKey ? 700 : 500,
                    backgroundColor: membershipFilter === tabKey ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    color: membershipFilter === tabKey ? '#ffffff' : 'var(--text-muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {tabKey === 'all' && `Tutti (${memberships.length})`}
                  {tabKey === 'active' && `Attivi (${memberships.filter(m => m.activeUntil === null).length})`}
                  {tabKey === 'ended' && `Conclusi (${memberships.filter(m => m.activeUntil !== null).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Tabella Tesseramenti */}
          {loading ? (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.9rem',
            }}>
              Caricamento tesseramenti della rosa...
            </div>
          ) : filteredMemberships.length > 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto',
              maxWidth: '100%',
              WebkitOverflowScrolling: 'touch',
            }} className="table-responsive">
              <table style={{ width: '100%', minWidth: '580px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>N°</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Giocatore</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Stagione</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Periodo di Validità</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Stato</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMemberships.map((m) => {
                    const playerName = playerNameMap.get(m.playerId) || 'Giocatore Sconosciuto';
                    const seasonObj = seasonMap.get(m.seasonId);
                    const isMembershipActive = m.activeUntil === null;

                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--brand-secondary)' }}>
                          {m.jerseyNumber !== null ? `#${m.jerseyNumber}` : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#ffffff' }}>
                          {playerName}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-dim)' }}>
                          {seasonObj ? seasonObj.label : m.seasonId}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          dal {m.activeFrom} {m.activeUntil ? `al ${m.activeUntil}` : '(in corso)'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {isMembershipActive ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}>
                              <UserCheck size={12} /> Attivo
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: 'rgba(100, 116, 139, 0.2)',
                              color: '#94a3b8',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                            }}>
                              <UserX size={12} /> Concluso
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          {isMembershipActive && (
                            <button
                              onClick={() => openEndMembershipDialog(m)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Termina Tesseramento
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px dashed var(--border-subtle)',
              padding: '40px 24px',
              textAlign: 'center',
            }}>
              <Users size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                Nessun tesseramento trovato per la selezione
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Non risultano atleti tesserati per i filtri impostati.
              </p>
              <button
                onClick={openModal}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--brand-secondary)',
                  color: '#0f172a',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Tessera un Giocatore
              </button>
            </div>
          )}
        </div>
      )}

      {/* VISTA 2: ANAGRAFICA GIOCATORI */}
      {activeSubTab === 'anagrafiche' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {players.length > 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              overflowX: 'auto',
              maxWidth: '100%',
              WebkitOverflowScrolling: 'touch',
            }} className="table-responsive">
              <table style={{ width: '100%', minWidth: '580px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.7)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>ID Anagrafica</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Nome Visualizzato</th>
                    <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Tesseramenti Totali</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const totalMemberships = memberships.filter(m => m.playerId === p.id).length;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {p.id}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: '#ffffff' }}>
                          {p.displayName}
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-dim)' }}>
                          {totalMemberships} stagioni/periodi
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px dashed var(--border-subtle)',
              padding: '40px 24px',
              textAlign: 'center',
            }}>
              <Users size={40} color="var(--text-muted)" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Nessun giocatore registrato in anagrafica.
              </p>
            </div>
          )}
        </div>
      )}

      {/* MODAL: NUOVO TESSERAMENTO / GIOCATORE */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
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
                Tessera Giocatore nella Rosa
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

            <form onSubmit={handleCreateOrAddMembership} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Modalità Giocatore: Esistente o Nuovo */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Anagrafica Giocatore
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setPlayerMode('existing')}
                    disabled={players.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: playerMode === 'existing' ? 700 : 500,
                      backgroundColor: playerMode === 'existing' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: playerMode === 'existing' ? '#60a5fa' : 'var(--text-muted)',
                      border: playerMode === 'existing' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                      cursor: players.length === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Seleziona Esistente ({players.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerMode('new')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: playerMode === 'new' ? 700 : 500,
                      backgroundColor: playerMode === 'new' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: playerMode === 'new' ? '#60a5fa' : 'var(--text-muted)',
                      border: playerMode === 'new' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                    }}
                  >
                    + Nuovo Giocatore
                  </button>
                </div>

                {playerMode === 'existing' ? (
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
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
                    {players.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} ({p.id.slice(0, 8)}...)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="Nome e Cognome (es. Marco Rossi)"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    maxLength={100}
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

              {/* Selezione Stagione */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Stagione di Tesseramento *
                </label>
                <select
                  value={modalSeasonId}
                  onChange={(e) => handleModalSeasonChange(e.target.value)}
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
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.startsOn} - {s.endsOn}) {s.id === adminTeam?.currentSeasonId ? '★ Corrente' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campi Dettaglio: Numero Maglia & Data Inizio */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Numero Maglia (0-99)
                  </label>
                  <input
                    type="number"
                    placeholder="Opzionale (es. 10)"
                    min={0}
                    max={99}
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Valido dal (activeFrom) *
                  </label>
                  <input
                    type="date"
                    value={activeFromDate}
                    onChange={(e) => setActiveFromDate(e.target.value)}
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
                    required
                  />
                </div>
              </div>

              {/* Bottoni Azione */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    if (onCloseNewPlayerModal) onCloseNewPlayerModal();
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? 'Registrazione...' : 'Conferma Tesseramento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIALOG: TERMINA TESSERAMENTO */}
      {endingMembership && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
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
            maxWidth: '440px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>
              Termina Tesseramento Giocatore
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Imposta la data di fine validità per <strong>{playerNameMap.get(endingMembership.playerId) || 'Giocatore'}</strong> (Maglia: {endingMembership.jerseyNumber ? `#${endingMembership.jerseyNumber}` : '—'}). L'atleta non sarà rimosso dal database ma apparirà nello storico come non più attivo.
            </p>

            <form onSubmit={handleEndMembershipSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Data di Uscita (activeUntil) *
                </label>
                <input
                  type="date"
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  min={endingMembership.activeFrom}
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
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEndingMembership(null)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={endingSubmitting}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: endingSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {endingSubmitting ? 'Salvataggio...' : 'Conferma Conclusione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
