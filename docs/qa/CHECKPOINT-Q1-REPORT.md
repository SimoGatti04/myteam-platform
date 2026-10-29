# Checkpoint Q1-R3.3 / Gate MVP-I1 — Rapporto Integrato di Rettifica Browser & Evidenze

**Data:** 29 Ottobre 2026  
**Agente Responsabile:** Agente QA persistente (`QA`)  
**Repository:** `myteam-platform` (`https://github.com/SimoGatti04/myteam-platform`)  
**Ambiente di Verifica:** macOS ARM64, PostgreSQL 16 (porta 54329), Node.js v26.5.0, pnpm 10.32.1, Playwright Chromium headless  

---

## 1. Commit e Relazione Git tra i Branch sotto Verifica

### Tabella degli SHA Verificati nel Baseline MVP-I1
| Componente | Branch Git | SHA Verificato | Note di Rilascio / Contenuto Integrato |
| :--- | :--- | :--- | :--- |
| **Core C1.2** | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` | Fix immutabilità calendario partite completate (`completed_match_schedule_is_immutable`), pool PostgreSQL |
| **Web W1-R2.2** | `web/w1-r2-integration` | `dd6f14796659313b7b200807ceac13225e09fa3e` | Onboarding DB vuoto, gestione stagioni admin, **34 test Web Vitest** (tutti PASS) |
| **QA Dedicated (Q1-R3.3)** | `qa/q1-suite-consolidation` | `HEAD` (aggiornato) | Rettifica selettori browser, asserzioni rigide 401/403 UI, tracciamento `WEB-BUG-01`, 74 PASS / 1 SKIPPED |
| **Branch Integrazione MVP-I1** | `qa/mvp-i1-integration` | `HEAD` (aggiornato) | Integrazione monorepo verificata (Core C1.2 + Web W1-R2.2 + suite QA + screenshot browser) |

### Separazione dei Checkpoint: Web W1-R2.2 vs Web W2-R1
- **Checkout Integrato MVP-I1 (`qa/mvp-i1-integration`):** Incorpora **rigorosamente Web W1-R2.2** (`dd6f147`), che include 34 test unitari/integrazione Vitest. **Non** incorpora le modifiche di Web W2-R1.
- **Branch Web W2-R1 (`web/w2-logto-auth`, commit `ff4585930b8338f1e8c62fdbdbbfd667970a6cd1`):** Rappresenta la successiva linea di evoluzione dell'agente Web per l'integrazione dell'SDK `@logto/browser` e include 68 test Vitest. Come prescritto dal supervisore, **i 68 test e le feature di W2-R1 non sono attribuiti al checkout MVP-I1**. Verranno certificati in un gate di integrazione dedicato successivo all'approvazione formale dell'handoff Web.

### Relazione Git tra i Branch (Senza Riscrittura della Storia)
- **`qa/q1-suite-consolidation`**: linea di sviluppo confinata allo scope di proprietà QA (`tests/`, `docs/qa/`). Avanza per commit lineari (`e55a65a` -> `144233c` -> `9b02dd0` -> `4866bf5` -> `fa076b2` -> Q1-R3.3). Non modifica i file applicativi `apps/api` o `apps/web`.
- **`qa/mvp-i1-integration`**: branch di integrazione multi-package (@myteam/contracts, @myteam/api, @myteam/web, test QA). Unisce Core C1.2, Web W1-R2.2 e suite QA per verificare l'intero ciclo applicativo.

---

## 2. Rilevamento e Diagnosi del Difetto Web W1-R2.2 (`WEB-BUG-01`)

### Descrizione del Difetto
Durante l'esecuzione dello Scenario 2 (autenticazione con token non valido o privo di permessi), la UI **non mostra l'avviso di errore** (`Errore di autenticazione`) all'utente, rimanendo apparentemente silente pur rifiutando l'accesso.

### Causa Tecnica e Riproduzione nel DOM
1. In `apps/web/src/context/AppContext.tsx`, la funzione `loginAdminWithToken`:
   ```typescript
   authService.setAuthToken(token.trim());
   setIsAuthenticated(true); // <--- Impostazione ottimistica prematura!

   // Verifica immediata chiamando GET /admin/team
   const result = await apiService.getAdminTeam();
   if (result.success) {
     ...
   } else {
     authService.logout();
     setIsAuthenticated(false); // <--- Ripristino a false dopo il fallimento HTTP
     ...
     return { success: false, error: `${result.message} (HTTP ${result.status} - ${result.errorCode})` };
   }
   ```
2. In `apps/web/src/App.tsx`:
   ```tsx
   const showAdminLogin = adminMode && !isDemoData && !isAuthenticated;
   ...
   ) : showAdminLogin ? (
     <AdminLoginView />
   ) : (
     <AdminPanoramicaView />
   )
   ```
3. **Effetto nel Ciclo di Vita React:**
   - Appena l'utente preme *"Accedi"*, `setIsAuthenticated(true)` fa sì che `showAdminLogin` diventi `false` mentre la richiesta di rete verso `/api/v1/admin/team` è ancora in transito.
   - React **smonta** `<AdminLoginView />` e tenta di montare `<AdminPanoramicaView />`.
   - Quando il backend risponde con HTTP 401 o 403, `setIsAuthenticated(false)` riporta `showAdminLogin` a `true`.
   - React **rimonta da zero** `<AdminLoginView />` con stato locale iniziale (`errorMsg: null`).
   - Il messaggio di errore restituito dalla Promise (`setLoading(false); setErrorMsg(...)`) viene perso perché il componente era stato distrutto o perché viene ri-inizializzato allo stato vuoto.

### Classificazione del Difetto
- **Codice Difetto:** `WEB-BUG-01`
- **Gravità:** **Media / Non Bloccante per l'Onboarding**, ma **Bloccante per la certificazione del browser gate di W1-R2.2** (Scenario 2A/2B).
- **Impatto:** L'utente non riceve feedback visuale se inserisce credenziali errate; il form si limita a resettarsi.
- **Suggerimento di correzione per l'agente Web:** Rimuovere `setIsAuthenticated(true)` preventivo da `loginAdminWithToken`. Impostare `setIsAuthenticated(true)` **solo dopo** che `result.success` è stato confermato con HTTP 200.

---

## 3. Ristrutturazione della Suite Browser E2E (`browser-e2e.py`)

Lo script `tests/browser/browser-e2e.py` è stato aggiornato con le seguenti garanzie:
1. **Classificazione Rigorosa degli Errori di Launch:**
   - Se Chromium non si avvia a causa di policy sandbox del sistema operativo (es. `bootstrap_check_in for MachPortRendezvousServer 1100`), viene restituito **`EXIT_NOT_RUN` (exit code 2)**.
   - Se l'avvio fallisce per binario mancante, dipendenze o configurazione errata, viene restituito **`EXIT_FAIL` (exit code 1)**.
2. **Asserzioni Rigide sull'Avviso UI per 401 e 403:**
   - In Sub-scenario 2A (token non valido): verifica HTTP 401 e asserisce `await expect(page.locator("text=Errore di autenticazione")).to_be_visible()`. Rileva il fallimento dovuto a `WEB-BUG-01` e cattura lo screenshot `02a-auth-401-error-lost.png`.
   - In Sub-scenario 2B (token forbidden): verifica HTTP 403 e asserisce `await expect(page.locator("text=Errore di autenticazione")).to_be_visible()`. Rileva il fallimento dovuto a `WEB-BUG-01` e cattura lo screenshot `02b-auth-403-error-lost.png`.
   - In Sub-scenario 2C (token valido): procede all'autenticazione con `test-admin-token` ed esegue i successivi scenari di onboarding, creazione partita e responsive.
3. **Nessun Falso Successo:**
   - Poiché lo Scenario 2 fallisce l'asserzione sull'avviso UI a causa di `WEB-BUG-01`, l'intero test runner riporta lo stato `FAIL` ed esce con **exit code 1**.
   - Tutti gli screenshot degli scenari (00 attraverso 08, più 02a e 02b) vengono salvati su disco e tracciati su Git.

---

## 4. Evidenze Verificabili di Esecuzione Browser E2E

### Dati dell'Esecuzione
- **Commit Esatto Testato:** `0f1b90acd4692726f28d439b9b0f7c79ee66c870` (branch `qa/mvp-i1-integration`)
- **Backend API:** Fastify 5 + PostgreSQL 16 (`TEST_DATABASE_URL="postgresql://myteam:local-dev-only@127.0.0.1:54329/myteam_platform_test"`) su porta 3000
- **Frontend Web:** Vite + React (`dd6f147` / Web W1-R2.2) su porta 5173
- **Runner:** Python 3.12 + Playwright 1.58 (Chromium headless 145.0.7632.6)
- **Exit Code Reale:** **`1` (EXIT_FAIL)** (A causa di `WEB-BUG-01` negli scenari 2A e 2B)

### Log Completo dell'Esecuzione
```
===========================================================================
PLAYWRIGHT BROWSER E2E TEST: Real Onboarding & Lifecycle Verification
Target Web: http://127.0.0.1:5173
Target API: http://127.0.0.1:3000
===========================================================================

[SCENARIO 0] Backend Offline UI Handling...
  -> PASS: Backend offline state surfaced with clean error UI.

[SCENARIO 1] Empty Database State & Neutral Branding...
  -> PASS: 404 unconfigured team rendered, no DEMO badge, no 'MAPI GROUP' branding.

[SCENARIO 2] Authentication & Access Control (401, 403, 200)...
  -> Sub-scenario 2A: Testing 401 Unauthorized with invalid token...
  -> FAIL (WEB-BUG-01): 401 error alert 'Errore di autenticazione' was NOT displayed in UI!
     Root Cause: In AppContext.tsx loginAdminWithToken sets setIsAuthenticated(true) before API call.
     In App.tsx showAdminLogin flips to false -> AdminLoginView unmounts -> API 401 -> setIsAuthenticated(false)
     -> AdminLoginView remounts fresh with errorMsg=null, wiping out the error alert.
  -> Sub-scenario 2B: Testing 403 Forbidden with forbidden token...
  -> FAIL (WEB-BUG-01): 403 error alert 'Errore di autenticazione' was NOT displayed in UI!
     Root Cause: Same unmount/remount cycle in AdminLoginView wipes errorMsg.
  -> Sub-scenario 2C: Testing 200 OK with authorized test token...
  -> PASS: Authorized Bearer token accepted; Admin Dashboard unlocked.

[SCENARIO 3] Empty DB Onboarding in Impostazioni...
  -> PASS: Season created, team configured and published successfully on PostgreSQL.

[SCENARIO 4] Opponent Creation & Draft Match Creation...
  -> PASS: Opponent created, match saved as draft with 'BOZZA (NON PUBBLICATA)' badge.

[SCENARIO 5] Strict Isolation of Draft Match from Public Website...
  -> PASS: Draft match is strictly isolated, GET /public/matches returned empty.

[SCENARIO 6] Explicit Match Publication & Public Display...
  -> PASS: Match explicitly published, visible on public site with correct opponent.

--- MOBILE VIEWPORT TEST (390x844) ---
  -> PASS: Mobile viewport 390x844 renders hamburger drawer and public matches cleanly.

===========================================================================
BROWSER E2E GATE FINISHED WITH DETECTED DEFECTS (2 scenario(s) failed):
  - 02a_auth_401_ui: FAIL (WEB-BUG-01: AdminLoginView unmounts, wiping errorMsg)
  - 02b_auth_403_ui: FAIL (WEB-BUG-01: AdminLoginView unmounts, wiping errorMsg)
Overall Exit Code: 1 (EXIT_FAIL)
===========================================================================
```

### Dettaglio Risultati per Singolo Scenario
| Scenario | Descrizione | Risultato | Dettaglio / Evidenza |
| :--- | :--- | :--- | :--- |
| **Scenario 0** | Backend Offline | **PASS** | Errore di rete intercettato; banner *"Servizio non disponibile"* e *"Server non raggiungibile"* visibili. |
| **Scenario 1** | DB Vuoto & Neutral Branding | **PASS** | Home pubblica risponde 404; *"Squadra non ancora pubblicata"*; nessun badge DEMO né logo MAPI. |
| **Scenario 2A** | 401 Unauthorized UI Alert | **FAIL** | HTTP 401 ricevuto; alert di errore non mostrato a causa di `WEB-BUG-01`. |
| **Scenario 2B** | 403 Forbidden UI Alert | **FAIL** | HTTP 403 ricevuto; alert di errore non mostrato a causa di `WEB-BUG-01`. |
| **Scenario 2C** | 200 OK Token Valido | **PASS** | `test-admin-token` accettato; dashboard amministrativa sbloccata con pulsanti *"Esci"* e *"Vai a Sito Pubblico"*. |
| **Scenario 3** | Onboarding DB Vuoto | **PASS** | Creazione prima stagione `2026/2027`, configurazione squadra, salvataggio e pubblicazione ufficiale su PostgreSQL. |
| **Scenario 4** | Creazione Avversario e Bozza Partita | **PASS** | Creazione avversaria *"US Virtus"*, salvataggio partita come bozza; badge *"BOZZA (NON PUBBLICATA)"* visibile in tabella admin. |
| **Scenario 5** | Isolamento Bozza dal Sito Pubblico | **PASS** | `GET /api/v1/public/matches` restituisce array vuoto; la partita in bozza non appare nel sito pubblico. |
| **Scenario 6** | Pubblicazione Esplicita Partita | **PASS** | Click su *"Pubblica Partita"*; comparsa istantanea nel calendario pubblico (`vs US Virtus`). |
| **Scenario 7** | Viewport Mobile Responsive (390x844) | **PASS** | Navbar collassata in hamburger; apertura drawer navigazione e consultazione partite ottimizzata per smartphone. |

### Artefatti Screenshot Tracciati nel Repository (`tests/browser/screenshots/`)
Tutti gli 11 file di screenshot sono stati generati dall'esecuzione reale e inclusi nel commit:
- `00-backend-offline.png` (52.8 KB): alert di errore offline con messaggio esplicito.
- `01-desktop-empty-db-home.png` (57.0 KB): stato iniziale con DB vuoto (404 pubblico).
- `02-desktop-admin-authenticated.png` (96.8 KB): pannello admin sbloccato dopo login valido.
- `02a-auth-401-error-lost.png` (90.2 KB): evidenza del form di login dopo invio token 401 privo dell'alert di errore (`WEB-BUG-01`).
- `02b-auth-403-error-lost.png` (90.2 KB): evidenza del form di login dopo invio token 403 privo dell'alert di errore (`WEB-BUG-01`).
- `03-desktop-team-published.png` (113.2 KB): squadra configurata e badge verde *"Stato Sito: PUBBLICATO"*.
- `04-desktop-draft-match-admin.png` (93.8 KB): partita in bozza con badge arancione *"BOZZA (NON PUBBLICATA)"*.
- `05-desktop-public-draft-isolated.png` (37.2 KB): pagina pubblica partite vuota durante lo stato bozza.
- `06-desktop-published-match-public.png` (65.3 KB): comparsa della partita pubblicata nel sito pubblico.
- `07-mobile-drawer-open.png` (75.2 KB): drawer di navigazione mobile aperto su viewport smartphone.
- `08-mobile-public-matches.png` (55.3 KB): scheda partita visualizzata su viewport mobile.

---

## 5. Matrice Consolidata dei Test Monorepo (PASS / FAIL / NOT RUN)

### Riepilogo Generale sul Checkout Integrato MVP-I1
| Livello / Suite di Test | Ambito / Tecnologia | Test Totali | PASS | FAIL | SKIPPED / NOT RUN | Note |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| **Core API Unit** | Node test runner (`apps/api`) | 6 | 6 | 0 | 0 | Verifica configurazione e verifier token |
| **Core Base API** | Node test runner (`tests/api`) | 3 | 3 | 0 | 0 | Contratto `/health`, loopback binding, porte |
| **QA Contracts** | TypeBox Schema Validation | 4 | 4 | 0 | 0 | Validazione schemi contracts, isolamento pubblico |
| **QA Auth JWT** | Crittografia reale RS256 (`jose`) | 5 | 5 | 0 | 0 | Token firmati, scaduti, issuer errato, scope `platform:admin` |
| **QA Q1 Pipeline** | Scenari Q1-01 a Q1-09 (SQLite) | 57 | 56 | 0 | 1 | Test 5.4 SKIPPED in attesa di contratto date fuori stagione |
| **QA PostgreSQL Reale** | Integrazione (`tests/integration`) | 6 | 6 | 0 | 0 | Concorrenza advisory lock, rollback, check, lifecycle 12-step, immutabilità C1.2 |
| **Web Frontend (W1-R2.2)** | Vitest (`apps/web`) | 34 | 34 | 0 | 0 | Test unitari e mock API di Web W1-R2.2 |
| **Browser E2E Reale** | Playwright su Chromium reale | 10 | 8 | 2 | 0 | Scenari 0, 1, 2C, 3, 4, 5, 6, 7 PASS; Scenari 2A/2B FAIL (`WEB-BUG-01`) |
| **TOTALE MONOREPO (Sintetico + PG)** | Tutte le suite escluso browser | **115** | **114** | **0** | **1** | **100% PASS sui test eseguibili automatizzati** |

---

## 6. Verdetto Finale per Categoria di Verifica

### A. Test Automatici Sintetici: **PASS**
- **114 PASS / 1 SKIPPED / 0 FAIL**.
- Nessun errore di compilazione o type-check in tutto il monorepo.
- Suite Web W1-R2.2 accertata a 34 test (tutti superati).

### B. Integrazione PostgreSQL Reale: **PASS**
- Eseguita con successo contro istanza locale PostgreSQL 16 su porta 54329 con schema isolato `test_qa_*` e pulizia atomica.
- Verificati lock concorrenti, integrità transazionale, rollback privo di orfani e l'immutabilità delle partite completate (`CORE-BUG-01` risolto in C1.2).
- Il test a 12 passi certifica il flusso continuo: DB vuoto -> Stagione -> Squadra -> Pubblicazione -> Avversario -> Bozza -> Pubblicazione Partita -> Lettura pubblica.

### C. Browser E2E: **FAIL su Web W1-R2.2 (Rilevato `WEB-BUG-01`) / NOT RUN in Sandbox Ristretto**
- Su host autorizzato con Chromium reale, il test ha verificato con successo 8 scenari su 10 (onboarding DB vuoto, creazione stagione e squadra, pubblicazione, creazione bozza partita, isolamento pubblico, pubblicazione esplicita, navigazione mobile responsive).
- **Rilevato il difetto `WEB-BUG-01`**: negli scenari 2A e 2B, l'avviso UI di errore di autenticazione viene perso per lo smontaggio prematuro di `AdminLoginView`. Exit code reale: `1`.
- In ambiente sandbox privo di autorizzazione Chromium MachPort, la suite restituisce correttamente `EXIT_NOT_RUN` (exit code 2).

### D. Autenticazione OIDC Remota: **GATE SEPARATO (NOT RUN)**
- L'integrazione con il tenant remoto Logto OIDC di staging rimane un gate ambientale e infrastrutturale distinto, non eseguito in questo checkpoint locale per ragioni di sicurezza delle credenziali.
- Il branch Web W2-R1 con il supporto nativo OIDC PKCE è isolato e pronto per la successiva verifica dedicata.

### E. Idoneità al Merge su `main`: **NON IDONEO A MERGE AUTOMATICO**
- Il merge su `main` **non deve essere eseguito** in questo turno.
- Prerequisiti per la promozione:
  1. Correzione circoscritta di `WEB-BUG-01` da parte dell'agente Web in `AppContext.tsx` (rimozione dell'impostazione ottimistica `setIsAuthenticated(true)` prima del completamento della verifica).
  2. Riesecuzione del browser gate con esito 10/10 PASS (exit code 0).
  3. Completamento del gate di integrazione per Web W2-R1 (Logto OIDC PKCE).
