/**
 * Servizio di autenticazione per l'area amministrativa.
 * Predispone la struttura per l'autenticazione reale Logto OIDC (Bearer token JWT).
 * Non implementa autenticazioni fittizie: se il token è assente, le richieste admin
 * non vengono inviate con credenziali inventate.
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
