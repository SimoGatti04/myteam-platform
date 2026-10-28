# apps/web — Frontend Web & PWA Responsive (`myteam-platform`)

Checkpoint W1-R2: Correzioni per integrazione MVP, consumazione contratti ed endpoint Core C1.1 (`@myteam/api`), gestione avanzata bozze/pubblicazione gare e gestione storico rosa.

## Architettura e Principi Guida (W1-R2)

- **Stack:** Vite + React 19 + TypeScript + Vitest.
- **Backend di Riferimento:** `@myteam/api` (Fastify 5 + TypeBox + PostgreSQL).
- **Separazione Rigida REALE / DEMO:**
  - **Modalità Reale (Default):** Il client interroga direttamente gli endpoint della piattaforma Core `@myteam/api` (`/api/v1/public/*` e `/api/v1/admin/*`). Nessun fallback silenzioso: gli errori 400 (es. date fuori stagione), 401/403 (autenticazione/autorizzazione), 404 (`public_team_not_found`, `match_not_found`), 5xx e network offline vengono mostrati all'utente con messaggi chiari, precisi e onesti.
  - **Modalità Demo (Sviluppo Locale / Collaudo Grafico):** Attivabile ESCLUSIVAMENTE negli ambienti di sviluppo autorizzati (`import.meta.env.DEV` o `VITE_ENABLE_DEMO === 'true'`). Nelle build di produzione, la modalità demo è rigorosamente disabilitata, `dataMode` è bloccato su `'real'` e il selettore/banner demo non viene renderizzato.
  - Nessuna informazione inventata viene spacciata per reale. Non si assumono campi non presenti nei DTO TypeBox (es. ruoli arbitrari o nazionalità non previste).
- **Integrazione Contratti Core Platform (`@myteam/contracts`):**
  - **Endpoint Pubblici:**
    - `GET /api/v1/public/team` -> `PublicTeamDto`
    - `GET /api/v1/public/roster` -> `PublicRosterDto`
    - `GET /api/v1/public/matches` -> `PublicMatchesDto` (`scheduled`, `toBeScheduled`)
    - `GET /api/v1/public/matches/:id` -> `PublicMatchDto`
  - **Endpoint Amministrativi (Core C1.1):**
    - `GET /api/v1/admin/team` -> `AdminTeamDto`
    - `PUT /api/v1/admin/team` -> `AdminTeamDto`
    - `POST /api/v1/admin/team/publish` -> `AdminTeamDto`
    - `GET /api/v1/admin/seasons` -> `SeasonDto[]`
    - `POST /api/v1/admin/seasons` -> `SeasonDto`
    - `GET /api/v1/admin/players` -> `PlayerDto[]`
    - `POST /api/v1/admin/players` -> `PlayerDto`
    - `GET /api/v1/admin/roster-memberships` -> `RosterMembershipDto[]` (filtrabili per `seasonId` o `playerId`)
    - `POST /api/v1/admin/roster-memberships` -> `RosterMembershipDto`
    - `POST /api/v1/admin/roster-memberships/:id/end` -> `RosterMembershipDto` (chiusura con data `activeUntil` e motivazione)
    - `GET /api/v1/admin/opponents` -> `OpponentDto[]`
    - `POST /api/v1/admin/opponents` -> `OpponentDto`
    - `GET /api/v1/admin/competitions` -> `CompetitionDto[]`
    - `POST /api/v1/admin/competitions` -> `CompetitionDto`
    - `GET /api/v1/admin/matches` -> `MatchDto[]` (espone tutte le gare, sia bozze con `publishedAt: null` che pubblicate)
    - `POST /api/v1/admin/matches` -> `MatchDto`
    - `POST /api/v1/admin/matches/:id/publish` -> `MatchDto`
- **Gestione Partite (Bozza vs Pubblica e Avversari Esistenti):**
  - La creazione della partita offre due azioni esplicite e separate: **"Salva come Bozza"** (crea solo il record via `POST /admin/matches`, lasciando `publishedAt: null`) e **"Salva e Pubblica"** (crea e invoca `POST /admin/matches/:id/publish`).
  - Il risultato di `publishMatch()` viene controllato esplicitamente: in caso di errore HTTP, la UI comunica l'esito negativo e non dichiara falsamente la partita pubblicata.
  - L'amministratore può selezionare un avversario già registrato da `GET /admin/opponents` oppure crearne uno nuovo se non ancora presente, evitando duplicazioni.
- **Gestione Rosa e Tesseramenti:**
  - Non limitata alla sola rosa pubblica corrente: visualizza anagrafica identità (`PlayerDto[]`) e storico appartenenze (`RosterMembershipDto[]`) con filtro per stagione e per stato (attivo/concluso).
  - Possibilità di terminare un tesseramento attivo impostando `activeUntil`.
  - La data di inizio appartenenza (`activeFrom`) è liberamente impostabile all'interno dei limiti della stagione (`startsOn` - `endsOn`), evitando l'obbligo della data odierna.
- **Autenticazione Amministrativa:**
  - L'immissione del token Bearer JWT è una soluzione di collaudo e test locale; `sessionStorage` funge da cache volatile e non da archivio credenziali definitivo. In produzione l'autenticazione è demandata a Logto OIDC.
  - Nessuna scrittura amministrativa viene simulata su `localStorage` in caso di rifiuto da parte del server.
- **Accessibilità & PWA:**
  - Zoom mobile ripristinato: rimosse le direttive restrittive `user-scalable=no` e `maximum-scale=1.0` dal viewport per rispettare le linee guida WCAG.
  - Web responsive con approccio mobile-first per smartphone e desktop.

## Navigazione

### 5 Voci Pubbliche Approvate
1. **Home:** Hero compatto con branding della squadra, card Prossima Partita / Ultimo Risultato, card informativa.
2. **Partite:** Lista cronologica divisa in Gare in programma e Da definire.
3. **Rosa:** Giocatori attivi della stagione con numero di maglia ed evidenza per il ruolo portiere (come da specifiche iOS).
4. **Statistiche:** In modalità reale segnala lo stato onesto "in arrivo con le API Core Fase 2"; in modalità demo espone il collaudo grafico del rendimento e classifica marcatori.
5. **Votazioni:** Modulo Player of the Match (POTM). In modalità reale presenta la roadmap di attivazione per evitare voti fittizi non registrati; in modalità demo offre il flusso interattivo simulato.

### Voci Amministrative
- **Panoramica:** Cruscotto riepilogativo con avvisi per sito in bozza o dati mancanti, prossimi impegni e scorciatoie per creare gare e giocatori.
- **Partite:** Sezione unica (Opzione A approvata) con gestione calendario (bozze e pubblicate), anagrafica avversari e stato importazioni.
- **Rosa:** Anagrafica giocatori, tesseramenti stagionali, date di appartenenza flessibili e chiusura tesseramenti.
- **Impostazioni:** Configurazione squadra (Nome e Stemma obbligatori per pubblicare), selettore palette dinamica con preview e azione di pubblicazione sul server Core `@myteam/api`.
- *Votazioni & Contenuti:* Visibili solo in modalità dimostrativa/sviluppo come anteprime architetturali Opzione B (sponsor multi-stagione e motore di voto legato alla distinta). Nascosti in modalità reale per evitare pagine operative fittizie.

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

   - Per testare la modalità reale (con backend `@myteam/api` su porta 3000): naviga su `http://127.0.0.1:5173`.
   - Per testare la modalità dimostrativa con tutti i componenti grafici popolati (solo in dev): naviga su `http://127.0.0.1:5173/?demo=true` o clicca sul pulsante "Passa a Demo" in cima alla pagina.

3. **Esecuzione dei Test:**
   ```bash
   pnpm --filter @myteam/web test
   ```
