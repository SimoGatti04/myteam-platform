import { Sparkles, RefreshCw, Radio, ClipboardList } from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from './context/AppContext';
import { Navbar } from './components/Navbar';
import { HomeView } from './views/HomeView';
import { PartiteView } from './views/PartiteView';
import { RosaView } from './views/RosaView';
import { StatisticheView } from './views/StatisticheView';
import { VotazioniView } from './views/VotazioniView';
import { AdminLoginView } from './views/admin/AdminLoginView';
import { AdminPanoramicaView } from './views/admin/AdminPanoramicaView';
import { AdminPartiteView } from './views/admin/AdminPartiteView';
import { AdminRosaView } from './views/admin/AdminRosaView';
import { AdminVotazioniView } from './views/admin/AdminVotazioniView';
import { AdminContenutiView } from './views/admin/AdminContenutiView';
import { AdminImpostazioniView } from './views/admin/AdminImpostazioniView';
import { readW4PreviewIntent } from './utils/preview';

export const App: React.FC = () => {
  const { adminMode, activeTab, adminTab, setAdminTab, isAuthenticated, isDemoData, pwaUpdateAvailable, applyPwaUpdate } = useApp();

  // Quick Action Modal states shared between Panoramica and sub-views
  const [modalMatchId, setModalMatchId] = useState<string | null>(null);
  const [modalNewPlayerOpen, setModalNewPlayerOpen] = useState<boolean>(false);

  // W4 preview deep link: read once so later navigation does not re-open the report.
  const [initialReportMatchId] = useState<string | null>(() => {
    if (!isDemoData) return null;
    const intent = readW4PreviewIntent();
    return intent?.view === 'admin-report' ? intent.matchId : null;
  });
  const w4PreviewIntent = isDemoData ? readW4PreviewIntent() : null;

  const handleOpenMatchModal = (matchId?: string) => {
    setAdminTab('partite');
    setModalMatchId(matchId || `match-${Date.now()}`);
  };

  const handleOpenPlayerModal = () => {
    setAdminTab('rosa');
    setModalNewPlayerOpen(true);
  };

  // Se l'amministratore è in modalità reale ma non ancora autenticato con Bearer token Logto
  const showAdminLogin = adminMode && !isDemoData && !isAuthenticated;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {pwaUpdateAvailable && (
        <div style={{
          backgroundColor: '#0284c7',
          color: '#ffffff',
          padding: '10px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.82rem',
          zIndex: 100,
          borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} />
            <span><strong>Nuova versione dell'app disponibile!</strong> Gli asset sono stati aggiornati.</span>
          </div>
          <button
            onClick={applyPwaUpdate}
            style={{
              padding: '4px 12px',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <RefreshCw size={12} /> Aggiorna ora
          </button>
        </div>
      )}
      <Navbar />

      {w4PreviewIntent && (
        <div className="w4-preview-ribbon" role="note" aria-label="Anteprima W4 con dati demo">
          <div className="w4-preview-ribbon__text">
            <Radio size={15} />
            <strong>ANTEPRIMA W4</strong>
            <span>Fixture demo esplicite · nessuna chiamata backend · modifiche solo in sessionStorage</span>
          </div>
          <nav className="w4-preview-ribbon__links" aria-label="Scorciatoie anteprima">
            <a href="?demo=true&preview=match-detail&match=m-last" className="w4-preview-ribbon__link">
              <Radio size={13} /> Dettaglio pubblico
            </a>
            <a href="?demo=true&preview=admin-report&match=m-last" className="w4-preview-ribbon__link">
              <ClipboardList size={13} /> Referto admin
            </a>
          </nav>
        </div>
      )}

      <main style={{ flex: 1, padding: '16px 0 40px 0' }}>
        {!adminMode ? (
          <>
            {activeTab === 'home' && <HomeView />}
            {activeTab === 'partite' && <PartiteView />}
            {activeTab === 'rosa' && <RosaView />}
            {activeTab === 'statistiche' && <StatisticheView />}
            {activeTab === 'votazioni' && <VotazioniView />}
          </>
        ) : showAdminLogin ? (
          <AdminLoginView />
        ) : (
          <>
            {adminTab === 'panoramica' && (
              <AdminPanoramicaView
                onOpenMatchModal={handleOpenMatchModal}
                onOpenPlayerModal={handleOpenPlayerModal}
              />
            )}
            {adminTab === 'partite' && (
              <AdminPartiteView
                openModalWithMatchId={modalMatchId}
                onCloseModal={() => setModalMatchId(null)}
                initialReportMatchId={initialReportMatchId}
              />
            )}
            {adminTab === 'rosa' && (
              <AdminRosaView
                openNewPlayerModal={modalNewPlayerOpen}
                onCloseNewPlayerModal={() => setModalNewPlayerOpen(false)}
              />
            )}
            {adminTab === 'votazioni' && <AdminVotazioniView />}
            {adminTab === 'contenuti' && <AdminContenutiView />}
            {adminTab === 'impostazioni' && <AdminImpostazioniView />}
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        backgroundColor: 'rgba(11, 15, 23, 0.9)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '24px 16px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-dim)',
      }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            myteam-platform • PWA & Responsive Web Frontend
          </div>
          <div>
            Conforme a contratti di dominio Core • Specifiche di prodotto approvate
          </div>
        </div>
      </footer>
    </div>
  );
};
