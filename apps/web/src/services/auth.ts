/**
 * Servizio di autenticazione per l'area amministrativa di myteam-platform.
 *
 * MODELLO DI SESSIONE E SICUREZZA (Approvato per W2):
 * - Flusso Principale: OpenID Connect (OIDC) con Authorization Code Flow + PKCE (RFC 7636).
 *   Integrato con Logto Identity Provider. Public Client senza client secret.
 * - Modello di Sessione:
 *   1. Nessun token o credenziale viene MAI salvato in `localStorage` permanente o cookie non protetti.
 *   2. I token di sessione sono archiviati primariamente in memoria volatile del client React.
 *   3. Per supportare il ricaricamento di pagina (F5) all'interno dello stesso tab, la sessione OIDC
 *      è sincronizzata con `sessionStorage`, che viene distrutto automaticamente alla chiusura del tab/finestra.
 *   4. La scadenza del token (`expiresAt`) viene verificata attivamente prima di ogni richiesta.
 *      Se il token è scaduto, la sessione viene invalidata e rimossa immediatamente.
 *   5. In caso di errore HTTP 401 (token revocato, non valido o scaduto sul backend), il servizio
 *      invalida istantaneamente la sessione locale.
 * - Flusso di Collaudo Manuale:
 *   L'inserimento manuale del Bearer token JWT è consentito ESCLUSIVAMENTE in ambienti di sviluppo
 *   o staging autorizzati (isManualAuthAllowed) per il test delle API Core C1.1.
 *   In produzione è categoricamente disabilitato.
 */

import { oidcClient, OidcSession, parseJwtPayload } from './oidc';

const STORAGE_KEY_MANUAL_TOKEN = 'myteam_admin_auth_token';

export type AuthSource = 'oidc' | 'manual' | null;

export interface SessionInfo {
  source: AuthSource;
  token: string;
  tokenType: string;
  expiresAt: number | null;
  subject?: string;
  scope?: string;
}

class AuthService {
  private oidcSession: OidcSession | null = null;
  private manualToken: string | null = null;

  constructor() {
    this.initSession();
  }

  private initSession(): void {
    // 1. Prova a caricare la sessione OIDC valida da sessionStorage
    this.oidcSession = oidcClient.loadSession();

    // 2. Prova a caricare l'eventuale token manuale di collaudo
    try {
      this.manualToken = sessionStorage.getItem(STORAGE_KEY_MANUAL_TOKEN);
    } catch {
      this.manualToken = null;
    }
  }

  /**
   * Restituisce l'access token attualmente valido, verificandone la scadenza.
   */
  public getAuthToken(): string | null {
    // Se c'è una sessione OIDC attiva
    if (this.oidcSession) {
      if (this.oidcSession.expiresAt && Date.now() >= this.oidcSession.expiresAt) {
        // Token OIDC scaduto -> invalidazione
        this.logout();
        return null;
      }
      return this.oidcSession.accessToken;
    }

    // Se c'è un token manuale di collaudo
    if (this.manualToken && this.manualToken.trim().length > 0) {
      // Controlla se il JWT manuale contiene una scadenza 'exp'
      const claims = parseJwtPayload(this.manualToken);
      if (claims && typeof claims.exp === 'number') {
        const expMs = claims.exp * 1000;
        if (Date.now() >= expMs) {
          this.logout();
          return null;
        }
      }
      return this.manualToken;
    }

    return null;
  }

  /**
   * Imposta la sessione attiva derivante dal callback OIDC Logto.
   */
  public setOidcSession(session: OidcSession | null): void {
    this.oidcSession = session;
    this.manualToken = null;
    oidcClient.saveSession(session);
    try {
      sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
    } catch {
      // ignore
    }
  }

  /**
   * Imposta il token manuale di collaudo (riservato ad ambienti dev/staging).
   */
  public setAuthToken(token: string | null): void {
    this.manualToken = token;
    this.oidcSession = null;
    oidcClient.saveSession(null);

    try {
      if (token) {
        sessionStorage.setItem(STORAGE_KEY_MANUAL_TOKEN, token);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
      }
    } catch {
      // storage unavailable
    }
  }

  /**
   * Restituisce true se l'utente possiede una sessione valida non scaduta.
   */
  public isAuthenticated(): boolean {
    return this.getAuthToken() !== null;
  }

  /**
   * Restituisce la sorgente di autenticazione corrente ('oidc' | 'manual' | null).
   */
  public getAuthSource(): AuthSource {
    if (this.oidcSession && this.getAuthToken()) {
      return 'oidc';
    }
    if (this.manualToken && this.getAuthToken()) {
      return 'manual';
    }
    return null;
  }

  /**
   * Restituisce i dettagli informativi della sessione corrente.
   */
  public getSessionInfo(): SessionInfo | null {
    const token = this.getAuthToken();
    if (!token) return null;

    if (this.oidcSession) {
      return {
        source: 'oidc',
        token,
        tokenType: this.oidcSession.tokenType,
        expiresAt: this.oidcSession.expiresAt,
        subject: this.oidcSession.subject,
        scope: this.oidcSession.scope,
      };
    }

    const claims = parseJwtPayload(token);
    return {
      source: 'manual',
      token,
      tokenType: 'Bearer',
      expiresAt: claims && typeof claims.exp === 'number' ? claims.exp * 1000 : null,
      subject: claims && typeof claims.sub === 'string' ? claims.sub : undefined,
      scope: claims && typeof claims.scope === 'string' ? claims.scope : undefined,
    };
  }

  /**
   * Genera gli header HTTP di autorizzazione per le chiamate API Core.
   */
  public getAuthHeaders(): Record<string, string> {
    const token = this.getAuthToken();
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Gestisce una risposta HTTP 401 Unauthorized invalidando la sessione.
   */
  public handleUnauthorized(): void {
    this.logout();
  }

  /**
   * Effettua il logout: invalida sessione in memoria e sessionStorage,
   * ed eventualmente reindirizza all'endpoint di logout IdP.
   */
  public logout(options?: { redirect?: boolean }): void {
    const idToken = this.oidcSession?.idToken;
    this.oidcSession = null;
    this.manualToken = null;

    oidcClient.logout();
    try {
      sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
    } catch {
      // ignore
    }

    if (options?.redirect && oidcClient.isConfigured()) {
      const logoutUrl = oidcClient.buildEndSessionUrl(idToken);
      if (logoutUrl && typeof window !== 'undefined') {
        window.location.assign(logoutUrl);
      }
    }
  }
}

export const authService = new AuthService();
