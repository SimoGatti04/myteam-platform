# MYTEAM-PLATFORM — INFRA-S1: Packaging Production e Preparazione Staging K3s

**Data:** 31 Ottobre 2026
**Ruolo:** INFRA
**Branch:** `infra/s1-r2-staging-gates`
**Base Commit:** `22d23d54a49f4a8c479a9011ca823b745f7a52b3` (Checkpoint INFRA-S1)
**Riferimento QA:** Finding `INFRA-QA-01` .. `INFRA-QA-05` da `qa/infra-s1-r1-review`
**Stato:** REMEDIATION & CI INTEGRATION COMPLETATA — NO DEPLOY ESEGUITO

---

## 1. Rettifiche e Risoluzione Finding QA INFRA-S1-R1

A seguito della revisione indipendente QA (rapporto `CHECKPOINT-INFRA-S1-R1-REPORT.md`), le architetture, i manifest e i runbook sono stati aggiornati come segue:

| Finding QA | Descrizione Finding | Rischio / Impatto | Azione Correttiva INFRA-S1-R2 | Stato |
|---|---|---|---|---|
| **INFRA-QA-01 (P1)** | **Sequencing non gated delle migrazioni:** Kustomize monolitico applicava DB, migrazioni, API, Web e HTTPRoute in un unico comando senza dipendenze d'ordine garantite. | Traffico web/API instradato verso un database non migrato o schema non pronto. | **Separazione a 4 stadi Kustomize indipendenti** (`01-bootstrap`, `02-migration`, `03-apps`, `04-routing`) e creazione di `deploy-stage.sh` con gate fail-closed: il Job di migrazione deve completare con successo prima di qualsiasi rollout applicativo. | **RISOLTO** |
| **INFRA-QA-02 (P1)** | **Readiness API non verifica PostgreSQL:** Le probe API puntavano a `/health` (liveness lightweight) anziché validare la reale connettività al database. | Pod API marcato Ready da Kubernetes anche in assenza di pool DB o connessione. | **Predisposto path `/ready`** nella `readinessProbe` del Deployment API (`deploy/staging/03-apps/api.yaml`). Mantenuto `/health` per `livenessProbe` e `startupProbe`. Dipendenza applicativa tracciata sul branch `core/readiness-r1`. | **PREDISPOSTO / DEPENDENCY TRACKED** |
| **INFRA-QA-03 (P2)** | **Egress HTTPS API non limitato:** Regola di egress API permetteva `0.0.0.0/0:443`. | Potenziale compromissione o chiamate non vincolate in uscita dal pod API. | **Verifica CNI e mitigazione:** Il CNI k3s dell'homelab (Flannel / standard NetworkPolicy v1) non supporta filtri FQDN. È stata documentata l'analisi di compatibilità con Logto e Cloudflare. Documentato rischio residuo e predisposizione per egress-proxy/FQDN appena disponibile. | **RISOLTO / DOCUMENTATO** |
| **INFRA-QA-04 (P2)** | **Tag mutabile `staging-latest`:** Possibilità di cache stale sui nodi worker e non-riproducibilità dei rilasci. | Versioni eterogenee o non allineate in esecuzione tra nodi del cluster. | **Kustomize Image Mapping Immutabile:** Introdotto blocco `images:` in Kustomize per mappare le immagini su tag immutabili `YYYYMMDD-<shortsha>` o digest SHA256 esatti (`deploy/staging/02-migration` e `03-apps`). | **RISOLTO** |
| **INFRA-QA-05 (P1)** | **Restore ordinario distruttivo sul database attivo:** Runbook proponeva `pg_restore --clean --if-exists` direttamente sul target. | Rischio di cancellazione accidentale o perdita irreversibile dei dati di produzione/staging. | **Eliminato restore distruttivo ordinario:** Distinzione netta tra rollback applicativo (immediato via `rollout undo`), rollback schema forward (fix forward) e procedura straordinaria di disaster recovery isolata su database/volume separato autorizzata esplicitamente dall'owner. | **RISOLTO** |

---

## 2. Packaging Applicativo dei Container

I file di build in `deploy/docker/` sono stati testati e convalidati:

### 2.1 API Core (`deploy/docker/Dockerfile.api`)
- **Base image:** Multi-stage `node:26-alpine`.
- **Builder stage:** Installa `pnpm@10.32.1`, copia manifest e lockfile, esegue `pnpm install --frozen-lockfile`, compila i package TypeScript `@myteam/contracts` e `@myteam/api`, e isola le dipendenze di produzione tramite `pnpm --filter @myteam/api --prod --legacy deploy /app/pruned-api`.
- **Runner stage:** Immagine minimale Alpine, esecuzione con utente non-root `node` (UID 1000, GID 1000). Copia solo il JavaScript compilato in `dist/`, le dipendenze runtime potate e `db/migrations/`.
- **Comando avvio:** `node apps/api/dist/index.js` (nessun tsx o compilatore a runtime).
- **Comando migrazioni:** `node apps/api/dist/persistence/migrate-cli.js`.

### 2.2 Web Frontend (`deploy/docker/Dockerfile.web` & `deploy/docker/nginx.conf`)
- **Base image:** Multi-stage `node:26-alpine` (builder) + `nginx:1.27-alpine-slim` (runner).
- **Parametri Build (ARG/ENV):**
  - `VITE_APP_ENV`: impostato tassativamente a `production` per la build di staging/produzione esposta (disabilita form JWT manuale e modalità demo).
  - `VITE_ENABLE_DEMO`: `false`.
  - `VITE_LOGTO_ENDPOINT`: `https://auth.simogatti.it/oidc`.
  - `VITE_LOGTO_APP_ID`: Client ID SPA rilasciato da Logto.
  - `VITE_LOGTO_API_RESOURCE`: `https://team-staging.simogatti.it/api`.
  - `VITE_LOGTO_SCOPES`: `openid profile platform:admin`.
  - `VITE_LOGTO_REDIRECT_URI`: `https://team-staging.simogatti.it/callback`.
  - `VITE_LOGTO_POST_LOGOUT_REDIRECT_URI`: `https://team-staging.simogatti.it`.
- **Nginx non-root (`deploy/docker/nginx.conf`):**
  - Esecuzione come utente non-root `nginx` (UID 101, GID 101) in ascolto sulla porta `8080`.
  - Fallback SPA `try_files $uri $uri/ /index.html` per supportare il router React su percorsi deep link.
  - Policy di caching: `Cache-Control: no-cache, no-store, must-revalidate` su `/index.html` e `Cache-Control: public, max-age=31536000, immutable` su `/assets/*`.
  - Header di sicurezza: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 3. Struttura Manifest Kubernetes a Stadi (`deploy/staging/`)

Per garantire un deployment ordinato, riproducibile e fail-closed, i manifest sono suddivisi in 4 stadi Kustomize progressivi:

1. **`01-bootstrap/`**:
   - `namespace.yaml`: Namespace dedicato `myteam-platform-staging` con label `simogatti.io/ghcr-pull: "true"`.
   - `storage.yaml`: `PersistentVolume` locale su `servergatti` (`/srv/myteam-platform-staging/postgres`) con `reclaimPolicy: Retain`, e `PersistentVolumeClaim` da 20Gi.
   - `external-secret.yaml`: Sincronizzazione secret da Infisical (`ClusterSecretStore/infisical-cluster-store`) su percorso `/myteam-platform/staging/*`.
   - `postgres.yaml`: StatefulSet singolo nodo `postgres:16-alpine`, UID/GID 70, probe `pg_isready`, Service ClusterIP `myteam-platform-postgres:5432`.
   - `network-policy.yaml`: Default-deny, ingress Traefik verso Web/API, egress API/Job verso PostgreSQL, egress DNS kube-system, ed egress HTTPS verso Logto OIDC.
2. **`02-migration/`**:
   - `migration-job.yaml`: Job Kubernetes che esegue `node apps/api/dist/persistence/migrate-cli.js`. Utilizza tag immutabili dichiarati in `kustomization.yaml`.
3. **`03-apps/`**:
   - `api.yaml`: Deployment stateless (1 replica) di `@myteam/api` con securityContext non-root (UID 1000), readOnlyRootFilesystem, liveness probe su `/health` e readiness probe su `/ready`. Service ClusterIP su porta 3000.
   - `web.yaml`: Deployment stateless (1 replica) di `@myteam/web` con Nginx non-root (UID 101), readOnlyRootFilesystem con `/tmp` emptyDir, probe su `/index.html` e Service ClusterIP su porta 80 (target 8080).
4. **`04-routing/`**:
   - `httproute.yaml`: Traefik Gateway API `HTTPRoute` per `team-staging.simogatti.it`. Instrada `/api` e `/health` su `myteam-platform-api:3000` e `/` su `myteam-platform-web:80`.
5. **`kustomization.yaml` (root staging):**
   - Raccoglie i 4 stadi per la validazione client e il rendering complessivo.

---

## 4. Runbook Operativo di Staging: Deploy Ordinato, Rollback e Disaster Recovery

### 4.1 Sequenza di Deploy Fail-Closed (`deploy/staging/deploy-stage.sh`)
Il deployment deve avvenire eseguendo lo script ordinato o i comandi corrispondenti dalla control-station `servergatti2`:

```bash
# 1. Applicazione Bootstrap
kubectl apply -k deploy/staging/01-bootstrap

# 2. Attesa sincronizzazione Secret e disponibilità Database
kubectl -n myteam-platform-staging wait --for=condition=Ready externalsecret/myteam-platform-secrets --timeout=120s
kubectl -n myteam-platform-staging rollout status statefulset/myteam-platform-postgres --timeout=180s

# 3. Esecuzione Job Migrazioni (FAIL-CLOSED GATE)
kubectl -n myteam-platform-staging delete job myteam-platform-migrate --ignore-not-found
kubectl apply -k deploy/staging/02-migration
kubectl -n myteam-platform-staging wait --for=condition=complete job/myteam-platform-migrate --timeout=180s

# SE IL JOB FALLISCE: Interrompere immediatamente il rollout. Non applicare 03-apps né 04-routing.

# 4. Rollout Applicativo (solo se migrazioni OK)
kubectl apply -k deploy/staging/03-apps
kubectl -n myteam-platform-staging rollout status deployment/myteam-platform-api --timeout=180s
kubectl -n myteam-platform-staging rollout status deployment/myteam-platform-web --timeout=180s

# 5. Routing e Apertura Traffico
kubectl apply -k deploy/staging/04-routing
```

### 4.2 Strategia di Rollback e Ripristino Dati (No In-Place Destruction)
1. **Rollback Applicativo (Standard):**
   In caso di bug applicativo a schema invariato o retrocompatibile:
   ```bash
   kubectl -n myteam-platform-staging rollout undo deployment/myteam-platform-api
   kubectl -n myteam-platform-staging rollout undo deployment/myteam-platform-web
   ```
2. **Rollback Schema / Migrazioni Fallite:**
   - **Regola primaria:** I rollback a caldo tramite drop di colonne o restore distruttivo sul database attivo sono vietati. Si applicano modifiche correttive *forward* (`0002-fix-*.sql`).
3. **Disaster Recovery Straordinario (Ripristino Isolato):**
   Se si rende necessario ripristinare un backup precedente a causa di corruzione grave:
   - **Non sovrascrivere mai il database attivo.**
   - Creare un database/schema temporaneo isolato (es. `myteam_restore_test`):
     ```bash
     kubectl -n myteam-platform-staging exec statefulset/myteam-platform-postgres -- \
       createdb -U myteam_app myteam_restore_test
     cat backup.dump | kubectl -n myteam-platform-staging exec -i statefulset/myteam-platform-postgres -- \
       pg_restore -U myteam_app -d myteam_restore_test -v
     ```
   - Validare l'integrità dei dati ripristinati su tale istanza isolata.
   - Solo previa autorizzazione esplicita dell'owner, procedere alla commutazione (`ALTER DATABASE ... RENAME TO ...`) con downtime controllato e le API scalate a 0 repliche.

---

## 5. Verifica CI GitHub Actions (`.github/workflows/docker-ci.yml`)

È stato integrato un workflow GitHub Actions dedicato per collaudare l'intero ciclo container e staging smoke:
- **Build Dockerfile.api** in ambiente Linux x86_64 runner.
- **Build Dockerfile.web** con argomenti di produzione (`VITE_APP_ENV=production`, `VITE_ENABLE_DEMO=false`).
- **Verifica Non-Root:** API UID `1000`, Web UID `101`.
- **Verifica Artefatti:** Presenza di `apps/api/dist/index.js`, `apps/api/dist/persistence/migrate-cli.js` e `db/migrations/*.sql`.
- **Esecuzione Migrazioni:** Esecuzione del runner migrazioni su service container `postgres:16-alpine` effimero.
- **Smoke API:** Avvio container API e verifica HTTP 200 su `/health`.
- **Smoke Web:** Avvio container Web e verifica HTTP 200, header `Cache-Control: no-cache` su root/SPA fallback (`/teams/slug`) e `Cache-Control: public, max-age=31536000, immutable` su file statici JS/CSS.
- **Verifica Esclusione Auth Manuale / Demo:** Accertamento che il frontend compilato non contenga form manuale o demo mock esposti.

---

## 6. Dipendenze Ancora Necessarie

1. **Core:** Implementazione e merge dell'endpoint `/ready` (in lavorazione sul branch `core/readiness-r1`) per completare il gate di readiness DB.
2. **Logto:** Registrazione API Resource (`https://team-staging.simogatti.it/api`, scope `platform:admin`) e registrazione SPA client su `auth.simogatti.it` per ricavare il `VITE_LOGTO_APP_ID` reale prima del deploy su K3s.
3. **Infrastruttura Host:** Creazione della directory `/srv/myteam-platform-staging/postgres` con UID/GID `70:70` su `servergatti` e popolamento chiavi Infisical `/myteam-platform/staging/*`.
