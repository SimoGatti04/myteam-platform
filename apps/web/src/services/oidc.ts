/**
 * Client OIDC per React SPA con supporto Authorization Code Flow + PKCE (RFC 7636).
 * Progettato per l'integrazione sicura con Logto Identity Provider.
 *
 * SPECIFICHE DI SICUREZZA:
 * - Public SPA Client: NESSUN client secret memorizzato o inviato dal frontend.
 * - PKCE: Generazione di `code_verifier` crittograficamente sicuro (Web Crypto API)
 *   e derivazione del `code_challenge` con metodo SHA-256 ('S256').
 * - State CSRF Protection: Generazione e verifica di un parametro `state` casuale ad ogni flusso.
 * - Archiviazione Volatile: Credenziali e token memorizzati esclusivamente in `sessionStorage`
 *   e memoria volatile dell'applicazione, MAI in `localStorage` permanente o cookie insicuri.
 * - Riconoscimento Configurazione: Se i parametri OIDC mancano, il servizio lo segnala
 *   in modo pulito senza lanciare eccezioni fatali.
 */

import type { EnvLike } from '../utils/env';

export interface OidcConfig {
  endpoint: string;
  appId: string;
  apiResource: string;
  scopes: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
}

export interface OidcSession {
  accessToken: string;
  idToken?: string;
  tokenType: string;
  expiresAt: number; // timestamp in millisecondi
  scope?: string;
  subject?: string;
}

export interface StoredPkceState {
  codeVerifier: string;
  state: string;
  returnTo?: string;
  createdAt: number;
}

export const STORAGE_KEY_PKCE = 'myteam_oidc_pkce';
export const STORAGE_KEY_SESSION = 'myteam_oidc_session';

/**
 * Codifica Base64URL conforme a RFC 7636 (senza padding '=', caratteri safe per URL).
 */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Genera una stringa casuale ad alta entropia usando crypto.getRandomValues.
 */
export function generateRandomString(byteLength: number = 32): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

/**
 * Genera un code_verifier conforme RFC 7636 (stringa casuale tra 43 e 128 caratteri).
 */
export function generateCodeVerifier(): string {
  // 32 byte generano 43 caratteri base64url
  return generateRandomString(32);
}

/**
 * Calcola il code_challenge da un verifier usando SHA-256 (metodo 'S256').
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Decodifica in modo sicuro il payload di un JWT (senza validazione crittografica della firma,
 * delegata al backend o a JWKS).
 */
export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadPart = parts[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Risolve la configurazione OIDC dalle variabili d'ambiente Vite o da un oggetto fornito.
 */
export function loadOidcConfig(env: EnvLike = import.meta.env): OidcConfig | null {
  const endpoint = (env as Record<string, string | undefined>).VITE_LOGTO_ENDPOINT?.trim();
  const appId = (env as Record<string, string | undefined>).VITE_LOGTO_APP_ID?.trim();

  if (!endpoint || !appId) {
    return null;
  }

  // Risorsa API: corrisponde a LOGTO_AUDIENCE di Core
  const apiResource =
    (env as Record<string, string | undefined>).VITE_LOGTO_API_RESOURCE?.trim() ||
    'https://api.myteam.local';

  // Scopi minimi per OIDC + scope admin per Core
  const scopes =
    (env as Record<string, string | undefined>).VITE_LOGTO_SCOPES?.trim() ||
    'openid profile offline_access platform:admin';

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  const redirectUri =
    (env as Record<string, string | undefined>).VITE_LOGTO_REDIRECT_URI?.trim() ||
    `${origin}/callback`;

  const postLogoutRedirectUri =
    (env as Record<string, string | undefined>).VITE_LOGTO_POST_LOGOUT_REDIRECT_URI?.trim() ||
    origin;

  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    appId,
    apiResource,
    scopes,
    redirectUri,
    postLogoutRedirectUri,
  };
}

export class OidcClient {
  private config: OidcConfig | null;

  constructor(config?: OidcConfig | null) {
    this.config = config !== undefined ? config : loadOidcConfig();
  }

  public isConfigured(): boolean {
    return this.config !== null;
  }

  public getConfig(): OidcConfig | null {
    return this.config;
  }

  public setConfig(config: OidcConfig | null): void {
    this.config = config;
  }

  /**
   * Costruisce l'URL di autorizzazione verso Logto `/auth` avviando il flusso PKCE.
   * Salva il code_verifier e lo state in sessionStorage.
   */
  public async buildAuthorizationUrl(options?: {
    returnTo?: string;
    state?: string;
  }): Promise<{ url: string; state: string; codeVerifier: string }> {
    if (!this.config) {
      throw new Error('Logto OIDC non è configurato. Impossibile avviare il login.');
    }

    const state = options?.state || generateRandomString(16);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Memorizza lo stato PKCE per la validazione al callback
    const pkceState: StoredPkceState = {
      codeVerifier,
      state,
      returnTo: options?.returnTo,
      createdAt: Date.now(),
    };

    try {
      sessionStorage.setItem(STORAGE_KEY_PKCE, JSON.stringify(pkceState));
    } catch {
      // Session storage non disponibile
    }

    const authEndpoint = this.config.endpoint.endsWith('/oidc')
      ? `${this.config.endpoint}/auth`
      : `${this.config.endpoint}/oidc/auth`;

    const url = new URL(authEndpoint);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.config.scopes);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('state', state);

    if (this.config.apiResource) {
      url.searchParams.set('resource', this.config.apiResource);
    }

    return { url: url.toString(), state, codeVerifier };
  }

  /**
   * Gestisce il ritorno dalla pagina di login di Logto (callback).
   * Valida lo state, recupera il code_verifier e scambia il code con i token via POST /token.
   */
  public async handleAuthorizationCallback(
    urlOrSearch: string | URLSearchParams
  ): Promise<{ session: OidcSession; returnTo?: string }> {
    if (!this.config) {
      throw new Error('Logto OIDC non è configurato.');
    }

    let params: URLSearchParams;
    if (typeof urlOrSearch === 'string') {
      const queryIdx = urlOrSearch.indexOf('?');
      params = new URLSearchParams(queryIdx >= 0 ? urlOrSearch.slice(queryIdx) : urlOrSearch);
    } else {
      params = urlOrSearch;
    }

    const error = params.get('error');
    if (error) {
      const description = params.get('error_description') || error;
      throw new Error(`Errore durante l'autenticazione IdP: ${description}`);
    }

    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code) {
      throw new Error('Parametro "code" mancante nella risposta del provider OIDC.');
    }

    // Recupera lo state PKCE salvato
    let storedPkce: StoredPkceState | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PKCE);
      if (raw) storedPkce = JSON.parse(raw);
    } catch {
      storedPkce = null;
    }

    if (!storedPkce || !storedPkce.codeVerifier) {
      throw new Error('Sessione PKCE non trovata o scaduta. Riprova il login.');
    }

    if (storedPkce.state !== returnedState) {
      throw new Error('Parametro "state" non corrispondente: possibile attacco CSRF.');
    }

    // Effettua lo scambio code -> tokens
    const tokenEndpoint = this.config.endpoint.endsWith('/oidc')
      ? `${this.config.endpoint}/token`
      : `${this.config.endpoint}/oidc/token`;

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', this.config.appId);
    body.set('code', code);
    body.set('code_verifier', storedPkce.codeVerifier);
    body.set('redirect_uri', this.config.redirectUri);
    if (this.config.apiResource) {
      body.set('resource', this.config.apiResource);
    }

    let res: Response;
    try {
      res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new Error('Identity Provider Logto non raggiungibile o errore di rete. Riprova più tardi.');
    }

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errorMsg = errJson.error_description || errJson.error || errorMsg;
      } catch {
        // payload non JSON
      }
      throw new Error(`Scambio token fallito con il provider OIDC: ${errorMsg}`);
    }

    const tokenResponse = await res.json();
    const accessToken = tokenResponse.access_token;
    if (!accessToken) {
      throw new Error('Risposta del provider priva di access_token.');
    }

    const expiresIn = Number(tokenResponse.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    let subject: string | undefined = undefined;
    const claims = parseJwtPayload(accessToken) || (tokenResponse.id_token ? parseJwtPayload(tokenResponse.id_token) : null);
    if (claims && typeof claims.sub === 'string') {
      subject = claims.sub;
    }

    const session: OidcSession = {
      accessToken,
      idToken: tokenResponse.id_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt,
      scope: tokenResponse.scope,
      subject,
    };

    // Salva la sessione e pulisce lo stato PKCE temporaneo
    this.saveSession(session);
    try {
      sessionStorage.removeItem(STORAGE_KEY_PKCE);
    } catch {
      // ignore
    }

    return {
      session,
      returnTo: storedPkce.returnTo,
    };
  }

  /**
   * Salva la sessione OIDC in sessionStorage.
   */
  public saveSession(session: OidcSession | null): void {
    try {
      if (session) {
        sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
      } else {
        sessionStorage.removeItem(STORAGE_KEY_SESSION);
      }
    } catch {
      // storage unavailable
    }
  }

  /**
   * Legge la sessione OIDC memorizzata e controlla se è ancora valida (con margine di 15 secondi).
   */
  public loadSession(): OidcSession | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      const session = JSON.parse(raw) as OidcSession;
      if (!session.accessToken) return null;

      // Verifica scadenza con margine di sicurezza di 15 secondi
      if (session.expiresAt && Date.now() >= session.expiresAt - 15_000) {
        this.saveSession(null);
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Costruisce l'URL di logout da Logto (endpoint `/session/end`).
   */
  public buildEndSessionUrl(idToken?: string): string | null {
    if (!this.config) return null;

    const endSessionEndpoint = this.config.endpoint.endsWith('/oidc')
      ? `${this.config.endpoint}/session/end`
      : `${this.config.endpoint}/oidc/session/end`;

    const url = new URL(endSessionEndpoint);
    url.searchParams.set('client_id', this.config.appId);
    url.searchParams.set('post_logout_redirect_uri', this.config.postLogoutRedirectUri);
    if (idToken) {
      url.searchParams.set('id_token_hint', idToken);
    }

    return url.toString();
  }

  /**
   * Esegue il logout: pulisce la sessione e lo stato PKCE.
   */
  public logout(): void {
    this.saveSession(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY_PKCE);
    } catch {
      // ignore
    }
  }
}

export const oidcClient = new OidcClient();
