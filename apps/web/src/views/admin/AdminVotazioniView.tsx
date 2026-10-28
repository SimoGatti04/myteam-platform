import React from 'react';
import { Vote, Award, Calendar, AlertCircle, Info } from 'lucide-react';

export const AdminVotazioniView: React.FC = () => {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff' }}>
          Gestione Votazioni & Premi (Fase 2)
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Modulo approvato nella roadmap di prodotto. Gestione cicli POTM, Player of the Month e registrazione di premi storici.
        </p>
      </div>

      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        padding: '24px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--brand-secondary)' }}>
          <Vote size={22} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
            Architettura del Motore Unico di Voto
          </h3>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '16px' }}>
          In questa sezione l'amministratore gestirà i cicli di voto delle gare ufficiali, i candidati generati automaticamente dalla distinta effettiva della partita, e la <strong>registrazione di premi storici già assegnati senza votazioni fittizie</strong> (Opzione B approvata).
        </p>

        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          borderRadius: '10px',
          padding: '16px',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          fontSize: '0.8rem',
        }}>
          <div style={{ fontWeight: 700, color: '#ffffff' }}>Regole di Dominio Attive:</div>
          <div style={{ color: 'var(--text-muted)' }}>• POTM e Player of the Month sono validi <strong>esclusivamente per gare ufficiali</strong>.</div>
          <div style={{ color: 'var(--text-muted)' }}>• I risultati parziali delle votazioni aperte restano <strong>privati e riservati</strong> all'amministrazione fino alla chiusura ufficiale.</div>
          <div style={{ color: 'var(--text-muted)' }}>• Nessun vincitore o statistica fittizia viene pubblicata.</div>
        </div>
      </div>
    </div>
  );
};
