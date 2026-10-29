import { describe, it, expect } from 'vitest';
import { loadOidcConfig } from '../../apps/web/src/services/oidc';

describe('Q2-D — QA-C-05: scope offline_access rimosso (W2-R4)', () => {
  it('default scopes non contengono offline_access', () => {
    const cfg = loadOidcConfig({
      VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc',
      VITE_LOGTO_APP_ID: 'app-id',
      VITE_LOGTO_API_RESOURCE: 'https://api.myteam.local',
    } as any);
    expect(cfg).not.toBeNull();
    expect(cfg!.scopes).toBe('openid profile platform:admin');
    expect(cfg!.scopes).not.toContain('offline_access');
  });

  it('configurazione esplicita VITE_LOGTO_SCOPES resta supportata', () => {
    const cfg = loadOidcConfig({
      VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc',
      VITE_LOGTO_APP_ID: 'app-id',
      VITE_LOGTO_API_RESOURCE: 'https://api.myteam.local',
      VITE_LOGTO_SCOPES: 'openid profile offline_access platform:admin custom:scope',
    } as any);
    expect(cfg).not.toBeNull();
    expect(cfg!.scopes).toBe('openid profile offline_access platform:admin custom:scope');
  });

  it('configurazione esplicita senza offline_access è accettata', () => {
    const cfg = loadOidcConfig({
      VITE_LOGTO_ENDPOINT: 'https://auth.myteam.local/oidc',
      VITE_LOGTO_APP_ID: 'app-id',
      VITE_LOGTO_API_RESOURCE: 'https://api.myteam.local',
      VITE_LOGTO_SCOPES: 'openid profile platform:admin',
    } as any);
    expect(cfg!.scopes).toBe('openid profile platform:admin');
  });
});
