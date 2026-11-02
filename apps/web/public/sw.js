// MyTeam Platform Service Worker - W3-R1 Remediated PWA caching strategy
// Strictly enforces OIDC security, avoids caching sensitive credentials/callbacks,
// provides reliable cache versioning and clean client updates.

const CACHE_VERSION = 'v2';
const APP_CACHE_PREFIX = 'myteam-pwa-';
const CURRENT_CACHE_NAME = `${APP_CACHE_PREFIX}${CACHE_VERSION}`;

// Precached static public assets only
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icon.svg',
];

// Sensitive path prefixes that MUST NEVER be intercepted or cached
const SENSITIVE_PATHS = [
  '/callback',
  '/login',
  '/logout',
  '/auth',
  '/oauth',
  '/oidc',
];

// Sensitive query parameters (OAuth/OIDC/Tokens/CSRF state)
const SENSITIVE_PARAMS = [
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
  'response_type',
  'client_id',
  'redirect_uri',
  'nonce',
];

/**
 * Checks if a URL represents an authentication endpoint, callback,
 * or contains sensitive query parameters.
 */
function isSensitiveOrAuthUrl(url) {
  // Check pathname
  for (const p of SENSITIVE_PATHS) {
    if (url.pathname === p || url.pathname.startsWith(p + '/')) {
      return true;
    }
  }

  // Check query parameters (case-insensitive)
  for (const [paramKey] of url.searchParams.entries()) {
    const lowerKey = paramKey.toLowerCase();
    for (const sensitive of SENSITIVE_PARAMS) {
      if (
        lowerKey === sensitive ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('auth')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a URL is an allowed static asset eligible for runtime caching.
 * Uses an allowlist of public static asset paths and extensions.
 */
function isStaticCacheableAsset(url) {
  // Must be same origin
  if (url.origin !== self.location.origin) {
    return false;
  }

  // Never cache API or sensitive/auth requests
  if (url.pathname.startsWith('/api/') || isSensitiveOrAuthUrl(url)) {
    return false;
  }

  // Allow fingerprinted assets directory
  if (url.pathname.startsWith('/assets/')) {
    return true;
  }

  // Allow known static file extensions
  return /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2|ico|json)$/i.test(url.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CURRENT_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // If there is no active worker controlling pages (first install), activate immediately.
      // If an existing worker is active, do not skipWaiting automatically to prevent disrupting open tabs.
      if (!self.registration.active) {
        return self.skipWaiting();
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (cacheNames) => {
      for (const cacheName of cacheNames) {
        // Only delete caches that belong to this application (prefix match)
        // This removes old caches like 'myteam-pwa-v1' without touching other apps
        if (cacheName.startsWith(APP_CACHE_PREFIX) && cacheName !== CURRENT_CACHE_NAME) {
          await caches.delete(cacheName);
        }
      }

      // Defensively purge any sensitive/auth requests from the current cache
      try {
        const currentCache = await caches.open(CURRENT_CACHE_NAME);
        const keys = await currentCache.keys();
        for (const req of keys) {
          const reqUrl = new URL(req.url);
          if (isSensitiveOrAuthUrl(reqUrl) || reqUrl.pathname.startsWith('/api/')) {
            await currentCache.delete(req);
          }
        }
      } catch (err) {
        console.warn('Error purging sensitive cache keys:', err);
      }
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Invariant: Do not intercept cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Invariant: Do not intercept dynamic API requests
  if (url.pathname.startsWith('/api/')) return;

  // Invariant: NEVER intercept or cache sensitive/auth/callback requests.
  // They go directly to network and will never be placed in Cache Storage.
  // When offline, they must NOT return the cached shell as a fake HTTP 200.
  if (isSensitiveOrAuthUrl(url)) {
    return;
  }

  // Handle SPA navigation requests
  if (event.request.mode === 'navigate') {
    // Network-first for HTML navigations: ensures fresh HTML / hashed bundles
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Never cache arbitrary navigation URLs with queries in Cache Storage
          return networkResponse;
        })
        .catch(() => {
          // Safe offline fallback: return cached shell only for public routes
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Handle static assets with strict allowlist
  if (isStaticCacheableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Respect no-store / no-cache headers
          const cacheControl = networkResponse.headers.get('cache-control');
          if (cacheControl && (cacheControl.includes('no-store') || cacheControl.includes('no-cache'))) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CURRENT_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        });
      })
    );
    return;
  }

  // All other requests pass through directly without caching
});
