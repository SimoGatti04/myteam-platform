import { getTeamDisplayName } from '../utils/branding';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Vote,
  Award,
  Trophy,
  CheckCircle2,
  Calendar,
  Shield,
  Info,
  Clock,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const VotazioniView: React.FC = () => {
  const { dataMode, setDataMode, isDemoData, publicTeam } = useApp();

  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [demoVoteSuccess, setDemoVoteSuccess] = useState<boolean>(false);

  const candidates = [
    { id: 'c1', name: 'Davide Moretti', number: 9, description: '1 Gol al 14° minuto' },
    { id: 'c2', name: 'Simone Gatti', number: 10, description: '1 Gol al 52° minuto, 2 assist vincenti' },
    { id: 'c3', name: 'Federico De Luca', number: 11, description: 'Gol decisivo al 86° minuto' },
    { id: 'c4', name: 'Marco Villa', number: 1, description: 'Portiere • 3 parate decisive nel secondo tempo' },
  ];

  const handleVoteSubmit = () => {
    if (!selectedCandidate) return;
    setDemoVoteSuccess(true);
  };

  // Se siamo in Real Mode, mostriamo la pagina informativa Roadmap senza inganni
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
            <Vote size={32} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
            Votazioni Ufficiali — Modulo in Fase 2
          </h2>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', maxWidth: '580px', margin: '0 auto 24px auto', lineHeight: '1.5' }}>
            Il motore unico per il Player of the Match (POTM) e il Player of the Month richiede l'integrazione del sistema di voto certificato, anti-tampering e anonimizzato nel backend Core. In questa prima fase (W1-R1 / C1), le API di voto non sono ancora attive sul server.
          </p>

          <div style={{
            backgroundColor: 'rgba(245, 158, 11, 0.05)',
            border: '1px dashed rgba(245, 158, 11, 0.3)',
            borderRadius: '12px',
            padding: '16px 20px',
            maxWidth: '520px',
            margin: '0 auto',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700 }}>
              <Sparkles size={16} /> Vuoi esplorare l'anteprima dell'esperienza di voto?
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
              Puoi attivare la <strong>Modalità Demo</strong> per testare l'interfaccia di voto grafica con candidati dimostrativi.
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
  // ANTEPRIMA GRAFICA (DEMO)
  // -----------------------------------------------------------------

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
            Votazioni & Riconoscimenti Ufficiali
          </h2>
          <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
            DEMO MOCK
          </span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Anteprima grafica dimostrativa della selezione Player of the Match
        </p>
      </div>

      {/* Scheda Votazione Demo */}
      <section style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '24px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '8px',
        }}>
          <div>
            <span style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--brand-secondary)',
              letterSpacing: '0.05em',
            }}>
              Votazione Aperta (Demo)
            </span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 0 0' }}>
              Player of the Match • {getTeamDisplayName(publicTeam?.name, isDemoData)} vs Oratorio San Luigi
            </h3>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.78rem',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            color: '#fbbf24',
            padding: '4px 10px',
            borderRadius: '9999px',
            border: '1px solid rgba(245, 158, 11, 0.2)',
          }}>
            <Clock size={14} /> Scade tra 14 ore
          </div>
        </div>

        {demoVoteSuccess ? (
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}>
            <CheckCircle2 size={36} color="#34d399" />
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#ffffff' }}>
              Voto registrato nell'anteprima grafica locale!
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: '460px', margin: 0 }}>
              Nota: trattandosi di un'anteprima demo di sviluppo, nessun dato è stato inviato a server esterni. L'integrazione con il backend Core avverrà nella Fase 2.
            </p>
            <button
              onClick={() => {
                setDemoVoteSuccess(false);
                setSelectedCandidate(null);
              }}
              style={{
                marginTop: '8px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Ripeti voto dimostrativo
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0 }}>
              Scegli il giocatore che ritieni sia stato il migliore nella gara:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              {candidates.map((cand) => {
                const isSelected = selectedCandidate === cand.id;
                return (
                  <div
                    key={cand.id}
                    onClick={() => setSelectedCandidate(cand.id)}
                    style={{
                      padding: '16px',
                      borderRadius: '12px',
                      backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      border: isSelected ? '2px solid var(--brand-secondary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      backgroundColor: isSelected ? 'var(--brand-secondary)' : 'rgba(255, 255, 255, 0.05)',
                      color: isSelected ? '#0f172a' : '#ffffff',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      #{cand.number}
                    </div>

                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                        {cand.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {cand.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button
                disabled={!selectedCandidate}
                onClick={handleVoteSubmit}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  backgroundColor: selectedCandidate ? 'var(--brand-secondary)' : 'rgba(255, 255, 255, 0.05)',
                  color: selectedCandidate ? '#0f172a' : 'var(--text-muted)',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: selectedCandidate ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                }}
              >
                Invia voto dimostrativo
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
