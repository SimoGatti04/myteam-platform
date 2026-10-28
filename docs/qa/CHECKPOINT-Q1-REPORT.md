# Checkpoint Q1-R3 / Gate MVP-I1 — Rapporto Integrato di Verifica QA
**Data:** 2026-10-28  
**Agente Responsabile:** Agente QA persistente (`QA`)  
**Repository:** `myteam-platform` (`https://github.com/SimoGatti04/myteam-platform`)  
**Commit e Branch sotto Verifica:**
- **Core C1.2:** Commit `1ab71792929bef1009e3ecab57adf3d333d58ceb` (Branch `origin/codex/core-persistent-flow`)
- **Web W1-R2.1:** Commit `3683ed972e019a7d6ce65b8d7b7680e833a463e1` (Branch `origin/web/w1-r2-integration`)
- **Web W1-R2 (precedente):** Commit `6559bce1c4d1e3d413a6a3a640da8d809e9b6bd3`
- **QA Suite Consolidata (Q1-R2):** Commit `e55a65a50a698a6cfc335cecdc7009517722c941` (Branch `origin/qa/q1-suite-consolidation`)
- **Worktree d'Integrazione MVP-I1:** `/Users/gatti/Workspace/myteam-platform-mvp-i1` (Branch `qa/mvp-i1-integration`)

---

## 1. Sintesi Esiti Gate MVP-I1

| Livello di Verifica | Totale Test | Esito | Dettaglio / Note |
| :--- | :---: | :---: | :--- |
| **Workspace Build (`pnpm build`)** | 3 package | **PASS** | `@myteam/contracts`, `@myteam/api`, `@myteam/web` compilati con successo. |
| **Workspace Typecheck (`pnpm typecheck`)** | 3 package | **PASS** | 0 errori TypeScript in tutto il monorepo. |
| **Suite Unitaria/Integrazione Web (Vitest)** | 29 test / 4 file | **PASS** | 29 PASS in 124ms (api-client, navigation, theme, w1-r2-integration). |
| **Suite QA Consolidata (Node test runner)** | 60 test / 10 file | **55 PASS / 5 SKIPPED** | Copertura completa Q1 (Setup, Rosa, Partite, Isolamento, Errori, Responsive statico, Admin Reads C1.1, Rilievi Web W1-R2.1, Onboarding DB vuoto). |
| **Regressione CORE-BUG-01 (Immutabilità Partite)** | 2 test | **PASS** | Riproduzione fallita su C1.1 (HTTP 200), protetta su C1.2 (HTTP 400 `completed_match_schedule_is_immutable`). |
| **PostgreSQL 16 reale (Loopback)** | 4 test | **NOT RUN / SKIPPED** | Socket loopback EPERM nel profilo sandbox gestito. Suite pronta ed eseguita con successo su host esterno. |
| **Browser E2E Live (Headless/Mobile/Desktop)** | 1 test | **NOT RUN / SKIPPED** | Assenza display daemon / socket browser in sandbox. Non certificato come PASS. |
| **Autenticazione Logto OIDC di Produzione** | Separato | **NOT RUN** | Verifica crittografica locale PASS; provider remoto OIDC non configurato in produzione. |

---

## 2. Verifica Dettagliata Obiettivi Q1-R3

### 2.1 Dettaglio Partita Core C1.1 (`GET /api/v1/public/matches/:id`)
- **Test vincolante eseguito:** `tests/q1/03-match-lifecycle.test.ts` (Test 3.7).
- **Esito:** **PASS** (eliminato categoricamente qualsiasi fallback che accettasse `route_not_found`).
- **Comportamento verificato:**
  1. Partita pubblicata (`published_at IS NOT NULL`): restituisce HTTP 200 con DTO completo (`id`, `seasonId`, `opponentName`, `competitionName`, `isOfficial`, `scheduledAt`, `status`).
  2. Partita non pubblicata (bozza): restituisce HTTP 404 con `{ "error": "public_match_not_found" }`.
  3. Partita inesistente: restituisce HTTP 404 con `{ "error": "public_match_not_found" }`.
  4. **Data Minimization:** Nessuna fuga di informazioni amministrative (`publishedAt`, `createdAt`, `updatedAt`, `opponentId`, `competitionId` non sono presenti nell'oggetto JSON restituito).

---

### 2.2 Immutabilità Partite Completate (Regressione CORE-BUG-01)
- **Difetto originale (`3c99e4e` Core C1.1):**
  Un match in stato `completed` accettava richieste `PATCH /api/v1/admin/matches/:id/schedule` con `status: "postponed"`, alterando la data e generando un evento spurio di riprogrammazione (risposta HTTP 200).
- **Riproduzione del difetto:**
  Eseguita contro l'app C1.1: confermata ricezione di HTTP 200 e alterazione dei dati a DB.
- **Verifica della correzione in Core C1.2 (`1ab7179`):**
  In `apps/api/src/platform/service.ts`:
  ```ts
  if (current.status === "completed") {
    throw new DomainError(400, "completed_match_schedule_is_immutable");
  }
  ```
  La richiesta `PATCH /schedule` su una partita terminata viene respinta con **HTTP 400 `completed_match_schedule_is_immutable`**.
  - Lo stato rimane invariato (`completed`).
  - La data programmata originaria rimane intatta.
  - Nessun record viene aggiunto a `match_reschedule_events` / `match_schedule_history`.
  - Nessun evento viene registrato in `platform_audit_log` / `audit_events`.
- **Esito:** **PASS** (Test 3.5 in `tests/q1/03-match-lifecycle.test.ts` e test di regressione in `tests/integration/`).

---

### 2.3 Letture Amministrative C1.1 (6 Endpoint Admin)
- **Test vincolante eseguito:** `tests/q1/07-admin-reads-and-c1-1.test.ts` (8 test dedicati).
- **Esito:** **PASS**.
- **Comportamento verificato:**
  1. **Controllo Accessi:** Tutte le 7 rotte admin (`/team`, `/seasons`, `/players`, `/roster-memberships`, `/opponents`, `/competitions`, `/matches`) restituiscono HTTP 401 `authentication_required` se prive di Bearer token, e HTTP 403 `insufficient_permissions` se fornite di token privo dello scope `platform:admin`.
  2. `GET /admin/team`: Restituisce il DTO completo di configurazione della squadra (`name`, `crestUrl`, `primaryColor`, `secondaryColor`, `currentSeasonId`, `publishedAt`).
  3. `GET /admin/seasons`: Restituisce l'array ordinato per `starts_on DESC`.
  4. `GET /admin/players`: Restituisce l'array ordinato per nome giocatore.
  5. `GET /admin/roster-memberships`: Supporta correttamente i parametri di query `seasonId` e `playerId` (con validazione del formato UUID, errore 400 se malformato).
  6. `GET /admin/opponents` e `GET /admin/competitions`: Restituiscono i cataloghi ordinati.
  7. `GET /admin/matches`: **Include esplicitamente le bozze** (`publishedAt: null`) oltre alle partite pubblicate. Supporta il filtro `seasonId`. Non supporta filtri `status` non documentati.

---

### 2.4 Verifica Rilievi Web W1-R2 vs W1-R2.1

La verifica ha confrontato il commit `6559bce` (W1-R2) con il nuovo commit `3683ed9` (W1-R2.1) pubblicato da Web:

| Rilievo Segnalato | Stato in W1-R2 (`6559bce`) | Risoluzione in W1-R2.1 (`3683ed9`) | Esito QA |
| :--- | :--- | :--- | :---: |
| **1. `loadData()` cancella `statusMsg`** | `loadData()` azzerava incondizionatamente `setStatusMsg(null)`, cancellando il messaggio di successo appena dopo la pubblicazione. | `loadData(preserveStatus = true)` preserva il feedback visivo di successo dell'operazione. | **PASS** (Test 8.1) |
| **2. Errore lettura admin mostrato come lista vuota** | `getAdminMatches` in caso di errore eseguiva un fallback silenzioso a `setMatches([])`. | Aggiunto `matchesLoadError` con banner visivo rosso di avviso errore API. | **PASS** (Test 8.2) |
| **3. Fallback pubblico hardcoded "MAPI GROUP"** | HomeView e Navbar mostravano `'MAPI GROUP'` come default se la squadra non era configurata. | Creata utility `branding.ts` con `getTeamDisplayName()`: in modalità reale usa `'La Mia Squadra'`, limitando `'MAPI GROUP'` alla sola DEMO. | **PASS** (Test 8.3) |
| **4. `VITE_ENABLE_DEMO` in build di produzione** | `isDemoAllowed()` poteva essere attivato da variabile anche in ambiente di produzione. | `getAppEnvironment()` e `isDemoAllowed()` bloccano categoricamente DEMO se `getAppEnvironment() === 'production'`. | **PASS** (Test 8.4) |
| **5. Form JWT manuale vs OIDC reale** | Form di login accettava token arbitrari senza avviso visivo. | Aggiunto alert giallo di test/bypass; disabilitato in produzione salvo esplicito `VITE_ALLOW_MANUAL_AUTH`. | **PASS** (Test 8.5) |

---

### 2.5 Percorso di Onboarding su Database Vuoto (Web W1-R2.2 Gap)
- **Rilievo Supervisor:** La UI frontend non offriva una procedura guidata di creazione della prima stagione in presenza di database completamente pulito (`seasons: []`, `team: null`).
- **Verifica API & Contratti:** `tests/q1/09-empty-db-onboarding-flow.test.ts` (3 test) ha verificato il ciclo di onboarding completo a livello backend e contratti:
  1. Su DB vuoto: `team` è `null`, `seasons` è `[]`, `public/*` risponde 404 isolato.
  2. Creazione della prima stagione via `POST /api/v1/admin/seasons` -> 201 Created.
  3. Configurazione squadra con `currentSeasonId` e successiva pubblicazione via `POST /api/v1/admin/team/publish` -> 200 OK.
  4. Immediata disponibilità delle rotte pubbliche senza errori 500.
- **Stato Web:** Web ha preparato in `AdminImpostazioniView.tsx` il banner e la modale per database vuoto (pronto per W1-R2.2). **PASS sui contratti, monitorato per W1-R2.2.**

---

## 3. Riepilogo Test Suite QA Eseguita

Comando di esecuzione:
```bash
TARGET_API_DIR="/Users/gatti/Workspace/myteam-platform-mvp-i1/apps/api" \
node --import tsx/esm --test tests/q1/*.test.ts tests/integration/*.test.ts
```

- **Totale Test:** 60 test
- **PASS:** 55 test
- **SKIPPED (Gate Ambientali Non Eseguiti):** 5 test
  - 1x Browser headless E2E responsive (mancanza socket / display loopback nel sandbox)
  - 4x Connessioni dirette TCP PostgreSQL su porta loopback 54329 (blocco socket EPERM)

Nessun test ha fallito. I gate ambientali restano tracciati come **NOT RUN**, in conformità alle direttive QA.

---

## 4. Stato Git, Worktree e Cleanup

- **Branch QA Consolidato:** `qa/q1-suite-consolidation`
  - Base commit: `e55a65a50a698a6cfc335cecdc7009517722c941`
  - Commit integrato: include `tests/` aggiornati e `docs/qa/CHECKPOINT-Q1-REPORT.md`.
- **Branch d'Integrazione:** `qa/mvp-i1-integration` (worktree `/Users/gatti/Workspace/myteam-platform-mvp-i1`)
  - Contiene il merge senza conflitti di Core C1.2 (`1ab7179`), Web W1-R2.1 (`3683ed9`) e QA Q1-R2 (`e55a65a`).
  - Nessun merge è stato eseguito su `main`.
- **Ownership Rispettata:** Nessuna modifica a codice applicativo `apps/api/` o `apps/web/` è stata committata da QA.
