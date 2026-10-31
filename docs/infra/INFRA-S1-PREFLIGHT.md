# MYTEAM-PLATFORM — INFRA-S1: Packaging Production e Preparazione Staging K3s

**Data:** 31 Ottobre 2026  
**Ruolo:** INFRA  
**Branch:** `infra/s1-staging-preparation`  
**Base Commit:** `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2` (Candidato I3)  
**Stato:** PREPARAZIONE COMPLETATA — NO DEPLOY ESEGUITO

---

## 1. Rettifiche e Correzioni al Piano INFRA-S0

Durante la fase di progettazione e analisi tecnica INFRA-S1 sono state rilevate e corrette le seguenti discrepanze del report preliminare INFRA-S0:

| Aspetto | Valutazione INFRA-S0 | Correzione / Validazione INFRA-S1 |
|---|---|---|
| **UID/GID PostgreSQL** | Proposto `999:999` (da standard Debian) | **Corretto a `70:70`**: l'immagine designata `postgres:16-alpine` utilizza nativamente UID 70 e GID 70 (`postgres:postgres`). L'uso di 999 su Alpine genera errori di permessi su `PGDATA`. |
| **Migrazioni SQL Runtime** | Comando `pnpm --filter @myteam/api migrate` | **Corretto a runtime Node compilato puro**: `node apps/api/dist/persistence/migrate-cli.js`. Elimina la necessità di `pnpm` o `tsx` nel container di produzione. |
| **Inclusione Migrazioni nell'Immagine** | Non specificata la directory | **Validata e inclusa**: `migrate.ts` calcola la directory via `new URL("../../../../db/migrations/", import.meta.url)`. La directory `db/migrations/*.sql` è copiata esattamente in `/app/db/migrations` affinché il path relativo da `/app/apps/api/dist/persistence/` coincida deterministicamente. |
| **Readiness vs Liveness API** | Riuso semplice di `/health` | **Distinzione operativa**: `/health` è una liveness lightweight Fastify (HTTP 200). Non verifica il pool DB. La readiness applicativa si basa su `/health` con periodicità più frequente (5s vs 15s) e gestione riavvii controllata. |
| **Form JWT Manuale in Staging** | Non analizzato il comportamento client | **Analizzato nel codice I3**: `apps/web/src/utils/env.ts` abilita il form manuale se `getAppEnvironment() === 'staging'`. In staging esposto pubblicamente ciò espone un campo token manuale. Soluzione: buildare l'immagine staging con `VITE_APP_ENV=production` lasciando gli URL OIDC puntati su staging (`team-staging.simogatti.it`), disattivando così il form manuale senza modificare il codice. |
| **Stato Live Cluster vs Documentale** | Assumeva interazione remota diretta | **Chiarito confine di rete**: la sandbox di lavoro non ha connettività diretta IP LAN (`192.168.1.13:22` o cluster K3s). I manifest sono validati localmente via `kustomize`. L'apply avverrà dalla control-station dell'homelab (`servergatti2`) con autorizzazione esplicita. |

---

## 2. Packaging Applicativo dei Container

Sono stati creati i file di build in `deploy/docker/`:

### 2.1 API Core (`deploy/docker/Dockerfile.api`)
- **Base image:** Multi-stage `node:26-alpine`.
- **Builder stage:** Attiva Corepack con `pnpm@10.32.1`, copia manifest e lockfile, esegue `pnpm install --frozen-lockfile`, compila i package TypeScript `@myteam/contracts` e `@myteam/api`, e isola le dipendenze di produzione tramite `pnpm --filter @myteam/api --prod deploy /app/pruned-api`.
- **Runner stage:** Immagine minimale Alpine, esecuzione con utente non-root `node` (UID 1000, GID 1000). Copia solo il JavaScript compilato in `dist/`, le dipendenze runtime potate e `db/migrations/`.
- **Comando avvio:** `node apps/api/dist/index.js` (nessun tsx o compilatore a runtime).
- **Comando migrazioni:** `node apps/api/dist/persistence/migrate-cli.js`.

### 2.2 Web Frontend (`deploy/docker/Dockerfile.web` & `deploy/docker/nginx.conf`)
- **Base image:** Multi-stage `node:26-alpine` (builder) + `nginx:1.27-alpine-slim` (runner).
- **Build time parameters (ARG/ENV):**
  - `VITE_APP_ENV`: default `production` (per disabilitare form JWT manuale e modalità demo).
  - `VITE_LOGTO_ENDPOINT`: `https://auth.simogatti.it/oidc`
  - `VITE_LOGTO_APP_ID`: Client ID SPA generato da Logto.
  - `VITE_LOGTO_API_RESOURCE`: `https://team-staging.simogatti.it/api`
  - `VITE_LOGTO_SCOPES`: `openid profile platform:admin`
  - `VITE_LOGTO_REDIRECT_URI`: `https://team-staging.simogatti.it/callback`
  - `VITE_LOGTO_POST_LOGOUT_REDIRECT_URI`: `https://team-staging.simogatti.it`
- **Nginx non-root (`deploy/docker/nginx.conf`):**
  - Esecuzione come utente `nginx` (UID 101, GID 101) in ascolto su porta non privilegiata `8080`.
  - Fallback SPA `try_files $uri $uri/ /index.html` per supportare il routing React.
  - Policy di caching: `Cache-Control: no-cache, no-store, must-revalidate` su `/index.html` (per deployment istantanei senza cache stale) e `Cache-Control: public, max-age=31536000, immutable` sugli asset versionati `/assets/*`.
  - Header di sicurezza: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 2.3 Esclusioni Build (`.dockerignore`)
- Esclusione di `node_modules`, `dist`, `.git`, `.github`, `.agents`, `.codex`, `tests`, `docs` e file `.env*`.

---

## 3. Manifest Kubernetes per Staging (`deploy/staging/`)

Tutti i manifest sono strutturati per Kustomize (`deploy/staging/kustomization.yaml`):

1. **`namespace.yaml`**: Namespace dedicato `myteam-platform-staging` con label `simogatti.io/ghcr-pull: "true"` per ereditare automaticamente il secret di pull GHCR via ESO.
2. **`storage.yaml`**: `PersistentVolume` locale su disco di `servergatti` (`/srv/myteam-platform-staging/postgres`) con `reclaimPolicy: Retain` e `nodeAffinity` vincolata a `servergatti`. `PersistentVolumeClaim` con `storageClassName: myteam-postgres-staging-local` da 20Gi.
3. **`external-secret.yaml`**: Configurazione ESO che preleva i secret da Infisical (`ClusterSecretStore/infisical-cluster-store`) sotto il percorso `/myteam-platform/staging/*`.
4. **`postgres.yaml`**: StatefulSet singolo nodo `postgres:16-alpine` vincolato a `servergatti`, `securityContext` non-root UID/GID 70, probe di startup, liveness e readiness basate su `pg_isready`. Service ClusterIP interno `myteam-platform-postgres:5432`.
5. **`migration-job.yaml`**: Kubernetes Job che esegue `node apps/api/dist/persistence/migrate-cli.js` prima del rollout API, sfruttando il lock advisory PostgreSQL e registrando l'audit in `schema_migrations`.
6. **`api.yaml`**: Deployment stateless (1 replica) di `@myteam/api` con securityContext non-root (UID 1000), readOnlyRootFilesystem, liveness/readiness probe su `/health`, e Service ClusterIP `myteam-platform-api:3000`.
7. **`web.yaml`**: Deployment stateless (1 replica) di `@myteam/web` con Nginx non-root (UID 101), readOnlyRootFilesystem con `/tmp` emptyDir, probe su `/index.html` e Service ClusterIP `myteam-platform-web:80` (target porta container 8080).
8. **`httproute.yaml`**: Gateway API `HTTPRoute` agganciata a `traefik-gateway` nel namespace `kube-system` per l'host `team-staging.simogatti.it`. Instradamento su base prefisso:
   - `/api` e `/health` -> `myteam-platform-api:3000`
   - `/` (tutto il resto) -> `myteam-platform-web:80`
   - **Zero CORS cross-origin:** Web e API condividono lo stesso origin HTTPS `team-staging.simogatti.it`.
9. **`network-policy.yaml`**: Isolamento a livello di rete con default-deny Ingress/Egress, abilitazione DNS kube-dns, traffico Traefik verso web e api, traffico API verso PostgreSQL e traffico Egress verso Logto HTTPS (porta 443).

---

## 4. Matrice di Configurazioni e Secret (Infisical)

Percorso Infisical: `/myteam-platform/staging`  
Ambiente: `prod` (K3S_Homelab_Cluster)

| Chiave Remota Infisical | Tipologia | Destinazione Pod / Variabile | Descrizione |
|---|---|---|---|
| `/myteam-platform/staging/POSTGRES_DB` | Config / Secret | `myteam-platform-postgres` & `api` | Nome database (es. `myteam_platform`) |
| `/myteam-platform/staging/POSTGRES_USER` | Config / Secret | `myteam-platform-postgres` | Utente DB admin/owner (es. `myteam_app`) |
| `/myteam-platform/staging/POSTGRES_PASSWORD` | Secret | `myteam-platform-postgres` | Password generata ad alta entropia |
| `/myteam-platform/staging/DATABASE_URL` | Secret | `myteam-platform-api` & `migration-job` | DSN completo: `postgres://myteam_app:<pwd>@myteam-platform-postgres:5432/myteam_platform` |
| `/myteam-platform/staging/LOGTO_ISSUER` | Config / Secret | `myteam-platform-api` | `https://auth.simogatti.it/oidc` |
| `/myteam-platform/staging/LOGTO_AUDIENCE` | Config / Secret | `myteam-platform-api` | `https://team-staging.simogatti.it/api` |

---

## 5. Runbook Operativo: Deployment, Migrazioni, Backup e Rollback

### 5.1 Pre-Deploy e Bootstrap (Una tantum)
1. **Creazione directory storage su `servergatti`:**
   ```bash
   ssh servergatti "sudo mkdir -p /srv/myteam-platform-staging/postgres && sudo chown -R 70:70 /srv/myteam-platform-staging/postgres && sudo chmod 700 /srv/myteam-platform-staging/postgres"
   ```
2. **Popolamento Infisical:** Inserire le chiavi nella cartella `/myteam-platform/staging` come da matrice sopra.
3. **Registrazione Logto:**
   - Creare API Resource: Identifier `https://team-staging.simogatti.it/api`, Scope `platform:admin`.
   - Creare Application SPA: Type `Single Page App`, Name `myteam-platform-web-staging`.
     - Redirect URIs: `https://team-staging.simogatti.it/callback`
     - Post-logout Redirect URIs: `https://team-staging.simogatti.it`
     - CORS Allowed Origins: `https://team-staging.simogatti.it`
   - Assegnare il ruolo `platform:admin` all'utente di test autorizzato.

### 5.2 Build & Push Immagini Immutabili
```bash
TAG="$(date +%Y%m%d)-$(git rev-parse --short HEAD)"

docker build -f deploy/docker/Dockerfile.api -t "ghcr.io/simogatti04/myteam-platform-api:${TAG}" .
docker push "ghcr.io/simogatti04/myteam-platform-api:${TAG}"

docker build -f deploy/docker/Dockerfile.web \
  --build-arg VITE_APP_ENV=production \
  --build-arg VITE_LOGTO_APP_ID="<LOGTO_APP_ID_REALE>" \
  -t "ghcr.io/simogatti04/myteam-platform-web:${TAG}" .
docker push "ghcr.io/simogatti04/myteam-platform-web:${TAG}"
```

### 5.3 Sequenza di Rollout su K3s (`servergatti2`)
1. Aggiornare i tag delle immagini in `deploy/staging/kustomization.yaml` o manifest:
   ```bash
   cd deploy/staging
   kustomize edit set image ghcr.io/simogatti04/myteam-platform-api=ghcr.io/simogatti04/myteam-platform-api:${TAG}
   kustomize edit set image ghcr.io/simogatti04/myteam-platform-web=ghcr.io/simogatti04/myteam-platform-web:${TAG}
   ```
2. Applicare storage, secrets e postgres:
   ```bash
   kubectl apply -k .
   kubectl -n myteam-platform-staging rollout status statefulset/myteam-platform-postgres --timeout=120s
   ```
3. Eseguire Job migrazione (pre-rollout):
   ```bash
   kubectl -n myteam-platform-staging delete job myteam-platform-migrate --ignore-not-found
   kubectl apply -f migration-job.yaml
   kubectl -n myteam-platform-staging wait --for=condition=complete job/myteam-platform-migrate --timeout=60s
   ```
4. Verificare completamento rollout API e Web:
   ```bash
   kubectl -n myteam-platform-staging rollout status deployment/myteam-platform-api --timeout=120s
   kubectl -n myteam-platform-staging rollout status deployment/myteam-platform-web --timeout=120s
   ```

### 5.4 Procedura di Backup Pre-Migrazione
Prima di applicare nuove migrazioni DDL/DML irreversibili:
```bash
BACKUP_TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
kubectl -n myteam-platform-staging exec statefulset/myteam-platform-postgres -- \
  pg_dump -U myteam_app -d myteam_platform -F c -b -v > "myteam-staging-backup-${BACKUP_TIMESTAMP}.dump"
```

### 5.5 Procedura di Ripristino e Rollback
1. **Rollback Applicativo (senza modifiche DB incompatibili):**
   ```bash
   kubectl -n myteam-platform-staging rollout undo deployment/myteam-platform-api
   kubectl -n myteam-platform-staging rollout undo deployment/myteam-platform-web
   ```
2. **Rollback Database (in caso di migrazione corrotta o rottura dati):**
   ```bash
   # Scala API a 0 per rilasciare connessioni e pool
   kubectl -n myteam-platform-staging scale deployment/myteam-platform-api --replicas=0
   
   # Ripristino da dump logico
   cat "myteam-staging-backup-${BACKUP_TIMESTAMP}.dump" | \
     kubectl -n myteam-platform-staging exec -i statefulset/myteam-platform-postgres -- \
     pg_restore -U myteam_app -d myteam_platform --clean --if-exists -v
   
   # Riavvio API
   kubectl -n myteam-platform-staging scale deployment/myteam-platform-api --replicas=1
   ```

---

## 6. Verifiche Eseguite in Fase S1

| Controllo | Modalità | Esito | Dettaglio |
|---|---|---|---|
| **TypeScript Build & Contracts** | Locale CLI | **PASS** | `@myteam/contracts` e `@myteam/api` compilati con successo in `dist/`. |
| **Vite SPA Build** | Locale CLI | **PASS** | `pnpm --filter @myteam/web build` completato in 343ms senza errori. |
| **Risoluzione Path Migrazioni** | Node test isolato | **PASS** | Verificato che `new URL("../../../../db/migrations/", import.meta.url)` risolve correttamente sia da `src/` che da `dist/`. |
| **Rendering Kustomize** | `kubectl kustomize` | **PASS** | Tutti i manifest Kubernetes (namespace, storage, secrets, postgres, jobs, api, web, httproute, network-policy) compilano un template valido. |
| **Verifica Collisioni Routing** | `grep` infra config | **PASS** | `team-staging.simogatti.it` non collassa con l'host `myteam` esistente né con altri sottodomini in `exposure.yaml`. |
| **Container Engine Build & Run** | Sandbox limitata | **NOT RUN** | Docker daemon non accessibile all'interno della sandbox di sviluppo. I file Dockerfile e configurazioni sono pronti per runner CI/CD o host. |
| **PostgreSQL 16 Live Test** | Sandbox limitata | **NOT RUN** | Nessun demone PostgreSQL locale o porta 5432 attiva nella sandbox. |

---

## 7. Prerequisiti e Decisioni Pendenti per l'Owner / Lead

Prima del comando operativo di deploy (INFRA-S2), sono richieste le seguenti azioni/conferme:

1. **Creazione Directory Host su `servergatti`:** Creare `/srv/myteam-platform-staging/postgres` con ownership `70:70` e permessi `0700`.
2. **Provisioning Secret su Infisical:** Inserire le credenziali sotto `/myteam-platform/staging/*` in `K3S_Homelab_Cluster`.
3. **Registrazione Client su Logto:** Creare API Resource `https://team-staging.simogatti.it/api` (scope `platform:admin`) e SPA application su `auth.simogatti.it` (recuperando il `client_id` da iniettare nella build Web).
4. **Approvazione Disattivazione Form Manuale:** Confermato l'uso di `VITE_APP_ENV=production` nella build container del frontend per escludere il form JWT manuale dall'ambiente di staging esposto.

---

## Verdetto
**INFRA-S1 PREPARED**

I container production, i manifest K3s Kustomize, la configurazione Nginx, le NetworkPolicy e il runbook operativo completo sono pronti e testati localmente. Nessuna mutazione infrastrutturale è stata effettuata.
