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

describe('Q2-D — QA-C-01: logout federato fail-closed (W2-R4)', () => {
  it('con discovery metadata disponibili, costruisce URL di end-session con id_token_hint', () => {
    const client = new OidcClient(mockConfig);
    client.setDiscoveryMetadata({
      issuer: mockConfig.endpoint,
      authorization_endpoint: `${mockConfig.endpoint}/auth`,
      token_endpoint: `${mockConfig.endpoint}/token`,
      end_session_endpoint: `${mockConfig.endpoint}/session/end`,
    });
    const url = client.buildEndSessionUrl('my-id-token');
    expect(url).not.toBeNull();
    expect(url).toContain('/session/end');
    expect(url).toContain('client_id=');
    expect(url).toContain('id_token_hint=my-id-token');
    expect(url).toContain('post_logout_redirect_uri=');
  });

  it('dopo F5 (cache discovery vuota), buildEndSessionUrl restituisce null — nessun endpoint arbitrario', () => {
    const client = new OidcClient(mockConfig);
    // nessuna setDiscoveryMetadata -> cache vuota (scenario F5)
    const url = client.buildEndSessionUrl('my-id-token');
    expect(url).toBeNull();
  });

  it('non costruisce mai URL euristici (/oidc/session/end, /session/end) senza discovery', () => {
    const client = new OidcClient(mockConfig);
    const url = client.buildEndSessionUrl('my-id-token');
    expect(url).toBeNull();
    // controllo negativo: nessun URL contenente percorsi euristici
    if (url !== null) {
      expect(url).not.toContain('/oidc/session/end');
      expect(url).not.toContain('/session/end');
    }
  });

  it('buildEndSessionUrl non lancia mai e restituisce null senza discovery (logout locale sempre possibile)', () => {
    const client = new OidcClient(mockConfig);
    expect(() => client.buildEndSessionUrl()).not.toThrow();
    expect(client.buildEndSessionUrl()).toBeNull();
    expect(() => client.buildEndSessionUrl('')).not.toThrow();
  });

  it('senza end_session_endpoint nei metadati, restituisce null (fail-closed)', () => {
    const client = new OidcClient(mockConfig);
    client.setDiscoveryMetadata({
      issuer: mockConfig.endpoint,
      authorization_endpoint: `${mockConfig.endpoint}/auth`,
      token_endpoint: `${mockConfig.endpoint}/token`,
      // end_session_endpoint omesso
    });
    const url = client.buildEndSessionUrl('my-id-token');
    expect(url).toBeNull();
  });
});
