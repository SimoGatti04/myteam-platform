import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authService } from '../src/services/auth';
import {
  OIDC_REQUEST_TIMEOUT_MS,
  OidcClient,
  OidcConfig,
  OidcSession,
  STORAGE_KEY_SESSION,
  STORAGE_KEY_PKCE,
  oidcClient,
} from '../src/services/oidc';

const config: OidcConfig = {
  endpoint: 'https://issuer.example.test/oidc',
  appId: 'web-client',
  apiResource: 'https://api.example.test',
  scopes: 'openid profile platform:admin',
  redirectUri: 'https://web.example.test/callback',
  postLogoutRedirectUri: 'https://web.example.test',
};

const discovery = {
  issuer: config.endpoint,
  authorization_endpoint: `${config.endpoint}/authorize`,
  token_endpoint: `${config.endpoint}/token`,
  end_session_endpoint: 'https://issuer.example.test/logout/discovered',
};

const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn().mockResolvedValue(body),
}) as unknown as Response;

const never = () => new Promise<never>(() => {});

describe('Web W2-R5 — logout and complete-request deadlines', () => {
  const originalFetch = globalThis.fetch;
  const originalLocation = window.location;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    oidcClient.setConfig(config);
    authService.logout();
    assign = vi.fn();
    delete (window as any).location;
    (window as any).location = { ...originalLocation, assign, origin: 'https://web.example.test' };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (window as any).location = originalLocation;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const session: OidcSession = {
    accessToken: 'opaque-access-token',
    idToken: 'opaque-id-token-hint',
    tokenType: 'Bearer',
    expiresAt: Date.now() + 60_000,
  };

  it('federated logout uses verified discovery while metadata is already available', async () => {
    authService.setOidcSession(session);
    oidcClient.setDiscoveryMetadata(discovery);
    globalThis.fetch = vi.fn().mockResolvedValue(response(discovery));

    await authService.logout({ redirect: true });

    expect(authService.getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${config.endpoint}/.well-known/openid-configuration`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    const logoutUrl = new URL(assign.mock.calls[0][0]);
    expect(logoutUrl.origin + logoutUrl.pathname).toBe(discovery.end_session_endpoint);
    expect(logoutUrl.searchParams.get('id_token_hint')).toBe(session.idToken);
  });

  it('restores session after F5 and resolves discovery before explicit federated logout', async () => {
    authService.setOidcSession(session);
    oidcClient.setConfig(config); // simulates a page reload: cached metadata is cleared
    authService.initSession(); // sessionStorage restores the OIDC session
    globalThis.fetch = vi.fn().mockResolvedValue(response(discovery));

    await authService.logout({ redirect: true });

    expect(authService.getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    expect(assign).toHaveBeenCalledTimes(1);
    const logoutUrl = new URL(assign.mock.calls[0][0]);
    expect(logoutUrl.origin + logoutUrl.pathname).toBe(discovery.end_session_endpoint);
    expect(logoutUrl.searchParams.get('id_token_hint')).toBe(session.idToken);
  });

  it.each([
    ['offline', () => Promise.reject(new Error('offline'))],
    ['invalid discovery', () => Promise.resolve(response({ ...discovery, issuer: 'https://wrong.example.test' }))],
  ])('always logs out locally when federated discovery is %s', async (_label, fetchResult) => {
    authService.setOidcSession(session);
    globalThis.fetch = vi.fn().mockImplementation(fetchResult);

    const completion = authService.logout({ redirect: true });
    expect(authService.getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    await completion;
    expect(assign).not.toHaveBeenCalled();
  });


  it('keeps local logout immediate if logout discovery JSON times out', async () => {
    vi.useFakeTimers();
    authService.setOidcSession(session);
    const hanging = response(null);
    (hanging.json as any) = vi.fn().mockImplementation(never);
    globalThis.fetch = vi.fn().mockResolvedValue(hanging);

    const completion = authService.logout({ redirect: true });
    expect(authService.getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
    const assertion = expect(completion).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(OIDC_REQUEST_TIMEOUT_MS);
    await assertion;
    expect(assign).not.toHaveBeenCalled();
  });

  it('does not perform federated discovery during automatic invalidation', async () => {
    authService.setOidcSession(session);
    globalThis.fetch = vi.fn();

    authService.handleUnauthorized('401');

    expect(authService.getAuthToken()).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('times out discovery when JSON body never resolves, then permits retry', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(config);
    const hanging = response(null);
    (hanging.json as any) = vi.fn().mockImplementation(never);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(hanging)
      .mockResolvedValueOnce(response(discovery));

    const first = client.fetchDiscovery();
    const firstAssertion = expect(first).rejects.toThrow(/timeout.*risposta completa/i);
    await vi.advanceTimersByTimeAsync(OIDC_REQUEST_TIMEOUT_MS);
    await firstAssertion;
    await expect(client.fetchDiscovery()).resolves.toMatchObject(discovery);
  });

  it('times out successful token exchange while JSON body is pending', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(config);
    client.setDiscoveryMetadata(discovery);
    sessionStorage.setItem(STORAGE_KEY_PKCE, JSON.stringify({
      codeVerifier: 'verifier', state: 'expected-state', nonce: 'expected-nonce', createdAt: Date.now(),
    }));
    const hanging = response(null);
    (hanging.json as any) = vi.fn().mockImplementation(never);
    globalThis.fetch = vi.fn().mockResolvedValue(hanging);

    const callback = client.handleAuthorizationCallback(
      'https://web.example.test/callback?code=one-time-code&state=expected-state'
    );
    const assertion = expect(callback).rejects.toThrow(/timeout.*risposta completa/i);
    await vi.advanceTimersByTimeAsync(OIDC_REQUEST_TIMEOUT_MS);
    await assertion;
  });

  it('times out HTTP error token response while its JSON body is pending', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(config);
    client.setDiscoveryMetadata(discovery);
    sessionStorage.setItem(STORAGE_KEY_PKCE, JSON.stringify({
      codeVerifier: 'verifier', state: 'expected-state', nonce: 'expected-nonce', createdAt: Date.now(),
    }));
    const hangingError = response(null, 503);
    (hangingError.json as any) = vi.fn().mockImplementation(never);
    globalThis.fetch = vi.fn().mockResolvedValue(hangingError);

    const callback = client.handleAuthorizationCallback(
      'https://web.example.test/callback?code=one-time-code&state=expected-state'
    );
    const assertion = expect(callback).rejects.toThrow(/timeout.*risposta completa/i);
    await vi.advanceTimersByTimeAsync(OIDC_REQUEST_TIMEOUT_MS);
    await assertion;
  });
});
