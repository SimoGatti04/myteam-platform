# Checkpoint Q1-R3.1 / Gate MVP-I1 — Rapporto Integrato di Verifica QA
**Data:** 28 Ottobre 2026  
**Agente Responsabile:** Agente QA persistente (`QA`)  
**Repository:** `myteam-platform` (`https://github.com/SimoGatti04/myteam-platform`)  

---

## 1. Commit e Branch sotto Verifica Integrata

| Componente | Branch Git | SHA Verificato | Note di Rilascio |
| :--- | :--- | :--- | :--- |
| **Core C1.2** | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` | Fix immutabilità calendario partite completate (`CORE-BUG-01`) |
| **Web W1-R2.2** | `web/w1-r2-integration` | `dd6f14796659313b7b200807ceac13225e09fa3e` | Onboarding DB vuoto, gestione stagioni admin, 34 test Web |
| **QA Suite Consolidata (Q1-R3)** | `qa/q1-suite-consolidation` | `144233c4771b9a1dafaf7474806b71fe461614eb` | Suite QA consolidata, test C1.1/C1.2, DB vuoto |
| **Branch Integrazione MVP-I1** | `qa/mvp-i1-integration` | *Verificato in worktree dedicato* | Combinazione di C1.2 + W1-R2.2 + QA Q1-R3 |

---

## 2. Matrice Sintetica dei Risultati di Verifica

| Ambito di Verifica | Suite / Strumento | Totale Test | Esito | Note e Dettaglio |
| :--- | :--- | :---: | :---: | :--- |
| **Monorepo Build** | `pnpm build` | 3 package | **PASS** | `@myteam/contracts`, `@myteam/api`, `@myteam/web` compilati. Bundle: 389.94 kB. |
| **Monorepo Typecheck** | `pnpm typecheck` | 3 package | **PASS** | 0 errori TypeScript su contratti, API, Web e test. |
| **Core Unit Tests** | Node test runner | 3 test | **PASS** | Token verifier Logto, validazione URL JWKS, requisiti scope `platform:admin`. |
| **Core Integration Flow** | Node test runner | 1 test | **PASS** | Migrazione PostgreSQL reale e flusso pubblico su schema dedicato. |
| **Web Suite Integrata** | Vitest (`apps/web`) | 34 test / 4 file | **PASS** | 34/34 PASS (api-client, navigation, theme, w1-r2-integration). |
| **QA Suite Consolidata** | Node test runner | 63 test / 12 file | **62 PASS / 1 SKIPPED** | Copertura requisiti Q1-R3.1 (inclusi 5 test PostgreSQL reali). |
| **Integrazione PostgreSQL Reale** | PostgreSQL 16 (porta 54329) | 5 test dedicati | **5 PASS / 0 FAIL** | Concorrenza advisory lock, rollback transazioni, vincoli nativi, regressione C1.2, ciclo onboarding 12 passi. |
| **HTTP Smoke Test Reale** | Fastify loopback + PG | 4 verifiche | **PASS** | `/health` (200), `/api/v1/public/team` (404), `/api/v1/admin/team` (401 unauth, 200 auth). |
| **Browser Live E2E Gate** | Playwright runtime | 1 gate | **NOT RUN / SKIPPED** | Sandbox vincolata (assenza display daemon / socket browser loopback). Audit statico bundle e layout PASS. |

---

## 3. Riclassificazione e Rigore delle Prove QA

In ottemperanza ai rilievi della revisione indipendente:
1. **Disinguimento Netto fra Pipeline Simulata ed E2E Reale:**  
   Il test `tests/integration/admin-postgres-public-web-e2e.test.ts` è stato rinominato in `tests/integration/admin-pipeline-in-memory-integration.test.ts` ed il titolo è stato allineato a:  
   *`API Integrated Pipeline (Fastify Inject + Memory DB): Admin writes -> Persistence -> Public API`*.  
   Non viene più impropriamente etichettato come "PostgreSQL + browser E2E".
2. **PostgreSQL Reale Esercitato Veramente:**  
   I test in `tests/integration/postgres-real-concurrency-and-rollback.test.ts` e il nuovo `tests/integration/postgres-real-onboarding-and-lifecycle.test.ts` si connettono a PostgreSQL 16 reale (`myteam_platform_test` su `127.0.0.1:54329`), creano schemi temporanei isolati (`test_qa_<uuid>`), applicano le migrazioni DDL ufficiali, testano `pg_advisory_xact_lock`, rollback transazionali, vincoli `CHECK`, e ripuliscono lo schema con `DROP SCHEMA ... CASCADE`.
3. **Eliminazione Percorsi Assoluti e Fallback Esterni:**  
   - Rimosso qualsiasi uso di `TARGET_API_DIR` e fallback a worktree fratelli da `tests/helpers/app-helper.ts` e `tests/q1/06-web-responsive-audit.test.ts`.  
   - Ogni test importa ed esercita rigorosamente i package del checkout locale integrato.
   - Rimosso ogni riferimento assoluto a filesystem locale (`/Users/...`).

---

## 4. Dettaglio Risultati per Singolo File della Suite QA (63 Test Totali)

Comando di esecuzione su checkout integrato:
```bash
TEST_DATABASE_URL="postgres://myteam:local-dev-only@127.0.0.1:54329/myteam_platform_test" \
node --import tsx/esm --test tests/q1/*.test.ts tests/integration/*.test.ts
```

| File di Test | Test Eseguiti | Esito | Natura della Verifica |
| :--- | :---: | :---: | :--- |
| `tests/integration/admin-pipeline-in-memory-integration.test.ts` | 1 | **1 PASS** | Pipeline API Fastify.inject con DB in memoria |
| `tests/integration/postgres-real-concurrency-and-rollback.test.ts` | 4 | **4 PASS** | **PostgreSQL 16 reale:** Concorrenza advisory lock, rollback transazionale, vincoli nativi, immutabilità C1.2 |
| `tests/integration/postgres-real-onboarding-and-lifecycle.test.ts` | 1 | **1 PASS** | **PostgreSQL 16 reale:** Flusso completo 12 passi (DB vuoto -> Stagione -> Team -> Partita bozza -> Pubblicazione -> Riavvio) |
| `tests/q1/01-team-setup.test.ts` | 9 | **9 PASS** | Setup squadra, validazione esadecimale, URL stemma, isolamento bozza, audit trail |
| `tests/q1/02-roster-management.test.ts` | 8 | **8 PASS** | Anagrafica giocatori UUID, numeri maglia (0-99), prevenzione sovrapposizioni rosa, chiusura tesseramento |
| `tests/q1/03-match-lifecycle.test.ts` | 8 | **8 PASS** | Creazione partita, isolamento bozza, rinvii, immutabilità C1.2 (`CORE-BUG-01`), dettaglio pubblico 3.7 vincolante |
| `tests/q1/04-access-and-isolation.test.ts` | 6 | **6 PASS** | Access control 401/403, isolamento contenuti bozza (404), data minimization (nessun leak campi admin) |
| `tests/q1/05-coherence-and-restart.test.ts` | 4 | **4 PASS** | Categorie competizioni, validazione errori, continuità riavvio servizio su dati persistiti |
| `tests/q1/06-web-responsive-audit.test.ts` | 3 | **2 PASS / 1 SKIPPED** | 6.1 e 6.2 PASS (Audit statico viewport, CSS tokens, PWA manifest, build bundle). 6.3 SKIPPED (Browser headless live) |
| `tests/q1/07-admin-reads-and-c1-1.test.ts` | 8 | **8 PASS** | 6 endpoint di lettura admin C1.1, autorizzazione 401/403, filtri `seasonId`/`playerId`, visibilità bozze |
| `tests/q1/08-web-w1-r2-integration-and-defects.test.ts` | 6 | **6 PASS** | Verifica correzione rilievi Web W1-R2 (feedback `loadData`, `matchesLoadError`, branding neutro, DEMO in prod, auth manuale, build prod) |
| `tests/q1/09-empty-db-onboarding-flow.test.ts` | 5 | **5 PASS** | DB vuoto (team null, seasons []), step 1 (crea stagione), step 2 (configura team), gestione errori date/duplicati (400/409), stato selezione locale vs server |

**Totale Suite QA:** **62 PASS**, **0 FAIL**, **1 SKIPPED** (ambientale: browser live).

---

## 5. Verifica Percorso di Onboarding Web W1-R2.2

La verifica indipendente ha controllato il percorso completo introdotto in W1-R2.2 (`dd6f147`):

1. **Database iniziale vuoto:**  
   `GET /api/v1/admin/team` risponde con `null`; `GET /api/v1/admin/seasons` risponde con `[]`. Tutte le rotte pubbliche (`/api/v1/public/team`, `/roster`, `/matches`) rispondono con HTTP 404 isolato (`public_team_not_found`).
2. **Accesso amministrativo autorizzato:**  
   In ambiente di test e sviluppo, l'accesso con token `platform:admin` permette l'accesso alle sezioni di gestione.
3. **Apertura Impostazioni & Banner DB Vuoto:**  
   La vista `AdminImpostazioniView` rileva `seasons.length === 0` e visualizza il banner informativo: *"Nessuna stagione registrata a sistema (Database Iniziale Vuoto)"* con CTA esplicita *"Crea la Prima Stagione"*.
4. **Creazione della prima stagione:**  
   Apertura modale (`isSeasonModalOpen`), validazione client date/denominazione, ed esecuzione di `POST /api/v1/admin/seasons` con `{ label: "2026/2027", startsOn: "2026-09-01", endsOn: "2027-06-30" }`. Risposta 201 con ID univoco.
5. **Selezione e distinzione locale vs salvata sul server:**  
   La stagione creata viene impostata come selezionata nel dropdown locale; la UI evidenzia lo stato *"Nuova stagione selezionata (non ancora salvata sul server)"*. Il server mantiene lo stato non associato finché non viene inviato `PUT /api/v1/admin/team`.
6. **Configurazione e pubblicazione squadra:**  
   Salvataggio impostazioni con `PUT /api/v1/admin/team` (stato salvato ma non pubblicato, `publishedAt: null`). Successiva pubblicazione esplicita via `POST /api/v1/admin/team/publish` (`publishedAt` valorizzato).
7. **Creazione avversaria:**  
   Registrazione in anagrafica Core via `POST /api/v1/admin/opponents` con ID stabile.
8. **Creazione partita come BOZZA:**  
   Creazione via `POST /api/v1/admin/matches` con `seasonId`, `opponentId`, `scheduledAt`. Risposta 201 con `publishedAt: null` e stato `scheduled`.
9. **Verifica isolamento bozza:**  
   `GET /api/v1/public/matches` non elenca la partita tra le gare programmate; `GET /api/v1/public/matches/:id` ritorna HTTP 404 `public_match_not_found`.
10. **Pubblicazione esplicita partita:**  
    Esecuzione di `POST /api/v1/admin/matches/:id/publish`. `AdminPartiteView` invoca `loadData(true)` preservando il messaggio di successo senza azzerarlo.
11. **Comparsa nel sito pubblico:**  
    `GET /api/v1/public/matches` include la partita nella lista `scheduled`; `GET /api/v1/public/matches/:id` restituisce HTTP 200 con DTO pubblico minimizzato.
12. **Riavvio backend e persistenza:**  
    Riavvio del servizio Fastify connesso allo stesso schema PostgreSQL: il team pubblico e il dettaglio partita risultano immediatamente disponibili e coerenti.

---

## 6. Verdetto per Categoria di Verifica

### A. Test Automatici Sintetici: **PASS**
I 57 test che utilizzano Fastify inject, contratti TypeScript TypeBox e database in memoria passano al 100% (0 fail). Compilazione e typecheck a zero errori.

### B. Integrazione PostgreSQL Reale: **PASS**
Tutti i 5 test dedicati eseguiti contro il container PostgreSQL 16 locale (`127.0.0.1:54329`) passano con successo. Concorrenza con lock consultivi, rollback transazionali su violazioni di vincolo, vincoli CHECK nativi, regressione `CORE-BUG-01` e ciclo onboarding/riavvio a 12 passi pienamente verificati.

### C. Browser E2E Effettivo: **NOT RUN (Ambiente)** / **PASS (Statico & Build)**
L'esecuzione live interattiva in finestra browser/Playwright è bloccata nell'ambiente sandbox (`EPERM` su socket browser / display daemon). L'audit statico dell'architettura responsive (viewport meta, CSS tokens, PWA manifest, build chunk integrity) passa regolarmente. Il gate browser live deve essere formalmente eseguito in ambiente di staging con interfaccia grafica prima della promozione in produzione.

### D. Autenticazione OIDC Reale: **NOT RUN (Separato)** / **PASS (Crittografico Locale)**
La verifica crittografica locale con chiavi RS256, firma JWT e endpoint JWKS simulato passa con successo. La federazione OIDC verso il tenant remoto Logto in cloud costituisce un gate di staging/deploy separato e non deve utilizzare credenziali di produzione nei test.

### E. Idoneità al Merge su `main`: **NON IDONEO A MERGE AUTOMATICO**
In conformità a dev-env e AGENTS.md:
- I branch di lavoro rimangono separati (`codex/core-persistent-flow`, `web/w1-r2-integration`, `qa/q1-suite-consolidation`).
- Nessun merge automatico deve essere eseguito su `main` da QA.
- La promozione richiede il completamento del gate browser live e della configurazione OIDC in ambiente idoneo.
