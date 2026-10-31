# Stato — myteam-platform

**Aggiornato:** 31 ottobre 2026. **Checkpoint:** C0 è pubblicato su `main`; le slice Core C1.1 e C1.2 sono implementate sul branch dedicato `codex/core-persistent-flow`. Non è l'MVP completo e non è stato integrato automaticamente in `main`.

## Integrations — CSI-S1 (31 ottobre 2026)

- Rapporto tecnico: `docs/spikes/csi-s1-feasibility.md`, branch autonomo `research/integrations-csi-s1` (base candidato I1 `f6382175b2fa9488994d3dfbb460d995ede97e5c`; rapporto al commit `d6031b4feea7d85610d700792cfb79262e9ae774`).
- Esito: PDF manuale documentato; API pubblica e licenza di riuso automatizzato non dimostrate. Gli estratti pubblici mostrano calendario/classifica e distinzione ufficiosa/omologata, ma l'accesso automatico a Live è stato bloccato da robots nel servizio di consultazione; nessun bypass o scraping eseguito.
- Nessun adapter, codice applicativo o schema dati modificato. L'inserimento e l'override admin restano il fallback e l'import CSI non blocca il primo deployment.
- **Prossimo gate:** localizzare la squadra MAPI nel comitato/competizione/girone corretti e ottenere dal CSI autorizzazione scritta o un export/API supportato, con ID, stato di omologazione e frequenza/condizioni d'uso verificabili.

## Integrazione iOS — stato R1-D

R1-A3 ha completato localmente la preparazione della cronologia iOS sotto `apps/ios/`. R1-B ha pubblicato il branch `codex/ios-r1-a3-publication` su GitHub all'SHA `42912195b63b401d5c6200f314338ca9a2754d06`; R1-C ha aperto la Draft PR #1 sulla base `docs/ios-c4-platform-decisions-20261029` (`7fd81044e6dab4f6cf732c99d7f2f3019977b665`). La revisione QA indipendente è ancora pendente e non è stato eseguito alcun merge su `main`. Build Xcode e suite C3.3: **122 PASS, 0 FAIL, 0 SKIPPED** sul commit effettivamente testato `4568542756051abbadf0c175559f08735cd9eb26`; il tip documentale successivo non è stato testato separatamente. CI remota: **NOT RUN**. Nessun deploy o distribuzione iOS. Il rapporto di migrazione registra audit, mapping e limiti.

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
- Playwright Browser E2E: escluso dai gate CI ordinari per evitare non-determinismo, assenza dipendenze browser nei lockfile e costi runner; mantenuto come test locale dedicato.

