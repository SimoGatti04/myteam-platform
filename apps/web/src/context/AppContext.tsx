import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { PublicTeamDto, AdminTeamDto } from '@myteam/contracts';
import { apiService } from '../services/api';
import { authService, AuthSource, SessionInfo } from '../services/auth';
import { oidcClient } from '../services/oidc';
import { deriveThemeTokens, applyThemeToDocument, NEUTRAL_THEME, type ThemeTokens, type TokenOverrides } from '../services/theme';
import { isDemoAllowed, isManualAuthAllowed } from '../utils/env';

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
  manualAuthAllowed: boolean;

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

  // Autenticazione OIDC Logto & Collaudo
  isAuthenticated: boolean;
  authSource: AuthSource;
  sessionInfo: SessionInfo | null;
  oidcConfigured: boolean;
  oidcLoading: boolean;
  oidcError: string | null;
  clearOidcError: () => void;
  loginWithOidc: (returnPath?: string) => Promise<void>;
  handleOidcCallback: (search: string) => Promise<{ success: boolean; error?: string }>;
  loginAdminWithToken: (token: string) => Promise<{ success: boolean; error?: string }>;
  logoutAdmin: (options?: { redirect?: boolean }) => Promise<void>;

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
  const manualAuthAllowed = isManualAuthAllowed();
  const oidcConfigured = oidcClient.isConfigured();

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

  // Selezione dettaglio
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Stato Squadra Pubblica
  const [publicTeam, setPublicTeam] = useState<PublicTeamDto | null>(null);
  const [publicTeamState, setPublicTeamState] = useState<LoadState>({
    status: 'idle',
    error: null,
  });

  // Stato Squadra Admin
  const [adminTeam, setAdminTeam] = useState<AdminTeamDto | null>(null);
  const [adminTeamState, setAdminTeamState] = useState<LoadState>({
    status: 'idle',
    error: null,
  });

  // Autenticazione
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => authService.isAuthenticated());
  const [oidcLoading, setOidcLoading] = useState<boolean>(false);
  const [oidcError, setOidcError] = useState<string | null>(null);

  const clearOidcError = () => setOidcError(null);

  // Tema
  const [tokenOverrides, setTokenOverrides] = useState<TokenOverrides | null>(null);
  const [themeTokens, setThemeTokens] = useState<ThemeTokens>(NEUTRAL_THEME);

  // PWA Prompt State
  const [showPwaBanner, setShowPwaBanner] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !sessionStorage.getItem('myteam_pwa_banner_dismissed');
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
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

  const dismissPwaBanner = () => {
    setShowPwaBanner(false);
    try {
      sessionStorage.setItem('myteam_pwa_banner_dismissed', 'true');
    } catch {
      // storage unavailable
    }
  };

  const installPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsPwaInstallable(false);
      setShowPwaBanner(false);
    }
    setDeferredPrompt(null);
  };

  // Caricamento Dati Squadra Pubblica
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

  // Gestione Callback OIDC al caricamento dell'applicazione
  const handleOidcCallback = useCallback(async (searchQuery: string): Promise<{ success: boolean; error?: string }> => {
    setOidcLoading(true);
    setOidcError(null);
    try {
      const { session, returnTo } = await oidcClient.handleAuthorizationCallback(searchQuery);
      authService.setOidcSession(session);
      setIsAuthenticated(true);

      // Carica i dati admin per verificare i permessi effettivi con Core
      const teamRes = await apiService.getAdminTeam();
      if (teamRes.success) {
        setAdminTeam(teamRes.data);
        setAdminTeamState({ status: 'success', error: null });
        if (returnTo && ['panoramica', 'partite', 'rosa', 'votazioni', 'contenuti', 'impostazioni'].includes(returnTo)) {
          setAdminTab(returnTo as any);
        }
        setOidcLoading(false);
        return { success: true };
      } else {
        // Se il backend risponde 403, significa che l'utente è autenticato su Logto ma manca il ruolo/scope platform:admin
        authService.logout();
        setIsAuthenticated(false);
        setAdminTeam(null);
        const errMessage = teamRes.status === 403
          ? "Accesso negato: il tuo account Logto non dispone dei permessi amministrativi richiesti (ruolo/scope 'platform:admin')."
          : (teamRes.message || "Errore durante la verifica dei permessi amministrativi con il backend Core.");
        setOidcError(errMessage);
        setOidcLoading(false);
        return { success: false, error: errMessage };
      }
    } catch (err: any) {
      authService.logout();
      setIsAuthenticated(false);
      setAdminTeam(null);
      const errMessage = err?.message || "Errore imprevisto durante l'elaborazione del callback OIDC.";
      setOidcError(errMessage);
      setOidcLoading(false);
      return { success: false, error: errMessage };
    }
  }, []);

  // Controllo automatico di query params per callback OIDC su mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has('code');
    const hasError = params.has('error');

    if (hasCode || hasError) {
      setAdminMode(true);
      handleOidcCallback(window.location.search).then(() => {
        // Rimuove i parametri OIDC dalla barra degli indirizzi senza causare un reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      });
    }
  }, [handleOidcCallback]);

  // Avvio redirect login OIDC verso Logto
  const loginWithOidc = async (returnPath?: string): Promise<void> => {
    if (!oidcClient.isConfigured()) {
      setOidcError('Identity Provider Logto non configurato in questo ambiente (mancano VITE_LOGTO_ENDPOINT o VITE_LOGTO_APP_ID).');
      return;
    }
    setOidcLoading(true);
    setOidcError(null);
    try {
      const { url } = await oidcClient.buildAuthorizationUrl({
        returnTo: returnPath || adminTab,
      });
      if (typeof window !== 'undefined') {
        window.location.assign(url);
      }
    } catch (err: any) {
      setOidcLoading(false);
      setOidcError(err?.message || 'Impossibile avviare il reindirizzamento verso Logto.');
    }
  };

  // Autenticazione Admin Manuale (Strumento di Collaudo dev/staging)
  const loginAdminWithToken = async (token: string): Promise<{ success: boolean; error?: string }> => {
    if (!manualAuthAllowed) {
      return {
        success: false,
        error: "L'inserimento manuale del Bearer token è disabilitato in questo ambiente di produzione. Utilizzare l'accesso OIDC Logto.",
      };
    }
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
      return {
        success: false,
        error: result.message || 'Verifica token fallita sul backend Core.',
      };
    }
  };

  const logoutAdmin = async (options?: { redirect?: boolean }): Promise<void> => {
    authService.logout(options);
    setIsAuthenticated(false);
    setAdminTeam(null);
    setAdminTeamState({ status: 'idle', error: null });
    setOidcError(null);
  };

  return (
    <AppContext.Provider
      value={{
        dataMode,
        setDataMode,
        isDemoData,
        demoAllowed,
        manualAuthAllowed,
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
        authSource: authService.getAuthSource(),
        sessionInfo: authService.getSessionInfo(),
        oidcConfigured,
        oidcLoading,
        oidcError,
        clearOidcError,
        loginWithOidc,
        handleOidcCallback,
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
    throw new Error("useApp deve essere utilizzato all'interno di un AppProvider");
  }
  return context;
};
