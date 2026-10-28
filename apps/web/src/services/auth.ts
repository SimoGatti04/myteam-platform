/**
 * Servizio di autenticazione per l'area amministrativa di myteam-platform.
 *
 * MODELLO DI SESSIONE E ANALISI DELLA SICUREZZA (Approvato per W2-R1):
 * - Flusso Principale: OpenID Connect (OIDC) con Authorization Code Flow + PKCE (RFC 7636).
 *   Integrato con Logto Identity Provider. Public Client SPA senza client secret.
 *
 * - Analisi del Modello di Sessione e Rischio XSS (Trade-Off Architetturale):
 *   1. Non consideriamo `sessionStorage` intrinsecamente "sicuro" contro attacchi XSS (Cross-Site Scripting),
 *      poiché qualsiasi script in esecuzione nel contesto dell'origine può accedervi.
 *   2. Tuttavia, rispetto a `localStorage` (persistenza indeterminata esposta a data leakage e furto a lungo termine),
 *      `sessionStorage` è limitato rigorosamente alla singola scheda/tab del browser e viene distrutto
 *      automaticamente alla chiusura della finestra.
 *   3. La sessione attiva risiede primariamente nella memoria volatile dell'applicazione React. La sincronizzazione
 *      con `sessionStorage` è circoscritta all'esigenza di preservare lo stato durante il refresh di pagina (F5).
 *   4. Nessun refresh token né client secret viene memorizzato o gestito dal frontend.
 *   5. Scadenza Attiva: Il token viene convalidato prima di ogni chiamata API (`getAuthToken()`).
 *      Se scaduto, la sessione viene distrutta immediatamente sia in memoria che in storage.
 *   6. Reazione Immediata a 401: Qualsiasi errore HTTP 401 sollevato dal backend Core scatena
 *      automaticamente l'invalidazione della sessione e notifica l'interfaccia utente tramite listener.
 *   7. Raccomandazione di sicurezza a lungo termine: L'evoluzione ottimale per mitigare integralmente
 *      il rischio XSS nelle SPA prevede l'adozione di un pattern Backend-For-Frontend (BFF) o reverse proxy
 *      con cookie HttpOnly, Secure, SameSite=Strict gestiti a monte. Fino all'introduzione del BFF,
 *      il modello in-memory + sessionStorage con PKCE e breve durata dell'access token rappresenta
 *      il trade-off standard conforme per client pubblici.
 *
 * - Flusso di Collaudo Manuale:
 *   L'inserimento manuale del Bearer token JWT è consentito ESCLUSIVAMENTE in ambienti di sviluppo
 *   o staging autorizzati (isManualAuthAllowed) per il test delle API Core.
 *   In produzione è categoricamente disabilitato e qualsiasi token manuale presente in storage
 *   viene immediatamente eliminato e mai ripristinato.
 */

import { oidcClient, OidcSession, parseJwtPayload } from './oidc';
import { isManualAuthAllowed } from '../utils/env';

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

export type UnauthorizedListener = (message?: string) => void;

class AuthService {
  private oidcSession: OidcSession | null = null;
  private manualToken: string | null = null;
  private unauthorizedListeners: UnauthorizedListener[] = [];

  constructor() {
    this.initSession();
  }

  /**
   * Inizializza la sessione all'avvio.
   * Se la policy ambientale vieta l'autenticazione manuale (es. produzione),
   * qualsiasi residuo di token manuale viene cancellato immediatamente da sessionStorage.
   */
  public initSession(): void {
    // 1. Prova a caricare la sessione OIDC valida da sessionStorage
    this.oidcSession = oidcClient.loadSession();

    // 2. Prova a caricare l'eventuale token manuale di collaudo SOLO se consentito
    if (!isManualAuthAllowed()) {
      this.manualToken = null;
      try {
        sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
      } catch {
        // ignore
      }
    } else {
      try {
        this.manualToken = sessionStorage.getItem(STORAGE_KEY_MANUAL_TOKEN);
      } catch {
        this.manualToken = null;
      }
    }
  }

  /**
   * Sottoscrizione per notifiche di sessione non autorizzata (HTTP 401).
   */
  public onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.push(listener);
    return () => {
      this.unauthorizedListeners = this.unauthorizedListeners.filter(l => l !== listener);
    };
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
      // Verifica nuovamente la policy ambientale
      if (!isManualAuthAllowed()) {
        this.manualToken = null;
        try {
          sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
        } catch {
          // ignore
        }
        return null;
      }

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
   * Imposta il token manuale di collaudo (riservato ad ambienti dev/staging autorizzati).
   */
  public setAuthToken(token: string | null): void {
    if (!isManualAuthAllowed()) {
      this.manualToken = null;
      try {
        sessionStorage.removeItem(STORAGE_KEY_MANUAL_TOKEN);
      } catch {
        // ignore
      }
      return;
    }

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
   * Genera gli header HTTP di autorizzazione per le chiamate API Core riservate.
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
   * Gestisce una risposta HTTP 401 Unauthorized invalidando la sessione
   * e notificando i componenti registrati.
   */
  public handleUnauthorized(message?: string): void {
    this.logout();
    for (const listener of this.unauthorizedListeners) {
      try {
        listener(message);
      } catch {
        // ignore listener errors
      }
    }
  }

  /**
   * Effettua il logout: invalida sessione in memoria e sessionStorage,
   * ed eventualmente reindirizza all'endpoint federato di logout IdP.
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
