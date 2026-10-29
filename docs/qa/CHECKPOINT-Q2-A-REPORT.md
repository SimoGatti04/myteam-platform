# Checkpoint Q2-A — Rapporto di Integrazione & Browser Regression Web W2-R1

**Data:** 29 Ottobre 2026  
**Agente Responsabile:** Agente QA persistente (`QA`)  
**Repository:** `myteam-platform` (`https://github.com/SimoGatti04/myteam-platform`)  
**Branch di Lavoro:** `qa/q2-a-w2-integration`  
**Ambiente di Esecuzione:** macOS ARM64, PostgreSQL 16 (porta 54329, schema isolato), Node.js v26.5.0, pnpm 10.32.1, Playwright Chromium headless  

---

## 1. Obiettivo e Quadro dell'Integrazione Q2-A

L'obiettivo del Checkpoint **QA Q2-A** è la verifica indipendente e rigorosa del nuovo rilascio frontend **Web W2-R1** (`web/w2-logto-auth` @ `ff4585930b8338f1e8c62fdbdbbfd667970a6cd1`) integrato sul baseline consolidato **MVP-I1** (`qa/mvp-i1-integration` @ `e8b90b41a3c2089efdb695dc216e44c827f11fa2`), senza attendere il successivo W2-R2 e preservando la rigorosa separazione delle responsabilità e l'ownership dei branch.

### Tabella degli SHA Verificati
| Componente | Branch Git | SHA Verificato | Ruolo & Contenuto Verificato |
| :--- | :--- | :--- | :--- |
| **Core C1.2** | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` | Backend Fastify 5, pool PostgreSQL, immutabilità calendario partite completate (`completed_match_schedule_is_immutable`), verificatore JWT con scope `platform:admin`. |
| **Web W2-R1** | `web/w2-logto-auth` | `ff4585930b8338f1e8c62fdbdbbfd667970a6cd1` | Consolidamento OIDC con PKCE S256, eliminazione autenticazione ottimistica, gestione visibile 401/403, isolamento Bearer token da route pubbliche, 68 test Vitest. |
| **QA MVP-I1 Base** | `qa/mvp-i1-integration` | `e8b90b41a3c2089efdb695dc216e44c827f11fa2` | Baseline integrato consolidato (Q1-R3.3) con suite PostgreSQL a 12 passi, contratti, auth crittografica e test browser Playwright. |
| **Branch Integrazione Q2-A** | `qa/q2-a-w2-integration` | `03c0438a3e7e732b3ac3932c3dda0c1569192a23` | Merge pulito di `web/w2-logto-auth` su base `qa/mvp-i1-integration`. Nessuna alterazione a file Core o Web da parte di QA. |

---

## 2. Esito Risoluzione Difetto `WEB-BUG-01` (Confermato Risolto)

### Analisi Diagnostica Precedente (W1-R2.2)
Nel rilascio W1-R2.2 (`dd6f147`), `loginAdminWithToken` in `AppContext.tsx` invocava `setIsAuthenticated(true)` prima di effettuare la chiamata di verifica API a `GET /api/v1/admin/team`. Di conseguenza:
1. `App.tsx` disattivava la visualizzazione del login (`showAdminLogin` diventava `false`), causando lo **smontaggio immediato** di `AdminLoginView`.
2. Quando la chiamata API falliva con HTTP 401 o 403, `AppContext` ripristinava `setIsAuthenticated(false)`.
3. `AdminLoginView` veniva **rimontato da zero** con stato locale `errorMsg = null`, cancellando l'avviso di errore prima che l'utente o il runner browser potessero visualizzarlo.

### Soluzione Implementata in Web W2-R1 (`ff45859`)
L'ispezione del codice e la verifica dinamica confermano che l'agente Web ha risolto alla radice il problema:
- In `apps/web/src/context/AppContext.tsx`, `loginAdminWithToken` **non imposta più ottimisticamente `setIsAuthenticated(true)`**.
- Esegue prima `await apiService.getAdminTeam()`:
  - Solo in caso di successo HTTP 200, `setIsAuthenticated(true)` e `setAdminTeam(result.data)` vengono confermati.
  - In caso di errore (401 o 403), la sessione viene azzerata con `authService.logout()`, `setIsAuthenticated(false)` rimane invariato, e viene restituito `{ success: false, error: errMessage }`.
- In `AdminLoginView.tsx`, il componente **rimane sempre montato**:
  - `handleManualSubmit` riceve il risultato e imposta lo stato locale `setManualError(result.error)`.
  - Il banner di avviso viene renderizzato con stili e titoli appropriati:
    * **HTTP 401**: Intestazione *"Errore di Autenticazione"*, messaggio *"Autenticazione richiesta (HTTP 401). Effettua l'accesso con token autorizzato."* (o *"Token non valido o scaduto (HTTP 401)."*).
    * **HTTP 403**: Intestazione con icona di scudo *"Permessi Insufficienti (HTTP 403)"*, messaggio *"Accesso negato (HTTP 403): token privo dello scope "platform:admin" richiesto da Core."*.
- **Evidenza Visiva Registrata:**
  * `tests/browser/screenshots/02a-auth-401-error-displayed.png` (Banner 401 perfettamente visibile a schermo).
  * `tests/browser/screenshots/02b-auth-403-error-displayed.png` (Banner 403 perfettamente visibile a schermo).
- **Stato:** **RISOLTO (CONFIRMED RESOLVED / VERIFIED PASS)**.

---

## 3. Matrice Completa dei Risultati dei Test

### A. Typecheck & Build Monorepo
| Controllo | Comando Eseguito | Esito | Dettaglio |
| :--- | :--- | :--- | :--- |
| **Monorepo Build** | `pnpm build` | **PASS** | `@myteam/contracts`, `@myteam/api`, `@myteam/web` compilati con successo. Bundle client Vite: 413.10 kB (gzip: 107.09 kB). |
| **Monorepo Typecheck** | `pnpm typecheck` | **PASS** | Nessun errore di tipo TypeScript nei 4 package del workspace. |

### B. Suite Unit & Integration Web (Vitest)
Eseguita con comando: `pnpm --filter @myteam/web test`  
**Totale:** **68 PASS / 0 FAIL** su 6 suite di test:
1. `apps/web/test/w2-oidc-auth.test.ts`: **23 PASS** (Configurazione OIDC, generazione state/nonce crittografici, Authorization URL con PKCE S256, scambio token e isolamento ID token, gestione sessione in `sessionStorage`).
2. `apps/web/test/w2-r1-react-integration.test.tsx`: **11 PASS** (Integrazione React context/provider, login redirect, callback con scambio code, 401 con logout automatico, 403 con messaggio permessi insufficienti, isolamento header Bearer, blocco credenziali manuali in produzione).
3. `apps/web/test/w1-r2-integration.test.ts`: **19 PASS** (Gestione stagioni, onboarding DB vuoto, creazione partita e bozza, pubblicazione esplicita).
4. `apps/web/test/api.test.ts`: **8 PASS** (Mapping errori HTTP e client fetch).
5. `apps/web/test/navigation.test.ts`: **4 PASS** (Routing interno e drawer mobile).
6. `apps/web/test/theme.test.ts`: **3 PASS** (Applicazione token CSS e branding dinamico).

### C. Suite Unit Core API (Node Test Runner)
Eseguita con comando: `pnpm --filter @myteam/api test`  
**Totale:** **3 PASS / 0 FAIL**:
- `apps/api/test/unit/auth.test.ts`:
  1. *Logto verifier accepts a correctly signed admin access token*: **PASS**
  2. *Logto configuration is optional locally but partial configuration fails*: **PASS**
  3. *Logto configuration requires HTTPS and uses the proposed admin permission by default*: **PASS**

### D. Suite QA Indipendente (Contratti, Auth Crittografica, Scenari Q1, PostgreSQL Reale)
Eseguita con comando:  
`export TEST_DATABASE_URL="postgresql://myteam:local-dev-only@127.0.0.1:54329/myteam_platform_test"`  
`node --import tsx --test tests/contracts/*.test.ts tests/auth/*.test.ts tests/q1/*.test.ts tests/integration/*.test.ts`  
**Totale:** **74 PASS / 0 FAIL / 0 SKIPPED** (100% eseguiti con successo):

| File di Test | Casi Verificati | Risultato | Ambito di Verifica |
| :--- | :---: | :---: | :--- |
| `tests/contracts/contracts.test.ts` | 4 | **PASS** | Validazione schema TypeBox, vincoli data, protezione dati riservati nei DTO pubblici. |
| `tests/auth/jwt-verification.test.ts` | 5 | **PASS** | Firma asimmetrica RS256 reale, validazione scope `platform:admin`, 401 su header malformato/scaduto, 403 su permessi mancanti, Fastify preHandler. |
| `tests/q1/01-team-setup.test.ts` | 9 | **PASS** | Setup squadra, stagioni, vincoli date, audit log. |
| `tests/q1/02-roster-management.test.ts` | 9 | **PASS** | Identità UUID giocatori, membership, numeri maglia, vincoli di overlap. |
| `tests/q1/03-match-lifecycle.test.ts` | 9 | **PASS** | Creazione partita, bozza non pubblicata, pubblicazione, immutabilità partite completate (`CORE-BUG-01`). |
| `tests/q1/04-access-and-isolation.test.ts` | 8 | **PASS** | Isolamento dati amministrativi, protezione rotte pubbliche da dati bozza. |
| `tests/q1/05-coherence-and-restart.test.ts` | 7 | **PASS** | Coerenza stagionale e simulazione riavvio database. |
| `tests/q1/06-web-responsive-audit.test.ts` | 5 | **PASS** | Verifiche layout responsive, viewport mobile e desktop. |
| `tests/q1/07-admin-reads-and-c1-1.test.ts` | 6 | **PASS** | 6 letture amministrative Core C1.1, validazione parametri, filtro seasonId. |
| `tests/q1/08-web-w1-r2-integration-and-defects.test.ts` | 6 | **PASS** | Controllo difetti pregressi Web (statusMsg, branding neutro, demo blocking). |
| `tests/integration/admin-pipeline-in-memory-integration.test.ts` | 1 | **PASS** | Pipeline API in-memory con Fastify.inject(). |
| `tests/integration/postgres-real-concurrency-and-rollback.test.ts` | 4 | **PASS** | **PostgreSQL 16 reale**: lock advisory di transazione, rollback atomico, vincoli check nativi, regressione `CORE-BUG-01`. |
| `tests/integration/postgres-real-onboarding-and-lifecycle.test.ts` | 1 | **PASS** | **PostgreSQL 16 reale**: percorso completo a 12 passi (da DB vuoto a partita pubblicata). |

---

## 4. Gate Browser E2E Reale su Playwright (Desktop & Mobile)

La suite `tests/browser/browser-e2e.py` è stata eseguita con successo completo contro lo stack integrato reale:
- **Backend API:** Fastify 5 (`start-test-api.ts`) connesso a PostgreSQL 16 (`localhost:54329`) con schema di test dedicato.
- **Frontend Web:** Vite Dev Server (`apps/web` @ `ff4585930b8338f1e8c62fdbdbbfd667970a6cd1`) su porta 5173.
- **Browser Runner:** Playwright Chromium headless (macOS ARM64, `--no-sandbox`).

### Risultati dei 9 Scenari Browser E2E
| Scenario | Nome Test | Esito | Evidenza / Dettaglio Operativo |
| :---: | :--- | :---: | :--- |
| **0** | **Backend Offline** | **PASS** | Route `/api/**` intercettata e abortita; l'interfaccia visualizza *"Servizio non disponibile"* e *"Server non raggiungibile (offline o connessione assente)"*. Screenshot: `00-backend-offline.png`. |
| **1** | **Database Iniziale Vuoto & Neutral Branding** | **PASS** | GET `/api/v1/public/team` restituisce 404; l'UI renderizza *"Squadra non ancora pubblicata"*; nessun badge DEMO né logo *"MAPI GROUP"*. Screenshot: `01-desktop-empty-db-home.png`. |
| **2A** | **401 Unauthorized UI Alert** | **PASS** | Token non valido (`invalid-token`) inviato all'API; risposta HTTP 401; **`AdminLoginView` rimane montato** ed espone l'alert *"Errore di Autenticazione"* con dettaglio HTTP 401. Screenshot: `02a-auth-401-error-displayed.png`. |
| **2B** | **403 Forbidden UI Alert** | **PASS** | Token forbidden (`forbidden-token`) inviato all'API; risposta HTTP 403; **`AdminLoginView` rimane montato** ed espone l'alert *"Permessi Insufficienti (HTTP 403)"* con menzione dello scope mancante `platform:admin`. Screenshot: `02b-auth-403-error-displayed.png`. |
| **2C** | **200 OK Authorized Bearer Token** | **PASS** | Token autorizzato (`test-admin-token`) inviato; HTTP 200 confermato da Core API; sblocco del pannello di amministrazione con controlli *"Esci"* e *"Vai a Sito Pubblico"*. Screenshot: `02-desktop-admin-authenticated.png`. |
| **3** | **Empty DB Onboarding in Impostazioni** | **PASS** | Apertura tab *"Impostazioni"*; banner *"Nessuna stagione registrata a sistema"*; creazione prima stagione `2026/2027` (01/09/2026 - 30/06/2027) salvata su PostgreSQL; configurazione profilo squadra (*"Aurora FC"*, crest, colori `#003366`/`#FFCC00`) e pubblicazione squadra. Screenshot: `03-desktop-team-published.png`. |
| **4** | **Creazione Avversaria & Partita Bozza** | **PASS** | Creazione squadra avversaria (*"Cittadella"*); programmazione partita per il `15/11/2026 15:00`; salvataggio con *"Salva come Bozza"*; verifica badge UI *"BOZZA (NON PUBBLICATA)"* e presenza pulsante *"Pubblica Partita"*. Screenshot: `04-desktop-draft-match-admin.png`. |
| **5** | **Isolamento Rigoroso Bozza dal Pubblico** | **PASS** | Navigazione al sito pubblico; verifica che la partita in bozza **non sia visibile** nel calendario pubblico (GET `/api/v1/public/matches` restituisce lista vuota). Screenshot: `05-desktop-public-draft-isolated.png`. |
| **6** | **Pubblicazione Esplicita & Dettaglio Pubblico** | **PASS** | Ritorno in Area Admin; click su *"Pubblica Partita"*; navigazione al sito pubblico; la partita appare nel calendario pubblico con stato programmato e denominazione avversaria corretta. Screenshot: `06-desktop-published-match-public.png`. |
| **Mobile** | **Responsive Viewport Mobile (390x844)** | **PASS** | Navigazione con viewport mobile 390x844; apertura drawer di navigazione con hamburger button; visualizzazione fluida del calendario partite su mobile. Screenshots: `07-mobile-drawer-open.png`, `08-mobile-public-matches.png`. |

**Esito Complessivo Browser Gate:** **ALL SCENARIOS VERIFIED WITH 100% SUCCESS — EXIT CODE: `0` (EXIT_PASS)**.

---

## 5. Verifiche Specifiche di Sicurezza e Architettura

1. **Gestione 401 & Invalidazione Sessione:**  
   In `api.ts`, quando una risposta da endpoint `/api/v1/admin/*` restituisce 401, viene immediatamente invocato `authService.handleUnauthorized(errorMessage)`. Questo pulisce i token in `sessionStorage` e notifica i subscriber di `AppContext`, impedendo qualsiasi permanenza in stati fantasma.
2. **Gestione 403 & Permessi Insufficienti:**  
   L'UI blocca l'accesso al pannello di amministrazione e mostra l'avviso di permessi insufficienti con riferimento esplicito allo scope richiesto `platform:admin`.
3. **Assenza di Autenticazione Ottimistica:**  
   Lo stato `isAuthenticated` è vincolato alla risposta positiva di Core API (`GET /api/v1/admin/team`). Nessun componente protetto viene mostrato prima dell'avvenuta validazione.
4. **Isolamento Token:**  
   La funzione `getAuthHeaders()` in `api.ts` viene chiamata **esclusivamente** per endpoint che iniziano con `/api/v1/admin/`. Nelle chiamate pubbliche `/api/v1/public/*` l'header `Authorization` non viene mai iniettato, prevenendo leakage accidentale di credenziali amministrative.
5. **Gating del Login Manuale:**  
   La maschera di inserimento manuale del Bearer token JWT è controllata da `isManualAuthAllowed()`. Nelle build di produzione (`VITE_APP_ENV=production`), l'opzione è disabilitata e non è presente alcun bypass all'autenticazione OIDC.

---

## 6. Lacune OIDC di W2-R1 Tracciate per W2-R2

Durante la revisione approfondita di W2-R1 (`ff45859`), sono state registrate le seguenti lacune architetturali che sono oggetto dell'incarico correttivo W2-R2 per l'agente Web:
1. **Validazione delle Claim dell'ID Token (OIDC Core 1.0):**  
   In W2-R1, l'ID token viene decodificato solo per estrarre il `sub`, senza validare rigorosamente che `iss` (issuer) corrisponda all'endpoint Logto configurato, che `aud` (audience) contenga il `client_id` (`appId`), e che il token non sia scaduto (`exp`).
2. **OIDC Discovery Dinamico (`/.well-known/openid-configuration`):**  
   W2-R1 costruisce gli endpoint `/oidc/auth`, `/oidc/token` e `/oidc/session/end` mediante concatenazione manuale di stringhe anziché interrogare il discovery document del provider.
3. **Logout RP-Initiated:**  
   La procedura di logout deve trasmettere `id_token_hint` e `post_logout_redirect_uri` conformemente alla specifica OpenID Connect RP-Initiated Logout 1.0.
4. **Dipendenze e Mock di Test:**  
   La suite Vitest in W2-R1 necessitava dell'ambiente `jsdom` e di `@testing-library/react` dichiarati esplicitamente in `package.json` di `apps/web`.

I test QA indipendenti sono già stati predisposti per accogliere e validare queste funzionalità non appena W2-R2 sarà pubblicato.

---

## 7. Stato Git e Pulizia Risorse

- **Branch di Integrazione:** `qa/q2-a-w2-integration`
- **Head Commit Integrazione:** `03c0438a3e7e732b3ac3932c3dda0c1569192a23` (merge di `web/w2-logto-auth` @ `ff4585930b8338f1e8c62fdbdbbfd667970a6cd1` su `qa/mvp-i1-integration` @ `e8b90b41a3c2089efdb695dc216e44c827f11fa2`).
- **File Modificati da QA nel Worktree:**
  * `tests/browser/browser-e2e.py` (adattamento selettori e asserzioni per i messaggi W2-R1).
  * `tests/browser/screenshots/*.png` (11 screenshot autentici catturati e salvati, inclusi `02a-auth-401-error-displayed.png` e `02b-auth-403-error-displayed.png`).
  * `docs/qa/CHECKPOINT-Q2-A-REPORT.md` (questo documento).
- **Rigorosa Ownership:** Nessun file applicativo in `apps/api/` o `apps/web/` è stato modificato da QA.
- **Pulizia Processi:** Tutti i processi locali Fastify (porta 3000) e Vite (porta 5173) sono stati terminati; le connessioni al database PostgreSQL di test sono state chiuse e lo schema isolato è stato ripulito.

---

## 8. Verdetto Finale Strutturato

| Gate di Verifica | Esito | Note e Motivazione |
| :--- | :---: | :--- |
| **A. Test Automatici Sintetici (Web + Core + QA)** | **PASS** | 68 PASS Web Vitest, 3 PASS Core unit, 74 PASS suite QA indipendente. Typecheck e build superati al 100%. |
| **B. Integrazione PostgreSQL Reale** | **PASS** | Eseguiti su PostgreSQL 16 (porta 54329): concorrenza advisory lock, rollback atomico, immutabilità calendario `CORE-BUG-01`, ciclo di vita completo a 12 passi. |
| **C. Browser E2E Reale (Playwright Desktop & Mobile)** | **PASS** | 9 scenari su 9 eseguiti con esito positivo (Exit Code 0). `WEB-BUG-01` **risolto e verificato** con banner 401 e 403 visibili. Nessun dato demo in modalità reale. |
| **D. Autenticazione OIDC Logto Staging Reale** | **NOT RUN** | Autenticazione simulata e verificata con flussi crittografici conformi e mock integrati; connessione all'istanza remota Logto reale in attesa di autorizzazione e configurazione staging dedicata. |
| **E. Idoneità al Merge su Main** | **NON IDONEO** | Nessun merge su `main` autorizzato in questa fase; il lavoro rimane confinato ai branch di integrazione e QA dedicati in attesa del completamento del ciclo W2-R2. |
