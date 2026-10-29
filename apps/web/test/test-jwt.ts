import { base64UrlEncode } from '../src/services/oidc';

/**
 * Genera un JWT di test ben formato con payload codificato e firma fittizia.
 */
export function createMockJwt(claims: Record<string, any>, headerOverride?: Record<string, any>): string {
  const header = headerOverride || { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  return `${encodedHeader}.${encodedPayload}.mock_signature_bytes`;
}

export function createValidMockIdToken(options?: {
  issuer?: string;
  appId?: string;
  nonce?: string;
  expiresInSec?: number;
  subject?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return createMockJwt({
    iss: options?.issuer || 'https://auth.myteam.local/oidc',
    aud: options?.appId || 'myteam-web-app-client-id',
    exp: nowSec + (options?.expiresInSec ?? 3600),
    nonce: options?.nonce || 'mock-nonce-default',
    sub: options?.subject || 'usr_admin_123',
    iat: nowSec,
  });
}

export function createValidMockAccessToken(options?: {
  resource?: string;
  scope?: string;
  expiresInSec?: number;
  subject?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  return createMockJwt({
    iss: 'https://auth.myteam.local/oidc',
    aud: options?.resource || 'https://api.myteam.local',
    exp: nowSec + (options?.expiresInSec ?? 3600),
    scope: options?.scope || 'openid profile platform:admin',
    sub: options?.subject || 'usr_admin_123',
  });
}
