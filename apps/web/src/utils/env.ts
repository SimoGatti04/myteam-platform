/**
 * Utility per la rilevazione e gestione degli ambienti di runtime e policy di sicurezza.
 *
 * MODELLO AMBIENTALE APPROVATO:
 * - 'production': Deployment pubblico di produzione.
 *                 La modalità DEMO è CATEGORICAMENTE DISABILITATA (nessun fallback, mock o parametro query consentito).
 *                 Il form JWT manuale è disabilitato finché Logto OIDC non è configurato.
 * - 'staging':    Build di test/staging autorizzata (es. VITE_APP_ENV='staging' o MODE='staging').
 *                 La modalità DEMO è consentita SOLO se esplicitamente autorizzata (VITE_ENABLE_DEMO === 'true').
 *                 Il form JWT manuale è consentito per il collaudo autorizzato.
 * - 'development' / 'test': Sviluppo locale Vite (import.meta.env.DEV) o test runner.
 *                 Modalità DEMO e form JWT manuale abilitati per collaudo grafico e unit test.
 */

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

export interface EnvLike {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  VITE_APP_ENV?: string;
  VITE_ENABLE_DEMO?: string;
  VITE_ALLOW_MANUAL_AUTH?: string;
}

/**
 * Risolve l'ambiente corrente a partire dai metadati d'ambiente (default: import.meta.env).
 */
export function getAppEnvironment(env: EnvLike = import.meta.env): AppEnvironment {
  const explicitAppEnv = env.VITE_APP_ENV?.toLowerCase().trim();
  if (explicitAppEnv === 'production') return 'production';
  if (explicitAppEnv === 'staging') return 'staging';
  if (explicitAppEnv === 'development') return 'development';
  if (explicitAppEnv === 'test') return 'test';

  const mode = env.MODE?.toLowerCase().trim();
  if (mode === 'staging') return 'staging';
  if (mode === 'test') return 'test';
  if (mode === 'development') return 'development';

  if (env.DEV) return 'development';

  // Se è in build di produzione o PROD === true, l'ambiente di default è 'production'
  return 'production';
}

/**
 * Restituisce true se l'ambiente corrente è un deployment pubblico di produzione.
 */
export function isProduction(env: EnvLike = import.meta.env): boolean {
  return getAppEnvironment(env) === 'production';
}

/**
 * Restituisce true se l'ambiente corrente è una build di staging autorizzata.
 */
export function isStaging(env: EnvLike = import.meta.env): boolean {
  return getAppEnvironment(env) === 'staging';
}

/**
 * Verifica se la modalità DEMO è autorizzata.
 *
 * REGOLE RIGIDE:
 * 1. Nel deployment pubblico di produzione ('production'), la demo è SEMPRE E RIGOROSAMENTE DISABILITATA (false).
 *    Anche se un utente passa ?demo=true o tenta di impostare sessionStorage, l'applicazione lo ignora.
 * 2. In una build staging autorizzata ('staging'), la demo è abilitata SOLO se esplicitamente autorizzata
 *    tramite variabile d'ambiente VITE_ENABLE_DEMO === 'true'.
 * 3. In ambiente di sviluppo locale ('development') o 'test', la demo è abilitata per collaudo grafico.
 */
export function isDemoAllowed(env: EnvLike = import.meta.env): boolean {
  const currentEnv = getAppEnvironment(env);

  if (currentEnv === 'production') {
    return false;
  }

  if (currentEnv === 'staging') {
    return env.VITE_ENABLE_DEMO === 'true';
  }

  return Boolean(env.DEV || currentEnv === 'development' || currentEnv === 'test');
}

/**
 * Verifica se l'immissione manuale del Bearer Token JWT (form di collaudo) è consentita.
 *
 * REGOLE:
 * 1. Nel deployment pubblico di produzione ('production'), il form JWT manuale è DISABILITATO.
 *    L'autenticazione è demandata a Logto OIDC reale; in assenza di OIDC configurato, la UI
 *    mostra uno stato esplicito di funzionalità non configurata.
 * 2. In staging, development e test, il form manuale è consentito come strumento di collaudo autorizzato.
 */
export function isManualAuthAllowed(env: EnvLike = import.meta.env): boolean {
  const currentEnv = getAppEnvironment(env);
  if (currentEnv === 'production') {
    return false;
  }
  return true;
}
