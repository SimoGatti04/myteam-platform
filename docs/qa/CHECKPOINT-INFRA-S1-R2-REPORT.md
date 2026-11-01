# MYTEAM-PLATFORM — QA INFRA-S1-R2 Report

**Data review:** 1 novembre 2026
**Repository:** `SimoGatti04/myteam-platform`
**Target verificato:** `origin/infra/s1-r2-staging-gates` @ `b925c9622c498818157b68d24ea4af38f6e304da`
**Base dichiarata:** `22d23d54a49f4a8c479a9011ca823b745f7a52b3`
**Branch QA:** `qa/infra-s1-r2-review` (rapporto da committare localmente; nessun push)

## Verdetto

**QA INFRA-S1-R2: GO CON RISERVE** per qualità del packaging, rendering Kustomize e pipeline Docker CI. **Non è un'autorizzazione allo staging**: prima occorrono l'integrazione Core+Infra della readiness, immagini di release verificabili per digest e la chiusura dei gate funzionali su DEMO/auth. Il deployment Kubernetes e il comportamento del CNI restano non provati.

- **Bloccanti per I4/integration candidate:** integrare Core `core/readiness-r1` nel candidato e provare il contratto `/ready`; correggere il gate DEMO/JWT che oggi non asserisce nulla; assegnare e verificare immagini corrispondenti al candidato.
- **Bloccanti per staging:** oltre ai precedenti, eseguire un rollout su cluster di staging autorizzato con test delle probe, delle policy di rete e del percorso di recovery. Non applicare il root Kustomize aggregator come sostituto della sequenza protetta.

## Identità, ancestry e perimetro

Il riferimento GitHub per il branch indicato e l'oggetto locale coincidono sullo SHA completo `b925c9622c498818157b68d24ea4af38f6e304da`. La base `22d23d54a49f4a8c479a9011ca823b745f7a52b3` è antenata; il parent diretto del target è `99616ecea7aa899cb2b98372dba64ae8cb1c9dd3`. Il delta base..target è di 20 file: pipeline Docker, Dockerfile, organizzazione dei quattro overlay, script staged deploy, smoke script e rapporto Infra. Non risultano modifiche ad applicazione Core/Web, contratti o dati.

Il controllo locale del diff rileva due righe con whitespace finale in `.github/workflows/docker-ci.yml` (linee 102 e 106): `git diff --check` sul delta Infra **FAIL** per questo motivo minore. Le credenziali visibili nel diff sono esclusivamente valori CI sintetici (`ci-staging-password`, `ci-mock-app-id`), non segreti di produzione. Non sono stati eseguiti deploy, push GHCR, accessi K3s, Cloudflare, Infisical o Logto.

## Matrice delle verifiche

| Area | Stato | Evidenza / limite |
|---|---|---|
| Identità target, base e ancestry | **PASS** | API GitHub branch e run riferiscono `b925c962…`; base antenata e checkout locale sullo stesso oggetto. |
| Rendering root Kustomize e quattro stadi | **PASS** | `kubectl kustomize deploy/staging` e ciascun overlay `01-bootstrap`, `02-migration`, `03-apps`, `04-routing` terminano con exit 0. È rendering, non validazione contro API server/CRD né applicazione. |
| Sintassi `deploy-stage.sh` | **PASS** | `bash -n deploy/staging/deploy-stage.sh` exit 0. Non simula l'esecuzione kubectl, i timeout o interruzioni. |
| Workflow CI applicativa, run `41235547169` | **PASS** | GitHub Actions `success`, checkout sullo SHA target; tutti i sei gate riportati completati: install frozen, `pnpm check`, Web Vitest, QA Vitest, QA Node, PostgreSQL integration. I dettagli dei test restano quelli della CI, non prove di deployment. |
| Docker CI, run `41235547318` | **PASS** | GitHub Actions `success` sullo SHA target; build API/Web, controlli UID API 1000/Web 101, artefatti/migrazioni, migration CLI su PostgreSQL 16 effimero, smoke `/health` e Nginx SPA/cache. Non certifica K3s, readiness, policy CNI o immagini GHCR di release. |
| Docker build locale indipendente | **NOT RUN** | Il client Docker è presente, ma `docker info` e `docker ps` falliscono entrambi con `permission denied while trying to connect to the Docker API at unix:///Users/gatti/.orbstack/run/docker.sock`. Le build reali disponibili sono quelle del run remoto sopra. |
| Build/typecheck/test locali | **NOT RUN** | `node` e `pnpm` non sono disponibili nel worktree; non si riusano dipendenze o risultati di altri worktree. I risultati CI sono registrati separatamente. |
| Deployment/rollout su Kubernetes, probes e policy effettive | **NOT RUN** | Nessun cluster K3s toccato, per vincolo. |
| Backup/restore reale isolato | **NOT RUN** | Nessun backup reale né volume/istanza di ripristino utilizzati. |
| `git diff --check` sul delta Infra | **FAIL (P3)** | Whitespace finale alle linee 102 e 106 del workflow Docker CI. |

### Contenuto provato dalla Docker CI remota

Il job `Docker Packaging, Non-Root & Staging Smoke` ha concluso tutti gli step applicabili con successo, incluse build immagini, UID runtime, presenza di `apps/api/dist/index.js`, `migrate-cli.js` e SQL migration, migrazione contro il servizio PostgreSQL 16 effimero, risposta `/health`, fallback SPA e header cache. La CI usa immagini Docker locali (`load: true`), senza `push`; quindi questa prova **non** dimostra che i tag specificati da Kustomize esistano nel registry o puntino alle immagini appena costruite. Il runner GitHub ha completato la fase di teardown dei container/servizi effimeri.

## Revisione tecnica e finding

### INFRA-R2-01 — readiness manifest non compatibile col Core incluso nel target

**Gravità: P1 — blocco per candidato I4 basato su questo checkout; non attribuito al Core readiness branch.**
**Tipo:** incompatibilità riprodotta staticamente; runtime non eseguito. **Owner:** Infra + Core.

`deploy/staging/03-apps/api.yaml` imposta la `readinessProbe` su `/ready`. In questo target, `apps/api/src/app.ts` registra `/health` ma non `/ready`; il relativo branch Core `origin/core/readiness-r1` contiene la route, ma non è antenato del target Infra né del checkout testato. È quindi atteso che il pod API di questo preciso insieme di sorgenti riceva 404 dalla readiness probe e non diventi Ready. Il commento inline nel manifest è inoltre contraddittorio: afferma che `/ready` è ancora in implementazione e che nel frattempo la probe usa `/health`, mentre il valore YAML effettivo è `/ready`.

**Riproduzione:** confrontare route in `git show HEAD:apps/api/src/app.ts` con `readinessProbe.httpGet.path` in `deploy/staging/03-apps/api.yaml`; verificare ancestry separata di `origin/core/readiness-r1`. Non è stato fatto un rollout.

**Rimedio:** integrare il commit Core readiness nel candidato integrato e aggiornare commento/documentazione; in ambiente isolato provare 200 con DB raggiungibile, 503 quando non lo è e timeout/pool assente. Un `SELECT 1` verifica connettività, non schema migrato/compatibilità. Non promuovere questa probe come schema gate.

### INFRA-R2-02 — gate DEMO/JWT del Docker workflow è inefficace

**Gravità: P1 — blocco del gate di sicurezza richiesto prima dello staging.**
**Tipo:** difetto del controllo CI dimostrato; presenza effettiva della feature nel bundle/UI staging non certificata. **Owner:** Infra + Web.

La build passa `VITE_APP_ENV=production` e `VITE_ENABLE_DEMO=false`, ma la verifica finale è `docker exec web-smoke grep -q "VITE_APP_ENV=production" /usr/share/nginx/html/assets/*.js || true` (workflow linea 132). Il `|| true` neutralizza ogni esito, incluso file assente, `grep` fallito o stringa non trovata; inoltre cerca una stringa di configurazione anziché provare le capability visibili. Nei log CI il controllo non fallisce anche quando `grep` segnala che il glob `assets/*.js` non esiste nel contesto invocato.

**Rimedio:** sostituire il controllo con asserzioni funzionali sul container/build di staging (form JWT manuale assente, DEMO non attivabile; verificare anche route/controlli accessibili), e far fallire lo step se setup/selettori/risposte non corrispondono. Il solo env della build non è evidenza della UI risultante.

### INFRA-R2-03 — immagini Kustomize non legate al digest del rilascio

**Gravità: P1 per autorizzare un rilascio riproducibile; P2 come debito di packaging.**
**Tipo:** rischio configurativo verificato; tag availability/provenienza non verificata. **Owner:** Infra/Release.

Il render root risolve API, Web e migration sul tag `20261031-22d23d5`; PostgreSQL resta `postgres:16-alpine`. I primi tre non corrispondono allo SHA target `b925c962…` per nome, ma al prefisso della base `22d23d5…`. La convenzione del tag data+short SHA non garantisce da sola immutabilità nel registry. Inoltre Docker CI ha `load: true` e non pubblica immagini: il run verde non prova che i tag renderizzati siano presenti né che corrispondano al codice destinato a staging.

**Rimedio:** nel candidato di release pubblicare immagini attraverso il processo autorizzato e fissare API/Web/PostgreSQL a digest `sha256` verificati; controllare che migration e API usino la medesima immagine API prevista. Non è stato effettuato alcun push GHCR.

### INFRA-R2-04 — root aggregator può bypassare la sequenza fail-closed

**Gravità: P2 — rischio operativo controllabile con runbook, ma gate non imposto tecnicamente.**
**Tipo:** bypass staticamente riproducibile; nessuna risorsa applicata. **Owner:** Infra.

`deploy/staging/kustomization.yaml` aggrega `01-bootstrap`, `02-migration`, `03-apps` e `04-routing` in un unico render. Applicare `kubectl apply -k deploy/staging` applicherebbe quindi anche apps e HTTPRoute senza attendere il Job di migrazione. Il commento dice che l'aggregatore serve per rendering/validazione statica, ma Kustomize non impedisce l'`apply`; il runbook descrive correttamente gli stadi e lo script usa le directory singole.

**Rimedio:** eliminare il root aggregator applicabile o renderlo non ambiguo/non utilizzabile per deploy; documentare come unico entrypoint supportato lo script staged e aggiungere un controllo CI che impedisca regressioni della struttura.

### INFRA-R2-05 — invocazioni concorrenti/interrotte possono cancellare il Job attivo

**Gravità: P2 — rischio di affidabilità del rollout; nessun danno dati riprodotto.**
**Tipo:** rischio da flusso statico; test cluster concorrente non eseguito. **Owner:** Infra.

Lo script fa `kubectl delete job myteam-platform-migrate --ignore-not-found` seguito da `apply` dello stesso nome ogni volta. Una seconda invocazione mentre la prima migrazione è attiva può cancellare il Job/pod della prima, provocandone il fallimento e avviando un nuovo Job; un'interruzione tra delete/apply/wait lascia una procedura incompleta da rilanciare. Nel Core incluso la migrazione usa advisory lock PostgreSQL e transazione per ciascun file, che mitigano l'esecuzione concorrente e il partial apply del singolo file, ma non coordinano i processi di deploy né impediscono che un runner cancelli il Job dell'altro.

**Rimedio:** serializzare per ambiente con Kubernetes Lease o lock equivalente (e una policy di CI concurrency); non cancellare un Job attivo; distinguere Job completato/fallito e generare un nome/versione deterministico per tentativo. Testare due invocazioni, timeout e interruzione usando cluster effimero prima del rollout operativo.

### INFRA-R2-06 — vecchio traffico/API può restare attivo durante le migrazioni

**Gravità: P2 — condizione di compatibilità da verificare a ogni release.**
**Tipo:** comportamento derivato dall'ordine risorse; impatto di una migrazione incompatibile non testato. **Owner:** Core + Infra.

La sequenza esegue bootstrap, migrazione DB, poi aggiorna Deployment API/Web e applica il nuovo routing. Se il cluster ha già una HTTPRoute, essa non viene rimossa prima della migrazione e i vecchi pod possono continuare a servire richieste mentre lo schema evolve. La separazione degli stadi garantisce che le nuove app non vengano applicate prima del Job, ma non crea una finestra senza traffico e non impone migrazioni expand/contract retrocompatibili.

**Rimedio:** per ogni migration verificare compatibilità sia con la versione API già in esecuzione sia con quella nuova; preferire expand/contract. Per cambi non retrocompatibili, pianificare e approvare una finestra di manutenzione/drain. Il codice corrente del migration runner transaziona ogni file, ma ciò non rende compatibile una migration con una vecchia app.

### INFRA-R2-07 — egress HTTPS API ampio

**Gravità: P2 — rischio residuo dichiarato, non mitigazione implementata.**
**Tipo:** configurazione verificata; enforcement del CNI non eseguito. **Owner:** Infra/Security.

La NetworkPolicy consente al pod API egress TCP 443 verso `0.0.0.0/0`; DNS è consentito. Ciò permette HTTPS verso qualsiasi IPv4, non soltanto Logto. La documentazione riconosce il limite delle NetworkPolicy standard senza filtri FQDN e la natura dinamica/Anycast del provider; i security context riducono l'impatto ma non restringono le destinazioni. Non è stato verificato che il CNI del cluster applichi effettivamente le policy.

**Rimedio:** mantenere il rischio esplicito e mitigato con egress proxy/CNI con policy FQDN o destinazioni IP controllate; testare da pod di staging che DNS, PostgreSQL e Logto funzionino e destinazioni non autorizzate siano negate.

### INFRA-R2-08 — restore solo logicamente isolato e non provato

**Gravità: P2 — gap di disaster recovery; non blocca da solo il packaging.**
**Tipo:** limite documentale/di verifica, nessuna restore prova. **Owner:** Infra/Operations.

Il runbook vieta correttamente restore distruttivi in-place e descrive il ripristino in un database separato `myteam_restore_test`. L'esempio crea quel database nello stesso StatefulSet/istanza PostgreSQL staging: è isolamento logico dal DB attivo, non isolamento di host/volume/failure domain. Non è definita o testata la provenienza di `backup.dump`; nessun backup automatico è dichiarato, coerentemente con il vincolo di non aggiungere backup pesanti.

**Rimedio:** prima di dichiarare operativo il DR, ottenere dall'owner destinazione/volume esterno, backup valido e procedura su istanza/volume separato; provare integrità e commutazione controllata senza alterare il DB live.

### INFRA-R2-09 — whitespace nel workflow

**Gravità: P3.** Due righe vuote con spazi nel workflow causano il fallimento di `git diff --check` sul delta del target (linee 102 e 106). Correzione circoscritta Infra.

## Immagini, pod e routing

Rendering del root: API `ghcr.io/simogatti04/myteam-platform-api:20261031-22d23d5`; Web `ghcr.io/simogatti04/myteam-platform-web:20261031-22d23d5`; migration usa la stessa API tag; PostgreSQL `postgres:16-alpine`. Il Service API espone 3000, Web Service 80 verso `targetPort` 8080; HTTPRoute inoltra API 3000 e Web 80. La probe manifest usa `/health` per startup/liveness e `/ready` per readiness. Il render locale conferma sintassi/trasformazioni, non risoluzione DNS/immagine del registry, scheduling, PV o CNI.

Il PV è `Retain`, `ReadWriteOnce`, path local `/srv/myteam-platform-staging/postgres`, con node affinity `servergatti`; il runbook non prova disponibilità, permessi o backup di tale volume. Il manifest Postgres usa PostgreSQL 16 e UID/GID non-root dichiarati; la corrispondenza del volume al nodo e i permessi reali non sono stati provati.

## Gate e prove aggiuntive richieste sul candidato integrato

1. Costruire il candidato I4 da SHA Core e Infra espliciti; controllare che `/ready` risponda realmente e che il pool non sia assente, senza confondere DB ping con schema migration.
2. Pubblicare/risolvere digest immutabili esatti per API/Web/PG; verificare che il digest della migration sia quello stesso Core atteso.
3. Eseguire `deploy-stage.sh` su cluster K3s/clone autorizzato: errori ExternalSecret, Postgres, `pg_isready`, migration SQL, timeout Job; attestare che non vengano applicati gli stadi successivi.
4. Testare rerun successivo, due runner simultanei, kill/interruzione dopo ogni stadio e recupero senza cancellare un Job attivo.
5. Provare migration sotto vecchi pod e HTTPRoute attivo; validare retrocompatibilità e rollback applicativo.
6. Eseguire test funzionale sulla Web image prod: login admin, assenza JWT manuale e DEMO, UI pubblica senza bozza; il gate attuale `grep || true` va sostituito.
7. Verificare su CNI reale regole DNS/Traefik/API/Postgres/HTTPS e negazione egress non autorizzato.
8. Provare restore su destinazione/volume separati scelti dall'owner, con backup sintetico/approvato e cleanup controllato.

## Stato Git e cleanup

Branch di lavoro `qa/infra-s1-r2-review`, inizialmente sul target esatto; nessun file applicativo o manifest Infra è stato modificato. Le sole risorse create per il rendering sono `/tmp/infra-s1-r2-rendered.yaml` e `/tmp/infra-s1-r2-kustomize.err`; non è stato creato alcuno schema o container locale. Il Docker socket non era accessibile. Il commit finale deve contenere soltanto questo rapporto e il worktree deve essere pulito dopo il commit. Nessun push o merge.
