import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { PublicTeamDto, AdminTeamDto } from '@myteam/contracts';
import { apiService, type ApiResult } from '../services/api';
import { authService } from '../services/auth';
import { deriveThemeTokens, applyThemeToDocument, NEUTRAL_THEME, type ThemeTokens, type TokenOverrides } from '../services/theme';
import { isDemoAllowed } from '../utils/env';

export type DataMode = 'real' | 'demo';

export interface LoadState {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: { status: number; errorCode: string; message: string } | null;
}

interface AppContextType {
  // Modalità Dati (REALE vs DEMO)
  dataMode: DataMode;
  setDataMode: (mode: DataMode) => void;
  isDemoData: boolean;
  demoAllowed: boolean;

  // Navigazione
  activeTab: 'home' | 'partite' | 'rosa' | 'statistiche' | 'votazioni';
  setActiveTab: (tab: 'home' | 'partite' | 'rosa' | 'statistiche' | 'votazioni') => void;
  adminMode: boolean;
  setAdminMode: (enabled: boolean) => void;
  adminTab: 'panoramica' | 'partite' | 'rosa' | 'votazioni' | 'contenuti' | 'impostazioni';
  setAdminTab: (tab: 'panoramica' | 'partite' | 'rosa' | 'votazioni' | 'contenuti' | 'impostazioni') => void;

  // Selezione dettaglio
  selectedMatchId: string | null;
  setSelectedMatchId: (id: string | null) => void;
  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;

  // Stato Dati Squadra Pubblica
  publicTeam: PublicTeamDto | null;
  publicTeamState: LoadState;
  refreshPublicTeam: () => Promise<void>;

  // Stato Dati Squadra Admin
  adminTeam: AdminTeamDto | null;
  adminTeamState: LoadState;
  refreshAdminTeam: () => Promise<void>;

  // Autenticazione Logto
  isAuthenticated: boolean;
  loginAdminWithToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: () => void;

  // Personalizzazione Colori & Tema
  themeTokens: ThemeTokens;
  tokenOverrides: TokenOverrides | null;
  setTokenOverrides: (overrides: TokenOverrides | null) => void;

  // PWA
  showPwaBanner: boolean;
  dismissPwaBanner: () => void;
  isPwaInstallable: boolean;
  installPwa: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const demoAllowed = isDemoAllowed();

  // Determinazione iniziale modalità:
  // In produzione: SEMPRE e RIGOROSAMENTE 'real'. Nessun demo consentito.
  // In sviluppo autorizzato: verifica query param ?demo=true o sessionStorage o default 'real'.
  const [dataMode, setDataModeState] = useState<DataMode>(() => {
    if (!demoAllowed) {
      return 'real';
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('demo') === 'true' || params.get('demo') === '1') {
        return 'demo';
      }
      try {
        const stored = sessionStorage.getItem('myteam_data_mode');
        if (stored === 'demo' || stored === 'real') {
          return stored;
        }
      } catch {
        // storage unavailable
      }
    }
    return 'real';
  });

  const setDataMode = (mode: DataMode) => {
    if (!demoAllowed) {
      // In produzione non è consentito attivare la modalità demo
      setDataModeState('real');
      return;
    }
    setDataModeState(mode);
    try {
      sessionStorage.setItem('myteam_data_mode', mode);
    } catch {
      // storage unavailable
    }
  };

  const isDemoData = dataMode === 'demo' && demoAllowed;

  // Navigazione
  const [activeTab, setActiveTab] = useState<'home' | 'partite' | 'rosa' | 'statistiche' | 'votazioni'>('home');
  const [adminMode, setAdminMode] = useState<boolean>(false);
  const [adminTab, setAdminTab] = useState<'panoramica' | 'partite' | 'rosa' | 'votazioni' | 'contenuti' | 'impostazioni'>('panoramica');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Stato Dati
  const [publicTeam, setPublicTeam] = useState<PublicTeamDto | null>(null);
  const [publicTeamState, setPublicTeamState] = useState<LoadState>({ status: 'idle', error: null });

  const [adminTeam, setAdminTeam] = useState<AdminTeamDto | null>(null);
  const [adminTeamState, setAdminTeamState] = useState<LoadState>({ status: 'idle', error: null });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authService.isAuthenticated());

  // Tema
  const [tokenOverrides, setTokenOverrides] = useState<TokenOverrides | null>(null);
  const [themeTokens, setThemeTokens] = useState<ThemeTokens>(NEUTRAL_THEME);

  // PWA Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPwaBanner, setShowPwaBanner] = useState<boolean>(true);
  const [isPwaInstallable, setIsPwaInstallable] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsPwaInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const installPwa = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsPwaInstallable(false);
      }
      setDeferredPrompt(null);
    } else {
      alert('Per installare la PWA: su iOS Safari premi "Condividi" -> "Aggiungi a Home", oppure su Chrome / Edge seleziona "Installa app" dalla barra degli indirizzi.');
    }
  };

  const dismissPwaBanner = () => {
    setShowPwaBanner(false);
  };

  // Caricamento Dati Pubblici della Squadra
  const refreshPublicTeam = useCallback(async () => {
    if (isDemoData) {
      const demoTeam = apiService.getDemoPublicTeam();
      setPublicTeam(demoTeam);
      setPublicTeamState({ status: 'success', error: null });
      return;
    }

    setPublicTeamState(prev => ({ ...prev, status: 'loading' }));
    const result = await apiService.getPublicTeam();
    if (result.success) {
      setPublicTeam(result.data);
      setPublicTeamState({ status: 'success', error: null });
    } else {
      setPublicTeam(null);
      setPublicTeamState({
        status: 'error',
        error: {
          status: result.status,
          errorCode: result.errorCode,
          message: result.message,
        },
      });
    }
  }, [isDemoData]);

  // Caricamento Dati Squadra Admin
  const refreshAdminTeam = useCallback(async () => {
    if (isDemoData) {
      const demoAdmin = apiService.getDemoAdminTeam();
      setAdminTeam(demoAdmin);
      setAdminTeamState({ status: 'success', error: null });
      return;
    }

    if (!authService.isAuthenticated()) {
      setAdminTeam(null);
      setAdminTeamState({
        status: 'error',
        error: {
          status: 401,
          errorCode: 'authentication_required',
          message: 'Autenticazione richiesta per accedere ai dati amministrativi.',
        },
      });
      return;
    }

    setAdminTeamState(prev => ({ ...prev, status: 'loading' }));
    const result = await apiService.getAdminTeam();
    if (result.success) {
      setAdminTeam(result.data);
      setAdminTeamState({ status: 'success', error: null });
    } else {
      setAdminTeam(null);
      setAdminTeamState({
        status: 'error',
        error: {
          status: result.status,
          errorCode: result.errorCode,
          message: result.message,
        },
      });
      if (result.status === 401) {
        authService.logout();
        setIsAuthenticated(false);
      }
    }
  }, [isDemoData]);

  // Ricarica quando cambia dataMode o adminMode
  useEffect(() => {
    refreshPublicTeam();
    if (adminMode) {
      refreshAdminTeam();
    }
  }, [dataMode, refreshPublicTeam, refreshAdminTeam, adminMode]);

  // Aggiornamento dinamico tema basato sulla squadra attiva
  useEffect(() => {
    const activeTeamSource = adminMode && adminTeam ? adminTeam : publicTeam;
    const tokens = deriveThemeTokens(
      activeTeamSource?.primaryColor || null,
      activeTeamSource?.secondaryColor || null,
      tokenOverrides
    );
    setThemeTokens(tokens);
    applyThemeToDocument(tokens);
  }, [publicTeam, adminTeam, adminMode, tokenOverrides]);

  // Autenticazione Admin
  const loginAdminWithToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    if (!token || token.trim().length === 0) {
      return { success: false, error: 'Il token Bearer non può essere vuoto.' };
    }

    authService.setAuthToken(token.trim());
    setIsAuthenticated(true);

    // Verifica immediata chiamando GET /admin/team
    const result = await apiService.getAdminTeam();
    if (result.success) {
      setAdminTeam(result.data);
      setAdminTeamState({ status: 'success', error: null });
      return { success: true };
    } else {
      authService.logout();
      setIsAuthenticated(false);
      setAdminTeam(null);
      setAdminTeamState({
        status: 'error',
        error: {
          status: result.status,
          errorCode: result.errorCode,
          message: result.message,
        },
      });
      return { success: false, error: `${result.message} (HTTP ${result.status} - ${result.errorCode})` };
    }
  };

  const logoutAdmin = () => {
    authService.logout();
    setIsAuthenticated(false);
    setAdminTeam(null);
    setAdminTeamState({ status: 'idle', error: null });
  };

  return (
    <AppContext.Provider
      value={{
        dataMode,
        setDataMode,
        isDemoData,
        demoAllowed,
        activeTab,
        setActiveTab,
        adminMode,
        setAdminMode,
        adminTab,
        setAdminTab,
        selectedMatchId,
        setSelectedMatchId,
        selectedPlayerId,
        setSelectedPlayerId,
        publicTeam,
        publicTeamState,
        refreshPublicTeam,
        adminTeam,
        adminTeamState,
        refreshAdminTeam,
        isAuthenticated,
        loginAdminWithToken,
        logoutAdmin,
        themeTokens,
        tokenOverrides,
        setTokenOverrides,
        showPwaBanner,
        dismissPwaBanner,
        isPwaInstallable,
        installPwa,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp deve essere utilizzato all\'interno di un AppProvider');
  }
  return context;
};
