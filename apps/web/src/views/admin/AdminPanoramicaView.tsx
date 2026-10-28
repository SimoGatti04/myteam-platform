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
  Sparkles
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

  // Avvisi Amministrativi Obbligatori secondo le specifiche
  const warnings: { id: string; title: string; desc: string; action: () => void }[] = [];

  if (!isPublished) {
    warnings.push({
      id: 'draft-status',
      title: 'Sito in stato BOZZA',
      desc: 'Il sito non è ancora visibile pubblicamente. Per pubblicarlo verifica che siano inseriti Nome e Stemma in Impostazioni.',
      action: () => setAdminTab('impostazioni'),
    });
  }

  if (!adminTeam?.name || !adminTeam?.crestUrl) {
    warnings.push({
      id: 'missing-identity',
      title: 'Identità squadra incompleta',
      desc: 'Nome della squadra o stemma mancanti. Sono requisiti obbligatori per pubblicare.',
      action: () => setAdminTab('impostazioni'),
    });
  }

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

        <div style={{ display: 'flex', gap: '8px' }}>
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
            <PlusCircle size={15} /> Aggiungi Giocatore
          </button>
        </div>
      </div>

      {/* Sezione Avvisi & Attenzioni Richieste */}
      {warnings.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} /> Attenzioni Richieste ({warnings.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {warnings.map(w => (
              <div
                key={w.id}
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fef3c7' }}>{w.title}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{w.desc}</div>
                </div>
                <button
                  onClick={w.action}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    color: '#fbbf24',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Risolvi
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Stato Squadra & Prossime Gare */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>

        {/* Card Stato Installazione */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="var(--brand-secondary)" /> Profilo Societario
            </h3>
            <span style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: isPublished ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: isPublished ? '#34d399' : '#fbbf24',
            }}>
              {isPublished ? 'PUBBLICATO' : 'IN BOZZA'}
            </span>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', lineHeight: '1.5' }}>
            <div><strong>Nome:</strong> {adminTeam?.name || 'Non configurato'}</div>
            <div><strong>Stemma:</strong> {adminTeam?.crestUrl ? 'Configurato' : 'Mancante'}</div>
            <div><strong>Colori:</strong> {adminTeam?.primaryColor ? `${adminTeam.primaryColor} / ${adminTeam.secondaryColor}` : 'Stile tecnico neutro'}</div>
          </div>

          <button
            onClick={() => setAdminTab('impostazioni')}
            style={{
              marginTop: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--brand-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Modifica impostazioni squadra <ChevronRight size={14} />
          </button>
        </div>

        {/* Card Prossimi Impegni */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} color="var(--brand-secondary)" /> Prossime Gare
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {upcomingMatches.length} in calendario
            </span>
          </div>

          {upcomingMatches.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingMatches.map(m => (
                <div
                  key={m.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>vs {m.opponentName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString('it-IT') : 'Data da definire'}
                    </div>
                  </div>
                  <button
                    onClick={() => onOpenMatchModal(m.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--brand-secondary)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                  >
                    Gestisci
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '12px 0' }}>
              Nessuna partita futura in calendario.
            </div>
          )}

          <button
            onClick={() => setAdminTab('partite')}
            style={{
              marginTop: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--brand-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            Vai al calendario completo <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
