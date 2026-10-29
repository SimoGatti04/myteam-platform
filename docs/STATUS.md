# Stato — myteam-platform

**Aggiornato:** 29 ottobre 2026. **Checkpoint:** C0 è pubblicato su `main`; le slice Core C1.1 e C1.2 sono implementate sul branch dedicato `codex/core-persistent-flow`. Non è l'MVP completo e non è stato integrato automaticamente in `main`.

## Integrazione iOS — gate locale R1-A3

Il candidato isolato `codex/ios-r1-a3-publication` integra la storia iOS sotto `apps/ios/` sulla base GitHub pubblicata `docs/ios-c4-platform-decisions-20261029` (`7fd81044e6dab4f6cf732c99d7f2f3019977b665`). Il commit Xcode effettivamente testato è `4568542756051abbadf0c175559f08735cd9eb26` (**build PASS; C3.3: 122 PASS, 0 FAIL, 0 SKIPPED**). Il rapporto di migrazione registra audit, mapping e limiti. Nessun push, merge su `main` o modifica del worktree Web attivo; il gate R1-B locale è PASS, la pubblicazione resta da eseguire separatamente.

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
