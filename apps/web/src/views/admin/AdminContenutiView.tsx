import React, { useState } from 'react';
import { Layers, Handshake, CheckCircle2, EyeOff, Eye, Info } from 'lucide-react';

export const AdminContenutiView: React.FC = () => {
  // Demonstration of Approved Option B: Multi-season sponsor model
  const [sponsors, setSponsors] = useState([
    {
      id: 'sp-1',
      name: 'Officina Brianza Motors',
      category: 'Main Sponsor',
      associatedSeasons: ['2025/2026', '2026/2027'],
      isActive: true,
      visibility: 'published', // 'draft' | 'published' | 'hidden'
    },
    {
      id: 'sp-2',
      name: 'Pizzeria Il Portico',
      category: 'Technical Partner',
      associatedSeasons: ['2025/2026'],
      isActive: false, // Expired / Inactive: remains in private admin history, not public
      visibility: 'hidden',
    },
  ]);

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
          Gestione Contenuti, Sponsor & Partner (Fase 2)
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Collaborazioni per stagione (Opzione B approvata) e post Instagram selezionati.
        </p>
      </div>

      {/* Model explanation card */}
      <div style={{
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        padding: '16px 20px',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        lineHeight: 1.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--brand-secondary)', fontWeight: 700, marginBottom: '6px' }}>
          <Info size={16} />
          Modello Collaborazioni Multi-Stagione Approvato
        </div>
        Un solo record permanente per sponsor, associato a una o più stagioni. Per comparire sul sito pubblico sono necessarie sia <strong>collaborazione attiva</strong> che <strong>pubblicazione visibile</strong>. Lo storico degli sponsor passati è rigorosamente riservato agli amministratori (nessun archivio pubblico).
      </div>

      {/* Sponsor list */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '20px',
      }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Handshake size={18} color="var(--brand-secondary)" />
          Anagrafica Collaborazioni & Sponsor
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sponsors.map(sp => (
            <div
              key={sp.id}
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.5)',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                  {sp.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {sp.category} • Stagioni: {sp.associatedSeasons.join(', ')}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: sp.isActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  color: sp.isActive ? '#34d399' : '#94a3b8',
                  fontWeight: 600,
                }}>
                  {sp.isActive ? 'Collaborazione Attiva' : 'Non Attiva'}
                </span>

                <span style={{
                  fontSize: '0.75rem',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  backgroundColor: sp.visibility === 'published' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: sp.visibility === 'published' ? '#38bdf8' : '#f87171',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  {sp.visibility === 'published' ? <Eye size={12} /> : <EyeOff size={12} />}
                  {sp.visibility === 'published' ? 'Pubblicato sul Sito' : 'Nascosto'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
