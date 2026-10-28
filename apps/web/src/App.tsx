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

export const App: React.FC = () => {
  const { adminMode, activeTab, adminTab, setAdminTab, isAuthenticated, isDemoData } = useApp();

  // Quick Action Modal states shared between Panoramica and sub-views
  const [modalMatchId, setModalMatchId] = useState<string | null>(null);
  const [modalNewPlayerOpen, setModalNewPlayerOpen] = useState<boolean>(false);

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
      <Navbar />

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
