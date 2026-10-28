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
  const [endReasonInput, setEndReasonInput] = useState<string>('');
  const [endingSubmitting, setEndingSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [isDemoData]);

  useEffect(() => {
    if (openNewPlayerModal) {
      openModal();
    }
  }, [openNewPlayerModal]);

  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);

    if (isDemoData) {
      const demoSeasons = apiService.getDemoSeasons();
      const demoPlayers = apiService.getDemoPlayers();
      const currentSeason = demoSeasons.find(s => s.id === adminTeam?.currentSeasonId) || demoSeasons[0];
      const initialSeasonId = currentSeason ? currentSeason.id : '';

      setSeasons(demoSeasons);
      setSelectedSeasonId(initialSeasonId);
      setModalSeasonId(initialSeasonId);
      setPlayers(demoPlayers);
      setMemberships(apiService.getDemoRosterMemberships(initialSeasonId));
      setLoading(false);
      return;
    }

    // Modalità REALE: Letture C1.1
    const [seasonsRes, playersRes] = await Promise.all([
      apiService.getAdminSeasons(),
      apiService.getAdminPlayers(),
    ]);

    if (!seasonsRes.success) {
      setStatusMsg({
        type: 'error',
        text: `Errore caricamento stagioni (${seasonsRes.status}): ${seasonsRes.message}`,
      });
      setLoading(false);
      return;
    }

    if (!playersRes.success) {
      setStatusMsg({
        type: 'error',
        text: `Errore caricamento anagrafiche giocatori (${playersRes.status}): ${playersRes.message}`,
      });
      setLoading(false);
      return;
    }

    const loadedSeasons = seasonsRes.data;
    const loadedPlayers = playersRes.data;
    setSeasons(loadedSeasons);
    setPlayers(loadedPlayers);

    // Determina la stagione iniziale (quella corrente o la prima disponibile)
    const initialSeason = loadedSeasons.find(s => s.id === adminTeam?.currentSeasonId) || loadedSeasons[0];
    const initialSid = initialSeason ? initialSeason.id : '';
    setSelectedSeasonId(initialSid);
    setModalSeasonId(initialSid);

    await loadMembershipsForSeason(initialSid);
    setLoading(false);
  };

  const loadMembershipsForSeason = async (seasonId?: string) => {
    if (isDemoData) {
      setMemberships(apiService.getDemoRosterMemberships(seasonId || undefined));
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
    setNewDisplayName('');
    setNewJerseyNumber('');
    const sId = selectedSeasonId || (seasons[0] ? seasons[0].id : '');
    setModalSeasonId(sId);

    // Imposta activeFrom in modo coerente con l'intervallo della stagione selezionata
    const targetSeason = seasons.find(s => s.id === sId) || seasons[0];
    if (targetSeason) {
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

    const targetSeason = seasons.find(s => s.id === modalSeasonId);
    if (targetSeason) {
      if (activeFromDate < targetSeason.startsOn || activeFromDate > targetSeason.endsOn) {
        setStatusMsg({
          type: 'error',
          text: `La data di inizio (${activeFromDate}) deve ricadere nell'intervallo della stagione (${targetSeason.startsOn} - ${targetSeason.endsOn}).`,
        });
        return;
      }
    }

    setSubmitting(true);
    setStatusMsg(null);

    const parsedJerseyNumber = newJerseyNumber ? parseInt(newJerseyNumber, 10) : null;

    if (isDemoData) {
      let playerId = selectedPlayerId;
      let displayName = '';

      if (playerMode === 'new') {
        playerId = `demo-pl-${Date.now()}`;
        displayName = newDisplayName.trim() || 'Nuovo Giocatore';
        const newPl: PlayerDto = { id: playerId, displayName };
        setPlayers(prev => [newPl, ...prev]);
      } else {
        const found = players.find(p => p.id === selectedPlayerId);
        displayName = found ? found.displayName : 'Giocatore';
      }

      const newMem: RosterMembershipDto = {
        id: `demo-rm-${Date.now()}`,
        playerId,
        seasonId: modalSeasonId,
        jerseyNumber: parsedJerseyNumber,
        activeFrom: activeFromDate,
        activeUntil: null,
      };

      setMemberships(prev => [newMem, ...prev]);
      setSubmitting(false);
      setIsModalOpen(false);
      if (onCloseNewPlayerModal) onCloseNewPlayerModal();
      setStatusMsg({
        type: 'success',
        text: `Tesseramento DEMO registrato per ${displayName}.`,
      });
      return;
    }

    // Modalità REALE
    let targetPlayerId = selectedPlayerId;
    let targetDisplayName = '';

    if (playerMode === 'new') {
      if (!newDisplayName.trim()) {
        setStatusMsg({ type: 'error', text: 'Inserisci il nome del nuovo giocatore.' });
        setSubmitting(false);
        return;
      }

      const createPlayerRes = await apiService.createPlayer({
        displayName: newDisplayName.trim(),
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
    } else {
      const p = players.find(x => x.id === selectedPlayerId);
      targetDisplayName = p ? p.displayName : 'Giocatore';
    }

    const memRes = await apiService.createRosterMembership({
      playerId: targetPlayerId,
      seasonId: modalSeasonId,
      jerseyNumber: parsedJerseyNumber,
      activeFrom: activeFromDate,
      activeUntil: null,
    });

    setSubmitting(false);

    if (!memRes.success) {
      setStatusMsg({
        type: 'error',
        text: `Errore registrazione tesseramento (${memRes.status}): ${memRes.message}`,
      });
      return;
    }

    setIsModalOpen(false);
    if (onCloseNewPlayerModal) onCloseNewPlayerModal();
    setStatusMsg({
      type: 'success',
      text: `Tesseramento registrato con successo per ${targetDisplayName} (${memRes.data.activeFrom}).`,
    });

    // Ricarica appartenenze
    await loadMembershipsForSeason(selectedSeasonId || undefined);
  };

  const handleEndMembershipSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endingMembership || !endDateInput) return;

    setEndingSubmitting(true);
    setStatusMsg(null);

    if (isDemoData) {
      setMemberships(prev =>
        prev.map(m => (m.id === endingMembership.id ? { ...m, activeUntil: endDateInput } : m))
      );
      setEndingSubmitting(false);
      setEndingMembership(null);
      setStatusMsg({
        type: 'success',
        text: 'Tesseramento terminato nell\'anteprima DEMO.',
      });
      return;
    }

    const res = await apiService.endRosterMembership(endingMembership.id, {
      activeUntil: endDateInput,
      reason: endReasonInput.trim() || undefined,
    });

    setEndingSubmitting(false);
    setEndingMembership(null);

    if (!res.success) {
      setStatusMsg({
        type: 'error',
        text: `Errore chiusura tesseramento (${res.status}): ${res.message}`,
      });
      return;
    }

    setStatusMsg({
      type: 'success',
      text: `Tesseramento concluso con data ${res.data.activeUntil}.`,
    });

    await loadMembershipsForSeason(selectedSeasonId || undefined);
  };

  const openEndMembershipDialog = (mem: RosterMembershipDto) => {
    setEndingMembership(mem);
    const targetSeason = seasons.find(s => s.id === mem.seasonId);
    const today = new Date().toISOString().split('T')[0]!;
    if (targetSeason && today > targetSeason.endsOn) {
      setEndDateInput(targetSeason.endsOn);
    } else if (today < mem.activeFrom) {
      setEndDateInput(mem.activeFrom);
    } else {
      setEndDateInput(today);
    }
    setEndReasonInput('');
  };

  // Mappa di supporto per i nomi giocatori
  const playerNameMap = new Map<string, string>();
  for (const p of players) {
    playerNameMap.set(p.id, p.displayName);
  }

  // Mappa di supporto per le stagioni
  const seasonMap = new Map<string, SeasonDto>();
  for (const s of seasons) {
    seasonMap.set(s.id, s);
  }

  // Filtro memberships
  const filteredMemberships = memberships.filter(m => {
    if (membershipFilter === 'active') return m.activeUntil === null;
    if (membershipFilter === 'ended') return m.activeUntil !== null;
    return true;
  });

  const selectedSeasonObj = seasons.find(s => s.id === modalSeasonId);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Gestione Rosa */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
            Gestione Rosa & Tesseramenti
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Anagrafica identità giocatori, appartenenze storiche e tesseramenti per stagione (Core C1.1).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => loadData()}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Aggiorna
          </button>
          <button
            onClick={openModal}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              backgroundColor: 'var(--brand-secondary)',
              color: '#0f172a',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
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

      {/* Sub Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        <button
          onClick={() => setActiveSubTab('appartenenze')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: activeSubTab === 'appartenenze' ? 700 : 500,
            backgroundColor: activeSubTab === 'appartenenze' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
            color: activeSubTab === 'appartenenze' ? '#60a5fa' : 'var(--text-muted)',
            border: activeSubTab === 'appartenenze' ? '1px solid rgba(59, 130, 246, 0.3)' : 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Users size={16} /> Appartenenze Stagionali ({memberships.length})
        </button>
        <button
          onClick={() => setActiveSubTab('anagrafiche')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
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
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  {tabKey === 'all' && 'Tutti'}
                  {tabKey === 'active' && 'Solo Attivi'}
                  {tabKey === 'ended' && 'Conclusi'}
                </button>
              ))}
            </div>
          </div>

          {/* Tabella Tesseramenti */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
              Caricamento dati rosa e tesseramenti in corso...
            </div>
          ) : filteredMemberships.length > 0 ? (
            <div style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
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
                          Dal {m.activeFrom} {m.activeUntil ? `al ${m.activeUntil}` : '— a tempo indet.'}
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
                              Termina
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
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Non ci sono giocatori tesserati per la stagione selezionata o con il filtro attivo.
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
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
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
                    onClick={() => setPlayerMode('new')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: playerMode === 'new' ? 'var(--brand-secondary)' : 'rgba(255, 255, 255, 0.05)',
                      color: playerMode === 'new' ? '#0f172a' : 'var(--text-muted)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Nuova Anagrafica
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerMode('existing')}
                    disabled={players.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: playerMode === 'existing' ? 'var(--brand-secondary)' : 'rgba(255, 255, 255, 0.05)',
                      color: playerMode === 'existing' ? '#0f172a' : 'var(--text-muted)',
                      border: 'none',
                      cursor: players.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: players.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Giocatore Esistente ({players.length})
                  </button>
                </div>

                {playerMode === 'new' ? (
                  <input
                    type="text"
                    placeholder="es. Mario Rossi (o nome d'arte)"
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
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-subtle)',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                  >
                    {players.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.displayName} (ID: {p.id.slice(0, 8)}...)
                      </option>
                    ))}
                  </select>
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
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
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

              {/* Data Inizio Tesseramento (coerente con la stagione) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                    Data Inizio Tesseramento *
                  </label>
                  {selectedSeasonObj && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Intervallo stagione: {selectedSeasonObj.startsOn} → {selectedSeasonObj.endsOn}
                    </span>
                  )}
                </div>
                <input
                  type="date"
                  value={activeFromDate}
                  min={selectedSeasonObj?.startsOn}
                  max={selectedSeasonObj?.endsOn}
                  onChange={(e) => setActiveFromDate(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Non vincolata alla data odierna: può essere retrodatata o impostata all'inizio della stagione.
                </p>
              </div>

              {/* Numero di Maglia */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Numero di Maglia (opzionale, 0-99)
                </label>
                <input
                  type="number"
                  placeholder="es. 10"
                  min="0"
                  max="99"
                  value={newJerseyNumber}
                  onChange={(e) => setNewJerseyNumber(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    if (onCloseNewPlayerModal) onCloseNewPlayerModal();
                  }}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
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
                    padding: '10px 20px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Salvataggio...' : 'Conferma Tesseramento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TERMINA TESSERAMENTO */}
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
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                Termina Tesseramento
              </h3>
              <button
                onClick={() => setEndingMembership(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Imposta la data di fine per il tesseramento di{' '}
              <strong>{playerNameMap.get(endingMembership.playerId) || 'questo giocatore'}</strong>.
              Lo storico del giocatore rimarrà preservato nelle gare e nelle distinte disputate.
            </p>

            <form onSubmit={handleEndMembershipSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Data Fine Tesseramento *
                </label>
                <input
                  type="date"
                  value={endDateInput}
                  min={endingMembership.activeFrom}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Motivazione / Note (opzionale)
                </label>
                <input
                  type="text"
                  placeholder="es. Trasferimento, fine prestito, infortunio"
                  value={endReasonInput}
                  onChange={(e) => setEndReasonInput(e.target.value)}
                  maxLength={500}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEndingMembership(null)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
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
                    padding: '10px 20px',
                    borderRadius: '8px',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: endingSubmitting ? 'not-allowed' : 'pointer',
                    opacity: endingSubmitting ? 0.7 : 1,
                  }}
                >
                  {endingSubmitting ? 'Chiusura...' : 'Conferma Fine Tesseramento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
