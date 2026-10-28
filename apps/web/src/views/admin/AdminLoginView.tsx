import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Lock,
  Shield,
  KeyRound,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  Loader2,
  LogIn,
} from 'lucide-react';

export const AdminLoginView: React.FC = () => {
  const {
    loginAdminWithToken,
    loginWithOidc,
    oidcConfigured,
    oidcLoading,
    oidcError,
    clearOidcError,
    setDataMode,
    demoAllowed,
    manualAuthAllowed,
  } = useApp();

  const [tokenInput, setTokenInput] = useState<string>('');
  const [manualLoading, setManualLoading] = useState<boolean>(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);
    clearOidcError();
    setManualLoading(true);

    const result = await loginAdminWithToken(tokenInput);
    setManualLoading(false);
    if (!result.success) {
      setManualError(result.error || 'Autenticazione manuale non riuscita.');
    }
  };

  const handleEnableDemo = () => {
    setDataMode('demo');
  };

  const isInsufficientPermissions =
    oidcError?.includes('403') ||
    oidcError?.toLowerCase().includes('platform:admin') ||
    manualError?.includes('403') ||
    manualError?.toLowerCase().includes('platform:admin');

  return (
    <div style={{ maxWidth: '540px', margin: '40px auto', padding: '16px' }}>
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '32px 24px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              color: 'var(--brand-secondary)',
            }}
          >
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main)' }}>
            Pannello Amministratore
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Accesso riservato alla gestione tecnica, partite, rosa e impostazioni
          </p>
        </div>

        {/* Banner Errore / 403 Permessi Insufficienti */}
        {(oidcError || manualError) && (
          <div
            style={{
              backgroundColor: isInsufficientPermissions ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${isInsufficientPermissions ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.25)'}`,
              borderRadius: '12px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 600, fontSize: '0.88rem' }}>
              {isInsufficientPermissions ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
              {isInsufficientPermissions ? 'Permessi Insufficienti (HTTP 403)' : 'Errore di Autenticazione'}
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: 0, lineHeight: 1.4 }}>
              {oidcError || manualError}
            </p>
          </div>
        )}

        {/* SEZIONE 1: Login OIDC Principale Logto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {oidcConfigured ? (
            <div
              style={{
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '14px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#60a5fa', fontWeight: 600, fontSize: '0.95rem' }}>
                <Shield size={20} />
                Accesso Ufficiale con Logto (SSO)
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Autenticazione federata sicura basata su OpenID Connect Authorization Code Flow con PKCE (RFC 7636).
              </p>
              <button
                type="button"
                onClick={() => { void loginWithOidc(); }}
                disabled={oidcLoading}
                style={{
                  padding: '12px 20px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--brand-secondary)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: oidcLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'opacity 0.2s',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                }}
              >
                {oidcLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Reindirizzamento a Logto...
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Accedi con Logto (SSO)
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          ) : (
            <div
              style={{
                backgroundColor: 'rgba(234, 179, 8, 0.06)',
                border: '1px dashed rgba(234, 179, 8, 0.3)',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#facc15', fontWeight: 600, fontSize: '0.85rem' }}>
                <AlertTriangle size={18} />
                Provider Logto OIDC non configurato
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                Per abilitare l'autenticazione reale, definire le variabili d'ambiente{' '}
                <code>VITE_LOGTO_ENDPOINT</code> e <code>VITE_LOGTO_APP_ID</code> nel file di configurazione del deployment.
              </p>
              {!manualAuthAllowed && (
                <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '4px', fontWeight: 500 }}>
                  In ambiente di produzione l'accesso è consentito esclusivamente tramite Logto OIDC configurato. Non è consentito alcun bypass manuale.
                </div>
              )}
            </div>
          )}
        </div>

        {/* SEZIONE 2: Strumento di Collaudo Manuale JWT (Abilitato SOLO se manualAuthAllowed) */}
        {manualAuthAllowed && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--text-dim)',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
              <span>oppure collaudo autorizzato (dev / staging)</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            </div>

            <form onSubmit={handleManualSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontSize: '0.85rem', fontWeight: 600 }}>
                <KeyRound size={16} />
                Inserimento manuale Bearer Token JWT (Collaudo)
              </div>
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: '1.4',
              }}>
                Disponibile esclusivamente in ambienti non di produzione per testare le API Core con token di prova aventi scope <code>platform:admin</code>.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Bearer Token JWT (solo per test):
                </label>
                <textarea
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Incolla il token JWT di collaudo..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    color: 'var(--text-main)',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={manualLoading || !tokenInput.trim()}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: manualLoading || !tokenInput.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {manualLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                Valida e accedi
              </button>
            </form>
          </>
        )}

        {/* SEZIONE 3: Demo Fallback (Abilitato SOLO se demoAllowed) */}
        {demoAllowed && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--text-dim)',
                fontSize: '0.75rem',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
              <span>oppure per sviluppo locale</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
            </div>

            <div
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                border: '1px dashed rgba(245, 158, 11, 0.3)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.82rem', fontWeight: 700 }}>
                <Sparkles size={16} />
                Collaudo grafico in Modalità Demo
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', margin: 0 }}>
                Se il server Logto non è attivo in locale, puoi esplorare il pannello amministrativo con dati mock di sviluppo. Le modifiche non verranno salvate sul backend Core.
              </p>
              <button
                type="button"
                onClick={handleEnableDemo}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  alignSelf: 'flex-start',
                }}
              >
                Attiva Modalità Demo
                <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
