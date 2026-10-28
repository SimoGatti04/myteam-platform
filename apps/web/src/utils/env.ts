/**
 * Utility per la verifica dell'ambiente di esecuzione.
 * In produzione (build Vite di produzione), la modalità DEMO è disabilitata di default
 * per garantire che nessun dato dimostrativo possa sostituire i dati reali del backend.
 */
export function isDemoAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  // Abilitata in modalità sviluppo locale Vite (import.meta.env.DEV)
  // oppure se esplicitamente autorizzata via variabile d'ambiente VITE_ENABLE_DEMO === 'true'
  return Boolean(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true');
}
