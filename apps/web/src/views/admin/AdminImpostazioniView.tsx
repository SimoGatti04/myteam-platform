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
  Eye,
  RotateCcw,
  HelpCircle,
  ChevronRight
} from 'lucide-react';
import { NEUTRAL_THEME, type ThemeTokens, isValidHexColor, deriveThemeTokens } from '../../services/theme';

export const AdminImpostazioniView: React.FC = () => {
  const {
    adminTeam,
    refreshAdminTeam,
    refreshPublicTeam,
    themeTokens,
    tokenOverrides,
    setTokenOverrides,
    isDemoData,
    setAdminTab,
  } = useApp();

  const [name, setName] = useState<string>(adminTeam?.name || '');
  const [crestUrl, setCrestUrl] = useState<string>(adminTeam?.crestUrl || '');
  const [primaryColor, setPrimaryColor] = useState<string>(adminTeam?.primaryColor || '');
  const [secondaryColor, setSecondaryColor] = useState<string>(adminTeam?.secondaryColor || '');
  const [currentSeasonId, setCurrentSeasonId] = useState<string>(adminTeam?.currentSeasonId || '');

  // Fine-tuning token derivati (Mode A approvata)
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
      setSeasonModalError('Inserisci data inizio e data fine della stagione.');
      return;
    }
    if (newSeasonStartsOn > newSeasonEndsOn) {
      setSeasonModalError('La data di inizio non può essere successiva alla data di fine.');
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

  // Anteprima live derivata
  const effectivePrimary = isValidHexColor(primaryColor) ? primaryColor.trim() : null;
  const effectiveSecondary = isValidHexColor(secondaryColor) ? secondaryColor.trim() : null;

  const currentOverrides = {
    ...(surfaceOverride && isValidHexColor(surfaceOverride) ? { surface: surfaceOverride.trim() } : {}),
    ...(borderOverride && isValidHexColor(borderOverride) ? { border: borderOverride.trim() } : {}),
    ...(textOnPrimaryOverride && isValidHexColor(textOnPrimaryOverride) ? { textOnPrimary: textOnPrimaryOverride.trim() } : {}),
  };

  const previewTokens: ThemeTokens = deriveThemeTokens(
    effectivePrimary,
    effectiveSecondary,
    Object.keys(currentOverrides).length > 0 ? currentOverrides : tokenOverrides
  );

  const handleApplyColorOverrides = () => {
    const overrides: any = {};
    if (surfaceOverride && isValidHexColor(surfaceOverride)) overrides.surface = surfaceOverride.trim();
    if (borderOverride && isValidHexColor(borderOverride)) overrides.border = borderOverride.trim();
    if (textOnPrimaryOverride && isValidHexColor(textOnPrimaryOverride)) overrides.textOnPrimary = textOnPrimaryOverride.trim();

    const result = Object.keys(overrides).length > 0 ? overrides : null;
    setTokenOverrides(result);
    setStatusMessage({ type: 'success', text: 'Colori derivati applicati con successo alla sessione!' });
  };

  const handleResetColorOverrides = () => {
    setSurfaceOverride('');
    setBorderOverride('');
    setTextOnPrimaryOverride('');
    setTokenOverrides(null);
    setStatusMessage({ type: 'success', text: 'Colori derivati reimpostati ai valori armonici automatici.' });
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    // Validazione Hex se compilati
    if (primaryColor.trim() && !isValidHexColor(primaryColor)) {
      setSaving(false);
      setStatusMessage({ type: 'error', text: 'Il colore primario deve essere un codice HEX valido nel formato #RRGGBB (es. #1e3a8a).' });
      return;
    }

    if (secondaryColor.trim() && !isValidHexColor(secondaryColor)) {
      setSaving(false);
      setStatusMessage({ type: 'error', text: 'Il colore secondario deve essere un codice HEX valido nel formato #RRGGBB (es. #f59e0b).' });
      return;
    }

    const payload = {
      name: name.trim() || null,
      crestUrl: crestUrl.trim() || null,
      primaryColor: primaryColor.trim() || null,
      secondaryColor: secondaryColor.trim() || null,
      currentSeasonId: currentSeasonId.trim() || null,
    };

    if (isDemoData) {
      setSaving(false);
      setStatusMessage({
        type: 'success',
        text: 'Configurazione salvata nell\'anteprima grafica locale (DEMO).',
      });
      return;
    }

    // Modalità REALE: chiamata a PATCH /api/v1/admin/team
    const result = await apiService.configureTeam(payload);
    setSaving(false);

    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: 'Configurazione squadra salvata con successo sul database Core!',
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
        text: 'Impossibile pubblicare: Nome e Stemma della squadra sono obbligatori.',
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

  // Setup Wizard / Onboarding Status Checklist
  const setupSteps = [
    {
      id: 'season',
      title: 'Stagione Sportiva',
      done: Boolean(adminTeam?.currentSeasonId),
      desc: adminTeam?.currentSeasonId ? 'Stagione corrente configurata' : 'Crea e assegna la stagione sportiva attiva',
    },
    {
      id: 'name',
      title: 'Nome Squadra',
      done: Boolean(adminTeam?.name && adminTeam.name.trim().length > 0),
      desc: adminTeam?.name ? adminTeam.name : 'Inserisci la denominazione ufficiale',
    },
    {
      id: 'crest',
      title: 'Stemma Societario',
      done: Boolean(adminTeam?.crestUrl && adminTeam.crestUrl.trim().length > 0),
      desc: adminTeam?.crestUrl ? 'URL stemma configurato' : 'Inserisci l\'URL dello stemma',
    },
    {
      id: 'colors',
      title: 'Palette Sociale',
      done: Boolean(adminTeam?.primaryColor && adminTeam?.secondaryColor),
      desc: adminTeam?.primaryColor && adminTeam?.secondaryColor ? `${adminTeam.primaryColor} / ${adminTeam.secondaryColor}` : 'Opzionale: personalizza i colori sociali',
    },
    {
      id: 'publish',
      title: 'Pubblicazione Sito',
      done: Boolean(adminTeam?.publishedAt),
      desc: adminTeam?.publishedAt ? 'Squadra e sito pubblici attivi' : 'Rendi visibile il sito ai tifosi',
    },
  ];

  const completedStepsCount = setupSteps.filter(s => s.done).length;

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
          Configura l'identità sociale, la palette cromatica e la pubblicazione ufficiale
        </p>
      </div>

      {/* Setup Guidato / Onboarding Progress */}
      <section style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--brand-secondary)" />
              Setup Guidato Squadra ({completedStepsCount}/{setupSteps.length})
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Passi essenziali per la configurazione e il lancio pubblico della piattaforma
            </div>
          </div>
          <div style={{
            fontSize: '0.78rem',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: '9999px',
            backgroundColor: completedStepsCount === setupSteps.length ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.15)',
            color: completedStepsCount === setupSteps.length ? '#34d399' : 'var(--brand-secondary)',
          }}>
            {completedStepsCount === setupSteps.length ? '✓ Configurazione Completa' : `${Math.round((completedStepsCount / setupSteps.length) * 100)}% Completato`}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(completedStepsCount / setupSteps.length) * 100}%`,
            backgroundColor: completedStepsCount === setupSteps.length ? '#10b981' : 'var(--brand-secondary)',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Checklist Step Pills */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '6px' }}>
          {setupSteps.map((step) => (
            <div
              key={step.id}
              style={{
                backgroundColor: step.done ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                border: step.done ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              {step.done ? (
                <CheckCircle2 size={16} color="#34d399" style={{ marginTop: '2px', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid var(--text-dim)', marginTop: '2px', flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: step.done ? '#ffffff' : 'var(--text-main)', lineHeight: 1.2 }}>
                  {step.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: step.done ? '#34d399' : 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Messaggi di Stato */}
      {statusMessage && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '12px',
          backgroundColor: statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${statusMessage.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: statusMessage.type === 'success' ? '#34d399' : '#fca5a5',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Banner Pubblicazione Squadra */}
      <section style={{
        backgroundColor: adminTeam?.publishedAt ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
        borderRadius: '16px',
        border: `1px solid ${adminTeam?.publishedAt ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
        padding: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: adminTeam?.publishedAt ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: adminTeam?.publishedAt ? '#34d399' : '#fbbf24',
          }}>
            <Globe size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#ffffff' }}>
              Stato del Sito: {adminTeam?.publishedAt ? 'PUBBLICATO' : 'IN BOZZA PRIVATA'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {adminTeam?.publishedAt
                ? `Visibile pubblicamente ai tifosi. Ultima pubblicazione: ${new Date(adminTeam.publishedAt).toLocaleString('it-IT')}`
                : 'I tifosi non vedono ancora le partite né la rosa sul sito pubblico.'}
            </div>
          </div>
        </div>

        <div>
          {!adminTeam?.publishedAt ? (
            <button
              type="button"
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
            <Shield size={18} color="var(--brand-secondary)" /> 1. Dati Anagrafici Obbligatori
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Il Nome della squadra e lo Stemma societario sono requisiti vincolanti per consentire la pubblicazione del sito pubblico.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Denominazione Ufficiale Squadra *
              </label>
              <input
                type="text"
                placeholder="es. ASD Aurora Calcio"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
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
                URL Stemma Ufficiale (Crest URL) *
              </label>
              <input
                type="url"
                placeholder="https://.../stemma.png"
                value={crestUrl}
                onChange={(e) => setCrestUrl(e.target.value)}
                maxLength={2048}
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

          {crestUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Anteprima stemma:</div>
              <img
                src={crestUrl}
                alt="Anteprima Stemma"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                style={{ width: '36px', height: '36px', objectFit: 'contain' }}
              />
            </div>
          )}
        </section>

        {/* 2. Selezione Stagione Corrente */}
        <section style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Calendar size={18} color="var(--brand-secondary)" /> 2. Stagione Sportiva Corrente
            </h3>
            <button
              type="button"
              onClick={openNewSeasonModal}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--brand-secondary)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PlusCircle size={14} /> Nuova Stagione
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            Collega la squadra alla stagione sportiva di riferimento (necessaria per il calendario gare e la rosa attiva).
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
              gap: '10px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontWeight: 700, fontSize: '0.85rem' }}>
                <AlertCircle size={18} /> Nessuna stagione censita nel database
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                Il database Core è attualmente vuoto. Per configurare la squadra e associare calendario e rosa, è necessario creare la prima stagione sportiva (es. 2026/2027).
              </p>
              <button
                type="button"
                onClick={openNewSeasonModal}
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--brand-secondary)',
                  color: '#0f172a',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <PlusCircle size={16} /> Crea la Prima Stagione
              </button>
            </div>
          )}

          {/* Selettore Stagione Corrente */}
          {seasons.length > 0 && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                Stagione Attiva Selezionata
              </label>
              <select
                value={currentSeasonId}
                onChange={(e) => setCurrentSeasonId(e.target.value)}
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
                <option value="">-- Nessuna stagione selezionata --</option>
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.startsOn} - {s.endsOn}) {s.id === adminTeam?.currentSeasonId ? '★ Attuale' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* 3. Branding & Personalizzazione Colori (Scelta cromatica libera + Anteprima Mode A) */}
        <section style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Palette size={18} color="var(--brand-secondary)" /> 3. Identità Cromatica & Branding
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
                  value={isValidHexColor(primaryColor) ? primaryColor : '#334155'}
                  onChange={(e) => setPrimaryColor(e.target.value.toLowerCase())}
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
                  value={isValidHexColor(secondaryColor) ? secondaryColor : '#0ea5e9'}
                  onChange={(e) => setSecondaryColor(e.target.value.toLowerCase())}
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

          {/* Anteprima Token Derivati & Preview */}
          <div style={{
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '12px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Eye size={14} /> Anteprima Componenti con la Palette Attiva
              </div>
              <button
                type="button"
                onClick={() => setShowTokenTuning(!showTokenTuning)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: showTokenTuning ? 'var(--brand-secondary)' : 'var(--text-muted)',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Sliders size={13} /> {showTokenTuning ? 'Nascondi Fine-Tuning Derivati' : 'Modifica Colori Derivati (Fine-Tuning)'}
              </button>
            </div>

            {/* Campioni componenti */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: previewTokens.primary,
                color: previewTokens.textOnPrimary,
                fontWeight: 700,
                fontSize: '0.8rem',
              }}>
                Pulsante Primario
              </div>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: previewTokens.secondary,
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}>
                Accento Secondario
              </div>
              <div style={{
                padding: '8px 14px',
                borderRadius: '8px',
                backgroundColor: previewTokens.surface,
                border: `1px solid ${previewTokens.border}`,
                color: '#ffffff',
                fontSize: '0.8rem',
              }}>
                Card Superficie
              </div>
            </div>

            {/* Sezione Fine-Tuning Derivati (Opzione A) */}
            {showTokenTuning && (
              <div style={{
                marginTop: '8px',
                padding: '14px',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  Personalizza i token derivati calcolati dal sistema (Superficie, Bordo, Contrasto Testo su Primario).
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  {/* Superficie */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                      Superficie Card (Attuale: {previewTokens.surface})
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="color"
                        value={isValidHexColor(surfaceOverride) ? surfaceOverride : previewTokens.surface}
                        onChange={(e) => setSurfaceOverride(e.target.value.toLowerCase())}
                        style={{ width: '36px', height: '36px', borderRadius: '6px', border: '1px solid var(--border-subtle)', cursor: 'pointer', backgroundColor: 'transparent' }}
                      />
                      <input
                        type="text"
                        placeholder={previewTokens.surface}
                        value={surfaceOverride}
                        onChange={(e) => setSurfaceOverride(e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', color: '#ffffff', fontSize: '0.8rem', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>

                  {/* Bordo */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                      Bordo Brand (Attuale: {previewTokens.border})
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="color"
                        value={isValidHexColor(borderOverride) ? borderOverride : previewTokens.border}
                        onChange={(e) => setBorderOverride(e.target.value.toLowerCase())}
                        style={{ width: '36px', height: '36px', borderRadius: '6px', border: '1px solid var(--border-subtle)', cursor: 'pointer', backgroundColor: 'transparent' }}
                      />
                      <input
                        type="text"
                        placeholder={previewTokens.border}
                        value={borderOverride}
                        onChange={(e) => setBorderOverride(e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', color: '#ffffff', fontSize: '0.8rem', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>

                  {/* Testo su Primario */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '4px' }}>
                      Testo su Primario (Attuale: {previewTokens.textOnPrimary})
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="color"
                        value={isValidHexColor(textOnPrimaryOverride) ? textOnPrimaryOverride : previewTokens.textOnPrimary}
                        onChange={(e) => setTextOnPrimaryOverride(e.target.value.toLowerCase())}
                        style={{ width: '36px', height: '36px', borderRadius: '6px', border: '1px solid var(--border-subtle)', cursor: 'pointer', backgroundColor: 'transparent' }}
                      />
                      <input
                        type="text"
                        placeholder={previewTokens.textOnPrimary}
                        value={textOnPrimaryOverride}
                        onChange={(e) => setTextOnPrimaryOverride(e.target.value)}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', backgroundColor: 'rgba(15, 23, 42, 0.8)', border: '1px solid var(--border-subtle)', color: '#ffffff', fontSize: '0.8rem', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={handleResetColorOverrides}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <RotateCcw size={12} /> Reimposta automatici
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyColorOverrides}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '6px',
                      backgroundColor: 'var(--brand-secondary)',
                      color: '#0f172a',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Applica Derivati alla Sessione
                  </button>
                </div>
              </div>
            )}
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
            maxWidth: '460px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Crea Nuova Stagione
              </h3>
              <button
                type="button"
                onClick={() => setIsSeasonModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            {seasonModalError && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                fontSize: '0.82rem',
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
                      fontSize: '0.85rem',
                      outline: 'none',
                    }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Data Fine *
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
                      fontSize: '0.85rem',
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
                  }}
                >
                  {creatingSeason ? 'Salvataggio...' : 'Crea Stagione'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
