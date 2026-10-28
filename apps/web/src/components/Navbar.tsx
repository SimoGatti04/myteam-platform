import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Shield,
  Calendar,
  Users,
  BarChart2,
  Vote,
  LayoutDashboard,
  Settings,
  Layers,
  Sparkles,
  Lock,
  Globe,
  Menu,
  X,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    adminMode,
    setAdminMode,
    adminTab,
    setAdminTab,
    publicTeam,
    adminTeam,
    dataMode,
    setDataMode,
    isDemoData,
    isAuthenticated,
    logoutAdmin,
    setSelectedMatchId,
    setSelectedPlayerId,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setSelectedMatchId(null);
    setSelectedPlayerId(null);
    setMobileMenuOpen(false);
  };

  const handleAdminNavClick = (tab: typeof adminTab) => {
    setAdminTab(tab);
    setMobileMenuOpen(false);
  };

  const isPublished = Boolean(adminTeam?.publishedAt);

  return (
    <header style={{
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      width: '100%',
    }}>
      {/* Top Banner: Status, Demo & Admin Switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 16px',
        fontSize: '0.75rem',
        backgroundColor: adminMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.6)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isDemoData ? (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              color: '#f59e0b',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontWeight: 700,
              border: '1px solid rgba(245, 158, 11, 0.4)',
            }}>
              <Sparkles size={12} /> MODALITÀ DIMOSTRATIVA (MOCK DI SVILUPPO)
            </span>
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontWeight: 600,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <Globe size={12} /> DATI REALI (Core Platform API)
            </span>
          )}

          {/* Toggle modalità Dati REALE / DEMO esplicito */}
          <button
            onClick={() => setDataMode(dataMode === 'real' ? 'demo' : 'real')}
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-dim)',
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Passa tra chiamate API reali e dati dimostrativi di sviluppo"
          >
            <RefreshCw size={10} />
            Passa a {dataMode === 'real' ? 'Demo' : 'Reale'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {adminMode && isAuthenticated && !isDemoData && (
            <button
              onClick={logoutAdmin}
              style={{
                background: 'none',
                border: 'none',
                color: '#f87171',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
              }}
              title="Disconnetti Bearer Token"
            >
              <LogOut size={12} /> Esci
            </button>
          )}

          <button
            onClick={() => setAdminMode(!adminMode)}
            style={{
              backgroundColor: adminMode ? 'var(--brand-secondary)' : 'transparent',
              color: adminMode ? '#0f172a' : 'var(--text-muted)',
              border: adminMode ? 'none' : '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '3px 10px',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
          >
            {adminMode ? <Globe size={12} /> : <Lock size={12} />}
            {adminMode ? 'Vai a Sito Pubblico' : 'Area Admin'}
          </button>
        </div>
      </div>

      {/* Main Bar: Brand & Primary Navigation */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {/* Brand/Team Identity */}
        <div
          onClick={() => {
            if (adminMode) setAdminTab('panoramica');
            else handleNavClick('home');
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          {publicTeam?.crestUrl ? (
            <img
              src={publicTeam.crestUrl}
              alt={publicTeam.name}
              style={{ width: '38px', height: '38px', objectFit: 'contain' }}
            />
          ) : (
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: 'var(--brand-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-secondary)',
              border: '1px solid var(--brand-secondary)',
            }}>
              <Shield size={20} />
            </div>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1.2 }}>
              {publicTeam?.name || 'MAPI GROUP'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>Prima Squadra</span>
              {adminMode && (
                <span style={{
                  color: 'var(--brand-secondary)',
                  fontWeight: 600,
                  fontSize: '0.68rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  • Pannello Admin
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav style={{ display: 'none' }} className="desktop-nav">
          <style>{`
            @media (min-width: 768px) {
              .desktop-nav { display: flex !important; align-items: center; gap: 6px; }
              .mobile-toggle { display: none !important; }
            }
          `}</style>

          {!adminMode ? (
            // Cinque Voci Pubbliche Approvate
            <>
              <button
                onClick={() => handleNavClick('home')}
                style={{
                  ...navButtonStyle(activeTab === 'home'),
                }}
              >
                <Shield size={16} /> Home
              </button>
              <button
                onClick={() => handleNavClick('partite')}
                style={{
                  ...navButtonStyle(activeTab === 'partite'),
                }}
              >
                <Calendar size={16} /> Partite
              </button>
              <button
                onClick={() => handleNavClick('rosa')}
                style={{
                  ...navButtonStyle(activeTab === 'rosa'),
                }}
              >
                <Users size={16} /> Rosa
              </button>
              <button
                onClick={() => handleNavClick('statistiche')}
                style={{
                  ...navButtonStyle(activeTab === 'statistiche'),
                }}
              >
                <BarChart2 size={16} /> Statistiche
              </button>
              {/* Votazioni: In Real Mode, modulo Fase 2. Visibile solo con avviso o in demo */}
              <button
                onClick={() => handleNavClick('votazioni')}
                style={{
                  ...navButtonStyle(activeTab === 'votazioni'),
                }}
              >
                <Vote size={16} /> Votazioni
              </button>
            </>
          ) : (
            // Sei Sezioni Amministrative Approvate
            <>
              <button
                onClick={() => handleAdminNavClick('panoramica')}
                style={{
                  ...navButtonStyle(adminTab === 'panoramica'),
                }}
              >
                <LayoutDashboard size={16} /> Panoramica
              </button>
              <button
                onClick={() => handleAdminNavClick('partite')}
                style={{
                  ...navButtonStyle(adminTab === 'partite'),
                }}
              >
                <Calendar size={16} /> Partite
              </button>
              <button
                onClick={() => handleAdminNavClick('rosa')}
                style={{
                  ...navButtonStyle(adminTab === 'rosa'),
                }}
              >
                <Users size={16} /> Rosa
              </button>
              <button
                onClick={() => handleAdminNavClick('votazioni')}
                style={{
                  ...navButtonStyle(adminTab === 'votazioni'),
                }}
              >
                <Vote size={16} /> Votazioni
              </button>
              <button
                onClick={() => handleAdminNavClick('contenuti')}
                style={{
                  ...navButtonStyle(adminTab === 'contenuti'),
                }}
              >
                <Layers size={16} /> Contenuti
              </button>
              <button
                onClick={() => handleAdminNavClick('impostazioni')}
                style={{
                  ...navButtonStyle(adminTab === 'impostazioni'),
                }}
              >
                <Settings size={16} /> Impostazioni
              </button>
            </>
          )}
        </nav>

        {/* Mobile Hamburger Toggle */}
        <button
          className="mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            padding: '8px',
          }}
          aria-label="Apri Menu"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.98)',
          borderTop: '1px solid var(--border-subtle)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          {!adminMode ? (
            <>
              <button onClick={() => handleNavClick('home')} style={mobileNavButtonStyle(activeTab === 'home')}>
                <Shield size={18} /> Home
              </button>
              <button onClick={() => handleNavClick('partite')} style={mobileNavButtonStyle(activeTab === 'partite')}>
                <Calendar size={18} /> Partite
              </button>
              <button onClick={() => handleNavClick('rosa')} style={mobileNavButtonStyle(activeTab === 'rosa')}>
                <Users size={18} /> Rosa
              </button>
              <button onClick={() => handleNavClick('statistiche')} style={mobileNavButtonStyle(activeTab === 'statistiche')}>
                <BarChart2 size={18} /> Statistiche
              </button>
              <button onClick={() => handleNavClick('votazioni')} style={mobileNavButtonStyle(activeTab === 'votazioni')}>
                <Vote size={18} /> Votazioni
              </button>
            </>
          ) : (
            <>
              <button onClick={() => handleAdminNavClick('panoramica')} style={mobileNavButtonStyle(adminTab === 'panoramica')}>
                <LayoutDashboard size={18} /> Panoramica
              </button>
              <button onClick={() => handleAdminNavClick('partite')} style={mobileNavButtonStyle(adminTab === 'partite')}>
                <Calendar size={18} /> Partite
              </button>
              <button onClick={() => handleAdminNavClick('rosa')} style={mobileNavButtonStyle(adminTab === 'rosa')}>
                <Users size={18} /> Rosa
              </button>
              <button onClick={() => handleAdminNavClick('votazioni')} style={mobileNavButtonStyle(adminTab === 'votazioni')}>
                <Vote size={18} /> Votazioni
              </button>
              <button onClick={() => handleAdminNavClick('contenuti')} style={mobileNavButtonStyle(adminTab === 'contenuti')}>
                <Layers size={18} /> Contenuti
              </button>
              <button onClick={() => handleAdminNavClick('impostazioni')} style={mobileNavButtonStyle(adminTab === 'impostazioni')}>
                <Settings size={18} /> Impostazioni
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};

const navButtonStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 14px',
  borderRadius: '8px',
  fontSize: '0.85rem',
  fontWeight: isActive ? 700 : 500,
  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
  color: isActive ? '#ffffff' : 'var(--text-muted)',
  border: isActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});

const mobileNavButtonStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '12px 16px',
  borderRadius: '10px',
  fontSize: '0.95rem',
  fontWeight: isActive ? 700 : 500,
  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
  color: isActive ? '#ffffff' : 'var(--text-muted)',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
});
