# QA INFRA-S1-R1 — Container, manifest e sicurezza staging

**Data verifica:** 31 ottobre 2026
**Repository:** `SimoGatti04/myteam-platform`
**Target Infra:** `origin/infra/s1-staging-preparation` @ `22d23d54a49f4a8c479a9011ca823b745f7a52b3`
**Base applicativa I3:** `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`
**Branch QA:** `qa/infra-s1-r1-review` (derivato dal target; commit QA locale riportato nel checkpoint)
**Ambiente:** macOS arm64; Docker CLI 29.8.2, contesto OrbStack senza accesso al socket; `kubectl` disponibile. Nessun accesso al cluster live, nessun segreto o database di staging usato.

## Sintesi

Revisione indipendente prevalentemente statica. Il rendering Kustomize è stato eseguito con successo. Non è stata eseguita alcuna Docker build, migrazione su PostgreSQL 16, esecuzione del container, smoke HTTP o prova di scheduling Kubernetes. Queste verifiche sono **NOT RUN**, non PASS. Il target è il commit Infra indicato e il suo parent diretto è I3.

## Matrice dei controlli

| Area | Esito | Evidenza / limite |
|---|---|---|
| Identità Git e base | PASS | HEAD `22d23d54a49f4a8c479a9011ca823b745f7a52b3`; parent diretto `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`; ancestry verificata. Branch QA creato nel worktree isolato. |
| Docker build API effettiva | NOT RUN | `docker version` mostra client 29.8.2, ma daemon OrbStack risponde `permission denied while trying to connect to the Docker API at unix:///Users/gatti/.orbstack/run/docker.sock`. Nessuna build simulata. |
| Docker build Web effettiva | NOT RUN | Stesso blocco daemon. |
| Installazione Node/pnpm per build fuori Docker | NOT RUN | `node`, `corepack` e `pnpm` non sono disponibili nel PATH del runner corrente; `node_modules` non presente. |
| Kustomize render | PASS | `kubectl kustomize deploy/staging` completa con exit code 0; render di 19 risorse con exit code 0; output salvato solo in `/tmp/qa-infra-s1-render.yaml`, non incluso nel commit. |
| Validazione API server/schema Kubernetes | NOT RUN | Non è stato contattato alcun API server, in particolare non il cluster K3s; il render client non certifica l'accettazione da parte del cluster. |
| Coerenza statica manifest | PASS con riserve | Resource names/namespace e selector esaminati; PV locale Retain, PVC 20Gi, node affinity `servergatti`, PostgreSQL Alpine e UID/GID dichiarato 70. Non verificati sul nodo o volume effettivi. |
| Ordine DB → migration → API/Web/route | FAIL (finding INFRA-QA-01) | Un unico Kustomize include StatefulSet, Job migrazione, Deployment API/Web e HTTPRoute; non c'è un gate/ordinamento applicativo esplicito. Applicazione delle risorse non attende il completamento del Job. |
| Readiness DB | FAIL (gap documentato INFRA-QA-02) | Probe API puntano tutte a `/health`, endpoint documentato come liveness senza controllo PostgreSQL. Un'API può risultare Ready senza DB/migrazioni. |
| NetworkPolicy egress Logto | FAIL (finding INFRA-QA-03) | Regola API consente egress HTTPS verso `0.0.0.0/0:443`; non limita l'uscita alla destinazione Logto. Valutare DNS e policy compatibile col provider senza bloccare ESO o servizi necessari. |
| Immagini riproducibili | FAIL (finding INFRA-QA-04) | Deployment e migration Job usano tag mutabile `staging-latest` con `IfNotPresent`; un nodo può usare cache stale, rendendo non deterministico il rilascio. |
| Runbook rollback/restore | FAIL (finding INFRA-QA-05) | Procedura di restore usa `pg_restore --clean --if-exists` sul DB target. È distruttiva sul target e non equivale a ripristino isolato su volume esterno scelto dall'owner. Nessun restore è stato eseguito. |
| Backup automatico pesante / modifica dati esistenti | NOT RUN / nessuna modifica | Revisione file e comandi; non avviati backup, restore, volumi o servizi. Nessuna risorsa persistente è stata toccata. |
| Readiness/avvio runtime container e smoke HTTP | NOT RUN | Richiede immagine e daemon Docker funzionanti. |
| PostgreSQL 16 effimero + migrazioni | NOT RUN | Nessun container Postgres effimero autorizzato/eseguibile nell'ambiente corrente. |
| Nginx non-root, porta 8080, fallback/cache | PASS statico / runtime NOT RUN | Dockerfile/config dichiarano immagine nginx non-root e listener `8080`; SPA e cache sono configurati nel file nginx. Non provato l'avvio effettivo né il comportamento HTTP. |
| DEMO/JWT manuale nel bundle production | NOT RUN | Dockerfile imposta `VITE_APP_ENV=production` e `VITE_ENABLE_DEMO=false`, ma nessun bundle/immagine è stato costruito o ispezionato. |
| Segreti nel bundle | NOT RUN | Nessun bundle generato. I manifest fanno riferimento a ExternalSecret; nessun valore segreto è stato letto. |
| Sequenza routing prima della readiness | FAIL (finding INFRA-QA-01) | HTTPRoute è incluso nello stesso render e non dipende da Job completato o readiness DB. La creazione route non è subordinata al completamento delle migrazioni. |
| Staging operativo / K3s | NOT RUN | Per vincolo non si è connessi al cluster live e non si è eseguito deploy. |

## Finding

### INFRA-QA-01 — Avvio e pubblicazione non gated dalle migrazioni (P1, Infra)

**Tipo:** rischio di deployment riproducibile dalla struttura dichiarativa; non è stato osservato su cluster.
**Evidenza:** `deploy/staging/kustomization.yaml` include Postgres, migration Job, API, Web e HTTPRoute nello stesso set. La semantica Kustomize rende risorse, non un workflow con dipendenze o attesa Job; i Deployment/route possono essere riconciliati mentre migrazione è ancora in corso o fallita. Le probe API usano inoltre `/health` (vedi INFRA-QA-02).
**Impatto:** accesso a endpoint prima dello schema aggiornato, errori intermittenti e falso stato di disponibilità.
**Raccomandazione:** sequenziare i rollout con pipeline/job gate esplicito: DB healthy → migration Job completato con verifica → API/Web → route; fallire il rollout se il Job non termina con successo. Non affidarsi all'ordine YAML.

### INFRA-QA-02 — Readiness API non verifica dipendenza PostgreSQL (P1, Infra/Core)

**Tipo:** gap di disponibilità noto nei documenti e confermato staticamente.
**Evidenza:** `deploy/staging/api.yaml` usa `/health` per startup, liveness e readiness; `docs/infra/INFRA-S1-PREFLIGHT.md` specifica che `/health` è lightweight e non verifica il pool DB.
**Impatto:** Kubernetes può instradare traffico a un'API senza connessione DB o con migrazioni non applicate.
**Raccomandazione:** endpoint di readiness distinto che verifica dipendenze richieste e schema; lasciare liveness indipendente dal DB per evitare restart storm. Coordinare eventuali endpoint applicativi con Core.

### INFRA-QA-03 — Egress HTTPS API non limitato (P2, Infra/Core)

**Tipo:** configurazione permissiva dimostrata dal manifest; impatto dipende dall'uso delle richieste in uscita.
**Evidenza:** `deploy/staging/network-policy.yaml` consente API → `0.0.0.0/0`, TCP 443.
**Impatto:** compromissione SSRF/exfiltrazione o accesso a servizi HTTPS arbitrari dal pod; non è stato effettuato alcun tentativo di rete.
**Raccomandazione:** limitare l'egress ai servizi necessari; se Logto richiede IP dinamici, definire una strategia controllata (egress gateway/proxy o policy DNS-aware supportata dalla CNI), documentando il compromesso. Verificare anche DNS, Postgres, ESO e flusso migration secondo selectors reali.

### INFRA-QA-04 — Tag immutabili non garantiti per API/Web (P2, Infra)

**Tipo:** rischio riproducibile dalla configurazione, non testato su registry.
**Evidenza:** `staging-latest` insieme a `imagePullPolicy: IfNotPresent` nei manifest API/Web e migration.
**Impatto:** rollout non riproducibile e nodi diversi possono eseguire digest differenti o immagini cache.
**Raccomandazione:** pubblicare e distribuire per digest SHA; mantenere tag leggibili solo come metadato.

### INFRA-QA-05 — Restore ordinario sul target è distruttivo/non isolato (P1, Infra)

**Tipo:** discrepanza rispetto al requisito di ripristino isolato.
**Evidenza:** procedura documentata nel preflight/runbook usa `pg_restore --clean --if-exists` sul database destinazione; il flag rimuove oggetti prima del restore. Nessun comando è stato eseguito.
**Impatto:** perdita/sostituzione di dati del database target se usato come rollback ordinario o se il backup è errato.
**Raccomandazione:** restore in database/schema/volume isolato, con validazione e decisione esplicita dell'owner sul volume esterno; promozione/switch separata e recuperabile. Non usare restore distruttivo come rollback standard.

## Controlli statici positivi e limiti

- `kubectl kustomize deploy/staging`: render client riuscito.
- `deploy/docker/Dockerfile.api` dichiara build multi-stage, deploy pruning pnpm, entrypoint `node apps/api/dist/index.js`, CLI migrazioni compilata e copia `db/migrations` in `/app/db/migrations`; **nessuno di questi artefatti è stato verificato dentro un'immagine**. Dipendenza accidentale da `tsx` e risoluzione runtime dei moduli: NOT RUN.
- `deploy/docker/Dockerfile.web` dichiara build production Vite, argomenti DEMO disabilitati e immagine Nginx separata; bundle production non ispezionato.
- Config Nginx imposta listener 8080 e regole di caching per `index.html` e asset hash; fallback SPA e risposta effettiva non collaudati.
- PV/PVC dichiarano `Retain`, volume locale 20Gi e affinity al nodo `servergatti`; permessi filesystem, capacità reale e UID/GID del volume sono NOT RUN.
- La NetworkPolicy è stata letta staticamente, ma non si è simulata la CNI né dimostrata connettività/blocco effettivi per Traefik, DNS, DB, migration, ESO e Logto.

## Comandi ed evidenze riproducibili

Dal root del checkout esatto `22d23d54a49f4a8c479a9011ca823b745f7a52b3`:

```sh
kubectl kustomize deploy/staging > /tmp/qa-infra-s1-render.yaml
# exit 0; render completato

docker version
# CLI disponibile (29.8.2), daemon non accessibile:
# permission denied while trying to connect to the Docker API at
# unix:///Users/gatti/.orbstack/run/docker.sock

for b in node corepack pnpm; do command -v "$b" || echo "$b NOT_FOUND"; done
# node, corepack e pnpm: NOT_FOUND nel PATH del runner
```

Non sono stati eseguiti `docker build`, `pnpm deploy`, migration job, smoke HTTP, `kubectl apply`, né comandi sul database/cluster. Nessun test è stato trasformato in PASS per inferenza.

## Gate e verdetto

| Gate | Verdetto |
|---|---|
| Packaging container | NOT VERIFIED — build Docker bloccata dal daemon; controlli Dockerfile solo statici |
| Manifest | GO CON RISERVE — render Kustomize PASS, ma nessuna validazione API server/scheduling |
| Sicurezza e disponibilità staging | NO-GO fino a risoluzione/accettazione esplicita dei finding P1; egress permissivo da ridurre o motivare |
| Staging operativo | NOT RUN |

**Verdetto complessivo: INFRA-S1 QUALITY GO CON RISERVE.** La qualità statica del pacchetto/manifests non certifica che immagini siano buildabili, migrazioni eseguibili o staging operativo. Non è autorizzato né dichiarato alcun deploy.

## Stato Git e cleanup

- Base testata esatta: `22d23d54a49f4a8c479a9011ca823b745f7a52b3`; parent I3: `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`.
- Branch: `qa/infra-s1-r1-review`, worktree isolato `/Users/gatti/.codex/worktrees/qa-infra-s1-r1/myteam-platform`.
- Nessun file Core/Web/iOS o configurazione di produzione modificato.
- Nessun container, schema, volume, database, servizio o risorsa Kubernetes creati/modificati. File render temporaneo in `/tmp/qa-infra-s1-render.yaml`.
- Commit QA locale: da valorizzare dopo il commit del solo report.
