import { describe, it, expect } from 'vitest';
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

describe('Q2-D — QA-C-02: setDiscoveryMetadata test-only (W2-R4)', () => {
  it('in ambiente di test (VITEST presente), setDiscoveryMetadata funziona', () => {
    const client = new OidcClient(mockConfig);
    client.setDiscoveryMetadata({
      issuer: mockConfig.endpoint,
      authorization_endpoint: `${mockConfig.endpoint}/auth`,
      token_endpoint: `${mockConfig.endpoint}/token`,
    });
    expect(client.getDiscoveryMetadata()).not.toBeNull();
    expect(client.getDiscoveryMetadata()?.issuer).toBe(mockConfig.endpoint);
  });

  it('in produzione (VITEST assente), setDiscoveryMetadata è no-op', () => {
    const original = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const client = new OidcClient(mockConfig);
      client.setDiscoveryMetadata({
        issuer: 'https://evil.example',
        authorization_endpoint: 'https://evil.example/auth',
        token_endpoint: 'https://evil.example/token',
      });
      expect(client.getDiscoveryMetadata()).toBeNull();
    } finally {
      if (original !== undefined) process.env.VITEST = original;
    }
  });

  it('in produzione, nessun bypass della discovery è raggiungibile via setDiscoveryMetadata', () => {
    const original = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const client = new OidcClient(mockConfig);
      // tentativo di iniezione metadati malevoli
      client.setDiscoveryMetadata({
        issuer: 'https://evil.example',
        authorization_endpoint: 'https://evil.example/auth',
        token_endpoint: 'https://evil.example/token',
      });
      // la metadata resta null -> il flusso dovrà eseguire la discovery reale
      expect(client.getDiscoveryMetadata()).toBeNull();
    } finally {
      if (original !== undefined) process.env.VITEST = original;
    }
  });

  it('la testabilità rimane disponibile nei test (VITEST presente)', () => {
    const client = new OidcClient(mockConfig);
    client.setDiscoveryMetadata({
      issuer: mockConfig.endpoint,
      authorization_endpoint: `${mockConfig.endpoint}/auth`,
      token_endpoint: `${mockConfig.endpoint}/token`,
      end_session_endpoint: `${mockConfig.endpoint}/session/end`,
    });
    expect(client.getDiscoveryMetadata()?.end_session_endpoint).toBe(`${mockConfig.endpoint}/session/end`);
  });
});
