/**
 * Client OIDC per React SPA con supporto Authorization Code Flow + PKCE (RFC 7636).
 * Progettato per l'integrazione sicura e interoperabile con Logto Identity Provider e Core API (@myteam/api).
 *
 * SPECIFICHE DI SICUREZZA, PROTOCOLLO E INTEROPERABILITÀ (W2-R2):
 * 1. Adozione SDK Ufficiale & Decisione Architetturale:
 *    - Integrazione delle funzioni crittografiche mantenute dell'SDK ufficiale (@logto/browser:
 *      `generateCodeVerifier`, `generateCodeChallenge`, `generateState`).
 *    - Modello di Sessione e Rischio XSS: La classe `BrowserStorage` di default di @logto/browser
 *      memorizza i token in `localStorage`, violando le direttive di sicurezza approvate (ACCESS-DEPLOYMENT.md).
 *      Inoltre `<LogtoProvider>` assume autenticazione ottimistica locale prima della verifica Core
 *      e non implementa la verifica client-side del claim `nonce` sull'ID token.
 *      Pertanto questo client mantiene l'architettura approvata: sessione volatile in memoria + sessionStorage
 *      (distrutta alla chiusura del tab) e convalida rigorosa dell'ID token e del backend Core.
 * 2. OIDC Discovery e Controllo dell'Issuer:
 *    - Discovery dinamica via `/.well-known/openid-configuration`.
 *    - Validazione tassativa dell'issuer restituito (`metadata.issuer === expectedIssuer`).
 *    - Utilizzo esclusivo degli endpoint scoperti (`authorization_endpoint`, `token_endpoint`, `end_session_endpoint`).
 * 3. PKCE S256, State e Nonce:
 *    - Code verifier ad alta entropia (RFC 7636) e code challenge SHA-256 ('S256').
 *    - Parametro `state` crittografico contro attacchi CSRF.
 *    - Parametro `nonce` obbligatorio e univoco per prevenire replay attacks sull'ID token.
 * 4. Validazione Rigorosa ID Token OIDC:
 *    - Presenza obbligatoria dell'ID token nella risposta del token endpoint per completare la sessione OpenID.
 *    - Verifica claims: `iss` (coincidenza con issuer), `aud` (coincidenza con appId), `exp` (non scaduto)
 *      e `nonce` (corrispondenza esatta con il nonce generato dal client).
 * 5. Assenza di Fallback Math.random():
 *    - Utilizzo esclusivo delle Web Crypto API (`crypto.getRandomValues`, `crypto.subtle`).
 *    - Eccezione esplicita e bloccante se le API crittografiche non sono disponibili.
 * 6. Scadenza Effettiva (TTL 5 min) e Consumo Monouso dello Stato PKCE:
 *    - Lo stato PKCE viene eliminato da `sessionStorage` immediatamente al primo tentativo di lettura.
 *    - Se il tempo trascorso dalla generazione supera 5 minuti, il callback viene respinto.
 * 7. Access Token per Core API (Mai ID Token come Bearer):
 *    - L'Access Token è specificamente richiesto per la risorsa API Core (`VITE_LOGTO_API_RESOURCE`).
 *    - `getAccessToken(resource)` rifiuta richieste per risorse non autorizzate.
 *    - L'ID Token non viene MAI inviato come Bearer token al backend Core.
 * 8. Gestione Esplicita della Scadenza:
 *    - Nessun refresh token memorizzato nel browser per mitigare il rischio XSS in SPA pubblica.
 *    - Alla scadenza dell'access token la sessione termina e viene richiesto un nuovo login.
 */

import {
  generateCodeChallenge as logtoGenerateCodeChallenge,
  generateCodeVerifier as logtoGenerateCodeVerifier,
  generateState as logtoGenerateState,
} from '@logto/browser';
import type { EnvLike } from '../utils/env';

export interface OidcConfig {
  endpoint: string;
  appId: string;
  apiResource: string;
  scopes: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  trustedAudiences?: string[];
}

export interface OidcDiscoveryMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  jwks_uri?: string;
  userinfo_endpoint?: string;
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
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
  nonce: string;
  returnTo?: string;
  createdAt: number;
}

export const STORAGE_KEY_PKCE = 'myteam_oidc_pkce';
export const STORAGE_KEY_SESSION = 'myteam_oidc_session';

/** TTL massimo per il flusso di autenticazione PKCE (5 minuti in millisecondi) */
export const PKCE_MAX_AGE_MS = 5 * 60 * 1000;

export const OIDC_REQUEST_TIMEOUT_MS = 10_000;

class OidcRequestTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OidcRequestTimeoutError';
  }
}

/** Deadline covers fetch headers and full body consumption, including JSON parsing. */
async function withOidcRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new OidcRequestTimeoutError(timeoutMessage));
    }, OIDC_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

/**
 * Asserisce la disponibilità delle API crittografiche sicure Web Crypto (crypto.getRandomValues).
 * Rifiuta categoricamente qualsiasi fallback insicuro a Math.random().
 */
export function assertWebCryptoAvailable(): void {
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error(
      'Web Crypto API (crypto.getRandomValues) non disponibile in questo ambiente. Impossibile generare valori casuali sicuri.'
    );
  }
}

/**
 * Asserisce la disponibilità di crypto.subtle.digest per il calcolo crittografico SHA-256.
 */
export function assertWebCryptoSubtleAvailable(): void {
  assertWebCryptoAvailable();
  if (!crypto.subtle || typeof crypto.subtle.digest !== 'function') {
    throw new Error(
      'Web Crypto API (crypto.subtle.digest) non disponibile in questo ambiente.'
    );
  }
}

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
 * Genera una stringa casuale ad alta entropia utilizzando esclusivamente Web Crypto API.
 * Nessun fallback a Math.random().
 */
export function generateRandomString(length: number = 32): string {
  assertWebCryptoAvailable();
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, length);
}

/**
 * Genera un code_verifier conforme a RFC 7636 riusando la funzione crittografica di @logto/browser.
 */
export function generateCodeVerifier(): string {
  assertWebCryptoAvailable();
  return logtoGenerateCodeVerifier();
}

/**
 * Calcola il code_challenge da code_verifier tramite SHA-256 ('S256') riusando @logto/browser.
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  assertWebCryptoSubtleAvailable();
  return logtoGenerateCodeChallenge(verifier);
}

/**
 * Genera un parametro state sicuro per URL riusando @logto/browser.
 */
export function generateState(): string {
  assertWebCryptoAvailable();
  return logtoGenerateState();
}

/**
 * Decodifica in sicurezza il payload di un JWT senza validarne la firma crittografica.
 * Utilizzato per estrarre informazioni di sessione (iss, aud, exp, nonce, sub, scope).
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
 * RIGORE AMBIENTALE:
 * - VITE_LOGTO_ENDPOINT, VITE_LOGTO_APP_ID e VITE_LOGTO_API_RESOURCE sono TUTTI e TRE OBBLIGATORI.
 * - Nessun default fittizio è consentito nei deployment reali.
 * - Se uno dei parametri manca, restituisce null per indicare configurazione incompleta.
 */
/**
 * Opzioni per la validazione degli URL HTTPS OIDC.
 */
export interface ValidateHttpsUrlOptions {
  allowQuery?: boolean;
  fieldName?: string;
}

/**
 * Valida rigorosamente che un URL utilizzi il protocollo HTTPS, sia ben formato,
 * contenga un hostname valido, sia privo di credenziali utente e frammenti (#).
 * Se allowQuery è false (default per issuer OIDC), proibisce anche parametri query (?).
 *
 * SPECIFICHE (Q3-AUTH-02, RFC 8414 §2, OpenID Connect Core 1.0 §1.2 & §3.1.2.1):
 * - Issuer OIDC: deve essere un URL HTTPS valido privo di query e fragment.
 * - Endpoint OIDC (authorization, token, end_session): devono essere HTTPS,
 *   possono includere percorsi e parametri query conforme alle specifiche OAuth 2.0 / OIDC.
 * - Credenziali utente (username/password) e frammenti (#) sono categoricamente respinti.
 * - Nessuna eccezione HTTP consentita in ambiente di produzione o runtime.
 */
export function validateHttpsUrl(
  rawUrl: string,
  options?: ValidateHttpsUrlOptions
): URL {
  const field = options?.fieldName || 'URL';
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error(`${field} non valido: valore vuoto o non testuale.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`${field} non valido: sintassi URL non valida ("${rawUrl}").`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(
      `${field} insicuro: protocollo "${parsed.protocol}" non consentito. È richiesto tassativamente HTTPS.`
    );
  }

  if (!parsed.hostname) {
    throw new Error(`${field} non valido: hostname mancante.`);
  }

  if (parsed.username || parsed.password) {
    throw new Error(`${field} non valido: credenziali utente nell'URL non consentite.`);
  }

  if (parsed.hash) {
    throw new Error(`${field} non valido: frammenti (#) non consentiti.`);
  }

  if (!options?.allowQuery && parsed.search) {
    throw new Error(`${field} non valido: parametri query (?) non consentiti per questo endpoint/issuer.`);
  }

  return parsed;
}

export function loadOidcConfig(env: EnvLike = import.meta.env): OidcConfig | null {
  const endpoint = (env as Record<string, string | undefined>).VITE_LOGTO_ENDPOINT?.trim();
  const appId = (env as Record<string, string | undefined>).VITE_LOGTO_APP_ID?.trim();
  const apiResource = (env as Record<string, string | undefined>).VITE_LOGTO_API_RESOURCE?.trim();

  if (!endpoint || !appId || !apiResource) {
    return null;
  }

  // Validazione preventiva dell'endpoint/issuer configurato (Q3-AUTH-02)
  try {
    validateHttpsUrl(endpoint, {
      allowQuery: false,
      fieldName: 'VITE_LOGTO_ENDPOINT',
    });
  } catch {
    return null;
  }

  const scopes =
    (env as Record<string, string | undefined>).VITE_LOGTO_SCOPES?.trim() ||
    'openid profile platform:admin';

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  const redirectUri =
    (env as Record<string, string | undefined>).VITE_LOGTO_REDIRECT_URI?.trim() ||
    `${origin}/callback`;

  const postLogoutRedirectUri =
    (env as Record<string, string | undefined>).VITE_LOGTO_POST_LOGOUT_REDIRECT_URI?.trim() ||
    origin;

  const trustedAudiencesRaw = (env as Record<string, string | undefined>).VITE_LOGTO_TRUSTED_AUDIENCES?.trim();
  const trustedAudiences = trustedAudiencesRaw
    ? trustedAudiencesRaw.split(/[,\s]+/).filter(Boolean)
    : undefined;

  return {
    endpoint,
    appId,
    apiResource,
    scopes,
    redirectUri,
    postLogoutRedirectUri,
    ...(trustedAudiences && trustedAudiences.length > 0 ? { trustedAudiences } : {}),
  };
}

export class OidcClient {
  private config: OidcConfig | null;
  private discoveryMetadata: OidcDiscoveryMetadata | null = null;

  constructor(config?: OidcConfig | null) {
    this.config = config !== undefined ? config : loadOidcConfig();
    if (this.config) {
      validateHttpsUrl(this.config.endpoint, {
        allowQuery: false,
        fieldName: 'OidcConfig.endpoint',
      });
    }
  }

  public isConfigured(): boolean {
    return this.config !== null;
  }

  public getConfig(): OidcConfig | null {
    return this.config;
  }

  public setConfig(config: OidcConfig | null): void {
    if (config) {
      validateHttpsUrl(config.endpoint, {
        allowQuery: false,
        fieldName: 'OidcConfig.endpoint',
      });
    }
    this.config = config;
    this.discoveryMetadata = null;
  }

  public getDiscoveryMetadata(): OidcDiscoveryMetadata | null {
    return this.discoveryMetadata;
  }

  public setDiscoveryMetadata(metadata: OidcDiscoveryMetadata | null): void {
    if (typeof process !== 'undefined' && process.env?.VITEST) {
      if (metadata !== null) {
        validateHttpsUrl(metadata.issuer, {
          allowQuery: false,
          fieldName: 'OIDC discovery issuer',
        });
        validateHttpsUrl(metadata.authorization_endpoint, {
          allowQuery: true,
          fieldName: 'OIDC discovery authorization_endpoint',
        });
        validateHttpsUrl(metadata.token_endpoint, {
          allowQuery: true,
          fieldName: 'OIDC discovery token_endpoint',
        });
        if (metadata.end_session_endpoint) {
          validateHttpsUrl(metadata.end_session_endpoint, {
            allowQuery: true,
            fieldName: 'OIDC discovery end_session_endpoint',
          });
        }
      }
      this.discoveryMetadata = metadata;
    }
  }

  /**
   * Esegue la discovery OIDC dinamica recuperando il documento /.well-known/openid-configuration.
   * Valida rigorosamente che l'issuer restituito coincida con l'endpoint configurato.
   */
  public async fetchDiscovery(options?: { forceRefresh?: boolean }): Promise<OidcDiscoveryMetadata> {
    if (!this.config) {
      throw new Error('Logto OIDC non è configurato. Impossibile eseguire la discovery OIDC.');
    }

    if (this.discoveryMetadata && !options?.forceRefresh) {
      return this.discoveryMetadata;
    }

    // Validazione preventiva dell'issuer configurato prima della richiesta di discovery (Q3-AUTH-02)
    validateHttpsUrl(this.config.endpoint, {
      allowQuery: false,
      fieldName: 'Configured OIDC issuer/endpoint',
    });

    const endpoint = this.config.endpoint;
    const issuerBase = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
    const discoveryUrl = new URL('.well-known/openid-configuration', issuerBase).toString();

    let discoveryResponse: { response: Response; body: any };
    try {
      discoveryResponse = await withOidcRequestDeadline(async signal => {
        const response = await fetch(discoveryUrl, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal,
        });
        if (!response.ok) return { response, body: null };
        try {
          return { response, body: await response.json() };
        } catch {
          return { response, body: null };
        }
      }, 'Logto OIDC discovery: timeout (10s) durante la risposta completa.');
    } catch (err: any) {
      if (err instanceof OidcRequestTimeoutError) throw err;
      throw new Error(`Logto OIDC discovery non raggiungibile: ${err?.message || 'offline'}`);
    }

    const { response: res, body: metadata } = discoveryResponse;
    if (!res.ok) {
      throw new Error(`OIDC discovery fallita con HTTP ${res.status}`);
    }
    if (metadata === null) {
      throw new Error('OIDC discovery: risposta JSON non valida o corrotta dal provider.');
    }

    if (
      !metadata ||
      typeof metadata !== 'object' ||
      typeof metadata.issuer !== 'string' ||
      typeof metadata.authorization_endpoint !== 'string' ||
      typeof metadata.token_endpoint !== 'string'
    ) {
      throw new Error(
        'OIDC discovery: metadati incompleti (issuer, authorization_endpoint o token_endpoint mancanti).'
      );
    }

    // Validazione HTTPS dei metadati di discovery (Q3-AUTH-02)
    validateHttpsUrl(metadata.issuer, {
      allowQuery: false,
      fieldName: 'OIDC discovery issuer',
    });
    validateHttpsUrl(metadata.authorization_endpoint, {
      allowQuery: true,
      fieldName: 'OIDC discovery authorization_endpoint',
    });
    validateHttpsUrl(metadata.token_endpoint, {
      allowQuery: true,
      fieldName: 'OIDC discovery token_endpoint',
    });

    if (metadata.end_session_endpoint !== undefined) {
      if (typeof metadata.end_session_endpoint !== 'string') {
        throw new Error('OIDC discovery: end_session_endpoint deve essere una stringa.');
      }
      validateHttpsUrl(metadata.end_session_endpoint, {
        allowQuery: true,
        fieldName: 'OIDC discovery end_session_endpoint',
      });
    }

    // Confronto esatto dei valori issuer configurato e restituito dalla discovery (Q3-AUTH-01)
    // Nessuna normalizzazione o rimozione automatica di slash finali
    const returnedIssuer = metadata.issuer;
    const expectedIssuer = endpoint;

    if (returnedIssuer !== expectedIssuer) {
      throw new Error(
        `OIDC discovery: issuer restituito dal provider ("${metadata.issuer}") non corrisponde all'endpoint configurato ("${this.config.endpoint}").`
      );
    }

    this.discoveryMetadata = metadata as OidcDiscoveryMetadata;
    return this.discoveryMetadata;
  }

  /**
   * Costruisce l'URL di autorizzazione verso l'authorization_endpoint scoperto via OIDC discovery.
   * Genera e memorizza lo stato PKCE (code_verifier, state, nonce) con TTL e consumo monouso.
   */
  public async buildAuthorizationUrl(options?: {
    returnTo?: string;
    state?: string;
  }): Promise<{ url: string; state: string; codeVerifier: string; nonce: string }> {
    if (!this.config) {
      throw new Error('Logto OIDC non è configurato. Impossibile avviare il login.');
    }

    // Risolve authorization_endpoint via OIDC discovery (fail-closed: nessun fallback manuale)
    const discovery = await this.fetchDiscovery();
    const authEndpoint = discovery.authorization_endpoint;

    validateHttpsUrl(authEndpoint, {
      allowQuery: true,
      fieldName: 'authorization_endpoint',
    });

    const state = options?.state || generateState();
    const nonce = generateRandomString(32);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Memorizza lo stato PKCE per la validazione al callback (con timestamp per TTL 5 min)
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

    return { url: url.toString(), state, codeVerifier, nonce };
  }

  /**
   * Gestisce il callback di reindirizzamento da Logto.
   * - Consumo monouso immediato dello stato PKCE.
   * - Controllo TTL 5 minuti.
   * - Protezione CSRF (`state`).
   * - Scambio authorization_code con access_token su token_endpoint scoperto.
   * - Validazione rigorosa dell'ID Token (iss, aud, exp, nonce obbligatorio).
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

    // 2. Lettura e CONSUMO MONOUSO dello stato PKCE salvato in sessionStorage
    let storedPkce: StoredPkceState | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY_PKCE);
      if (raw) {
        storedPkce = JSON.parse(raw);
      }
      // Consumo monouso immediato: rimuove subito il record per prevenire replay o riutilizzo
      sessionStorage.removeItem(STORAGE_KEY_PKCE);
    } catch {
      storedPkce = null;
    }

    if (!storedPkce || !storedPkce.codeVerifier) {
      throw new Error('Sessione PKCE non trovata o scaduta. Riprova il login.');
    }

    // 2b. Verifica scadenza effettiva dello stato PKCE (TTL 5 minuti)
    if (typeof storedPkce.createdAt === 'number' && Date.now() - storedPkce.createdAt > PKCE_MAX_AGE_MS) {
      throw new Error('Sessione PKCE scaduta (tempo limite di 5 minuti superato). Riprova il login.');
    }

    // 2c. Protezione CSRF: il parametro state restituito deve corrispondere esattamente
    if (storedPkce.state !== returnedState) {
      throw new Error('Parametro "state" non corrispondente: possibile attacco CSRF.');
    }

    // 3. Risolve token_endpoint via OIDC discovery (fail-closed: nessun fallback manuale)
    const discoveryForToken = await this.fetchDiscovery();
    const tokenEndpoint = discoveryForToken.token_endpoint;

    validateHttpsUrl(tokenEndpoint, {
      allowQuery: true,
      fieldName: 'token_endpoint',
    });

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('client_id', this.config.appId);
    body.set('code', code);
    body.set('code_verifier', storedPkce.codeVerifier);
    body.set('redirect_uri', this.config.redirectUri);
    if (this.config.apiResource) {
      body.set('resource', this.config.apiResource);
    }

    let tokenResult: { response: Response; body: any };
    try {
      tokenResult = await withOidcRequestDeadline(async signal => {
        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          redirect: 'error',
          signal,
        });
        let responseBody: any = null;
        try {
          responseBody = await response.json();
        } catch {
          // HTTP error details are optional; success with an invalid body is rejected below.
        }
        return { response, body: responseBody };
      }, 'Scambio token fallito: timeout (10s) durante la risposta completa.');
    } catch (netErr: any) {
      if (netErr instanceof OidcRequestTimeoutError) throw netErr;
      throw new Error(
        `Identity Provider Logto non raggiungibile o errore di rete: ${netErr?.message || 'offline'}`
      );
    }

    const { response: res, body: tokenResponse } = tokenResult;
    if (!res.ok) {
      let errorMsg = `HTTP ${res.status}`;
      if (tokenResponse && typeof tokenResponse === 'object') {
        if (tokenResponse.error_description) errorMsg = tokenResponse.error_description;
        else if (tokenResponse.error) errorMsg = tokenResponse.error;
      }
      throw new Error(`Scambio token fallito con il provider OIDC: ${errorMsg}`);
    }
    const accessToken = tokenResponse.access_token;
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Risposta del provider priva di access_token valido.');
    }

    // 4. Validazione Rigorosa ID Token secondo OpenID Connect Core 1.0
    const rawIdToken = tokenResponse.id_token;
    if (!rawIdToken || typeof rawIdToken !== 'string') {
      throw new Error('Risposta del provider priva di id_token: ID token obbligatorio per completare la sessione OpenID.');
    }

    const idTokenClaims = parseJwtPayload(rawIdToken);
    if (!idTokenClaims || typeof idTokenClaims !== 'object') {
      throw new Error('Validazione ID Token fallita: token JWT malformato o non valido.');
    }

    // 4a. Verifica Issuer (Q3-AUTH-01: confronto esatto, nessuna trasformazione di slash)
    const expectedIssuer = this.config.endpoint;
    const idTokenIssuer = typeof idTokenClaims.iss === 'string' ? idTokenClaims.iss : '';
    if (idTokenIssuer !== expectedIssuer) {
      throw new Error(
        `Validazione ID Token fallita: issuer non corrispondente (atteso: "${expectedIssuer}", ricevuto: "${idTokenClaims.iss}").`
      );
    }

    // 4b. Verifica Audience e Authorized Party (azp) secondo OpenID Connect Core 1.0 §3.1.3.7 (Q3-AUTH-01)
    // POLITICA DI VALIDAZIONE AUDIENCE & AZP:
    // 1. aud deve essere una stringa non vuota o un array non vuoto di stringhe.
    // 2. aud deve contenere il client ID (config.appId).
    // 3. Se aud contiene audience aggiuntive rispetto a config.appId, ciascuna di esse deve essere
    //    esplicitamente presente nell'elenco fidato (config.trustedAudiences). In assenza di
    //    trustedAudiences configurate, qualsiasi audience aggiuntiva comporta il rigetto immediato.
    // 4. Se sono presenti audience multiple (aud.length > 1), il claim azp è OBBLIGATORIO e
    //    deve coincidere esattamente con il client ID (config.appId).
    // 5. Se il claim azp è presente (anche per audience singola), deve coincidere con config.appId.
    // 6. La presenza di un claim azp valido non è MAI sufficiente ad accettare audience sconosciute o non fidate.
    const aud = idTokenClaims.aud;
    const appId = this.config.appId;
    const trustedAudiences = new Set(this.config.trustedAudiences || []);

    if (typeof aud === 'string') {
      if (aud !== appId) {
        throw new Error(
          `Validazione ID Token fallita: audience non valida per appId "${appId}".`
        );
      }
      if (idTokenClaims.azp !== undefined) {
        if (typeof idTokenClaims.azp !== 'string' || idTokenClaims.azp !== appId) {
          throw new Error(
            `Validazione ID Token fallita: authorized party (azp: "${idTokenClaims.azp}") non corrisponde al client ID ("${appId}").`
          );
        }
      }
    } else if (Array.isArray(aud)) {
      if (aud.length === 0 || aud.some(a => typeof a !== 'string' || !a)) {
        throw new Error('Validazione ID Token fallita: claim "aud" contiene valori non validi o vuoti.');
      }
      if (!aud.includes(appId)) {
        throw new Error(
          `Validazione ID Token fallita: audience non valida per appId "${appId}".`
        );
      }

      const additionalAudiences = aud.filter(a => a !== appId);
      if (additionalAudiences.length > 0) {
        const untrusted = additionalAudiences.filter(a => !trustedAudiences.has(a));
        if (untrusted.length > 0) {
          throw new Error(
            `Validazione ID Token fallita: l'ID token contiene audience aggiuntive non fidate (${untrusted.join(', ')}).`
          );
        }
      }

      if (aud.length > 1) {
        if (!idTokenClaims.azp || typeof idTokenClaims.azp !== 'string') {
          throw new Error(
            'Validazione ID Token fallita: claim "azp" obbligatorio per ID token con audience multiple.'
          );
        }
        if (idTokenClaims.azp !== appId) {
          throw new Error(
            `Validazione ID Token fallita: authorized party (azp: "${idTokenClaims.azp}") non corrisponde al client ID ("${appId}").`
          );
        }
      } else if (idTokenClaims.azp !== undefined) {
        if (typeof idTokenClaims.azp !== 'string' || idTokenClaims.azp !== appId) {
          throw new Error(
            `Validazione ID Token fallita: authorized party (azp: "${idTokenClaims.azp}") non corrisponde al client ID ("${appId}").`
          );
        }
      }
    } else {
      throw new Error(
        `Validazione ID Token fallita: audience non valida per appId "${appId}".`
      );
    }

    // 4c. Verifica Scadenza (exp)
    if (typeof idTokenClaims.exp !== 'number' || Date.now() >= (idTokenClaims.exp + 10) * 1000) {
      throw new Error('Validazione ID Token fallita: ID token scaduto.');
    }

    // 4d. Verifica Nonce (obbligatorio e deve coincidere con storedPkce.nonce)
    if (!idTokenClaims.nonce || idTokenClaims.nonce !== storedPkce.nonce) {
      throw new Error('Validazione ID Token fallita: nonce mancante o non corrispondente.');
    }

    const expiresIn = Number(tokenResponse.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    let subject: string | undefined = undefined;
    if (typeof idTokenClaims.sub === 'string') {
      subject = idTokenClaims.sub;
    } else {
      const accessClaims = parseJwtPayload(accessToken);
      if (accessClaims && typeof accessClaims.sub === 'string') {
        subject = accessClaims.sub;
      }
    }

    const session: OidcSession = {
      accessToken,
      idToken: rawIdToken,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt,
      scope: tokenResponse.scope,
      subject,
    };

    // Salva la sessione
    this.saveSession(session);

    return {
      session,
      returnTo: storedPkce.returnTo,
    };
  }

  /**
   * Restituisce l'access token valido per la risorsa (conforme a @logto/react getAccessToken).
   * Rifiuta l'emissione del token se la risorsa richiesta differisce dalla risorsa configurata.
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
   * Salva la sessione OIDC in sessionStorage (memoria volatile di tab).
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
   * Costruisce l'URL di logout da Logto usando end_session_endpoint scoperto (o fallback conforme).
   */
  public buildEndSessionUrl(idToken?: string): string | null {
    if (!this.config) return null;

    const endSessionEndpoint = this.discoveryMetadata?.end_session_endpoint;
    if (!endSessionEndpoint) {
      return null;
    }

    validateHttpsUrl(endSessionEndpoint, {
      allowQuery: true,
      fieldName: 'end_session_endpoint',
    });

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
