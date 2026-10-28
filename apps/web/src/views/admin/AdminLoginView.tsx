import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, Shield, KeyRound, AlertTriangle, ArrowRight, Sparkles } from 'lucide-react';

export const AdminLoginView: React.FC = () => {
  const { loginAdminWithToken, setDataMode, setAdminMode, demoAllowed } = useApp();
  const [tokenInput, setTokenInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    const result = await loginAdminWithToken(tokenInput);
    setLoading(false);
    if (!result.success) {
      setErrorMsg(result.error || 'Autenticazione non riuscita.');
    }
  };

  const handleEnableDemo = () => {
    setDataMode('demo');
  };

  return (
    <div style={{ maxWidth: '540px', margin: '40px auto', padding: '16px' }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '32px 24px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
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
          }}>
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
            Accesso Amministrazione
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            L'area gestionale richiede autenticazione reale tramite <strong>Logto OIDC (Bearer Token JWT)</strong> per interagire con il backend Core.
          </p>
        </div>

        {errorMsg && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '0.8rem',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 700 }}>Errore di autenticazione</div>
              <div>{errorMsg}</div>
            </div>
          </div>
        )}

        {/* Real Token Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '6px' }}>
              Bearer Token JWT Logto
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                placeholder="eyJhbGciOiJSUzI1NiIs..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--border-subtle)',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  outline: 'none',
                }}
              />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
              Il token viene inviato all'endpoint <code>/api/v1/admin/team</code> con header <code>Authorization: Bearer</code>.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading || !tokenInput.trim()}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              backgroundColor: 'var(--brand-secondary)',
              color: '#0f172a',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
              cursor: loading || !tokenInput.trim() ? 'not-allowed' : 'pointer',
              opacity: loading || !tokenInput.trim() ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.15s ease',
            }}
          >
            <KeyRound size={16} />
            {loading ? 'Verifica credenziali...' : 'Accedi con Bearer Token'}
          </button>
        </form>

        {demoAllowed && (
          <>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: 'var(--text-dim)',
          fontSize: '0.75rem',
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
          <span>oppure per sviluppo locale</span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-subtle)' }} />
        </div>

        {/* Demo Fallback Box */}
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.05)',
          border: '1px dashed rgba(245, 158, 11, 0.3)',
          borderRadius: '12px',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
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
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fef3c7',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            Passa a Modalità Demo <ArrowRight size={14} />
          </button>
        </div>
          </>
        )}

        <div style={{ textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setAdminMode(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            ← Torna al sito pubblico
          </button>
        </div>
      </div>
    </div>
  );
};
