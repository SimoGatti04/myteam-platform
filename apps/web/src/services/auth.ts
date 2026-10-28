/**
 * Servizio di autenticazione per l'area amministrativa.
 *
 * NOTA ARCHITETTURALE E DI SICUREZZA:
 * L'immissione manuale del Bearer token JWT è una soluzione di COLLAUDO LOCALE / STAGING,
 * non il login definitivo di produzione.
 * In produzione l'accesso viene demandato al flusso OIDC autorizzato di Logto con redirect
 * sicuro, gestione dei refresh token e token di sessione protetti.
 *
 * sessionStorage è utilizzato qui esclusivamente come cache volatile della sessione
 * di collaudo e NON è considerato equivalente a uno storage di credenziali sicuro di produzione.
 */

const STORAGE_KEY_AUTH_TOKEN = 'myteam_admin_auth_token';

class AuthService {
  private token: string | null = null;

  constructor() {
    try {
      this.token = sessionStorage.getItem(STORAGE_KEY_AUTH_TOKEN);
    } catch {
      this.token = null;
    }
  }

  public getAuthToken(): string | null {
    return this.token;
  }

  public setAuthToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        sessionStorage.setItem(STORAGE_KEY_AUTH_TOKEN, token);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_AUTH_TOKEN);
      }
    } catch {
      // storage unavailable
    }
  }

  public isAuthenticated(): boolean {
    return Boolean(this.token && this.token.trim().length > 0);
  }

  public getAuthHeaders(): Record<string, string> {
    if (!this.token) {
      return {};
    }
    return {
      Authorization: `Bearer ${this.token}`,
    };
  }

  public logout(): void {
    this.setAuthToken(null);
  }
}

export const authService = new AuthService();
