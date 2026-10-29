/**
 * Client OIDC per React SPA con supporto Authorization Code Flow + PKCE (RFC 7636).
 * Progettato per l'integrazione sicura con Logto Identity Provider e Core API (@myteam/api).
 *
 * SPECIFICHE DI SICUREZZA E PROTOCOLLO:
 * - Public SPA Client: NESSUN client secret memorizzato o inviato dal frontend.
 * - PKCE: Generazione di `code_verifier` crittograficamente sicuro (Web Crypto API)
 *   e derivazione del `code_challenge` con metodo SHA-256 ('S256').
 * - State CSRF Protection: Generazione e verifica di un parametro `state` casuale ad ogni flusso.
 * - Nonce Protection: Parametro `nonce` univoco per prevenire replay attacks sull'ID token.
 * - Separazione Access Token vs ID Token:
 *   L'Access Token è destinato alla risorsa Core API (audience) con scope `platform:admin`.
 *   L'ID Token è utilizzato solo per estrarre informazioni identitarie (`sub`) e come `id_token_hint` nel logout.
 *   L'ID token non viene MAI usato come Bearer token per le API.
 * - Modello di Sessione e Rischio XSS:
 *   I token sono memorizzati primariamente in memoria volatile React e sincronizzati in `sessionStorage`
 *   esclusivamente per la durata del tab (F5 reload). Nessuna persistenza a lungo termine (localStorage).
 * - Validazione Configurazione Rigida (Punto 3.E):
 *   Nessun default fittizio per audience/resource o appId nei deployment reali.
 *   Se uno dei parametri obbligatori manca, il client fallisce in modo esplicito senza inventare risorse.
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
  nonce?: string;
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
 * Genera una stringa casuale con caratteri sicuri per URL (A-Z, a-z, 0-9, -, _).
 */
export function generateRandomString(length: number = 32): string {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes).slice(0, length);
}

/**
 * Genera un code_verifier conforme a RFC 7636 (lunghezza tra 43 e 128 caratteri).
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(bytes); // 32 bytes producono esattamente 43 caratteri base64url
}

/**
 * Calcola il code_challenge da code_verifier tramite SHA-256 ('S256').
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(hashBuffer));
  }

  throw new Error('Web Crypto API (crypto.subtle.digest) non disponibile in questo ambiente.');
}

/**
 * Decodifica in sicurezza il payload di un JWT senza validarne la firma crittografica.
 * Utilizzato solo per estrarre informazioni di visualizzazione (sub, scope, exp).
 */
export function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) {
      return null;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Risolve la configurazione OIDC dalle variabili d'ambiente Vite o da un oggetto fornito.
 *
 * RIGORE AMBIENTALE (Punto 3.E):
 * - VITE_LOGTO_ENDPOINT, VITE_LOGTO_APP_ID e VITE_LOGTO_API_RESOURCE sono TUTTI e TRE OBBLIGATORI.
 * - Nessun default fittizio (come 'https://api.myteam.local') è consentito nei deployment reali.
 * - Se uno dei parametri manca, restituisce null per indicare configurazione incompleta.
 */
export function loadOidcConfig(env: EnvLike = import.meta.env): OidcConfig | null {
  const endpoint = (env as Record<string, string | undefined>).VITE_LOGTO_ENDPOINT?.trim();
  const appId = (env as Record<string, string | undefined>).VITE_LOGTO_APP_ID?.trim();
  const apiResource = (env as Record<string, string | undefined>).VITE_LOGTO_API_RESOURCE?.trim();

  if (!endpoint || !appId || !apiResource) {
    return null;
  }

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
   * Salva il code_verifier, state e nonce in sessionStorage.
   */
  public async buildAuthorizationUrl(options?: {
    returnTo?: string;
    state?: string;
  }): Promise<{ url: string; state: string; codeVerifier: string }> {
    if (!this.config) {
      throw new Error('Logto OIDC non è configurato. Impossibile avviare il login.');
    }

    const state = options?.state || generateRandomString(16);
    const nonce = generateRandomString(16);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Memorizza lo stato PKCE per la validazione al callback
    const pkceState: StoredPkceState = {
      codeVerifier,
      state,
      nonce,
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
    url.searchParams.set('nonce', nonce);

    if (this.config.apiResource) {
      url.searchParams.set('resource', this.config.apiResource);
    }

    return { url: url.toString(), state, codeVerifier };
  }

  /**
   * Gestisce il callback di reindirizzamento da Logto.
   * Verifica state, scambia authorization_code con access_token e id_token tramite PKCE.
   */
  public async handleAuthorizationCallback(
    urlOrSearch: string | URLSearchParams
  ): Promise<{
    session: OidcSession;
    returnTo?: string;
  }> {
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

    // 1. Verifica errori restituiti da IdP
    const error = params.get('error');
    if (error) {
      const description = params.get('error_description') || error;
      throw new Error(`Errore durante l'autenticazione IdP: ${description}`);
    }

    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code) {
      throw new Error('Parametro "code" mancante nel callback di reindirizzamento.');
    }

    if (!returnedState) {
      throw new Error('Parametro "state" mancante nel callback di reindirizzamento.');
    }

    // 2. Lettura e validazione stato PKCE salvato in sessionStorage
    let storedPkce: StoredPkceState | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PKCE);
      if (raw) {
        storedPkce = JSON.parse(raw);
      }
    } catch {
      storedPkce = null;
    }

    if (!storedPkce || !storedPkce.codeVerifier) {
      throw new Error('Sessione PKCE non trovata o scaduta. Riprova il login.');
    }

    // Protezione CSRF: il parametro state restituito deve corrispondere esattamente
    if (storedPkce.state !== returnedState) {
      throw new Error('Parametro "state" non corrispondente: possibile attacco CSRF.');
    }

    // 3. Scambio Authorization Code -> Token su Logto `/token`
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
    } catch (netErr: any) {
      throw new Error(
        `Identity Provider Logto non raggiungibile o errore di rete: ${netErr?.message || 'offline'}`
      );
    }

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson && errorJson.error_description) {
          errorMsg = errorJson.error_description;
        } else if (errorJson && errorJson.error) {
          errorMsg = errorJson.error;
        }
      } catch {
        // ignore
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
    const idTokenClaims = tokenResponse.id_token ? parseJwtPayload(tokenResponse.id_token) : null;
    const accessClaims = parseJwtPayload(accessToken);
    const claims = accessClaims || idTokenClaims;

    if (claims && typeof claims.sub === 'string') {
      subject = claims.sub;
    }

    // Se id_token e stored nonce sono presenti, convalida il nonce
    if (idTokenClaims && idTokenClaims.nonce && storedPkce.nonce) {
      if (idTokenClaims.nonce !== storedPkce.nonce) {
        throw new Error('Validazione ID Token fallita: nonce non corrispondente.');
      }
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
   * Restituisce l'access token valido per la risorsa (conforme a @logto/react getAccessToken).
   */
  public async getAccessToken(resource?: string): Promise<string | null> {
    const session = this.loadSession();
    if (!session) return null;

    if (resource && this.config?.apiResource && resource !== this.config.apiResource) {
      return null;
    }

    return session.accessToken;
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

      // Verifica scadenza attiva
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

    const isOidcPath = this.config.endpoint.endsWith('/oidc');
    const endSessionEndpoint = isOidcPath
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
