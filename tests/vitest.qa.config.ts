/**
 * Configurazione Vitest per i soli test QA che importano codice Web
 * (che usa `import.meta.env`).
 *
 * Root = directory `apps/web` risolta in modo assoluto dal file di config,
 * così il comando funziona da qualsiasi working directory (nessuna dipendenza
 * nascosta dalla CWD). L'`include` è relativo alla root.
 */
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('../apps/web', import.meta.url));

export default {
  root: webRoot,
  test: {
    include: ['../../tests/q1/10-*.vitest.ts'],
    environment: 'jsdom',
  },
};
