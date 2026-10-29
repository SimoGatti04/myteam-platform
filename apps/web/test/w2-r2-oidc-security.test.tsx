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
    scopes: 'openid profile offline_access platform:admin',
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
});
