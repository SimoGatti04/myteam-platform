import { createValidMockIdToken } from './test-jwt';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OidcClient,
  loadOidcConfig,
  generateCodeVerifier,
  generateCodeChallenge,
  base64UrlEncode,
  parseJwtPayload,
  STORAGE_KEY_PKCE,
  STORAGE_KEY_SESSION,
  OidcConfig,
  OidcSession,
} from '../src/services/oidc';
import { authService } from '../src/services/auth';
import { isDemoAllowed, isManualAuthAllowed } from '../src/utils/env';

describe('Web W2 — Logto OIDC Admin Authentication Tests', () => {
  const originalFetch = globalThis.fetch;

  const mockConfig: OidcConfig = {
    endpoint: 'https://auth.myteam.local/oidc',
    appId: 'myteam-web-app-client-id',
    apiResource: 'https://api.myteam.local',
    scopes: 'openid profile offline_access platform:admin',
    redirectUri: 'https://myteam.local/callback',
    postLogoutRedirectUri: 'https://myteam.local',
  };

  beforeEach(() => {
    sessionStorage.clear();
    authService.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. PKCE & CRITTOGRAFIA (RFC 7636)
  // ==========================================
  describe('1. PKCE and Cryptographic Helpers', () => {
    it('generates high-entropy base64url code_verifier between 43 and 128 characters', () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      expect(verifier1.length).toBeGreaterThanOrEqual(43);
      expect(verifier1.length).toBeLessThanOrEqual(128);
      expect(verifier2.length).toBeGreaterThanOrEqual(43);
      expect(verifier2.length).toBeLessThanOrEqual(128);
      expect(verifier1).not.toBe(verifier2);
      // Solo caratteri unreserved URL
      expect(verifier1).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('calculates SHA-256 S256 code_challenge deterministically', async () => {
      // Test vector con verifier noto
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const challenge = await generateCodeChallenge(verifier);

      expect(challenge).toBeDefined();
      expect(challenge).toHaveLength(43);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);

      // Secondo calcolo deve essere identico
      const challenge2 = await generateCodeChallenge(verifier);
      expect(challenge).toBe(challenge2);
    });

    it('base64UrlEncode strips padding and replaces + and /', () => {
      const testBytes = new Uint8Array([251, 239]); // In standard base64 produce caratteri con '+' o '/'
      const encoded = base64UrlEncode(testBytes);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });

    it('parseJwtPayload extracts claims safely without signature verification', () => {
      // Token fittizio header.payload.signature
      const payloadObj = { sub: 'user_123', scope: 'platform:admin', exp: Math.floor(Date.now() / 1000) + 3600 };
      const base64Payload = btoa(JSON.stringify(payloadObj));
      const fakeJwt = `eyJhbGciOiJSUzI1NiJ9.${base64Payload}.fakeSignature`;

      const claims = parseJwtPayload(fakeJwt);
      expect(claims).not.toBeNull();
      expect(claims?.sub).toBe('user_123');
      expect(claims?.scope).toBe('platform:admin');

      // Stringa non valida restituisce null senza crash
      expect(parseJwtPayload('invalid-jwt')).toBeNull();
    });
  });

  // ==========================================
  // 2. CONFIGURAZIONE E AMBIENTI OIDC
  // ==========================================
  describe('2. OIDC Configuration Handling', () => {
    it('returns null when VITE_LOGTO_ENDPOINT, VITE_LOGTO_APP_ID or VITE_LOGTO_API_RESOURCE is missing', () => {
      const config1 = loadOidcConfig({ VITE_LOGTO_ENDPOINT: '' });
      expect(config1).toBeNull();

      const config2 = loadOidcConfig({ VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc' });
      expect(config2).toBeNull();

      const config3 = loadOidcConfig({
        VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc',
        VITE_LOGTO_APP_ID: 'app-client-123',
      });
      expect(config3).toBeNull();
    });

    it('correctly parses full configuration and sets default scopes including platform:admin', () => {
      const config = loadOidcConfig({
        VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc/',
        VITE_LOGTO_APP_ID: 'app-client-123',
        VITE_LOGTO_API_RESOURCE: 'https://api.myteam.local',
      });

      expect(config).not.toBeNull();
      expect(config?.endpoint).toBe('https://auth.myteam.local/oidc');
      expect(config?.appId).toBe('app-client-123');
      expect(config?.apiResource).toBe('https://api.myteam.local');
      expect(config?.scopes).toContain('platform:admin');
      expect(config?.scopes).toContain('openid');
    });

    it('isConfigured reports false when unconfigured and true when configured', () => {
      const clientUnconfigured = new OidcClient(null);
      expect(clientUnconfigured.isConfigured()).toBe(false);

      const clientConfigured = new OidcClient(mockConfig);
      expect(clientConfigured.isConfigured()).toBe(true);
    });
  });

  // ==========================================
  // 3. LOGIN REDIRECT & AUTHORIZATION URL
  // ==========================================
  describe('3. Login Redirect and Authorization URL Generation', () => {
    it('builds compliant authorization URL with code_challenge and state, storing PKCE context', async () => {
      const client = new OidcClient(mockConfig);
      const { url, state, codeVerifier } = await client.buildAuthorizationUrl({ returnTo: 'partite' });

      expect(url).toContain('https://auth.myteam.local/oidc/auth');
      const parsedUrl = new URL(url);

      expect(parsedUrl.searchParams.get('client_id')).toBe('myteam-web-app-client-id');
      expect(parsedUrl.searchParams.get('redirect_uri')).toBe('https://myteam.local/callback');
      expect(parsedUrl.searchParams.get('response_type')).toBe('code');
      expect(parsedUrl.searchParams.get('scope')).toContain('platform:admin');
      expect(parsedUrl.searchParams.get('resource')).toBe('https://api.myteam.local');
      expect(parsedUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(parsedUrl.searchParams.get('code_challenge')).toHaveLength(43);
      expect(parsedUrl.searchParams.get('state')).toBe(state);

      // Verifica archiviazione volatile in sessionStorage
      const rawStored = sessionStorage.getItem(STORAGE_KEY_PKCE);
      expect(rawStored).not.toBeNull();
      const stored = JSON.parse(rawStored!);
      expect(stored.state).toBe(state);
      expect(stored.codeVerifier).toBe(codeVerifier);
      expect(stored.returnTo).toBe('partite');
    });

    it('throws error when trying to build authorization URL on unconfigured client', async () => {
      const client = new OidcClient(null);
      await expect(client.buildAuthorizationUrl()).rejects.toThrow(/Logto OIDC non è configurato/);
    });
  });

  // ==========================================
  // 4. CALLBACK & SCAMBIO TOKEN
  // ==========================================
  describe('4. Callback Handling and Token Exchange', () => {
    it('successfully exchanges code for tokens and saves session', async () => {
      const client = new OidcClient(mockConfig);

      // Prepara stato PKCE
      const codeVerifier = generateCodeVerifier();
      const state = 'secure-state-123';
      const nonce = 'secure-nonce-123';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, returnTo: 'impostazioni', createdAt: Date.now() })
      );
      const fakeAccessToken = 'fake-access-token-xyz';
      const fakeIdToken = createValidMockIdToken({ issuer: mockConfig.endpoint, appId: mockConfig.appId, nonce });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: fakeAccessToken,
          id_token: fakeIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid profile platform:admin',
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=auth-code-789&state=${state}`;
      const result = await client.handleAuthorizationCallback(callbackUrl);

      expect(result.session.accessToken).toBe(fakeAccessToken);
      expect(result.session.idToken).toBe(fakeIdToken);
      expect(result.session.tokenType).toBe('Bearer');
      expect(result.session.expiresAt).toBeGreaterThan(Date.now());
      expect(result.returnTo).toBe('impostazioni');

      // Verifica che la richiesta POST /token sia stata effettuata con i parametri corretti
      const tokenCall = (globalThis.fetch as any).mock.calls.find((call: any) => call[0].includes('/token'));
      expect(tokenCall).toBeDefined();
      const fetchArgs = tokenCall;
      expect(fetchArgs[0]).toBe('https://auth.myteam.local/oidc/token');
      expect(fetchArgs[1].method).toBe('POST');
      expect(fetchArgs[1].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const bodyParams = new URLSearchParams(fetchArgs[1].body);
      expect(bodyParams.get('grant_type')).toBe('authorization_code');
      expect(bodyParams.get('client_id')).toBe('myteam-web-app-client-id');
      expect(bodyParams.get('code')).toBe('auth-code-789');
      expect(bodyParams.get('code_verifier')).toBe(codeVerifier);
      expect(bodyParams.get('resource')).toBe('https://api.myteam.local');

      // Verifica pulizia dello stato PKCE
      expect(sessionStorage.getItem(STORAGE_KEY_PKCE)).toBeNull();

      // Verifica sessione salvata in sessionStorage
      const storedSession = client.loadSession();
      expect(storedSession).not.toBeNull();
      expect(storedSession?.accessToken).toBe(fakeAccessToken);
    });

    it('rejects callback when IdP returns an error parameter', async () => {
      const client = new OidcClient(mockConfig);
      const callbackUrl = 'https://myteam.local/callback?error=access_denied&error_description=User+cancelled';

      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Errore durante l'autenticazione IdP: User cancelled/
      );
    });

    it('rejects callback when state does not match (CSRF protection)', async () => {
      const client = new OidcClient(mockConfig);
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier: 'test-verifier', state: 'original-state', createdAt: Date.now() })
      );

      const callbackUrl = 'https://myteam.local/callback?code=some-code&state=forged-state';
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(/possibile attacco CSRF/);
    });

    it('rejects callback when PKCE session is missing or expired', async () => {
      const client = new OidcClient(mockConfig);
      const callbackUrl = 'https://myteam.local/callback?code=some-code&state=any-state';

      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(/Sessione PKCE non trovata o scaduta/);
    });

    it('handles HTTP error during token exchange with server message', async () => {
      const client = new OidcClient(mockConfig);
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier: 'verifier', state: 'state123', createdAt: Date.now() })
      );

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_grant', error_description: 'Authorization code has expired' }),
      });

      const callbackUrl = 'https://myteam.local/callback?code=expired-code&state=state123';
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Scambio token fallito.*Authorization code has expired/
      );
    });

    it('handles network unreachable / offline IdP gracefully', async () => {
      const client = new OidcClient(mockConfig);
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier: 'verifier', state: 'state123', createdAt: Date.now() })
      );

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (network offline)'));

      const callbackUrl = 'https://myteam.local/callback?code=code123&state=state123';
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Identity Provider Logto non raggiungibile o errore di rete/
      );
    });
  });

  // ==========================================
  // 5. SESSION MANAGEMENT & SCADENZA
  // ==========================================
  describe('5. Session Lifetime and Expiration', () => {
    it('loadSession returns null and clears storage when session is expired', () => {
      const client = new OidcClient(mockConfig);

      // Sessione scaduta 1 minuto fa
      const expiredSession: OidcSession = {
        accessToken: 'expired-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 60_000,
      };
      client.saveSession(expiredSession);

      const loaded = client.loadSession();
      expect(loaded).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    });

    it('authService.getAuthToken invalidates session if expired', () => {
      const expiredSession: OidcSession = {
        accessToken: 'expired-token-xyz',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
      };
      authService.setOidcSession(expiredSession);

      expect(authService.getAuthToken()).toBeNull();
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('authService.getAuthHeaders provides Bearer header when token is valid', () => {
      const validSession: OidcSession = {
        accessToken: 'valid-token-123',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      authService.setOidcSession(validSession);

      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getAuthToken()).toBe('valid-token-123');
      expect(authService.getAuthHeaders()).toEqual({
        Authorization: 'Bearer valid-token-123',
      });
      expect(authService.getAuthSource()).toBe('oidc');
    });
  });

  // ==========================================
  // 6. LOGOUT E FINE SESSIONE
  // ==========================================
  describe('6. Logout and Session Invalidation', () => {
    it('logout clears in-memory state and sessionStorage completely', () => {
      const session: OidcSession = {
        accessToken: 'token-to-clear',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      authService.setOidcSession(session);
      expect(authService.isAuthenticated()).toBe(true);

      authService.logout();
      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getAuthToken()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
      expect(sessionStorage.getItem('myteam_admin_auth_token')).toBeNull();
    });

    it('buildEndSessionUrl builds valid Logto end session URL with post_logout_redirect_uri', () => {
      const client = new OidcClient(mockConfig);
      const url = client.buildEndSessionUrl('my-id-token');

      expect(url).toBeDefined();
      expect(url).toContain('https://auth.myteam.local/oidc/session/end');
      const parsed = new URL(url!);
      expect(parsed.searchParams.get('client_id')).toBe('myteam-web-app-client-id');
      expect(parsed.searchParams.get('post_logout_redirect_uri')).toBe('https://myteam.local');
      expect(parsed.searchParams.get('id_token_hint')).toBe('my-id-token');
    });
  });

  // ==========================================
  // 7. SICUREZZA, 401/403 E AMBIENTI
  // ==========================================
  describe('7. Security, 401/403 and Environment Controls', () => {
    it('handleUnauthorized clears authentication state on HTTP 401', () => {
      authService.setAuthToken('test-token');
      expect(authService.isAuthenticated()).toBe(true);

      authService.handleUnauthorized();
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('in production, manualAuthAllowed and demoAllowed are strictly disabled', () => {
      const prodEnv = { MODE: 'production', PROD: true, VITE_APP_ENV: 'production' };
      expect(isManualAuthAllowed(prodEnv)).toBe(false);
      expect(isDemoAllowed(prodEnv)).toBe(false);
    });

    it('in staging, manualAuthAllowed is allowed for testing while demo requires explicit flag', () => {
      const stagingEnvWithoutDemo = { MODE: 'staging', VITE_APP_ENV: 'staging' };
      expect(isManualAuthAllowed(stagingEnvWithoutDemo)).toBe(true);
      expect(isDemoAllowed(stagingEnvWithoutDemo)).toBe(false);

      const stagingEnvWithDemo = { MODE: 'staging', VITE_APP_ENV: 'staging', VITE_ENABLE_DEMO: 'true' };
      expect(isManualAuthAllowed(stagingEnvWithDemo)).toBe(true);
      expect(isDemoAllowed(stagingEnvWithDemo)).toBe(true);
    });
  });
});
