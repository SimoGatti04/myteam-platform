import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OidcClient } from '../../apps/web/src/services/oidc';
import type { OidcConfig } from '../../apps/web/src/services/oidc';

const mockConfig: OidcConfig = {
  endpoint: 'https://auth.myteam.local/oidc',
  appId: 'myteam-web-app-client-id',
  apiResource: 'https://api.myteam.local',
  scopes: 'openid profile platform:admin',
  redirectUri: 'https://myteam.local/callback',
  postLogoutRedirectUri: 'https://myteam.local',
};

function hangingFetch() {
  return (_url: any, init: any) =>
    new Promise((resolve, reject) => {
      if (init?.signal) {
        if (init.signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
        init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }
    });
}

describe('Q2-D — QA-C-03: timeout discovery e token exchange (W2-R4)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('discovery che non risponde mai → timeout dopo 10s (termina)', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(mockConfig);
    vi.stubGlobal('fetch', hangingFetch());
    const promise = client.fetchDiscovery({ forceRefresh: true });
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10000);
    await expect(promise).rejects.toThrow(/timeout/i);
  }, 15000);

  it('token exchange che non risponde mai → timeout dopo 10s (termina)', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(mockConfig);
    client.setDiscoveryMetadata({
      issuer: mockConfig.endpoint,
      authorization_endpoint: `${mockConfig.endpoint}/auth`,
      token_endpoint: `${mockConfig.endpoint}/token`,
    });
    const { state } = await client.buildAuthorizationUrl({ returnTo: 'home' });
    vi.stubGlobal('fetch', hangingFetch());
    const promise = client.handleAuthorizationCallback(`?code=abc&state=${state}`);
    promise.catch(() => {});
    await vi.advanceTimersByTimeAsync(10000);
    await expect(promise).rejects.toThrow(/timeout/i);
  }, 15000);

  it('server invia header ma corpo JSON sospeso → limite documentato (timeout non copre res.json)', async () => {
    // W2-R5 ha corretto il limite QA-C-08: il corpo JSON è ora racchiuso nel deadline.
    // Il flusso termina (con errore di timeout) anche se il corpo resta sospeso.
    vi.useFakeTimers();
    const client = new OidcClient(mockConfig);
    vi.stubGlobal('fetch', () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise(() => {}), // corpo sospeso indefinitamente
      } as any),
    );
    let settled = false;
    const promise = client.fetchDiscovery({ forceRefresh: true });
    promise.then(() => { settled = true; }).catch(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(10000);
    // W2-R5 ha corretto il limite: il corpo JSON è ora racchiuso nel deadline.
    // Il flusso deve terminare (con errore di timeout) anche se il corpo resta sospeso.
    expect(settled).toBe(true);
    vi.useRealTimers();
  }, 15000);

  it('dopo timeout, retry riesce (nuova chiamata completata)', async () => {
    vi.useFakeTimers();
    const client = new OidcClient(mockConfig);
    let callCount = 0;
    vi.stubGlobal('fetch', (_url: any, init: any) => {
      callCount++;
      if (callCount === 1) {
        return new Promise((resolve, reject) => {
          if (init?.signal) {
            if (init.signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
            init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          }
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            issuer: mockConfig.endpoint,
            authorization_endpoint: `${mockConfig.endpoint}/auth`,
            token_endpoint: `${mockConfig.endpoint}/token`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    const p1 = client.fetchDiscovery({ forceRefresh: true });
    p1.catch(() => {});
    await vi.advanceTimersByTimeAsync(10000);
    await expect(p1).rejects.toThrow(/timeout/i);

    const p2 = client.fetchDiscovery({ forceRefresh: true });
    await expect(p2).resolves.toBeDefined();
    expect((await p2).issuer).toBe(mockConfig.endpoint);
  }, 15000);
});
