import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { SeasonDto } from '@myteam/contracts';
import {
  Calendar,
  PlusCircle,
  Settings,
  Palette,
  Shield,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Globe,
  Sliders,
  Eye
} from 'lucide-react';
import { NEUTRAL_THEME, type ThemeTokens } from '../../services/theme';

export const AdminImpostazioniView: React.FC = () => {
  const {
    adminTeam,
    refreshAdminTeam,
    refreshPublicTeam,
    themeTokens,
    tokenOverrides,
    setTokenOverrides,
    isDemoData,
  } = useApp();

  const [name, setName] = useState<string>(adminTeam?.name || '');
  const [crestUrl, setCrestUrl] = useState<string>(adminTeam?.crestUrl || '');
  const [primaryColor, setPrimaryColor] = useState<string>(adminTeam?.primaryColor || '');
  const [secondaryColor, setSecondaryColor] = useState<string>(adminTeam?.secondaryColor || '');
  const [currentSeasonId, setCurrentSeasonId] = useState<string>(adminTeam?.currentSeasonId || '');

  // Individual derived token overrides (Approved Mode A: fine-tuning)
  const [showTokenTuning, setShowTokenTuning] = useState<boolean>(false);
  const [surfaceOverride, setSurfaceOverride] = useState<string>(tokenOverrides?.surface || '');
  const [borderOverride, setBorderOverride] = useState<string>(tokenOverrides?.border || '');
  const [textOnPrimaryOverride, setTextOnPrimaryOverride] = useState<string>(tokenOverrides?.textOnPrimary || '');

  const [saving, setSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Gestione Stagioni (GET /api/v1/admin/seasons & POST /api/v1/admin/seasons)
  const [seasons, setSeasons] = useState<SeasonDto[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState<boolean>(true);
  const [seasonsLoadError, setSeasonsLoadError] = useState<string | null>(null);

  // Modal Nuova Stagione
  const [isSeasonModalOpen, setIsSeasonModalOpen] = useState<boolean>(false);
  const [newSeasonLabel, setNewSeasonLabel] = useState<string>('');
  const [newSeasonStartsOn, setNewSeasonStartsOn] = useState<string>('');
  const [newSeasonEndsOn, setNewSeasonEndsOn] = useState<string>('');
  const [creatingSeason, setCreatingSeason] = useState<boolean>(false);
  const [seasonModalError, setSeasonModalError] = useState<string | null>(null);

  useEffect(() => {
    loadSeasons();
  }, [isDemoData]);

  const loadSeasons = async () => {
    setLoadingSeasons(true);
    setSeasonsLoadError(null);

    if (isDemoData) {
      setSeasons(apiService.getDemoSeasons());
      setLoadingSeasons(false);
      return;
    }

    const res = await apiService.getAdminSeasons();
    if (res.success) {
      setSeasons(res.data);
      setSeasonsLoadError(null);
    } else {
      setSeasons([]);
      setSeasonsLoadError(`Impossibile caricare le stagioni (${res.status}): ${res.message}`);
    }
    setLoadingSeasons(false);
  };

  const openNewSeasonModal = () => {
    setIsSeasonModalOpen(true);
    setSeasonModalError(null);
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    setNewSeasonLabel(`${currentYear}/${nextYear}`);
    setNewSeasonStartsOn(`${currentYear}-09-01`);
    setNewSeasonEndsOn(`${nextYear}-06-30`);
  };

  const handleCreateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeasonModalError(null);

    const trimmedLabel = newSeasonLabel.trim();
    if (!trimmedLabel) {
      setSeasonModalError('Inserisci la denominazione della stagione (es. 2026/2027).');
      return;
    }
    if (!newSeasonStartsOn || !newSeasonEndsOn) {
      setSeasonModalError('Inserisci sia la data di inizio che la data di fine stagione.');
      return;
    }
    if (newSeasonEndsOn < newSeasonStartsOn) {
      setSeasonModalError('La data di conclusione della stagione non può precedere la data di inizio.');
      return;
    }

    // Controllo client per evitare duplicazioni di etichetta già presenti
    const alreadyExists = seasons.some(s => s.label.trim().toLowerCase() === trimmedLabel.toLowerCase());
    if (alreadyExists) {
      setSeasonModalError(`Una stagione con denominazione "${trimmedLabel}" è già presente nell'elenco.`);
      return;
    }

    setCreatingSeason(true);

    if (isDemoData) {
      const demoSeason: SeasonDto = {
        id: `demo-season-${Date.now()}`,
        label: trimmedLabel,
        startsOn: newSeasonStartsOn,
        endsOn: newSeasonEndsOn,
      };
      setSeasons(prev => [demoSeason, ...prev]);
      setCurrentSeasonId(demoSeason.id);
      setCreatingSeason(false);
      setIsSeasonModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Stagione "${trimmedLabel}" creata e selezionata come corrente nell'anteprima (DEMO). Salva le impostazioni per confermare.`,
      });
      return;
    }

    // Modalità REALE: chiamata Core POST /api/v1/admin/seasons
    const res = await apiService.createSeason({
      label: trimmedLabel,
      startsOn: newSeasonStartsOn,
      endsOn: newSeasonEndsOn,
    });

    setCreatingSeason(false);

    if (res.success) {
      const created = res.data;
      setSeasons(prev => [created, ...prev]);
      setCurrentSeasonId(created.id);
      setIsSeasonModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Stagione "${created.label}" registrata con successo nel database Core e selezionata come corrente! Clicca su "Salva Impostazioni" per confermare l'assegnazione alla squadra.`,
      });
    } else {
      setSeasonModalError(`Errore creazione stagione (${res.status}): ${res.message}`);
    }
  };

  useEffect(() => {
    if (adminTeam) {
      setName(adminTeam.name || '');
      setCrestUrl(adminTeam.crestUrl || '');
      setPrimaryColor(adminTeam.primaryColor || '');
      setSecondaryColor(adminTeam.secondaryColor || '');
      setCurrentSeasonId(adminTeam.currentSeasonId || '');
    }
  }, [adminTeam]);

  // Validazione secondo specifiche di prodotto:
  // Per pubblicare sono obbligatori: Nome della squadra e Stemma!
  const canPublish = Boolean(name.trim() && crestUrl.trim());
  const isPublished = Boolean(adminTeam?.publishedAt);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    // Salva Token Overrides nel contesto
    if (surfaceOverride || borderOverride || textOnPrimaryOverride) {
      setTokenOverrides({
        surface: surfaceOverride || undefined,
        border: borderOverride || undefined,
        textOnPrimary: textOnPrimaryOverride || undefined,
      });
    } else {
      setTokenOverrides(null);
    }

    if (isDemoData) {
      // In Demo Mode: feedback locale immediato
      setTimeout(() => {
        setSaving(false);
        setStatusMessage({
          type: 'success',
          text: 'Impostazioni aggiornate nell\'anteprima grafica locale (DEMO).',
        });
      }, 300);
      return;
    }

    // Modalità REALE: invio al server Core /api/v1/admin/team con Bearer token
    const result = await apiService.configureTeam({
      name: name.trim() || null,
      crestUrl: crestUrl.trim() || null,
      primaryColor: primaryColor.trim() || null,
      secondaryColor: secondaryColor.trim() || null,
      currentSeasonId: currentSeasonId.trim() || null,
    });

    setSaving(false);

    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: 'Configurazione squadra salvata con successo sul server Core!',
      });
      await refreshAdminTeam();
      await refreshPublicTeam();
    } else {
      setStatusMessage({
        type: 'error',
        text: `Errore salvataggio server (${result.status}): ${result.message}`,
      });
    }
  };

  const handlePublish = async () => {
    if (!canPublish) {
      setStatusMessage({
        type: 'error',
        text: 'Per pubblicare il sito sono obbligatori il Nome della squadra e lo Stemma.',
      });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    if (isDemoData) {
      setSaving(false);
      setStatusMessage({
        type: 'success',
        text: 'Pubblicazione simulata nell\'anteprima grafica locale (DEMO).',
      });
      return;
    }

    // Modalità REALE: chiamata a POST /api/v1/admin/team/publish
    const result = await apiService.publishTeam();
    setSaving(false);

    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: 'Squadra pubblicata con successo! I contenuti pubblici sono ora visibili ai tifosi.',
      });
      await refreshAdminTeam();
      await refreshPublicTeam();
    } else {
      setStatusMessage({
        type: 'error',
        text: `Errore pubblicazione server (${result.status}): ${result.message}`,
      });
    }
  };

  const handleResetToNeutral = () => {
    setPrimaryColor('');
    setSecondaryColor('');
    setSurfaceOverride('');
    setBorderOverride('');
    setTextOnPrimaryOverride('');
    setTokenOverrides(null);
    setStatusMessage({ type: 'success', text: 'Ripristinato stile tecnico neutro di visualizzazione.' });
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
            Impostazioni Squadra & Identità Visiva
          </h2>
          {isDemoData && (
            <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              DEMO MOCK
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Configura nome, stemma e la palette intelligente personalizzabile (Modalità A approvata).
        </p>
      </div>

      {statusMessage && (
        <div style={{
          padding: '14px 16px',
          borderRadius: '10px',
          backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: statusMessage.type === 'success' ? '#34d399' : '#fca5a5',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Box Stato Pubblicazione */}
      <section style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: isPublished ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${isPublished ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isPublished ? '#34d399' : '#fbbf24',
          }}>
            {isPublished ? <Globe size={22} /> : <AlertCircle size={22} />}
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ffffff' }}>
              Stato Sito: {isPublished ? 'PUBBLICATO' : 'BOZZA PRIVATA'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {isPublished
                ? `Visibile pubblicamente ai tifosi. Data pubblicazione: ${adminTeam?.publishedAt}`
                : 'Il sito è visibile solo agli amministratori. I requisiti obbligatori sono Nome squadra e Stemma.'}
            </div>
          </div>
        </div>

        <div>
          {!isPublished ? (
            <button
              onClick={handlePublish}
              disabled={saving || !canPublish}
              style={{
                backgroundColor: canPublish ? 'var(--brand-secondary)' : 'rgba(255, 255, 255, 0.05)',
                color: canPublish ? '#0f172a' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: canPublish && !saving ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Globe size={16} />
              {saving ? 'Operazione in corso...' : 'Pubblica Squadra sul Server'}
            </button>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
            }}>
              <CheckCircle2 size={16} /> Squadra Ufficiale Attiva
            </div>
          )}
        </div>
      </section>

      {/* Form Principale */}
      <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* 1. Dati Anagrafici Obbligatori */}
        <section style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} color="var(--brand-secondary)" />
            Dati Identificativi Squadra (Obbligatori per la pubblicazione)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Nome Ufficiale Squadra *
              </label>
              <input
                type="text"
                placeholder="es. Nome Società Sportiva"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                URL Stemma Ufficiale *
              </label>
              <input
                type="text"
                placeholder="https://.../crest.png"
                value={crestUrl}
                onChange={(e) => setCrestUrl(e.target.value)}
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
          </div>
        </section>

        {/* 2. Stagione Sportiva Corrente & Gestione Calendario */}
        <section style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--brand-secondary)" />
              Stagione Sportiva Corrente & Gestione Calendario
            </h3>
            <button
              type="button"
              onClick={openNewSeasonModal}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: 'var(--brand-secondary)',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PlusCircle size={15} /> Nuova Stagione
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            La stagione corrente definisce l'intervallo temporale predefinito per la rosa atleti, i tesseramenti e le partite in calendario.
          </p>

          {/* Caso caricamento in corso */}
          {loadingSeasons && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} className="animate-spin" /> Caricamento stagioni dal server Core...
            </div>
          )}

          {/* Errore caricamento stagioni */}
          {seasonsLoadError && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
            }}>
              <span style={{ fontSize: '0.82rem', color: '#fca5a5' }}>{seasonsLoadError}</span>
              <button
                type="button"
                onClick={loadSeasons}
                style={{
                  background: 'none',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                Riprova
              </button>
            </div>
          )}

          {/* Caso DATABASE COMPLETAMENTE VUOTO: Nessuna stagione registrata */}
          {!loadingSeasons && !seasonsLoadError && seasons.length === 0 && (
            <div style={{
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '0.9rem' }}>
                <AlertCircle size={18} /> Nessuna stagione registrata a sistema (Database Iniziale Vuoto)
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
                La piattaforma è al primo avvio su database pulito. Per poter tesserare atleti e inserire partite nel calendario, è necessario creare la prima stagione sportiva ufficiale.
              </p>
              <div>
                <button
                  type="button"
                  onClick={openNewSeasonModal}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <PlusCircle size={15} /> Crea la Prima Stagione
                </button>
              </div>
            </div>
          )}

          {/* Selezione Stagione Esistente */}
          {!loadingSeasons && seasons.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Seleziona Stagione Corrente Squadra
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={currentSeasonId}
                  onChange={(e) => setCurrentSeasonId(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '240px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    outline: 'none',
                  }}
                >
                  <option value="">-- Nessuna stagione selezionata (Bozza) --</option>
                  {seasons.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label} ({s.startsOn} - {s.endsOn}) {s.id === adminTeam?.currentSeasonId ? '★ Attuale sul Server' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dettaglio/Stato Stagione Selezionata */}
              <div style={{ marginTop: '8px', fontSize: '0.78rem' }}>
                {currentSeasonId ? (
                  currentSeasonId === adminTeam?.currentSeasonId ? (
                    <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> Questa è la stagione attualmente attiva e salvata per la squadra.
                    </span>
                  ) : (
                    <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={14} /> Nuova stagione selezionata (non ancora salvata sul server). Clicca su "Salva Impostazioni" in fondo per confermare l'assegnazione.
                    </span>
                  )
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Nessuna stagione attiva assegnata alla squadra. Le sezioni Rosa e Partite richiedono una stagione attiva per operare.
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 3. Personalizzazione Colori (Modalità A Approvata) */}
        <section style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Palette size={18} color="var(--brand-secondary)" />
              Colori Sociali & Palette Intelligente (Modalità A)
            </h3>
            <button
              type="button"
              onClick={handleResetToNeutral}
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              Ripristina stile tecnico neutro
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Nessuna palette hardcoded imposta. Scegli liberamente il Colore Primario e Secondario della tua società sportiva (codice esadecimale #RRGGBB).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            {/* Colore Primario */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Colore Primario (#HEX)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="color"
                  value={primaryColor || '#334155'}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                  }}
                />
                <input
                  type="text"
                  placeholder="#1e3a8a"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Colore Secondario */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Colore Secondario (#HEX)
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="color"
                  value={secondaryColor || '#0ea5e9'}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    backgroundColor: 'transparent',
                  }}
                />
                <input
                  type="text"
                  placeholder="#38bdf8"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Anteprima Token Derivati */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Eye size={14} /> Anteprima Componenti con la Palette Attiva
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: themeTokens.primary,
                color: themeTokens.textOnPrimary,
                fontWeight: 700,
                fontSize: '0.8rem',
              }}>
                Pulsante Primario
              </div>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: themeTokens.secondary,
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}>
                Accento Secondario
              </div>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: themeTokens.surface,
                border: `1px solid ${themeTokens.border}`,
                color: '#ffffff',
                fontSize: '0.8rem',
              }}>
                Card Superficie
              </div>
            </div>
          </div>
        </section>

        {/* Pulsante Salvataggio Finale */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              backgroundColor: 'var(--brand-secondary)',
              color: '#0f172a',
              border: 'none',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={18} />
            {saving ? 'Salvataggio in corso...' : 'Salva Impostazioni'}
          </button>
        </div>
      </form>

      {/* Modal Nuova Stagione */}
      {isSeasonModalOpen && (
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
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--brand-secondary)" />
                Nuova Stagione Sportiva
              </h3>
              <button
                type="button"
                onClick={() => setIsSeasonModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Crea una nuova stagione sportiva registrata sul server Core (<code>POST /api/v1/admin/seasons</code>).
            </p>

            {seasonModalError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <AlertCircle size={16} />
                <span>{seasonModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSeason} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Denominazione / Etichetta Stagione *
                </label>
                <input
                  type="text"
                  placeholder="es. 2026/2027"
                  value={newSeasonLabel}
                  onChange={(e) => setNewSeasonLabel(e.target.value)}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Data Inizio *
                  </label>
                  <input
                    type="date"
                    value={newSeasonStartsOn}
                    onChange={(e) => setNewSeasonStartsOn(e.target.value)}
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

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Data Conclusione *
                  </label>
                  <input
                    type="date"
                    value={newSeasonEndsOn}
                    onChange={(e) => setNewSeasonEndsOn(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsSeasonModalOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
                  disabled={creatingSeason}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--brand-secondary)',
                    color: '#0f172a',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: creatingSeason ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {creatingSeason ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Creazione in corso...
                    </>
                  ) : (
                    'Crea Stagione'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
