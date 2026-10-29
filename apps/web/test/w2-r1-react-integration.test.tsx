import { createValidMockIdToken } from './test-jwt';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { AppProvider, useApp } from '../src/context/AppContext';
import { AdminLoginView } from '../src/views/admin/AdminLoginView';
import { apiService } from '../src/services/api';
import { authService } from '../src/services/auth';
import {
  oidcClient,
  OidcConfig,
  OidcSession,
  STORAGE_KEY_PKCE,
  STORAGE_KEY_SESSION,
} from '../src/services/oidc';

describe('Web W2-R1 — React Integration & Auth Flows (Prompt Verification)', () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;

  const mockConfig: OidcConfig = {
    endpoint: 'https://auth.simogatti.it/oidc',
    appId: 'myteam-web-app-client',
    apiResource: 'https://api.simogatti.it',
    scopes: 'openid profile platform:admin',
    redirectUri: 'https://myteam.simogatti.it/callback',
    postLogoutRedirectUri: 'https://myteam.simogatti.it',
  };

  let locationAssignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    authService.logout();
    oidcClient.setConfig(mockConfig);
    oidcClient.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token`, end_session_endpoint: `${mockConfig.endpoint}/session/end` });

    locationAssignMock = vi.fn();
    delete (window as any).location;
    window.location = {
      ...originalLocation,
      origin: 'https://myteam.simogatti.it',
      pathname: '/',
      search: '',
      assign: locationAssignMock,
      replace: vi.fn(),
    } as any;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.location = originalLocation;
    vi.restoreAllMocks();
  });

  // Test Consumer Component per verificare lo stato esposto da AppContext
  const StatusConsumer: React.FC<{
    onState?: (state: ReturnType<typeof useApp>) => void;
  }> = ({ onState }) => {
    const app = useApp();
    useEffect(() => {
      onState?.(app);
    }, [app, onState]);

    return (
      <div data-testid="app-status">
        <span data-testid="is-authenticated">{app.isAuthenticated ? 'true' : 'false'}</span>
        <span data-testid="admin-mode">{app.adminMode ? 'true' : 'false'}</span>
        <span data-testid="oidc-error">{app.oidcError || 'none'}</span>
        <span data-testid="auth-source">{app.authSource || 'none'}</span>
        <span data-testid="team-name">{app.adminTeam?.name || 'none'}</span>
        <button data-testid="btn-login-oidc" onClick={() => app.loginWithOidc('impostazioni')}>
          Login OIDC
        </button>
        <button data-testid="btn-logout" onClick={() => app.logoutAdmin({ redirect: true })}>
          Logout
        </button>
      </div>
    );
  };

  // ==========================================
  // 1. LOGIN RIUSCITO E REDIRECT OIDC
  // ==========================================
  it('1. Login riuscito: genera URL autorizzazione conforme con PKCE S256 e state', async () => {
    render(
      <AppProvider>
        <AdminLoginView />
      </AppProvider>
    );

    const ssoButton = screen.getByRole('button', { name: /Accedi con Logto \(SSO\)/i });
    expect(ssoButton).toBeDefined();

    await act(async () => {
      fireEvent.click(ssoButton);
    });

    await waitFor(() => {
      expect(locationAssignMock).toHaveBeenCalledTimes(1);
    });

    const targetUrl = locationAssignMock.mock.calls[0][0];
    expect(targetUrl).toContain('https://auth.simogatti.it/oidc/auth');

    const parsed = new URL(targetUrl);
    expect(parsed.searchParams.get('client_id')).toBe('myteam-web-app-client');
    expect(parsed.searchParams.get('resource')).toBe('https://api.simogatti.it');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('code_challenge')).toBeDefined();
    expect(parsed.searchParams.get('state')).toBeDefined();
    expect(parsed.searchParams.get('nonce')).toBeDefined();

    // Verifica salvataggio PKCE in sessionStorage
    const storedPkceRaw = sessionStorage.getItem(STORAGE_KEY_PKCE);
    expect(storedPkceRaw).not.toBeNull();
    const storedPkce = JSON.parse(storedPkceRaw!);
    expect(storedPkce.codeVerifier).toBeDefined();
    expect(storedPkce.state).toBe(parsed.searchParams.get('state'));
  });

  // ==========================================
  // 2. CALLBACK VALIDO CON SUCCESSO
  // ==========================================
  it('2. Callback valido: scambia authorization code, valida Core e conferma autenticazione', async () => {
    const codeVerifier = 'valid-code-verifier-1234567890-test-verifier';
    const state = 'valid-state-abc';
    const nonce = 'valid-nonce-abc';
    sessionStorage.setItem(
      STORAGE_KEY_PKCE,
      JSON.stringify({ codeVerifier, state, nonce, returnTo: 'partite', createdAt: Date.now() })
    );

    const fakeAccessToken = 'logto-access-token-adm';
    const fakeIdToken = createValidMockIdToken({
      issuer: mockConfig.endpoint,
      appId: mockConfig.appId,
      nonce,
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: fakeAccessToken,
            id_token: fakeIdToken,
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'openid profile platform:admin',
          }),
        };
      }
      if (url.includes('/api/v1/admin/team')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 'team_01',
            name: 'Aurora FC',
            slug: 'aurora-fc',
            publishedAt: null,
          }),
        };
      }
      if (url.includes('openid-configuration')) {
        return { ok: true, status: 200, json: async () => ({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'not_found' }) };
    });

    let capturedState: any;
    render(
      <AppProvider>
        <StatusConsumer onState={(s) => (capturedState = s)} />
      </AppProvider>
    );

    await act(async () => {
      const res = await capturedState.handleOidcCallback(`?code=valid-code-xyz&state=${state}`);
      expect(res.success).toBe(true);
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('true');
      expect(screen.getByTestId('auth-source').textContent).toBe('oidc');
      expect(screen.getByTestId('team-name').textContent).toBe('Aurora FC');
    });

    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getAuthToken()).toBe(fakeAccessToken);
  });

  // ==========================================
  // 3. CALLBACK MANIPOLATO (ATTACCO CSRF)
  // ==========================================
  it('3. Callback manipolato: rifiuta state difforme, previene CSRF e non autentica', async () => {
    const codeVerifier = 'valid-code-verifier';
    const state = 'legitimate-state-999';
    sessionStorage.setItem(
      STORAGE_KEY_PKCE,
      JSON.stringify({ codeVerifier, state, createdAt: Date.now() })
    );

    let capturedState: any;
    render(
      <AppProvider>
        <StatusConsumer onState={(s) => (capturedState = s)} />
      </AppProvider>
    );

    await act(async () => {
      const res = await capturedState.handleOidcCallback('?code=attacker-code&state=forged-state-000');
      expect(res.success).toBe(false);
      expect(res.error).toContain('possibile attacco CSRF');
    });

    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    expect(authService.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
  });

  // ==========================================
  // 4. NESSUN ACCESSO OTTIMISTICO NON CONFERMATO (Punto 3.A)
  // ==========================================
  it('4. Nessun accesso ottimistico: se Core fallisce la verifica permessi, isAuthenticated resta false', async () => {
    const codeVerifier = 'valid-code-verifier';
    const state = 'legitimate-state';
    const nonce = 'legitimate-nonce-4';
    sessionStorage.setItem(
      STORAGE_KEY_PKCE,
      JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
    );

    const validIdToken = createValidMockIdToken({
      issuer: mockConfig.endpoint,
      appId: mockConfig.appId,
      nonce,
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-logto-token',
            id_token: validIdToken,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        };

      }
      if (url.includes('/api/v1/admin/team')) {
        // Backend Core offline o errore 500
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'internal_error' }),
        };
      }
      if (url.includes('openid-configuration')) {
        return { ok: true, status: 200, json: async () => ({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    let capturedState: any;
    render(
      <AppProvider>
        <StatusConsumer onState={(s) => (capturedState = s)} />
      </AppProvider>
    );

    await act(async () => {
      const res = await capturedState.handleOidcCallback(`?code=code-xyz&state=${state}`);
      expect(res.success).toBe(false);
    });

    // isAuthenticated NON deve mai essere rimasto true
    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    expect(authService.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
  });

  // ==========================================
  // 5. 403 CON ERRORE VISIBILE (PERMESSI INSUFFICIENTI) (Punto 3.B)
  // ==========================================
  it('5. Errore 403: mostra errore visibile per mancanza di platform:admin e nessun accesso', async () => {
    const codeVerifier = 'valid-code-verifier';
    const state = 'legitimate-state';
    const nonce = 'legitimate-nonce-5';
    sessionStorage.setItem(
      STORAGE_KEY_PKCE,
      JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
    );

    const validIdToken = createValidMockIdToken({
      issuer: mockConfig.endpoint,
      appId: mockConfig.appId,
      nonce,
    });

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/token')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'user-token-without-admin-scope',
            id_token: validIdToken,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        };
      }
      if (url.includes('/api/v1/admin/team')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'insufficient_permissions' }),
        };
      }
      if (url.includes('openid-configuration')) {
        return { ok: true, status: 200, json: async () => ({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    let capturedState: any;
    render(
      <AppProvider>
        <AdminLoginView />
        <StatusConsumer onState={(s) => (capturedState = s)} />
      </AppProvider>
    );

    await act(async () => {
      const res = await capturedState.handleOidcCallback(`?code=valid-code&state=${state}`);
      expect(res.success).toBe(false);
      expect(res.error).toContain('403');
    });

    expect(authService.isAuthenticated()).toBe(false);
    expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    expect(screen.getByTestId('oidc-error').textContent).toContain('403');
  });

  // ==========================================
  // 6. 401 DOPO SESSIONE INIZIALMENTE VALIDA (Punto 3.B & 3.C)
  // ==========================================
  it('6. Errore 401: invalida automaticamente la sessione e notifica l\'UI tramite listener', async () => {
    const initialSession: OidcSession = {
      accessToken: 'revoked-or-expired-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
    };
    authService.setOidcSession(initialSession);
    expect(authService.isAuthenticated()).toBe(true);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_access_token' }),
    });

    render(
      <AppProvider>
        <StatusConsumer />
      </AppProvider>
    );

    // Eseguiamo una richiesta admin tramite apiService
    await act(async () => {
      const res = await apiService.getAdminTeam();
      expect(res.success).toBe(false);
      expect(res.status).toBe(401);
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
      expect(authService.isAuthenticated()).toBe(false);
      expect(screen.getByTestId('oidc-error').textContent).toContain('401');
    });
  });

  // ==========================================
  // 7. SESSIONE SCADUTA PER TIMESTAMP (TTL)
  // ==========================================
  it('7. Sessione scaduta per timestamp: getAuthToken la invalida e authService la rimuove', () => {
    const expiredSession: OidcSession = {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() - 5000, // Scaduta 5 secondi fa
    };
    authService.setOidcSession(expiredSession);

    expect(authService.getAuthToken()).toBeNull();
    expect(authService.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
  });

  // ==========================================
  // 8. LOGOUT COMPLETO (LOCALE E FEDERATO)
  // ==========================================
  it('8. Logout: distrugge sessione in memoria/storage e costruisce redirect federato IdP', async () => {
    const session: OidcSession = {
      accessToken: 'active-token-123',
      idToken: 'active-id-token-xyz',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
    };
    authService.setOidcSession(session);
    expect(authService.isAuthenticated()).toBe(true);

    render(
      <AppProvider>
        <StatusConsumer />
      </AppProvider>
    );

    const logoutBtn = screen.getByTestId('btn-logout');
    await act(async () => {
      fireEvent.click(logoutBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('is-authenticated').textContent).toBe('false');
    });

    expect(authService.isAuthenticated()).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();

    // Verifica redirect a Logto session/end
    expect(locationAssignMock).toHaveBeenCalledTimes(1);
    const logoutUrl = locationAssignMock.mock.calls[0][0];
    expect(logoutUrl).toContain('https://auth.simogatti.it/oidc/session/end');
    expect(logoutUrl).toContain('id_token_hint=active-id-token-xyz');
    expect(logoutUrl).toContain('post_logout_redirect_uri=https%3A%2F%2Fmyteam.simogatti.it');
  });

  // ==========================================
  // 9. F5 / RIPRISTINO SECONDO POLICY APPROVATA (Punto 3.D)
  // ==========================================
  it('9. Ripristino F5: ripristina OIDC valida; ma in produzione purga token manuali non autorizzati', () => {
    // 9a: Sessione OIDC valida in sessionStorage viene ripristinata al ricaricamento
    const validOidc: OidcSession = {
      accessToken: 'f5-valid-token',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 1800_000,
    };
    sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(validOidc));

    authService.initSession();
    expect(authService.isAuthenticated()).toBe(true);
    expect(authService.getAuthSource()).toBe('oidc');

    // 9b: In produzione, un residuo manuale viene rimosso categoricamente da initSession
    authService.logout();
    sessionStorage.setItem('myteam_admin_auth_token', 'manual-jwt-token');

    // Mock ambiente produzione per testare la pulizia
    vi.stubEnv('VITE_APP_ENV', 'production');
    authService.initSession();

    expect(sessionStorage.getItem('myteam_admin_auth_token')).toBeNull();
    expect(authService.getAuthToken()).toBeNull();
    vi.unstubAllEnvs();
  });

  // ==========================================
  // 10. MANCATA CONFIGURAZIONE IDP (Punto 3.E)
  // ==========================================
  it('10. Mancata configurazione IdP: mostra avviso chiaro e fallisce senza eccezioni fatali', async () => {
    oidcClient.setConfig(null);
    expect(oidcClient.isConfigured()).toBe(false);

    render(
      <AppProvider>
        <AdminLoginView />
        <StatusConsumer />
      </AppProvider>
    );

    expect(screen.getByText(/Provider Logto OIDC non configurato/i)).toBeDefined();

    const loginBtn = screen.getByTestId('btn-login-oidc');
    await act(async () => {
      fireEvent.click(loginBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('oidc-error').textContent).toContain('non configurato');
    });
    expect(locationAssignMock).not.toHaveBeenCalled();
  });

  // ==========================================
  // 11. NESSUN TOKEN AMMINISTRATIVO NELLE RICHIESTE PUBBLICHE
  // ==========================================
  it('11. Nessun token amministrativo nelle richieste pubbliche: isolamento rigoroso header', async () => {
    const adminSession: OidcSession = {
      accessToken: 'super-secret-admin-token-123',
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
    };
    authService.setOidcSession(adminSession);
    expect(authService.isAuthenticated()).toBe(true);

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
    globalThis.fetch = fetchSpy;

    // Chiamata 1: getPublicTeam()
    await apiService.getPublicTeam();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    let requestHeaders: Headers = fetchSpy.mock.calls[0][1]?.headers;
    expect(requestHeaders.get('Authorization')).toBeNull();

    // Chiamata 2: getPublicRoster()
    await apiService.getPublicRoster();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    requestHeaders = fetchSpy.mock.calls[1][1]?.headers;
    expect(requestHeaders.get('Authorization')).toBeNull();

    // Chiamata 3: getPublicMatches()
    await apiService.getPublicMatches();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    requestHeaders = fetchSpy.mock.calls[2][1]?.headers;
    expect(requestHeaders.get('Authorization')).toBeNull();

    // Chiamata 4: getAdminTeam() - Deve invece includere Authorization!
    await apiService.getAdminTeam();
    expect(fetchSpy).toHaveBeenCalledTimes(4);
    requestHeaders = fetchSpy.mock.calls[3][1]?.headers;
    expect(requestHeaders.get('Authorization')).toBe('Bearer super-secret-admin-token-123');
  });
});
