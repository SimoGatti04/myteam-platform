import nodeCrypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { useEffect } from 'react';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { AppProvider, useApp } from '../src/context/AppContext';
import { apiService } from '../src/services/api';
import { authService } from '../src/services/auth';
import {
  OidcClient,
  oidcClient,
  loadOidcConfig,
  OidcConfig,
  OidcSession,
  STORAGE_KEY_PKCE,
  STORAGE_KEY_SESSION,
  PKCE_MAX_AGE_MS,
  generateCodeVerifier,
  generateCodeChallenge,
  generateRandomString,
  assertWebCryptoAvailable,
  assertWebCryptoSubtleAvailable,
} from '../src/services/oidc';
import { createValidMockIdToken, createValidMockAccessToken, createMockJwt } from './test-jwt';

describe('Web W2-R2 — OIDC Security, Interoperability & Negative Regression Tests', () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;
  const originalCrypto = globalThis.crypto;

  const mockConfig: OidcConfig = {
    endpoint: 'https://auth.myteam.local/oidc',
    appId: 'myteam-web-app-client-id',
    apiResource: 'https://api.myteam.local',
    scopes: 'openid profile platform:admin',
    redirectUri: 'https://myteam.local/callback',
    postLogoutRedirectUri: 'https://myteam.local',
  };

  beforeEach(() => {
    sessionStorage.clear();
    authService.logout();
    oidcClient.setConfig(mockConfig);

    delete (window as any).location;
    window.location = {
      ...originalLocation,
      origin: 'https://myteam.local',
      pathname: '/',
      search: '',
      assign: vi.fn(),
      replace: vi.fn(),
    } as any;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.location = originalLocation;
    Object.defineProperty(globalThis, 'crypto', {
      value: nodeCrypto.webcrypto,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. VALIDAZIONE RIGOROSA ID TOKEN SECONDO OIDC CORE 1.0
  // =========================================================================
  describe('1. Rigorous ID Token Validation (OIDC Core 1.0)', () => {
    it('rifiuta callback se id_token è mancante nella risposta del token endpoint', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-1';
      const nonce = 'nonce-test-1';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          // id_token omesso
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Risposta del provider priva di id_token.*ID token obbligatorio/
      );
    });

    it('rifiuta callback se id_token è una stringa non JWT o malformata', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-2';
      const nonce = 'nonce-test-2';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: 'not-a-valid-jwt-token-payload',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: token JWT malformato o non valido/
      );
    });

    it('rifiuta callback se id_token ha un issuer difforme da quello configurato', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-3';
      const nonce = 'nonce-test-3';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const forgedIdToken = createValidMockIdToken({
        issuer: 'https://attacker-idp.evil.com/oidc',
        appId: mockConfig.appId,
        nonce,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: forgedIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: issuer non corrispondente/
      );
    });

    it('rifiuta callback se id_token ha un audience (aud) che non include client appId', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-4';
      const nonce = 'nonce-test-4';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const mismatchedAudIdToken = createValidMockIdToken({
        issuer: mockConfig.endpoint,
        appId: 'different-app-id-999',
        nonce,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: mismatchedAudIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: audience non valida/
      );
    });

    it('rifiuta callback se id_token è scaduto (claim exp nel passato)', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-5';
      const nonce = 'nonce-test-5';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const expiredIdToken = createValidMockIdToken({
        issuer: mockConfig.endpoint,
        appId: mockConfig.appId,
        nonce,
        expiresInSec: -300, // Scaduto 5 minuti fa
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: expiredIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: ID token scaduto/
      );
    });

    it('rifiuta callback se id_token è privo del claim nonce obbligatorio', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-6';
      const nonce = 'nonce-test-6';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const nowSec = Math.floor(Date.now() / 1000);
      const idTokenWithoutNonce = createMockJwt({
        iss: mockConfig.endpoint,
        aud: mockConfig.appId,
        exp: nowSec + 3600,
        // nonce assente
        sub: 'usr_admin_123',
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: idTokenWithoutNonce,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: nonce mancante o non corrispondente/
      );
    });

    it('rifiuta callback se id_token ha un nonce non coincidente con quello registrato in PKCE', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-test-7';
      const nonce = 'original-expected-nonce';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const mismatchedNonceIdToken = createValidMockIdToken({
        issuer: mockConfig.endpoint,
        appId: mockConfig.appId,
        nonce: 'attacker-tampered-nonce',
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-access-token',
          id_token: mismatchedNonceIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Validazione ID Token fallita: nonce mancante o non corrispondente/
      );
    });
  });

  // =========================================================================
  // 2. PKCE LIFECYCLE, SCADENZA (5 MIN) & CONSUMO MONOUSO
  // =========================================================================
  describe('2. PKCE State Lifecycle, Expiration and Single-Use Consumption', () => {
    it('rifiuta callback se la sessione PKCE ha superato il TTL di 5 minuti', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-ttl-test';
      const nonce = 'nonce-ttl-test';
      // Più vecchia di 5 minuti
      const expiredCreatedAt = Date.now() - (PKCE_MAX_AGE_MS + 10_000);
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: expiredCreatedAt })
      );

      const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Sessione PKCE scaduta \(tempo limite di 5 minuti superato\)/
      );
    });

    it('garantisce consumo monouso: il secondo tentativo di callback con gli stessi parametri fallisce', async () => {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({ issuer: mockConfig.endpoint, authorization_endpoint: `${mockConfig.endpoint}/auth`, token_endpoint: `${mockConfig.endpoint}/token` });
      const codeVerifier = generateCodeVerifier();
      const state = 'state-single-use';
      const nonce = 'nonce-single-use';
      sessionStorage.setItem(
        STORAGE_KEY_PKCE,
        JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
      );

      const validIdToken = createValidMockIdToken({
        issuer: mockConfig.endpoint,
        appId: mockConfig.appId,
        nonce,
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'valid-token',
          id_token: validIdToken,
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const callbackUrl = `https://myteam.local/callback?code=valid-code&state=${state}`;

      // Primo tentativo: consuma lo stato PKCE da sessionStorage e ha successo
      const res1 = await client.handleAuthorizationCallback(callbackUrl);
      expect(res1.session.accessToken).toBe('valid-token');
      expect(sessionStorage.getItem(STORAGE_KEY_PKCE)).toBeNull();

      // Secondo tentativo immediato: lo stato PKCE è già stato consumato (replay attack protection)
      await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
        /Sessione PKCE non trovata o scaduta/
      );
    });
  });

  // =========================================================================
  // 3. SICUREZZA CRITTOGRAFICA & ASSENZA DI FALLBACK MATH.RANDOM
  // =========================================================================
  describe('3. Cryptographic Security & No Math.random Fallbacks', () => {
    it('solleva eccezione esplicita se crypto.getRandomValues è assente (nessun fallback)', () => {
      const cryptoMock = Object.create(globalThis.crypto);
      Object.defineProperty(cryptoMock, 'getRandomValues', { value: undefined });
      Object.defineProperty(globalThis, 'crypto', {
        value: cryptoMock,
        writable: true,
        configurable: true,
      });

      expect(() => assertWebCryptoAvailable()).toThrow(
        /Web Crypto API \(crypto.getRandomValues\) non disponibile/
      );
      expect(() => generateRandomString()).toThrow(
        /Web Crypto API \(crypto.getRandomValues\) non disponibile/
      );
      expect(() => generateCodeVerifier()).toThrow(
        /Web Crypto API \(crypto.getRandomValues\) non disponibile/
      );
    });

    it('solleva eccezione esplicita se crypto.subtle.digest è assente', async () => {
      const cryptoMock = Object.create(globalThis.crypto);
      Object.defineProperty(cryptoMock, 'subtle', { value: undefined });
      Object.defineProperty(globalThis, 'crypto', {
        value: cryptoMock,
        writable: true,
        configurable: true,
      });

      expect(() => assertWebCryptoSubtleAvailable()).toThrow(
        /Web Crypto API \(crypto.subtle.digest\) non disponibile/
      );
      await expect(generateCodeChallenge('test-verifier')).rejects.toThrow(
        /Web Crypto API \(crypto.subtle.digest\) non disponibile/
      );
    });
  });

  // =========================================================================
  // 4. OIDC DISCOVERY E CONTROLLO DELL'ISSUER
  // =========================================================================
  describe('4. OIDC Discovery & Issuer Verification', () => {
    it('rifiuta discovery se l\'issuer restituito non corrisponde esattamente all\'endpoint configurato', async () => {
      const client = new OidcClient(mockConfig);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('.well-known/openid-configuration')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: 'https://malicious-gateway.io/oidc',
              authorization_endpoint: 'https://malicious-gateway.io/oidc/auth',
              token_endpoint: 'https://malicious-gateway.io/oidc/token',
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      await expect(client.fetchDiscovery()).rejects.toThrow(
        /OIDC discovery: issuer restituito dal provider \("https:\/\/malicious-gateway\.io\/oidc"\) non corrisponde all'endpoint configurato/
      );
    });

    it('rifiuta discovery se i metadati restituiti sono incompleti (mancano endpoint obbligatori)', async () => {
      const client = new OidcClient(mockConfig);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('.well-known/openid-configuration')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              issuer: mockConfig.endpoint,
              authorization_endpoint: 'https://auth.myteam.local/oidc/auth',
              // token_endpoint mancante
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      await expect(client.fetchDiscovery()).rejects.toThrow(
        /OIDC discovery: metadati incompleti/
      );
    });

    it('gestisce con errore esplicito il fallimento HTTP della discovery (es. 500)', async () => {
      const client = new OidcClient(mockConfig);

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('.well-known/openid-configuration')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'server_error' }),
          };
        }
        return { ok: false, status: 404 };
      });

      await expect(client.fetchDiscovery()).rejects.toThrow(
        /OIDC discovery fallita con HTTP 500/
      );
    });
  });

  // =========================================================================
  // 5. SEPARAZIONE RISORSE API E DESTINAZIONE ACCESS TOKEN (getAccessToken)
  // =========================================================================
  describe('5. Resource Separation & Audience Verification (getAccessToken)', () => {
    it('emette il token per la risorsa API Core autorizzata e lo nega per risorse non autorizzate', async () => {
      const client = new OidcClient(mockConfig);
      const session: OidcSession = {
        accessToken: 'core-api-access-token-456',
        idToken: 'id-token-info-123',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      client.saveSession(session);

      // Risorsa corretta (combacia con mockConfig.apiResource)
      const tokenForCore = await client.getAccessToken('https://api.myteam.local');
      expect(tokenForCore).toBe('core-api-access-token-456');

      // Chiamata senza risorsa (default risorsa configurata)
      const defaultToken = await client.getAccessToken();
      expect(defaultToken).toBe('core-api-access-token-456');

      // Risorsa difforme non autorizzata: rifiuto categorico
      const unauthorizedResourceToken = await client.getAccessToken('https://unauthorized-service.org/api');
      expect(unauthorizedResourceToken).toBeNull();
    });

    it('garantisce che l\'ID token non venga mai restituito al posto dell\'access token', async () => {
      const client = new OidcClient(mockConfig);
      const session: OidcSession = {
        accessToken: 'access-token-only',
        idToken: 'id-token-purely-informational',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      client.saveSession(session);

      const returnedToken = await client.getAccessToken('https://api.myteam.local');
      expect(returnedToken).not.toBe('id-token-purely-informational');
      expect(returnedToken).toBe('access-token-only');
    });
  });

  // =========================================================================
  // 6. RIPRISTINO F5 SUBORDINATO A VERIFICA CORE (NESSUN ACCESSO OTTIMISTICO)
  // =========================================================================
  describe('6. F5 Session Restore Subordinate to Core Verification', () => {
    const StatusVerifierConsumer: React.FC<{
      onState?: (state: ReturnType<typeof useApp>) => void;
    }> = ({ onState }) => {
      const app = useApp();
      useEffect(() => {
        onState?.(app);
      }, [app, onState]);

      return (
        <div data-testid="app-state-panel">
          <span data-testid="is-auth">{app.isAuthenticated ? 'true' : 'false'}</span>
          <span data-testid="team-status">{app.adminTeamState.status}</span>
          <button data-testid="btn-enter-admin" onClick={() => app.setAdminMode(true)}>
            Admin
          </button>
        </div>
      );
    };

    it('su reload F5 con token presente, isAuthenticated è false e la dashboard non è presentata finché Core 200 OK non ha risposto', async () => {
      const session: OidcSession = {
        accessToken: 'f5-pending-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      authService.initSession();

      // Mock Core: chiamata ritardata per verificare lo stato transitorio
      let resolveCoreRequest: (value: any) => void;
      const corePromise = new Promise((resolve) => {
        resolveCoreRequest = resolve;
      });

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/admin/team')) {
          await corePromise;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'team_aurora',
              name: 'Aurora FC',
              slug: 'aurora-fc',
              publishedAt: '2026-10-25T10:00:00Z',
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      let stateSnap: any;
      render(
        <AppProvider>
          <StatusVerifierConsumer onState={(s) => (stateSnap = s)} />
        </AppProvider>
      );

      // Entra in modalità admin
      act(() => {
        stateSnap.setAdminMode(true);
      });

      // SUBORDINAZIONE RIGOROSA: mentre Core sta verificando, isAuthenticated resta FALSE!
      expect(screen.getByTestId('is-auth').textContent).toBe('false');
      expect(stateSnap.isAuthenticated).toBe(false);
      expect(stateSnap.adminTeam).toBeNull();

      // Risolve la risposta 200 OK di Core
      await act(async () => {
        resolveCoreRequest!({ ok: true });
      });

      // Solo ORA, dopo verifica positiva con Core, isAuthenticated diventa TRUE
      await waitFor(() => {
        expect(screen.getByTestId('is-auth').textContent).toBe('true');
        expect(stateSnap.isAuthenticated).toBe(true);
        expect(stateSnap.adminTeam?.name).toBe('Aurora FC');
      });
    });

    it('su reload F5, se Core rifiuta il token con 401, la sessione viene distrutta e isAuthenticated resta false', async () => {
      const session: OidcSession = {
        accessToken: 'f5-revoked-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      authService.initSession();

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/admin/team')) {
          return {
            ok: false,
            status: 401,
            json: async () => ({ error: 'token_revoked' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      let stateSnap: any;
      render(
        <AppProvider>
          <StatusVerifierConsumer onState={(s) => (stateSnap = s)} />
        </AppProvider>
      );

      act(() => {
        stateSnap.setAdminMode(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-auth').textContent).toBe('false');
        expect(stateSnap.isAuthenticated).toBe(false);
        expect(authService.isAuthenticated()).toBe(false);
      });

      expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    });

    it('su reload F5, se Core rifiuta il token con 403 (manca platform:admin), mostra errore permessi e nessun accesso', async () => {
      const session: OidcSession = {
        accessToken: 'f5-user-only-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
      };
      sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      authService.initSession();

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/admin/team')) {
          return {
            ok: false,
            status: 403,
            json: async () => ({ error: 'forbidden_missing_role' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      let stateSnap: any;
      render(
        <AppProvider>
          <StatusVerifierConsumer onState={(s) => (stateSnap = s)} />
        </AppProvider>
      );

      act(() => {
        stateSnap.setAdminMode(true);
      });

      await waitFor(() => {
        expect(screen.getByTestId('is-auth').textContent).toBe('false');
        expect(stateSnap.isAuthenticated).toBe(false);
        expect(stateSnap.oidcError).toContain('403');
      });
    });
  });

  // =========================================================================
  // 7. Q3-AUTH-01 & Q3-AUTH-02 SECURITY HARDENING DEDICATED TESTS
  // =========================================================================
  describe('7. Q3-AUTH-01 & Q3-AUTH-02 Security Hardening', () => {
    describe('Q3-AUTH-01: Issuer exact match, multi-audience, and azp validation', () => {
      it('rifiuta callback se l\'issuer dell\'ID token differisce anche solo per trailing slash (nessuna normalizzazione permissiva)', async () => {
        const client = new OidcClient(mockConfig);
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-trailing-slash-1';
        const nonce = 'nonce-trailing-slash-1';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        // ID token con trailing slash rispetto all'endpoint configurato senza slash
        const tokenWithSlash = createValidMockIdToken({
          issuer: `${mockConfig.endpoint}/`,
          appId: mockConfig.appId,
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: tokenWithSlash,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
          /Validazione ID Token fallita: issuer non corrispondente/
        );
      });

      it('rifiuta discovery se l\'issuer restituito differisce per trailing slash rispetto alla configurazione', async () => {
        const client = new OidcClient(mockConfig);

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            issuer: `${mockConfig.endpoint}/`,
            authorization_endpoint: `${mockConfig.endpoint}/auth`,
            token_endpoint: `${mockConfig.endpoint}/token`,
          }),
        });

        await expect(client.fetchDiscovery({ forceRefresh: true })).rejects.toThrow(
          /OIDC discovery: issuer restituito dal provider.*non corrisponde all'endpoint configurato/
        );
      });

      it('rifiuta token multi-audience se il claim azp è mancante (OIDC Core 1.0 §3.1.3.7)', async () => {
        const client = new OidcClient({
          ...mockConfig,
          trustedAudiences: ['https://api.myteam.local'],
        });
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-multiaud-no-azp';
        const nonce = 'nonce-multiaud-no-azp';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        // Multi-audience con audience fidate ma privo di azp
        const multiAudTokenNoAzp = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          aud: [mockConfig.appId, 'https://api.myteam.local'],
          nonce,
          // azp undefined
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: multiAudTokenNoAzp,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
          /claim "azp" obbligatorio per ID token con audience multiple/
        );
      });

      it('rifiuta token multi-audience se azp è presente e valido ma contiene audience sconosciute non fidate', async () => {
        const client = new OidcClient({
          ...mockConfig,
          trustedAudiences: ['https://trusted.myteam.local'],
        });
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-multiaud-untrusted';
        const nonce = 'nonce-multiaud-untrusted';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        // azp coincide con client ID, ma c'è un'audience sconosciuta 'https://malicious-aud.evil.com'
        const multiAudUntrusted = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          aud: [mockConfig.appId, 'https://malicious-aud.evil.com'],
          azp: mockConfig.appId,
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: multiAudUntrusted,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
          /l'ID token contiene audience aggiuntive non fidate \(https:\/\/malicious-aud\.evil\.com\)/
        );
      });

      it('rifiuta token multi-audience se azp non corrisponde al client ID, anche se tutte le audience sono fidate', async () => {
        const client = new OidcClient({
          ...mockConfig,
          trustedAudiences: ['https://api.myteam.local'],
        });
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-multiaud-wrong-azp';
        const nonce = 'nonce-multiaud-wrong-azp';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        const multiAudWrongAzp = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          aud: [mockConfig.appId, 'https://api.myteam.local'],
          azp: 'another-third-party-client-app',
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: multiAudWrongAzp,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
          /authorized party \(azp: "another-third-party-client-app"\) non corrisponde al client ID/
        );
      });

      it('accetta token multi-audience valido con tutte le audience fidate e azp coincidente con appId', async () => {
        const client = new OidcClient({
          ...mockConfig,
          trustedAudiences: ['https://api.myteam.local', 'https://auth-service.myteam.local'],
        });
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-multiaud-valid';
        const nonce = 'nonce-multiaud-valid';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        const validMultiAudToken = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          aud: [mockConfig.appId, 'https://api.myteam.local'],
          azp: mockConfig.appId,
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: validMultiAudToken,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        const { session } = await client.handleAuthorizationCallback(callbackUrl);
        expect(session.accessToken).toBe('valid-access-token');
        expect(session.idToken).toBe(validMultiAudToken);
      });

      it('rifiuta token a singola audience se azp è presente ma difforme da appId', async () => {
        const client = new OidcClient(mockConfig);
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-single-aud-mismatched-azp';
        const nonce = 'nonce-single-aud-mismatched-azp';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        const singleAudWrongAzp = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          appId: mockConfig.appId,
          azp: 'rogue-azp-client',
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: singleAudWrongAzp,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        await expect(client.handleAuthorizationCallback(callbackUrl)).rejects.toThrow(
          /authorized party \(azp: "rogue-azp-client"\) non corrisponde al client ID/
        );
      });

      it('accetta token a singola audience con azp coincidente con appId', async () => {
        const client = new OidcClient(mockConfig);
        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
        });
        const codeVerifier = generateCodeVerifier();
        const state = 'state-single-aud-matching-azp';
        const nonce = 'nonce-single-aud-matching-azp';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        const singleAudMatchingAzp = createValidMockIdToken({
          issuer: mockConfig.endpoint,
          appId: mockConfig.appId,
          azp: mockConfig.appId,
          nonce,
        });

        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'valid-access-token',
            id_token: singleAudMatchingAzp,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
        });

        const callbackUrl = `https://myteam.local/callback?code=test-code&state=${state}`;
        const { session } = await client.handleAuthorizationCallback(callbackUrl);
        expect(session.accessToken).toBe('valid-access-token');
      });
    });

    describe('Q3-AUTH-02: HTTPS enforcement, URL validation, and redirect protection', () => {
      it('rifiuta configurazione con endpoint HTTP non sicuro (loadOidcConfig e costruttore)', () => {
        const insecureConfig = loadOidcConfig({
          VITE_LOGTO_ENDPOINT: 'http://auth.myteam.local/oidc',
          VITE_LOGTO_APP_ID: 'app-123',
          VITE_LOGTO_API_RESOURCE: 'https://api.myteam.local',
        });
        expect(insecureConfig).toBeNull();

        expect(() => {
          new OidcClient({
            ...mockConfig,
            endpoint: 'http://auth.myteam.local/oidc',
          });
        }).toThrow(/protocollo "http:" non consentito.*È richiesto tassativamente HTTPS/);
      });

      it('rifiuta URL con credenziali (username/password) o frammenti (#)', () => {
        expect(() => {
          new OidcClient({
            ...mockConfig,
            endpoint: 'https://user:pass@auth.myteam.local/oidc',
          });
        }).toThrow(/credenziali utente.*non consentite/);

        expect(() => {
          new OidcClient({
            ...mockConfig,
            endpoint: 'https://auth.myteam.local/oidc#fragment',
          });
        }).toThrow(/frammenti \(#\) non consentiti/);
      });

      it('rifiuta endpoint issuer con parametri query (?)', () => {
        expect(() => {
          new OidcClient({
            ...mockConfig,
            endpoint: 'https://auth.myteam.local/oidc?param=evil',
          });
        }).toThrow(/parametri query \(\?\) non consentiti/);
      });

      it('rifiuta discovery contenente endpoint HTTP non sicuri', async () => {
        const client = new OidcClient(mockConfig);

        // authorization_endpoint HTTP
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            issuer: mockConfig.endpoint,
            authorization_endpoint: 'http://auth.myteam.local/oidc/auth',
            token_endpoint: 'https://auth.myteam.local/oidc/token',
          }),
        });

        await expect(client.fetchDiscovery({ forceRefresh: true })).rejects.toThrow(
          /protocollo "http:" non consentito/
        );

        // token_endpoint HTTP
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            issuer: mockConfig.endpoint,
            authorization_endpoint: 'https://auth.myteam.local/oidc/auth',
            token_endpoint: 'http://auth.myteam.local/oidc/token',
          }),
        });

        await expect(client.fetchDiscovery({ forceRefresh: true })).rejects.toThrow(
          /protocollo "http:" non consentito/
        );

        // end_session_endpoint HTTP
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            issuer: mockConfig.endpoint,
            authorization_endpoint: 'https://auth.myteam.local/oidc/auth',
            token_endpoint: 'https://auth.myteam.local/oidc/token',
            end_session_endpoint: 'http://auth.myteam.local/oidc/session/end',
          }),
        });

        await expect(client.fetchDiscovery({ forceRefresh: true })).rejects.toThrow(
          /protocollo "http:" non consentito/
        );
      });

      it('accetta endpoint OIDC validi contenenti percorsi e parametri query conforme alle specifiche', async () => {
        const client = new OidcClient(mockConfig);

        client.setDiscoveryMetadata({
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/oauth/v2/authorize?tenant=myteam`,
          token_endpoint: `${mockConfig.endpoint}/oauth/v2/token?tenant=myteam`,
          end_session_endpoint: `${mockConfig.endpoint}/oauth/v2/logout?tenant=myteam`,
        });

        const authResult = await client.buildAuthorizationUrl();
        expect(authResult.url).toContain('https://auth.myteam.local/oidc/oauth/v2/authorize');
        const parsedAuth = new URL(authResult.url);
        expect(parsedAuth.searchParams.get('tenant')).toBe('myteam');
        expect(parsedAuth.searchParams.get('client_id')).toBe(mockConfig.appId);

        const endSessionUrl = client.buildEndSessionUrl('test-hint');
        expect(endSessionUrl).not.toBeNull();
        const parsedEnd = new URL(endSessionUrl!);
        expect(parsedEnd.searchParams.get('tenant')).toBe('myteam');
        expect(parsedEnd.searchParams.get('client_id')).toBe(mockConfig.appId);
        expect(parsedEnd.searchParams.get('id_token_hint')).toBe('test-hint');
      });

      it('rifiuta buildEndSessionUrl se end_session_endpoint è HTTP', () => {
        const client = new OidcClient(mockConfig);
        (client as any).discoveryMetadata = {
          issuer: mockConfig.endpoint,
          authorization_endpoint: `${mockConfig.endpoint}/auth`,
          token_endpoint: `${mockConfig.endpoint}/token`,
          end_session_endpoint: 'http://auth.myteam.local/oidc/session/end',
        };

        expect(() => client.buildEndSessionUrl('token-123')).toThrow(
          /protocollo "http:" non consentito.*È richiesto tassativamente HTTPS/
        );
      });

      it('configura redirect: "error" nelle richieste di discovery e scambio token per prevenire redirect hijacking', async () => {
        const client = new OidcClient(mockConfig);

        let discoveryOptions: RequestInit | undefined;
        let tokenOptions: RequestInit | undefined;

        globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
          if (url.includes('.well-known/openid-configuration')) {
            discoveryOptions = init;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                issuer: mockConfig.endpoint,
                authorization_endpoint: `${mockConfig.endpoint}/auth`,
                token_endpoint: `${mockConfig.endpoint}/token`,
              }),
            };
          }
          if (url.includes('/token')) {
            tokenOptions = init;
            return {
              ok: true,
              status: 200,
              json: async () => ({
                access_token: 'access-ok',
                id_token: createValidMockIdToken({
                  issuer: mockConfig.endpoint,
                  appId: mockConfig.appId,
                  nonce: 'nonce-redirect-test',
                }),
                token_type: 'Bearer',
                expires_in: 3600,
              }),
            };
          }
          return { ok: false, status: 404 };
        });

        await client.fetchDiscovery({ forceRefresh: true });
        expect(discoveryOptions?.redirect).toBe('error');

        const codeVerifier = generateCodeVerifier();
        const state = 'state-redirect-test';
        const nonce = 'nonce-redirect-test';
        sessionStorage.setItem(
          STORAGE_KEY_PKCE,
          JSON.stringify({ codeVerifier, state, nonce, createdAt: Date.now() })
        );

        await client.handleAuthorizationCallback(`https://myteam.local/callback?code=auth-code&state=${state}`);
        expect(tokenOptions?.redirect).toBe('error');
      });
    });
  });

});
