# apps/web — Frontend Web & PWA Responsive (`myteam-platform`)

Checkpoint W1-R1: Consolidamento frontend, separazione rigida DEMO/REALE, integrazione delle letture Core (`/api/v1/public/*`) e predisposizione per l'autenticazione Logto OIDC.

## Architettura e Principi Guida (W1-R1)

- **Stack:** Vite + React 19 + TypeScript + Vitest.
- **Separazione Rigida REALE / DEMO:**
  - **Modalità Reale (Default):** Il client interroga direttamente gli endpoint della piattaforma Core (`/api/v1/public/team`, `/api/v1/public/roster`, `/api/v1/public/matches`). Nessun fallback silenzioso: gli errori 401/403, 404 (`public_team_not_found`), 5xx e network offline vengono mostrati all'utente con stato esplicito e onesto.
  - **Modalità Demo (Sviluppo Locale / Collaudo Grafico):** Attivabile esplicitamente tramite query parameter `?demo=true` o pulsante nella barra superiore. Evidenziata da un banner persistente `MODALITÀ DIMOSTRATIVA` e badge `[DEMO]` su tutti i mock di sviluppo.
  - Nessuna informazione inventata viene spacciata per reale.
- **Integrazione Contratti Core Platform (`@myteam/contracts`):**
  - Consuma direttamente i DTO TypeBox: `PublicTeamDto`, `PublicRosterDto`, `PublicMatchesDto` (`scheduled`, `toBeScheduled`), `AdminTeamDto`.
  - Non altera `packages/contracts`.
- **Autenticazione Amministrativa:**
  - Nessun toggle fittizio. L'area admin in modalità reale richiede l'autenticazione tramite Bearer Token JWT (Logto OIDC).
  - Nessuna scrittura amministrativa (`PUT /admin/team`, `POST /admin/team/publish`, `POST /admin/matches`, `POST /admin/players`) viene simulata o memorizzata in `localStorage` se il server rifiuta l'operazione.
- **Branding Dinamico (Modalità A approvata):**
  - Nessuna palette hardcoded. L'amministratore imposta colore primario e secondario in formato esadecimale (`#RRGGBB`).
  - In assenza di colori configurati viene applicato lo stile tecnico neutro di visualizzazione.
- **PWA & Mobile-First:**
  - Manifest conforme (`/manifest.json`), icone vettoriali responsive (`/icon.svg`, `/favicon.svg`), banner browser-aware per l'aggiunta alla schermata Home.

## Navigazione

### 5 Voci Pubbliche Approvate
1. **Home:** Hero compatto identità squadra, card in primo piano della prossima partita o gara più vicina, card secondo impegno, anteprima classifica (solo se disponibile da server o in demo), teaser votazioni e banner PWA.
2. **Partite:** Lista cronologica per gare programmate e sezione gare da definire. Scheda partita con dati ufficiali del calendario. In modalità demo include il tabellino eventi (marcatori, cartellini).
3. **Rosa:** Tesserati della stagione corrente da `PublicRosterDto`. In modalità demo permette il click per visualizzare la scheda profilo.
4. **Statistiche:** In modalità reale segnala lo stato onesto "in arrivo con le API Core Fase 2"; in modalità demo espone il collaudo grafico del rendimento e classifica marcatori.
5. **Votazioni:** Modulo Player of the Match (POTM). In modalità reale presenta la roadmap di attivazione per evitare voti fittizi non registrati; in modalità demo offre il flusso interattivo simulato.

### 6 Voci Amministrative Approvate
1. **Panoramica:** Cruscotto riepilogativo con avvisi per sito in bozza o dati mancanti, prossimi impegni e scorciatoie per creare gare e giocatori.
2. **Partite:** Sezione unica (Opzione A approvata) con gestione calendario, anagrafica avversari e stato delle importazioni.
3. **Rosa:** Creazione e tesseramento giocatori associati alla stagione corrente.
4. **Votazioni:** Gestione cicli di voto POTM e registrazione premi storici (Fase 2).
5. **Contenuti:** Gestione sponsor multi-stagione e integrazione social (Fase 2).
6. **Impostazioni:** Configurazione anagrafica (Nome e Stemma obbligatori per pubblicare), selettore palette dinamica con preview e azione di pubblicazione sul server Core.

## Istruzioni per Avviare e Visualizzare Localmente

1. **Installazione dipendenze e build contratti:**
   ```bash
   pnpm install
   pnpm --filter @myteam/contracts build
   ```

2. **Avvio del frontend Web (porta 5173 con proxy verso API Core porta 3000):**
   ```bash
   pnpm --filter @myteam/web dev
   ```
   Apri il browser su `http://127.0.0.1:5173`.

   - Per testare la modalità reale (richiede backend Core su porta 3000): naviga su `http://127.0.0.1:5173`.
   - Per testare la modalità dimostrativa con tutti i componenti grafici popolati: naviga su `http://127.0.0.1:5173/?demo=true` o clicca sul pulsante "Passa a Demo" in cima alla pagina.

3. **Esecuzione dei Test:**
   ```bash
   pnpm --filter @myteam/web test
   ```
