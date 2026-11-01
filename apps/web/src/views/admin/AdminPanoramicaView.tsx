import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { apiService } from '../../services/api';
import type { PublicMatchDto } from '@myteam/contracts';
import {
  LayoutDashboard,
  Calendar,
  AlertTriangle,
  PlusCircle,
  Vote,
  Users,
  Settings,
  ChevronRight,
  Clock,
  CheckCircle2,
  FileText,
  Shield,
  HelpCircle,
  Globe,
  Sparkles,
  Smartphone,
  Trophy,
  Palette
} from 'lucide-react';

export const AdminPanoramicaView: React.FC<{
  onOpenMatchModal: (matchId?: string) => void;
  onOpenPlayerModal: () => void;
}> = ({ onOpenMatchModal, onOpenPlayerModal }) => {
  const { adminTeam, setAdminTab, isDemoData } = useApp();
  const [matches, setMatches] = useState<PublicMatchDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadMatches();
  }, [isDemoData]);

  const loadMatches = async () => {
    setLoading(true);
    if (isDemoData) {
      const demo = apiService.getDemoMatches();
      setMatches([...demo.scheduled, ...demo.toBeScheduled]);
    } else {
      const res = await apiService.getPublicMatches();
      if (res.success) {
        setMatches([...res.data.scheduled, ...res.data.toBeScheduled]);
      } else {
        setMatches([]);
      }
    }
    setLoading(false);
  };

  const isPublished = Boolean(adminTeam?.publishedAt);

  // Setup Checklist Steps
  const setupSteps = [
    {
      id: 'season',
      title: 'Stagione Sportiva',
      done: Boolean(adminTeam?.currentSeasonId),
      desc: adminTeam?.currentSeasonId ? 'Stagione configurata' : 'Manca la stagione corrente',
    },
    {
      id: 'name',
      title: 'Nome Squadra',
      done: Boolean(adminTeam?.name && adminTeam.name.trim().length > 0),
      desc: adminTeam?.name ? adminTeam.name : 'Manca il nome ufficiale',
    },
    {
      id: 'crest',
      title: 'Stemma Societario',
      done: Boolean(adminTeam?.crestUrl && adminTeam.crestUrl.trim().length > 0),
      desc: adminTeam?.crestUrl ? 'Stemma presente' : 'Manca l\'URL dello stemma',
    },
    {
      id: 'colors',
      title: 'Palette Sociale',
      done: Boolean(adminTeam?.primaryColor && adminTeam?.secondaryColor),
      desc: adminTeam?.primaryColor && adminTeam?.secondaryColor ? `${adminTeam.primaryColor} / ${adminTeam.secondaryColor}` : 'Stile tecnico neutro attivo',
    },
    {
      id: 'publish',
      title: 'Pubblicazione Sito',
      done: isPublished,
      desc: isPublished ? 'Sito pubblico attivo per i tifosi' : 'Sito attualmente in bozza',
    },
  ];

  const completedStepsCount = setupSteps.filter(s => s.done).length;
  const isSetupComplete = completedStepsCount === setupSteps.length;

  const upcomingMatches = matches.filter(m => m.status === 'scheduled' || m.status === 'to_be_scheduled').slice(0, 3);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header Panoramica */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
              Panoramica Gestionale
            </h2>
            {isDemoData && (
              <span style={{ fontSize: '0.65rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                DEMO MOCK
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Centro di controllo operativo della prima squadra
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onOpenMatchModal()}
            style={{
              padding: '8px 14px',
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
            <PlusCircle size={15} /> Nuova Partita
          </button>
          <button
            onClick={onOpenPlayerModal}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: '1px solid var(--border-subtle)',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Users size={15} /> Tessera Giocatore
          </button>
          <button
            onClick={() => setAdminTab('impostazioni')}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              border: '1px solid var(--border-subtle)',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Settings size={15} /> Impostazioni Squadra
          </button>
        </div>
      </div>

      {/* Setup Guidato Squadra (Onboarding Card) */}
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
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--brand-secondary)" />
              Setup Guidato Squadra ({completedStepsCount}/{setupSteps.length})
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {isSetupComplete
                ? 'Tutti i passaggi fondamentali della configurazione sono stati completati!'
                : 'Completa i passaggi per rendere il sito della squadra operativo e pubblicato per i tifosi.'}
            </div>
          </div>
          <button
            onClick={() => setAdminTab('impostazioni')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              backgroundColor: isSetupComplete ? 'rgba(16, 185, 129, 0.15)' : 'var(--brand-secondary)',
              color: isSetupComplete ? '#34d399' : '#0f172a',
              border: isSetupComplete ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {isSetupComplete ? 'Modifica Configurazione' : 'Vai a Impostazioni Squadra'} <ChevronRight size={14} />
          </button>
        </div>

        {/* Progress Bar */}
        <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(completedStepsCount / setupSteps.length) * 100}%`,
            backgroundColor: isSetupComplete ? '#10b981' : 'var(--brand-secondary)',
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Step Items */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
          {setupSteps.map((step) => (
            <div
              key={step.id}
              onClick={() => setAdminTab('impostazioni')}
              style={{
                backgroundColor: step.done ? 'rgba(16, 185, 129, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                border: step.done ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                cursor: 'pointer',
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

      {/* Grid: Stato Operativo & PWA Diagnostic */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>

        {/* Card Stato Squadra */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-secondary)' }}>
            <Globe size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Visibilità Sito Pubblico
            </h3>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: isPublished ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            color: isPublished ? '#34d399' : '#fbbf24',
            fontWeight: 700,
            fontSize: '0.82rem',
          }}>
            {isPublished ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {isPublished ? 'Sito Pubblicato & Attivo' : 'Sito in Bozza Privata (Non Pubblicato)'}
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {isPublished
              ? 'I dati della squadra, la rosa e le partite contrassegnate come pubblicate sono regolarmente visibili ai tifosi.'
              : 'Tutti i dati rimangono isolati nell\'area amministrativa. Per rendere il sito pubblico, completa Nome e Stemma in Impostazioni e pubblica la squadra.'}
          </p>

          <button
            onClick={() => setAdminTab('impostazioni')}
            style={{
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              color: 'var(--brand-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: 0,
              marginTop: '4px',
            }}
          >
            Gestisci stato pubblicazione <ChevronRight size={14} />
          </button>
        </div>

        {/* Card Diagnostica PWA & Installabilità */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-secondary)' }}>
            <Smartphone size={18} />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Requisiti PWA & Installabilità
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Web App Manifest (manifest.json) attivo
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Service Worker per caching shell e supporto offline
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Icone vettoriali ad alta risoluzione (192x192, 512x512)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399' }}>
              <CheckCircle2 size={14} /> Modalità Standalone nativa (iOS e Android)
            </div>
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
            Gli utenti possono installare l'applicazione direttamente sulla schermata Home senza passare dagli app store.
          </p>
        </div>
      </div>

      {/* Prossime Partite in Programma */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="var(--brand-secondary)" />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Prossime Partite in Calendario
            </h3>
          </div>
          <button
            onClick={() => setAdminTab('partite')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--brand-secondary)',
              fontSize: '0.8rem',
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

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Caricamento prossime partite in corso...
          </div>
        ) : upcomingMatches.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {upcomingMatches.map((match) => (
              <div
                key={match.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#ffffff' }}>
                    vs {match.opponentName}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={12} />
                    {match.scheduledAt ? new Date(match.scheduledAt).toLocaleString('it-IT') : 'Data da definire'}
                    {match.competitionName && ` • ${match.competitionName}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--brand-secondary)',
                  }}>
                    {match.status}
                  </span>
                  <button
                    onClick={() => setAdminTab('partite')}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Gestisci
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '10px',
            border: '1px dashed var(--border-subtle)',
          }}>
            <Calendar size={28} style={{ margin: '0 auto 8px auto', display: 'block', color: 'var(--text-dim)' }} />
            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#ffffff', marginBottom: '4px' }}>
              Nessuna partita in programma
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Crea la prima partita per iniziare a popolare il calendario della squadra.
            </div>
            <button
              onClick={() => onOpenMatchModal()}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--brand-secondary)',
                color: '#0f172a',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <PlusCircle size={14} /> Crea Partita
            </button>
          </div>
        )}
      </section>

    </div>
  );
};
