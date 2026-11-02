import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('W3-R1 PWA Security & Cache Remediation (W3-PWA-01 & W3-PWA-02)', () => {
  const swPath = path.resolve(__dirname, '../public/sw.js');
  const swCode = fs.readFileSync(swPath, 'utf8');

  // Helper evaluating functions extracted from sw.js
  const evalSwContext = () => {
    const sandbox = {
      self: {
        location: { origin: 'http://127.0.0.1:4173' },
        addEventListener: () => {},
        skipWaiting: () => {},
        clients: { claim: () => {} },
      },
    };
    const fn = new Function('self', `
      ${swCode}
      return {
        CACHE_VERSION,
        APP_CACHE_PREFIX,
        CURRENT_CACHE_NAME,
        PRECACHE_ASSETS,
        SENSITIVE_PATHS,
        SENSITIVE_PARAMS,
        isSensitiveOrAuthUrl,
        isStaticCacheableAsset,
      };
    `);
    return fn(sandbox.self);
  };

  const sw = evalSwContext();

  describe('P1 Finding W3-PWA-01: OIDC Query & Callback Security Invariants', () => {
    it('identifies synthetic OIDC callback as sensitive and strictly non-cacheable', () => {
      // Synthetic URL exactly as reported in QA NO-GO
      const oidcUrl = new URL('http://127.0.0.1:4173/callback?code=SYNTHETIC_CODE_83&state=SYNTHETIC_STATE_42');
      expect(sw.isSensitiveOrAuthUrl(oidcUrl)).toBe(true);
      expect(sw.isStaticCacheableAsset(oidcUrl)).toBe(false);
    });

    it('rejects all sensitive query parameters (code, state, token, error, id_token, etc.)', () => {
      const sensitiveParams = [
        'code',
        'state',
        'error',
        'error_description',
        'token',
        'id_token',
        'access_token',
        'refresh_token',
        'session_state',
        'iss',
        'client_id',
        'redirect_uri',
      ];

      for (const param of sensitiveParams) {
        const url = new URL(`http://127.0.0.1:4173/?${param}=secret_value`);
        expect(sw.isSensitiveOrAuthUrl(url)).toBe(true);
        expect(sw.isStaticCacheableAsset(url)).toBe(false);
      }
    });

    it('rejects sensitive authentication path prefixes (/callback, /login, /logout, /auth)', () => {
      const paths = ['/callback', '/callback/sub', '/login', '/logout', '/auth', '/oauth', '/oidc'];
      for (const p of paths) {
        const url = new URL(`http://127.0.0.1:4173${p}`);
        expect(sw.isSensitiveOrAuthUrl(url)).toBe(true);
        expect(sw.isStaticCacheableAsset(url)).toBe(false);
      }
    });

    it('never intercepts cross-origin requests', () => {
      const crossOriginUrl = new URL('https://logto.example.com/oidc/auth');
      expect(sw.isStaticCacheableAsset(crossOriginUrl)).toBe(false);
    });

    it('never intercepts or caches dynamic /api/ requests', () => {
      const apiUrl = new URL('http://127.0.0.1:4173/api/v1/matches');
      expect(sw.isStaticCacheableAsset(apiUrl)).toBe(false);
    });

    it('verifies that sw.js source code explicitly bypasses sensitive and auth requests', () => {
      expect(swCode).toContain('if (isSensitiveOrAuthUrl(url))');
      expect(swCode).toContain('if (url.pathname.startsWith(\'/api/\')) return;');
      expect(swCode).toContain('if (url.origin !== self.location.origin) return;');
    });
  });

  describe('P2 Finding W3-PWA-02: Versioned Cache and Old Cache Cleanup', () => {
    it('uses explicit build/cache versioning with application prefix', () => {
      expect(sw.APP_CACHE_PREFIX).toBe('myteam-pwa-');
      expect(sw.CACHE_VERSION).toBeDefined();
      expect(sw.CURRENT_CACHE_NAME).toBe(`${sw.APP_CACHE_PREFIX}${sw.CACHE_VERSION}`);
    });

    it('only caches allowed static assets from allowlist and fingerprinted assets directory', () => {
      // Fingerprinted bundle
      const assetJs = new URL('http://127.0.0.1:4173/assets/index-BN18ars6.js');
      expect(sw.isStaticCacheableAsset(assetJs)).toBe(true);

      const assetCss = new URL('http://127.0.0.1:4173/assets/index-Bm32Lz9A.css');
      expect(sw.isStaticCacheableAsset(assetCss)).toBe(true);

      // Known static files
      const manifest = new URL('http://127.0.0.1:4173/manifest.json');
      expect(sw.isStaticCacheableAsset(manifest)).toBe(true);

      const iconSvg = new URL('http://127.0.0.1:4173/icon.svg');
      expect(sw.isStaticCacheableAsset(iconSvg)).toBe(true);

      // Unknown dynamic routes are NOT static assets
      const dynamicRoute = new URL('http://127.0.0.1:4173/admin/arbitrary-page');
      expect(sw.isStaticCacheableAsset(dynamicRoute)).toBe(false);
    });

    it('cleans up previous version cache (such as myteam-pwa-v1) while preserving other apps', () => {
      expect(swCode).toContain('cacheName.startsWith(APP_CACHE_PREFIX) && cacheName !== CURRENT_CACHE_NAME');
      expect(swCode).toContain('await caches.delete(cacheName)');
    });

    it('includes defensive purge of any sensitive/auth keys in current cache', () => {
      expect(swCode).toContain('isSensitiveOrAuthUrl(reqUrl)');
      expect(swCode).toContain('await currentCache.delete(req)');
    });

    it('supports SKIP_WAITING message for clean update transitions', () => {
      expect(swCode).toContain('event.data.type === \'SKIP_WAITING\'');
      expect(swCode).toContain('self.skipWaiting()');
    });
  });
});
