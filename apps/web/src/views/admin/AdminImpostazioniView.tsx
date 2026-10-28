import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { SeasonDto } from '@myteam/contracts';
import {
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
                placeholder="es. MAPI GROUP"
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

        {/* 2. Personalizzazione Colori (Modalità A Approvata) */}
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
    </div>
  );
};
