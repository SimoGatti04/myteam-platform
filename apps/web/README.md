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


## Autenticazione Amministrativa Logto OIDC (W2)

A partire dal checkpoint **W2**, l'area amministrativa adotta l'autenticazione federata ufficiale con **Logto Identity Provider** basata su **OpenID Connect (OIDC)** e **Authorization Code Flow con PKCE (RFC 7636)**.

### Architettura e Flusso di Autenticazione
1. **Public SPA Client (Nessun Client Secret):**
   - L'applicazione web è un client pubblico di tipo Single Page Application.
   - Non viene utilizzato né memorizzato alcun client secret nel frontend o nel bundle client.
2. **Authorization Code Flow con PKCE (RFC 7636):**
   - Avvio login: il client genera un `code_verifier` ad alta entropia crittograficamente sicuro (`crypto.getRandomValues`) e ne deriva il `code_challenge` con algoritmo SHA-256 (`S256`).
   - Viene generato un parametro `state` casuale ad ogni sessione per prevenire attacchi CSRF.
   - Redirect dell'utente all'endpoint di autorizzazione Logto (`/oidc/auth`) con i parametri:
     - `client_id`: ID applicazione SPA registrato in Logto
     - `redirect_uri`: URI di callback autorizzato
     - `response_type`: `code`
     - `scope`: `openid profile offline_access platform:admin`
     - `resource`: URI risorsa API indicata da `VITE_LOGTO_API_RESOURCE` (corrispondente a `LOGTO_AUDIENCE` di Core)
     - `code_challenge`: hash S256 calcolato
     - `code_challenge_method`: `S256`
     - `state`: token CSRF
3. **Elaborazione Callback & Scambio Token:**
   - Logto reindirizza all'applicazione con i parametri `code` e `state` (o `error`).
   - L'applicazione verifica rigorosamente la corrispondenza del parametro `state` salvato per scongiurare attacchi CSRF.
   - Invia una richiesta `POST /oidc/token` scambiando `code` e `code_verifier` con un access token JWT per le API Core.
   - I parametri query OIDC vengono rimossi immediatamente dalla barra degli indirizzi tramite `history.replaceState`.
4. **Verifica dei Ruoli e Permessi con Core (HTTP 401 / 403):**
   - L'applicazione effettua una verifica immediata con Core chiamando `GET /api/v1/admin/team`.
   - Se il server risponde **HTTP 403 (`insufficient_permissions`)**, significa che l'utente è autenticato su Logto ma non gli è stato assegnato il ruolo o lo scope `platform:admin`. L'utente viene avvisato con un messaggio chiaro e non accede al pannello.
   - Se il server risponde **HTTP 401 (`invalid_access_token` o `authentication_required`)**, la sessione locale viene invalidata.
5. **Modello di Sessione e Sicurezza:**
   - I token non vengono **MAI** memorizzati in `localStorage` permanente o cookie non protetti.
   - La sessione è mantenuta in memoria React e sincronizzata con `sessionStorage` (per consentire il reload della pagina/F5 all'interno dello stesso tab). `sessionStorage` viene distrutto automaticamente alla chiusura della finestra/scheda.
   - La scadenza del token (`expires_at`) viene controllata proattivamente prima di ogni chiamata: se il token è scaduto, viene invalidato e l'utente reindirizzato al login.
   - Nota W2-R3: il rinnovo silenzioso tramite refresh token **non è supportato**. Il scope `offline_access` può essere richiesto ma non viene usato per persistere o ruotare refresh token. Eventuale supporto richiede una decisione architetturale approvata e coordinamento con Core.
6. **Disabilitazione in Produzione del Form Manuale:**
   - In produzione (`MODE='production'` o `VITE_APP_ENV='production'`), il form manuale JWT è categoricamente disabilitato.
   - In ambienti di sviluppo locale o staging autorizzati (`isManualAuthAllowed`), il form manuale è conservato come strumento secondario di collaudo tecnico.

### Variabili d'Ambiente di Configurazione OIDC

| Variabile | Obbligatoria | Descrizione | Valore Tipico / Default |
|---|---|---|---|
| `VITE_LOGTO_ENDPOINT` | **Sì** (per OIDC) | URL base dell'istanza Logto OIDC (corrisponde a `LOGTO_ISSUER` di Core) | `https://auth.myteam.org/oidc` |
| `VITE_LOGTO_APP_ID` | **Sì** (per OIDC) | Client ID pubblico dell'applicazione SPA creata in Logto | es. `k492msldkf9203js` |
| `VITE_LOGTO_API_RESOURCE` | **Sì** (per OIDC) | Resource indicator API registrato in Logto (corrisponde tassativamente a `LOGTO_AUDIENCE` di Core) | `https://api.myteam.local` |
| `VITE_LOGTO_SCOPES` | No | Scope OIDC e permessi API richiesti | `openid profile offline_access platform:admin` |
| `VITE_LOGTO_REDIRECT_URI` | No | URI di callback post-login autorizzato | `${window.location.origin}/callback` |
| `VITE_LOGTO_POST_LOGOUT_REDIRECT_URI` | No | URI di redirect dopo il logout | `${window.location.origin}` |

### Valutazione Adozione SDK Ufficiale (@logto/react / @logto/browser) e Decisione Architetturale (W2-R2)

In conformità al gate di sicurezza e interoperabilità W2-R2, sono stati installati ed esaminati nel dettaglio i package ufficiali `@logto/react` (^4.1.2) e `@logto/browser` (^3.1.2).
L'analisi del codice sorgente dell'SDK ha rilevato i seguenti vincoli critici:
1. **Modello di Sessione e Rischio XSS:** `@logto/browser` implementa `BrowserStorage` che salva sistematicamente tutti i token (access token, ID token e refresh token) in `localStorage`. Questa persistenza a lungo termine viola il modello di sicurezza approvato in `ACCESS-DEPLOYMENT.md`, che vieta storage permanente non protetto per SPA pubbliche.
2. **Replay Protection sull'ID Token:** L'implementazione client di `@logto/client` non trasmette né convalida il parametro standard `nonce` nei flussi authorization code, omettendo una difesa essenziale di OIDC Core 1.0.
3. **Controllo Ottimistico dell'Accesso:** `<LogtoProvider>` assume `isAuthenticated = true` al montaggio appena rileva un token nello storage locale, prima ancora che il backend Core (`GET /api/v1/admin/team`) abbia confermato l'effettiva validità del token e il permesso `platform:admin`.
4. **Scadenza e Gestione Refresh Token:** Nessun refresh token viene memorizzato nel browser per mitigare il rischio XSS in SPA pubblica. Alla scadenza del token, la sessione viene distrutta e l'utente reindirizzato al login; non viene fittiziamente dichiarato il supporto a refresh token non protetti.

**Decisione:**
Vengono riusate direttamente le funzioni crittografiche mantenute dell'SDK (`generateCodeVerifier`, `generateCodeChallenge`, `generateState`), affiancate da un client OIDC integrato pienamente conforme a OIDC Core 1.0 (discovery dinamica RFC 8414 con verifica rigorosa dell'issuer, consumo monouso PKCE con TTL 5 minuti, validazione tassativa di iss, aud, exp e nonce sull'ID token, e ripristino F5 rigorosamente subordinato a Core prima di presentare la dashboard).

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
