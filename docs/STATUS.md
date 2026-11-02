# Stato — myteam-platform

## Web — W3: MVP Functional Advancement (1 novembre 2026)

- **Branch / Worktree:** `web/w3-mvp-functional` (originato da `codex/integration-i3-candidate` @ `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`).
- **Obiettivo raggiunto:** Avanzamento funzionale completo del sito pubblico, della PWA e dell'amministrazione sulle API Core C1.1/C1.2 esistenti, senza persistenze fittizie o alterazioni di contratti.
- **Interventi completati:**
  1. **Branding e Dynamic Theming (Mode A approvata):**
     - Scelta cromatica libera con validazione HEX rigorosa `#RRGGBB`.
     - Calcolo armoniato di contrasti e token derivati (`surface`, `border`, `textOnPrimary`) e anteprima componenti live.
     - Interfaccia di fine-tuning dei singoli token derivati con ripristino valori armonici predefiniti.
     - Checklist/wizard passo-passo guidato in Panoramica e Impostazioni.
  2. **Completamento UX Amministrativa:**
     - Aggiunta gestione **Competizioni** (`GET/POST /api/v1/admin/competitions`) in Partite.
     - Aggiunta modifica e rinvio programmazione gara (`PATCH /api/v1/admin/matches/:id/schedule`) con finestra modal dedicata per data/ora, stato gara (`scheduled`, `to_be_scheduled`, `postponed`, `cancelled`, `completed`) e motivazione.
     - Gestione tabelle touch/mobile friendly con container `.table-responsive`.
  3. **PWA Completa & Installabilità:**
     - Web App Manifest conforme (`apps/web/public/manifest.json`) con icone maskable, `id`, `scope` e modalità standalone.
     - Service Worker (`apps/web/public/sw.js`) per cache shell e gestione offline (esclusione esplicita di chiamate `/api/`).
     - Banner e supporto all'evento nativo d'installazione in Home e AppContext.
  4. **Stati applicativi e robustezza:**
     - Gestione accurata di stati vuoti, caricamento, errori HTTP e dati parziali sia in modalità DEMO che REALE (Logto OIDC / Bearer JWT).
  5. **Test & Build:**
     - 10 test suite su `@myteam/web` tutte superate (120 test passati, 0 errori).
     - Build Vite/TypeScript superata senza errori di compilazione o typecheck.
- **Dipendenze Core aperte:**
  - Nessuna persistenza locale fittizia introdotta per tabellini o eventi live: si attende il contratto C2 per le API di referto/marcatori.


**Aggiornato:** 31 ottobre 2026. **Checkpoint:** Candidato I1 (`f638217`) pubblicato su `origin/codex/integration-i0-candidate`. Candidato I2 (`162cd2c`) pubblicato su `origin/codex/integration-i2-candidate`. Candidato I3 incorpora Security Q3-R1 (`0fb810c`) su `codex/integration-i3-candidate`. Nessun merge su `main`.

## Integrations — CSI-S1 (31 ottobre 2026)

- Rapporto tecnico: `docs/spikes/csi-s1-feasibility.md`, branch autonomo `research/integrations-csi-s1` (base candidato I1 `f6382175b2fa9488994d3dfbb460d995ede97e5c`; rapporto al commit `d6031b4feea7d85610d700792cfb79262e9ae774`).
- Esito: PDF manuale documentato; API pubblica e licenza di riuso automatizzato non dimostrate. Gli estratti pubblici mostrano calendario/classifica e distinzione ufficiosa/omologata, ma l'accesso automatico a Live è stato bloccato da robots nel servizio di consultazione; nessun bypass o scraping eseguito.
- Nessun adapter, codice applicativo o schema dati modificato. L'inserimento e l'override admin restano il fallback e l'import CSI non blocca il primo deployment.
- **Prossimo gate:** localizzare la squadra MAPI nel comitato/competizione/girone corretti e ottenere dal CSI autorizzazione scritta o un export/API supportato, con ID, stato di omologazione e frequenza/condizioni d'uso verificabili.
- **Evoluzione progettuale post CSI-S1:** a seguito delle conclusioni della ricerca CSI-S1, l'utente ha approvato lo scraping CSI configurabile dall'area Admin come soluzione progettuale, soggetta alla verifica concreta di accessibilità e condizioni d'uso. Lo sviluppo del prototipo è demandato al checkpoint separato CSI-S2, workstream indipendente non incluso in I2.

## Baseline C0

- Repository locale distinta: `/Users/gatti/Workspace/myteam-platform`.
- Remote: `git@github.com:SimoGatti04/myteam-platform.git`.
- Commit C0 su `main`: `66b49875acbf7d520029730702a03f3abc66bb8c`.
- Il preflight del 28 ottobre 2026 ha verificato il repository GitHub vuoto prima del primo push; il repository ora contiene la baseline C0.
- Workspace pnpm/TypeScript, Node.js `26.5.0`, pnpm `10.32.1`, API Fastify e contratti TypeBox. `GET /health` è liveness, non readiness PostgreSQL.
- Le specifiche approvate sono copiate in `docs/platform/`; gli snapshot ADR iOS pertinenti sono in `docs/decisions/ios/`. Le fonti iOS originali restano nella repository AURINFORMATC.

## Slice persistente Core

La persistenza applicativa è PostgreSQL 16, scelta durevole per il flusso condiviso (ADR-0002), non un database provvisorio da sostituire per l'integrazione iOS. Il branch dedicato aggiunge:

- schema SQL iniziale e runner di migrazione con checksum, applicazione esplicita e rifiuto di migrazioni già applicate ma modificate;
- servizi di dominio transazionali e audit per configurazione squadra/stagioni, giocatori, appartenenze stagionali, avversarie, competizioni e partite;
- controllo delle sovrapposizioni dei periodi di rosa, chiusura delle appartenenze e storico delle modifiche di calendario;
- pubblicazione esplicita di squadra e partite, con letture pubbliche limitate a proiezioni versionate e DTO condivisi;
- protezione delle rotte admin con verifica JWT/JWKS, issuer, audience, scadenza e scope. `platform:admin` è solo lo scope proposto: va associato alla permission reale nell'istanza Logto prima dell'uso operativo.

Le rotte, i payload e la semantica preliminare sono elencati in [docs/API.md](API.md). I contratti sono utilizzabili da Web/QA come base d'integrazione, ma non sono definitivi: coordinare eventuali modifiche ai DTO prima del loro congelamento.

## Verifiche dello slice C1 precedente — 28 ottobre 2026 (storico)

- **PASS** `pnpm check`: build dei package, type-check API/contratti/test e 6 test unitari (3 API + 3 C0), tutti superati.
- **PASS** `pnpm test:integration`: 1 test PostgreSQL superato su `TEST_DATABASE_URL` locale con suffisso `_test`; il test crea uno schema casuale isolato, applica e riapplica la migrazione e rimuove lo schema in `finally`.
- **PASS** smoke HTTP tramite il comando documentato `pnpm dev`: `GET /health` → 200 con contratto v1; `PUT /api/v1/admin/team` senza token → 503 `admin_auth_not_configured`, senza scrittura.
- **PASS** test Logto: issuer/JWKS HTTP non accettati; configurazione HTTPS pulita accettata. Il test era disallineato dal messaggio aggiornato del validatore; l'asserzione ora verifica la regola HTTPS prevista, confermata anche in `docs/OPERATIONS.md`.
- **PASS** controllo `git diff --check` e link Markdown locali (33 file, nessun target locale mancante).
- **NOT RUN** CI GitHub Actions, verifica con una configurazione Logto reale, readiness/backup/restore di produzione e deploy/K3s.

Il test JWT locale usa un JWKS effimero su loopback; è passato quando eseguito con i permessi runtime necessari. Il fallimento precedente del listener era un `EPERM` del sandbox, non un difetto del server.

## C1.1 — letture amministrative e dettaglio partita

**Stato:** implementato sul branch dedicato `codex/core-persistent-flow`, a partire da `c53db86f12ba1085fb2321d57422ff74158c8d28`; non integrato automaticamente in `main`. Contratti e policy API restano preliminari.

- Letture admin protette per stagioni, identità giocatore, appartenenze stagionali, avversarie, competizioni e partite. Le partite admin includono bozze e record non pubblicati; i filtri supportati sono `seasonId` per partite e `seasonId`/`playerId` per appartenenze. Le liste non sono paginate.
- Nuovo `GET /api/v1/public/matches/{id}`: restituisce esclusivamente il `PublicMatchDto` esistente; una partita non pubblicata/non presente restituisce 404 (e una squadra non pubblicata mantiene il 404 `public_team_not_found`). Non sono esposti risultati o eventi non disponibili.
- Intervalli di appartenenza inclusivi, entro i limiti inclusivi della stagione. Lo storico e i rientri sono ammessi se i periodi non si sovrappongono; un giorno di confine è condiviso e quindi non può appartenere a due intervalli. La data di una partita fuori stagione non è rifiutata: rinvii e competizioni protratte restano possibili. Questa è una policy tecnica provvisoria, non una decisione di prodotto; eventuali avvisi o controlli successivi richiedono coordinamento.
- Le sole modifiche amministrative restano chiusura appartenenza e aggiornamento calendario/stato partita, oltre alle scritture già esistenti. Non sono state aggiunte modifiche/eliminazioni generiche o correzioni dei legami partita.
- `docs/API.md` documenta tutte le rotte, query, DTO, privacy, semantica dei 404, non-paginazione e limiti. I DTO TypeBox in `packages/contracts/src/platform.ts` sono dichiarati preliminari.

### Verifiche C1.1 — 28 ottobre 2026

- **PASS** `pnpm check`: build dei package, type-check API/contratti/test e test unitari (3 test API + 3 test condivisi, 6 totali). Include il test del listener JWKS locale su loopback e i test della configurazione Logto.
- **NOT RUN — prerequisito assente** `pnpm test:integration`: il comando è stato avviato ma si è fermato prima di connettersi a PostgreSQL perché `.env` e `TEST_DATABASE_URL` non sono presenti. La suite d'integrazione PostgreSQL resta da eseguire; nessun container o database è stato avviato o modificato.
- **NOT RUN — prerequisito assente** smoke test HTTP dell'API: `.env`/`DATABASE_URL` non sono presenti e `apps/api/src/index.ts` rifiuta l'avvio senza `DATABASE_URL`. Non si dichiara verificata l'API via rete in questo checkpoint.
- **PASS** analisi dei due precedenti errori: il test che avvia un listener JWKS locale è passato con i permessi runtime autorizzati, quindi il precedente `EPERM` era una limitazione del sandbox e non un difetto applicativo. Il test Logto conferma invece la policy desiderata: issuer e URL JWKS devono essere HTTPS puliti; URL HTTP sono rifiutati, HTTPS è accettato. In C1.1 non sono stati cambiati né validatore né asserzioni Logto per ottenere un PASS.
- **PASS** `git diff --check` sul diff finale C1.1.

Web e QA sono stati informati delle rotte additive, della proiezione pubblica limitata e del comportamento sulle date; riceveranno lo SHA del commit pubblicato per l'integrazione dai propri branch/worktree.

## C1.2 — immutabilità delle partite completate e integrazione

**Stato:** implementato sul branch dedicato `codex/core-persistent-flow`, a partire da `3c99e4ec785c1cea1cbe8bb8e1070c278b770740`; nessun merge automatico su `main`. Non sono cambiati percorsi, DTO o schemi condivisi rispetto a C1.1.

- `PATCH /api/v1/admin/matches/{id}/schedule` ora rifiuta con `400 completed_match_schedule_is_immutable` ogni tentativo di aggiornamento se il record persistito è già `completed`, oltre a continuare a rifiutare la transizione verso `completed`. Il flusso dei risultati non è implementato.
- La regressione d'integrazione semina in PostgreSQL una partita completata, tenta di modificarne insieme data e stato e verifica errore, immutabilità di data/stato e nessuna nuova riga nello storico. È una prova reale quando eseguita con `TEST_DATABASE_URL`, non sostituibile da un mock.
- Le letture admin C1.1 sono state verificate in `docs/API.md`: stagioni, giocatori, appartenenze, avversarie, competizioni e partite (comprese bozze/non pubblicate) restano protette e non hanno cambi incompatibili in C1.2. I DTO TypeBox restano preliminari.
- Compatibilità Web: il worktree W1 usa `GET /api/v1/admin/team` e le scritture del flusso, ma il client `apps/web/src/services/api.ts` non espone ancora metodi per le letture admin di collezione. Backend e documentazione sono pronti a integrarle; il caricamento/listing di tali collezioni dal pannello resta da collegare lato Web.
- `docs/TESTING.md` documenta `pnpm --filter @myteam/api dev` e la prova manuale admin → PostgreSQL → pubblicazione → API pubblica → browser, con prerequisiti Logto e database locale espliciti.

### Verifiche C1.2 — 28 ottobre 2026

- **PASS** `pnpm check`: build dei package, type-check API/contratti/test e 6 test automatici (3 unitari API e 3 test API condivisi).
- **PASS** `git diff --check` sui file modificati.
- **NOT RUN — prerequisito assente** `pnpm test:integration`: nel worktree non esiste `.env`, `TEST_DATABASE_URL` e `DATABASE_URL` non sono definite nell'ambiente. Non è stato avviato né modificato alcun database o container; l'accesso al socket Docker è stato negato e non è stato ritentato.
- **NOT RUN — prerequisiti assenti** smoke HTTP ed E2E browser: mancano la configurazione autorizzata del database locale e le credenziali/configurazioni Logto di sviluppo. Nessuna configurazione Logto reale è stata cambiata.

## Ownership e risorse locali

- Core: `apps/api/`, `packages/contracts/` e configurazione/architettura condivise.
- Web: `apps/web/`; QA: `tests/`; Integrations: `packages/integrations/`. Nessun file di proprietà di questi altri moduli è stato modificato.
- `pnpm dev` e lo smoke HTTP sono terminati. Il container Compose `myteam-platform-postgres-1` (`postgres:16-alpine`) era già presente e healthy; non è stato avviato, arrestato o riconfigurato. Il volume persistente è stato lasciato intatto.
- `.env` locale resta ignorato da Git. Non committare credenziali o segreti.

## Non incluso / prossimo coordinamento

Frontend/PWA, flussi OIDC browser, sincronizzazione iOS, SSE/LIVE completo, provider o scraping CSI, risultati/statistiche, votazioni, contenuti, CI, deployment e mutazioni K3s restano fuori da questo checkpoint. Il passo d'integrazione è condividere i contratti preliminari con Web e QA e poi definire gli adapter/provider senza cambiare la gerarchia delle fonti di ADR-0008.

## QA Release Gate Q3 — revisione candidato integrato

Al 31/10/2026, il candidato `codex/integration-i0-candidate` @ `f6382175b2fa9488994d3dfbb460d995ede97e5c` ha superato i gate locali build/typecheck, suite automatica, PostgreSQL reale e browser E2E con verificatore admin sostitutivo. QA ha emesso **NO-GO per merge/release** finché restano aperti i finding di validazione/configurazione OIDC e finché il gate CI remoto non esiste; Logto staging e deployment sono **NOT RUN**. Il flusso admin→PostgreSQL→API pubblica→Web è verificato nel perimetro di test, non equivale a production-ready. Vedere [rapporto Q3](qa/CHECKPOINT-Q3-REPORT.md). Prossimo gate: remediation Web dei finding Q3-AUTH-01/02, definizione dei controlli CI e verifica Logto/deploy su staging autorizzato.

## CI Baseline (CI-C1)

- Branch: `ci/c1-release-gates` basato su `f6382175b2fa9488994d3dfbb460d995ede97e5c`.
- Workflow GitHub Actions: `.github/workflows/ci.yml`.
- Runner: `ubuntu-latest` (standard Linux, costi e risorse controllate).
- Servizio: PostgreSQL 16 (`postgres:16-alpine`) effimero su porta 54329 con database di test `myteam_platform_test`.
- Gate automatizzati:
  1. Integrità lockfile: `git diff --exit-code pnpm-lock.yaml` con pnpm frozen lockfile.
  2. Root Build, Typecheck e Test: `pnpm check` (compilazione contratti, API, web e unit test).
  3. Web Vitest Suite: `pnpm --filter @myteam/web test` (96 test di componenti e store).
  4. QA Vitest Suite: `pnpm --filter @myteam/web exec vitest run --config ../../tests/vitest.qa.config.ts` (28 test di sicurezza OIDC, logout e isolamento).
  5. QA Node Suite: `pnpm exec tsx --test tests/api/*.test.ts tests/contracts/*.test.ts tests/auth/*.test.ts tests/q1/*.test.ts tests/integration/admin-pipeline-in-memory-integration.test.ts` (33 test di scenari, JWT e contratti).
  6. PostgreSQL Integration: `pnpm test:integration` e `pnpm exec tsx --test tests/integration/postgres-real-concurrency-and-rollback.test.ts tests/integration/postgres-real-onboarding-and-lifecycle.test.ts` (7 test reali con schema isolato temporaneo e rollback).
- Sicurezza: `permissions: contents: read`, zero segreti produttivi, zero deploy, solo pull_request/push standard.
- Esito primo run remoto: **SUCCESS** (Run #1, ID 41206638980 su GitHub Actions, branch `ci/c1-release-gates`).
- Limiti attuali della CI remota: Playwright Browser E2E e suite iOS non sono coperti dalla CI remota per ragioni di footprint/dipendenze; restano coperti da gate ed evidenze locali dedicate.

## Consolidamento candidato I2 e stato dei gate (31 ottobre 2026)

- **Branch candidato:** `codex/integration-i2-candidate` (worktree `integration-i2`).
- **Base:** Candidato I1 (`f6382175b2fa9488994d3dfbb460d995ede97e5c`), integrato, testato e pubblicato su `origin/codex/integration-i0-candidate`.
- **Revisioni consolidate in I2:**
  - CI-C1 (`996d08d5f4f78097edca850a556f97e87587ce3f`): baseline GitHub Actions `.github/workflows/ci.yml`.
  - QA Q3 (`e192451d55392c71e9780a8652e024747321c29a`): release gate review e pacchetto evidenze E2E/PostgreSQL.
  - CSI-S1 (`d19915e96d90c92a7dabac680c9b466149ce28ea`): studio di fattibilità integrazioni CSI.
- **Stato gate e verdict QA:**
  - QA Q3 ha emesso **NO-GO per merge/release** sul candidato I1 per via dei finding aperti di configurazione e validazione OIDC (`Q3-AUTH-01` e `Q3-AUTH-02`).
  - I finding `Q3-AUTH-01` e `Q3-AUTH-02` restano **APERTI** fino alla verifica formale e indipendente della remediation in corso nel ramo `security/q3-oidc-hardening` (non incorporato in I2).
  - La CI remota GitHub Actions è ora attiva e ha superato il primo run; Browser E2E e iOS rimangono gestiti via test harness locali.
- **Stato integrazioni CSI:**
  - CSI-S1 è concluso come pura ricerca (nessun adapter o modifica a schema/codice).
  - L'utente ha successivamente approvato lo scraping configurabile da Admin; il prototipo è assegnato al checkpoint **CSI-S2** (workstream indipendente da I2).
- **Nessun merge su main, nessun deploy e nessuna alterazione di I1.**

## Consolidamento candidato I3 e Security Q3-R1 (31 ottobre 2026)

- **Branch candidato:** `codex/integration-i3-candidate` (worktree `integration-i3`).
- **Base:** Candidato I2 (`162cd2c2e61d0fc58a9ffba1ab8d2e0713f908b1`), che include CI-C1, QA Q3 e CSI-S1.
- **Revisione Security incorporata:** `security/q3-oidc-hardening` (`0fb810cfabdce07b0ca3ae8a4ade95c2edfeb278`).
- **Stato CI e Remediation:**
  - **CI-C1:** Pipeline GitHub Actions pienamente integrata e verificata con esito SUCCESS sui run remoti di baseline e candidato I2.
  - **Security Q3-R1:** Incorporata con successo nel candidato I3 con modifiche strettamente confinate al modulo Web (`apps/web/src/services/oidc.ts`, test correlati).
  - **Remediation Q3-AUTH-01 / Q3-AUTH-02 implementata:**
    - Confronto esatto di issuer/discovery/ID token senza normalizzazioni permissive o rimozione slash.
    - Validazione restrittiva dell'audience con client ID obbligatorio, supporto per audience multiple tramite `VITE_LOGTO_TRUSTED_AUDIENCES` e controllo mandatorio di corrispondenza `azp` (OpenID Connect Core 1.0 §3.1.3.7).
    - `VITE_LOGTO_TRUSTED_AUDIENCES`: opzionale, valore predefinito restrittivo (vuoto/assente). Se assente, qualsiasi audience aggiuntiva rispetto a `appId` comporta il rigetto immediato. Non configurare audience aggiuntive senza necessità formale verificata.
    - Protocollo HTTPS tassativo su issuer ed endpoint OIDC (`authorization_endpoint`, `token_endpoint`, `end_session_endpoint`).
    - Esclusione categorica di credenziali utente e frammenti (`#`) negli URL; parametri query proibiti per l'issuer e consentiti solo ove previsto dalle specifiche per gli endpoint.
    - Configurazione `redirect: 'error'` su fetch di discovery e token exchange per prevenire redirect hijacking.
  - **Stato dei Gate e Verdict QA:**
    - I finding di sicurezza Q3-AUTH-01 e Q3-AUTH-02 dispongono di una remediation implementata e coperta da test unitari/integrazione approfonditi (111 test Web Vitest totali, di cui 37 test dedicati OIDC security e regressioni).
    - **La chiusura formale e indipendente dei finding è ancora PENDENTE** in attesa della revisione e validazione autonoma di QA (prevista nel checkpoint Q4).
    - **Logto staging reale e deployment rimangono NOT RUN**: nessun test sintetico o su mock è presentato come prova di login reale con l'Identity Provider remoto.

## Core — Readiness Endpoint R1 (31 ottobre 2026)

- **Branch autonomo:** `core/readiness-r1` (base I3 `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`).
- **Obiettivo:** Introduzione endpoint `/ready` separato da `/health` per il gate di readiness applicativo in staging e produzione.
- **Dettagli implementativi:**
  - `GET /health`: liveness del processo, completamente disaccoppiato dal database PostgreSQL. Restituisce HTTP 200 `{ status: "ok", service: "myteam-platform-api", apiVersion: "v1" }`.
  - `GET /ready`: probe di readiness a traffico servibile. Esegue probe `SELECT 1` con timeout limitato (default 2s) e gestione fail-closed. Nessuna esecuzione o applicazione automatica di migrazioni.
  - Comportamento fail-closed: restituisce HTTP 503 `{ status: "not_ready", service: "myteam-platform-api", apiVersion: "v1", error: "service_unavailable" }` in assenza di pool, timeout o errore di connessione/query. Nessun dettaglio interno o credenziale esposta.
  - Restituisce HTTP 200 `{ status: "ready", service: "myteam-platform-api", apiVersion: "v1", database: "connected" }` solo con connettività PostgreSQL verificata.
- **Schemi e contratti:** Aggiornato `packages/contracts/src/health.ts` con `ReadyOkResponseSchema` e `ReadyUnavailableResponseSchema`.
- **Test:** Aggiunti unit test dedicati `apps/api/test/unit/readiness.test.ts` e contratto API `tests/api/ready.test.ts` a copertura di pool sano, pool assente, errore query, timeout, assenza leak credenziali e indipendenza di `/health`.
- **Vincoli:** Nessuna modifica a manifest INFRA, Web, iOS, Logto o CSI. Nessun merge su main o I3.

## Core Readiness R3 — ricostruzione locale per gate I4 (2 novembre 2026)

- **Origine verificata:** la ricerca locale e le ref disponibili non contengono il commit R2 `21cfba4a33f1bf7f412881c256526fabe5231be4` né il commit R3 dichiarato in precedenti handoff `843e9f4a6a34220ac0278e86a265572fe311708b`. Il report QA Platform R2 / Infra S1-R3 (`qa/platform-r2-infra-r3-review` @ `74e86803adf16da23c2f478201c33a28383bb3fc`) è disponibile, letto integralmente; il QA vi documenta il leak su PostgreSQL 16 con `pool.max=1` e acquisizione `pool.connect()` tardiva.
- **Candidato ricostruito, non recuperato:** branch `core/readiness-r3-reconstructed`, creato su worktree isolato da `origin/core/readiness-r1` @ `58145314fae1588616de8f9680332a27f4cfbe7e`. Non si afferma ancestry o equivalenza con gli SHA R2/R3 mancanti. Questo checkpoint ricostruisce il probe client-based, single-flight e il guard di congestione dal finding/report, poi aggiunge cleanup per acquisizioni tardive.
- **Implementazione:** timeout complessivo copre acquisizione e `SELECT 1`; `release(error)` distrugge il client su errore/timeout. Il listener immediato su `pool.connect()` rilascia e scarta un client arrivato dopo il timeout e osserva rigetti tardivi. Lo stato per pool impedisce probe duplicati concorrenti; se un'acquisizione non cancellabile resta pendente dopo il timeout, retry successive falliscono chiuse senza accodare un'altra acquisizione fino alla sua risoluzione. `/health` non usa il pool; `/ready` non controlla né applica migrazioni/schema.
- **Verifiche:** riproduzione controllata del pattern `Promise.race(pool.connect())` su PostgreSQL 16: dopo timeout e sblocco acquisizione, il client resta checked-out (`totalCount=1`, `idleCount=0`, `waitingCount=0`) senza handler; cleanup manuale del reproducer eseguito. Suite unit API: **17 PASS**, di cui 14 test readiness-focused. Integrazione PostgreSQL 16 effimera: **2 PASS**, incluso pool `max=1`, acquisizione tardiva scartata, nessun client residuo e retry `SELECT 1` riuscito. Build e typecheck in `pnpm check`: **PASS**; suite complessiva del comando **FAIL limitato** sul commit Core iniziale perché `tests/api/ready.test.ts` usava un mock con solo `query()` mentre il probe richiede `connect()`; il commit QA `14fda6d93dd34d1de7c7f7488fed4c637ad7a0bd` aggiorna il fixture senza cambiare il contratto. Le suite integrate restano da rieseguire in I4. Dettagli nel report di consegna del checkpoint.
- **Prossimo gate:** riesecuzione delle suite integrate, QA indipendente sul commit ricostruito e riesame congiunto I4. Il timeout interno resta 2.000ms; Infra deve verificare un `timeoutSeconds` esterno con margine (3s indicato dal report QA). Nessuna modifica Infra, push, merge, deploy o operazione cluster eseguita/autorizzata.
## Web W3-R1 — P1 OIDC e remediation P2 responsive (2 novembre 2026)

- **W3-PWA-01: CLOSED, senza modifiche alla remediation P1.** Test Chromium production con soli `code/state` sintetici: regressione positiva sul worker W3 v1, callback online non memorizzato, callback offline fail-closed, rimozione cache v1, conservazione cache estranea e attivazione controllata multi-scheda. Report: `docs/qa/CHECKPOINT-WEB-W3-R1-P1-OIDC-REPORT.md`.
- **P2 contrasto: verificato come già implementato nel WIP** con luminanza relativa/rapporto WCAG, caso `#808000` (testo nero AA); l’override manuale resta libero e mostra un avviso quando il rapporto testo/primario è sotto 4.5:1. Suite Web: 138 test PASS.
- **P2 overflow mobile: corretto e verificato in Chromium.** Prima: a 320 px l’admin Partite raggiungeva 323 px e l’admin Rosa 476 px (a 360 px Rosa 476 px). Dopo il fix, Partite/Rosa pubbliche e admin hanno `documentElement.scrollWidth === innerWidth` a 320, 360, 375, 390 e 414 px; la tabella Rosa resta scorribile nel proprio wrapper (602 px di contenuto dentro 286 px visibili a viewport 320 px, documento sempre 320 px).
- `pnpm check` (build/typecheck/test monorepo), suite Web (138 test) e regression Chromium P1: **PASS**. La matrice Chromium responsive è una prova manuale/diagnostica con dati DEMO sintetici; non è stata aggiunta al runner automatico.
- **Non equivale a GO W3-R1 generale.** `CACHE_VERSION` rimane il valore fisso `v2`: invalidazione per build/asset fingerprinted e click UI di aggiornamento/reload non sono coperti. Login/logout Logto reale non eseguito. Nessuna verifica indipendente QA3 in questo checkpoint.
- **Prossimo gate:** re-QA indipendente QA3 su P1/P2; poi valutazione separata del versionamento build e del ciclo completo di aggiornamento PWA. Nessun push, merge o deploy.

## Candidato locale I4 Web + API + Infra (2 novembre 2026)

- **Base:** I3 `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2` (verificato sul branch remoto `codex/integration-i3-candidate`).
- **Revisioni integrate con merge ordinari:** Core Readiness R3 ricostruito `418bac465b0eca4f3371468594dfa7a29c7302f0`, fixture QA `14fda6d93dd34d1de7c7f7488fed4c637ad7a0bd`, Infra S1-R4 ricostruito `d1be5b5064fdd9e56c9a03e154467bbcf2b6ea6d`, Web W3-R1 corrente `51575be7c21acfe2393d410928740037b6a91ae6`. Gli SHA R3/R4 originali persi non sono dichiarati recuperati né sostituiti: i commit sopra sono ricostruzioni locali identificate dai propri SHA.
- **Conflitto documentale:** `docs/STATUS.md` riconciliato conservando i checkpoint Core e Web, senza alterare i loro esiti storici; il fixture Core readiness aggiornato dal commit QA è registrato e il riesame indipendente resta pendente.
- **Verifiche locali sul candidato:** `pnpm install --frozen-lockfile` PASS (pnpm store riutilizzato); `pnpm check` PASS; Web Vitest **138 PASS**; QA Vitest **28 PASS**; QA Node/API/contratti/auth **71 PASS, 1 SKIP** (lo skip è il browser E2E, non un PASS). Le verifiche che richiedono listener loopback sono state eseguite con permessi runtime autorizzati.
- **Infra:** build statiche Kustomize PASS per `01-bootstrap`, `02-migration`, `03-apps` e `04-routing`. Nessun `apply`, deploy, accesso/modifica K3s o gestione di credenziali.
- **NOT RUN / gate aperti:** PostgreSQL reale non eseguito perché `TEST_DATABASE_URL` non è configurata; browser E2E e QA Web indipendente restano in corso; CI remota sul candidato non avviata perché il branch non è stato pubblicato. Nessun login Logto reale o staging verificato.
- **Perimetro:** iOS escluso da I4 Web+API secondo decisione dell'utente; nessun deliverable o finding iOS è incluso nel gate.
- **Esito:** candidato locale per handoff QA, **non è un GO di release**. Prima di una promozione servono chiusura QA indipendente Web/API, PostgreSQL reale su database isolato `*_test`, CI sul commit pubblicato e gate Infra/registry/GHCR e staging autorizzati.

## I4 Web + API release-prep candidate (2 novembre 2026)

- **Release-prep branch:** `integration/i4-web-api-release-prep`, worktree isolato. Base di release-prep verificata: `6d754a1983cba475b37e961a3bdc11c4d85a2f9f`.
- **Catena verificata:** I4 codice/infra `e567deee1209c05074ac8f7129b2c2fd1e243b1a` → BUILD workflow `1004ba90de30386320409345a253ec5c38244480` → correzione runbook signer `6d754a1983cba475b37e961a3bdc11c4d85a2f9f`. Ogni SHA è antenato del branch di release-prep; iOS resta escluso.
- **Validazione locale sul source SHA `6d754a1`:** installazione frozen completata; `mise exec -- pnpm check` PASS (build/typecheck, API unit 17/17 e API HTTP 5/5); Web Vitest 138/138 PASS; Kustomize staging 4/4 PASS; `actionlint .github/workflows/release-artifacts.yml` PASS.
- **Decisione PR:** **GO CON RISERVE per revisione della PR del candidato Web+API/BUILD**, non è autorizzazione a merge o release. La chiusura QA browser indipendente resta richiesta per il gate Web end-to-end. Usare il full SHA del branch release-prep come source revision sottoposta a revisione; il commit protetto risultante su `main` avrà uno SHA diverso.
- **Gate release:** **NO-GO per GHCR/staging/deploy.** Nessun workflow è stato lanciato; attestazioni e digest GHCR, strict provenance, accesso/pull, Logto reale e staging non sono stati verificati. Solo dopo il normale merge protetto e l'approvazione del release owner, il dispatch manuale deve essere eseguito da `main` con `source_commit` uguale allo SHA completo del run su `main`, come specificato nel runbook. Non usare lo SHA del branch come se fosse già lo SHA protetto di `main`.

## Candidato I5 Web+API isolato, senza import iOS (2 novembre 2026)

- **Branch locale:** `integration/i5-web-api-scoped-candidate`, worktree isolato; base esatta `main` @ `66b49875acbf7d520029730702a03f3abc66bb8c`.
- **Sorgente verificata:** PR #2, `integration/i4-web-api-release-prep` @ `7389d3252fecccefe0a9aa9b3a8f0ec1331809e8`. Sono stati trasferiti i cambiamenti tracciati Web/API, CI, infra documentale e QA, escludendo l'intero albero `apps/ios/` e i documenti/sezioni di importazione o migrazione iOS. Il rapporto R1-D della copia iOS è stato rimosso da questo stato; `docs/platform/IOS-C4-PLATFORM-DECISIONS.md` resta soltanto come specifica di prodotto APPROVATA, non come implementazione.
- **Riconciliazione documentale:** `AGENTS.md` è mantenuto coerente col ramo senza `apps/ios/`; README distingue lo stack Web/API incluso dalla sincronizzazione iOS non inclusa; l'indice piattaforma non collega i rapporti di migrazione esclusi. Requisiti di prodotto e rapporti QA storici non pertinenti all'import sono conservati.
- **Validazione locale I5:** frozen install PASS; `pnpm check` PASS; Web Vitest **138 PASS**; QA Vitest **28 PASS**; QA Node **71 PASS, 1 SKIP** (browser E2E separato); PostgreSQL 16 usa container usa-e-getta solo loopback, suite API **2 PASS** e suite PostgreSQL QA **6 PASS**; Docker Web build e smoke Chromium di sicurezza con Logto sintetico **PASS**; Kustomize staging **4/4 PASS**; actionlint sui tre workflow **PASS**.
- **Workflow CI:** sola correzione di quoting su `$GITHUB_ENV` nel workflow CI dopo finding shellcheck SC2086; nessuna condizione di gate è stata rimossa o indebolita.
- **Stato:** candidato preparato localmente per handoff a QA indipendente. Nessun push, PR, merge, pubblicazione GHCR o deploy; Logto reale e staging non verificati.
