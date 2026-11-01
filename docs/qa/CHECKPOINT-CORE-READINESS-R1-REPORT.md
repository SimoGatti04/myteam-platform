# QA Core Readiness R1 — rapporto indipendente

- **Data verifica:** 1 novembre 2026
- **Repository:** `SimoGatti04/myteam-platform`
- **Target verificato:** `origin/core/readiness-r1` @ `58145314fae1588616de8f9680332a27f4cfbe7e`
- **Base I3:** `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`
- **Branch QA:** `qa/core-readiness-r1-review`
- **Worktree:** `/Users/gatti/.codex/worktrees/qa-core-readiness-r1/myteam-platform`

## Sintesi e verdetto

**CORE READINESS QA: GO CON RISERVE.**

L'identità Git richiesta è stata riconciliata: `origin` punta al repository GitHub atteso; `git ls-remote` e GitHub REST concordano sullo SHA richiesto; il fetch aveva reso disponibile l'oggetto locale. Il commit è figlio diretto della base I3. L'ispezione statica mostra contratti HTTP fail-closed e senza dettagli DB, ma `/ready` prova esclusivamente che una query `SELECT 1` termina, non che le migrazioni siano state applicate o che lo schema sia compatibile. Inoltre il timeout applicativo basato su `Promise.race` non cancella la query PostgreSQL sottostante.

**Non è stata eseguita alcuna suite automatica né una prova PostgreSQL reale:** nel worktree non sono disponibili Node.js, pnpm, Corepack o `psql`; il client Docker esiste, ma il daemon OrbStack ha negato l'accesso. Di conseguenza il verdetto è limitato alla riconciliazione Git e all'ispezione statica del codice/contratto; non certifica runtime, build, tipo, comportamento effettivo PostgreSQL o readiness Kubernetes.

## Riconciliazione Git

| Controllo | Risultato | Evidenza |
|---|---|---|
| Remote `origin` | PASS | `git remote -v`: `git@github.com:SimoGatti04/myteam-platform.git` per fetch/push. |
| Riferimento Git remoto | PASS | `git ls-remote --heads origin refs/heads/core/readiness-r1` → `58145314fae1588616de8f9680332a27f4cfbe7e`. Il primo tentativo isolato fallì per risoluzione DNS; ripetuto tramite il normale accesso autorizzato, il riferimento è stato letto correttamente. |
| GitHub REST | PASS | `GET /repos/SimoGatti04/myteam-platform/branches/core/readiness-r1` restituisce il medesimo SHA. |
| Oggetto locale | PASS | `HEAD` del worktree è il commit richiesto dopo fetch esplicito; `git show` lo risolve. |
| Ancestry | PASS | Parent diretto e merge-base con I3: `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`; un commit nel delta. |
| Delta | PASS | Sei file: `apps/api/src/app.ts`, `apps/api/src/persistence/readiness.ts`, `apps/api/test/unit/readiness.test.ts`, `docs/STATUS.md`, `packages/contracts/src/health.ts`, `tests/api/ready.test.ts` (333 aggiunte, 1 rimozione). |
| Worktree iniziale | PASS | Branch isolato `qa/core-readiness-r1-review`, HEAD target, working tree pulito prima del rapporto. Nessun branch Core/Infra modificato. |

## Matrice delle verifiche

| Area | Esito | Evidenza / limite |
|---|---|---|
| Contratto `GET /health` | PASS — ispezione statica | In `apps/api/src/app.ts` risponde 200 con `status`, `service`, `apiVersion`; non interroga il DB. Il contratto TypeBox vieta proprietà aggiuntive. È una liveness, non una prova di readiness. Runtime NOT RUN. |
| `GET /ready`, pool presente e query riuscita | PASS — ispezione statica | Esegue `SELECT 1`; su completamento della query restituisce 200 e `database: "connected"`. Non prova la compatibilità dello schema. Runtime NOT RUN. |
| Pool assente | PASS — ispezione statica | `checkDatabaseReadiness(undefined)` restituisce `no_pool`; l'handler lo mappa a HTTP 503 e a un corpo generico. Non verificato a runtime. |
| Errore DB / timeout HTTP | PASS — ispezione statica | Errori e timeout risultano non pronti; 503 usa `service_unavailable`, senza propagare messaggio, host o credenziali. Schemi di risposta chiusi (`additionalProperties: false`). Nessun dato sensibile è incluso nei DTO. Runtime NOT RUN. |
| Query dopo timeout / capacità pool | FAIL — finding statico QA-READY-01 | `Promise.race` chiude l'attesa HTTP ma non invia cancellazione a `pg` e non interrompe la query. Vedi finding; esaurimento pool non riprodotto dinamicamente. |
| PostgreSQL disponibile | NOT RUN | Nessun `psql`; daemon Docker non accessibile (`permission denied` sul socket OrbStack). Nessun test ha usato PostgreSQL. |
| Connessioni DB disponibili / pool sotto pressione | NOT RUN | Nessun test con pool PostgreSQL reale, concorrenza o query lente. |
| Schema migrato e compatibile | NOT RUN / non garantito dall'endpoint | `SELECT 1` non richiede tabelle applicative; nessun controllo di versione migrazioni o query su tabelle Core nel codice `/ready`. La compatibilità dello schema non è deducibile dalla connettività. |
| Build e typecheck | NOT RUN | `pnpm check` terminato con exit 127: `zsh:1: command not found: pnpm`; `node --version` terminato con exit 127: `zsh:1: command not found: node`. Nessun risultato preesistente riutilizzato. |
| Test Core | NOT RUN | La revisione individua 9 casi `node:test` in `apps/api/test/unit/readiness.test.ts`, inclusi mock e un mock che non si risolve; il runner non è disponibile. |
| Test contratto QA | NOT RUN | `tests/api/ready.test.ts` contiene 2 casi con pool simulato/Fastify inject; il runner non è disponibile. Questi test non equivalgono a PostgreSQL reale. |
| Prova PostgreSQL 16 effimero | NOT RUN | `docker info` mostra client 29.8.2, context `orbstack`, ma termina con `permission denied while trying to connect to the Docker API at unix:///Users/gatti/.orbstack/run/docker.sock`. Nessun container avviato. |
| Compatibilità probe INFRA-S1-R2 | PARTIAL — confronto statico | Worktree Infra letto in sola lettura a `b925c9622c498818157b68d24ea4af38f6e304da`; la readiness probe usa `GET /ready`, porta `http`, ogni 5 s, soglia 3. Mancano `timeoutSeconds` espliciti (Kubernetes default 1 s), inferiore al timeout Core di 2 s. Il path/status sono compatibili; la finestra temporale va coordinata. Nessuna applicazione Kubernetes eseguita. |

## Finding

### QA-READY-01 — Query PostgreSQL non cancellata dal timeout HTTP

- **Severità:** P2 — rischio di capacità/availability, non perdita o esposizione dati.
- **Classificazione:** limite/difetto dimostrato dal codice; conseguenza sul pool non riprodotta in ambiente PostgreSQL.
- **File:** `apps/api/src/persistence/readiness.ts`, funzione `checkDatabaseReadiness` (commit target; blocco `Promise.race` tra `pool.query("SELECT 1")` e timer).
- **Evidenza:** il timeout rigetta la sola `timeoutPromise`; il `finally` cancella il timer, ma non cancella `queryPromise`, non usa `AbortSignal` e non chiama un meccanismo di cancellazione del client PostgreSQL. Il test unitario del caso timeout simula una promise che resta pendente e verifica solo `{ok:false, reason:"timeout"}`. Non controlla se query o connessione restino occupate.
- **Impatto:** se la query ha acquisito un client e il server/trasporto la lascia pendente, la chiamata HTTP termina circa dopo 2 s ma il client può restare occupato finché la query si risolve o la connessione fallisce. Prove ripetute o concorrenziali possono consumare il pool (configurato con `max: 10`) e causare code o errori anche per le route applicative. `connectionTimeoutMillis: 2000` limita l'acquisizione di connessioni nuove, ma non equivale a `statement_timeout` né interrompe una query già in esecuzione.
- **Riproducibilità:** deducibile dal flusso statico; scenario PostgreSQL reale NOT RUN. Non si afferma che un esaurimento sia stato osservato.
- **Correzione raccomandata:** definire un timeout server-side PostgreSQL/query effettivo e verificato (es. `statement_timeout` limitato per questa query/connessione) e/o cancellazione esplicita con rilascio client garantito. Aggiungere test d'integrazione che bloccano una query oltre il deadline, controllano `pool.totalCount`, `idleCount`, `waitingCount` e dimostrano che probe successive e una query applicativa non restano affamate. Evitare di trattare il solo `Promise.race` come cancellazione.
- **Owner:** Core.

### QA-READY-02 — `/ready` certifica connettività, non schema/migrazioni

- **Severità:** P2 — rischio di rollout e interpretazione della probe.
- **Classificazione:** limite verificato staticamente; non è un bug se il contratto è intenzionalmente “DB connectivity only”.
- **File:** `apps/api/src/persistence/readiness.ts`; confronto con `deploy/staging/03-apps/api.yaml` del worktree INFRA-S1-R2 @ `b925c9622c498818157b68d24ea4af38f6e304da`.
- **Evidenza:** `/ready` esegue soltanto `SELECT 1`, che può riuscire anche con database vuoto o prima delle migrazioni applicative. Il commento del manifest INFRA descrive invece `/ready` come controllo di connettività PostgreSQL **e schema pronto**; questa seconda garanzia non risulta implementata nel codice Core ispezionato.
- **Impatto:** un DB raggiungibile ma non migrato può rendere `/ready` HTTP 200. Il traffico può quindi essere instradato a un'applicazione incompatibile se la sequenza di migrazione non è garantita separatamente.
- **Riproducibilità:** semantica dimostrata dal testo della query e dalla route; prova su database vuoto/migrato NOT RUN.
- **Correzione raccomandata:** allineare la documentazione Infra al contratto “connettività” e rendere obbligatoria/verificabile la barriera del migration job prima dell'API; oppure, con decisione Core esplicita, aggiungere un controllo schema-version non sensibile e testarlo su schema assente, migrazione corrente e versione incompatibile. Non implicare che `SELECT 1` certifichi lo schema.
- **Owner:** Core (contratto/semantica), Infra (sequenza deployment e commento manifest).

### QA-READY-03 — Deadline HTTP più corto della probe configurata implicitamente

- **Severità:** P2 basso / compatibilità operativa da correggere prima dello staging.
- **Classificazione:** incompatibilità plausibile dimostrata per configurazione; nessun falso negativo runtime riprodotto.
- **File:** `apps/api/src/persistence/readiness.ts` (deadline 2.000 ms); `deploy/staging/03-apps/api.yaml` @ `b925c9622c498818157b68d24ea4af38f6e304da` (readiness probe senza `timeoutSeconds`).
- **Evidenza:** la probe HTTP Kubernetes usa `timeoutSeconds: 1` per default quando omesso; il deadline interno Core è 2 secondi. Il path `/ready`, porta `http` e status attesi 200/503 sono coerenti, ma il client probe può interrompere la richiesta prima del fail-closed controllato dall'API. La documentazione ufficiale Kubernetes indica `timeoutSeconds` predefinito a 1 secondo ([probe configuration](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/#configure-probes)).
- **Impatto:** possibile timeout/errore della probe invece del 503 controllato; può ritardare o rendere più rumorosa la transizione di readiness in condizioni DB lente. Non equivale a esporre traffico (un timeout è normalmente un fallimento della probe), ma rende ambigua la diagnosi e può alterare i tempi di rollout.
- **Correzione raccomandata:** impostare esplicitamente `timeoutSeconds` a un valore superiore al timeout Core con margine per overhead, oppure ridurre il timeout Core sotto la soglia Kubernetes; verificare anche `periodSeconds` e il comportamento in avvio/DB recovery.
- **Owner:** Infra per il manifest; coordinamento Core/Infra sul budget temporale.

## Contratto osservato

- `/health`: liveness processo-only, HTTP 200; non dimostra connettività DB.
- `/ready`: HTTP 200 solo se `pool.query("SELECT 1")` termina entro il timeout interno; HTTP 503 per pool assente, eccezione o deadline. La risposta pubblica non include il motivo interno né l'errore PG.
- Questi endpoint non richiedono autenticazione applicativa, appropriato per probe interne; il manifest di rete e l'esposizione esterna non sono stati testati.
- “Database connected” significa solo che la query di prova è riuscita in quel momento. Non prova capacità residua del pool per richieste concorrenti, schema applicativo, migrazioni né correttezza dei dati.

## Gate mancanti e prerequisiti

Per trasformare le voci NOT RUN in evidenza eseguita occorrono:

1. Runtime Node.js e pnpm coerenti con `packageManager`/lockfile del repository e dipendenze installate in modo pulito.
2. Accesso autorizzato al Docker daemon o a un runner Linux effimero con PostgreSQL 16, oppure un PostgreSQL dedicato di test esplicitamente identificato. Nessuna prova deve usare il DB di sviluppo condiviso o servizi produttivi.
3. Schema temporaneo dedicato, cleanup verificato, database URL test-only con suffisso richiesto dalle fixture; test di query bloccata e misurazione del pool prima/dopo timeout.
4. Test su database disponibile, rifiuto connessione, pool assente, timeout acquisizione, timeout query attiva, schema vuoto, schema migrato e errore migrazione.
5. Manifest Infra con `timeoutSeconds` esplicito e sequencing verificato in un cluster effimero; il cluster live non è stato consultato.
6. Verifica separata del migration job: l'endpoint attuale non lo sostituisce.

## Tracce e comandi

Comandi di controllo eseguiti:

```text
git remote -v
# origin git@github.com:SimoGatti04/myteam-platform.git (fetch/push)

git ls-remote --heads origin refs/heads/core/readiness-r1
# 58145314fae1588616de8f9680332a27f4cfbe7e refs/heads/core/readiness-r1

node --version
# exit 127: zsh:1: command not found: node

pnpm check
# exit 127: zsh:1: command not found: pnpm

docker info
# exit 1: permission denied while trying to connect to the Docker API at
# unix:///Users/gatti/.orbstack/run/docker.sock
```

`psql` non è installato nel PATH. Nessun container è stato avviato e nessuno schema/database è stato creato o rimosso. I test individuati (9 unit test Core e 2 test di contratto QA) sono conteggi statici dei casi presenti nel sorgente, **non** risultati di esecuzione.

## Stato finale

- **Target applicativo sottoposto a ispezione:** `58145314fae1588616de8f9680332a27f4cfbe7e`.
- **Base:** `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`.
- **Commit QA del rapporto:** da registrare nel branch `qa/core-readiness-r1-review` dopo verifica del diff.
- **Nessuna modifica applicativa Core/Infra, nessun push, merge o deploy.**
- **Verdetto:** `CORE READINESS QA GO CON RISERVE`; runtime, PostgreSQL reale e rollout non certificati.
