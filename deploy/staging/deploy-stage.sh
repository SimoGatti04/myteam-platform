#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MYTEAM-PLATFORM STAGING DEPLOYMENT RUNNER (FAIL-CLOSED STAGED ROLLOUT)
# ==============================================================================
# Esegue il rollout ordinato e fail-closed per staging su K3s in 5 fasi:
# 1. Concurrency Lock & Preflight (INFRA-R2-05)
# 2. Bootstrap: Namespace, Storage PV/PVC, ExternalSecret, PostgreSQL, NetworkPolicy
# 3. Attesa Database Ready
# 4. Esecuzione e verifica del Job migrazioni SQL deterministico (fail-closed)
# 5. Rollout applicativo: API Core e Web Frontend
# 6. Routing: Abilitazione Traefik Gateway HTTPRoute e smoke test
# ==============================================================================

NAMESPACE="myteam-platform-staging"
STAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ID="${RELEASE_ID:-$(date +%Y%m%d%H%M%S)}"
JOB_NAME="myteam-platform-migrate-${RELEASE_ID}"
LOCK_NAME="myteam-platform-deploy-lock"

echo "=== INIZIALIZZAZIONE DEPLOYMENT STAGING (RELEASE: ${RELEASE_ID}) ==="

# ------------------------------------------------------------------------------
# FASE 0: LOCK DI CONCORRENZA AMBIENTE (INFRA-R2-05)
# ------------------------------------------------------------------------------
# Utilizza una risorsa Lease Kubernetes nel namespace per evitare che due runner
# o processi di deployment si sovrappongano e interferiscano l'uno con l'altro.
acquire_lock() {
  echo "Verifica e acquisizione concurrency lock staging..."
  # Verifica se il namespace esiste già
  if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    echo "Namespace ${NAMESPACE} non ancora presente (primo bootstrap); skip acquisizione lease."
    return 0
  fi

  # Tenta la creazione atomica del Lease
  local now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if ! kubectl -n "${NAMESPACE}" create lease "${LOCK_NAME}" \
    --holder-identity="runner-${RELEASE_ID}" \
    --duration=900 >/dev/null 2>&1; then
    # Se il lease esiste già, controlla se è ancora attivo
    echo "ATTENZIONE: Trovato un lease di deployment attivo (${LOCK_NAME})!" >&2
    local holder
    holder=$(kubectl -n "${NAMESPACE}" get lease "${LOCK_NAME}" -o jsonpath='{.spec.holderIdentity}' 2>/dev/null || true)
    echo "ERRORE: Deployment concorrente già in esecuzione da parte di '${holder}'." >&2
    echo "Attendere il completamento o rimuovere il lease manualmente se stale." >&2
    exit 1
  fi
  echo "Lock di deployment acquisito da runner-${RELEASE_ID}."
}

release_lock() {
  echo "Rilascio concurrency lock staging..."
  kubectl -n "${NAMESPACE}" delete lease "${LOCK_NAME}" --ignore-not-found >/dev/null 2>&1 || true
}
trap release_lock EXIT

acquire_lock

# ------------------------------------------------------------------------------
# FASE 1: BOOTSTRAP (Namespace, Storage, Secrets, DB, NetworkPolicy)
# ------------------------------------------------------------------------------
echo "=== FASE 1: BOOTSTRAP (Namespace, Storage, Secrets, DB, NetworkPolicy) ==="
kubectl apply -k "${STAGING_DIR}/01-bootstrap"

# ------------------------------------------------------------------------------
# FASE 2: ATTESA DATABASE READY
# ------------------------------------------------------------------------------
echo "=== FASE 2: ATTESA DATABASE READY ==="
echo "Attesa sincronizzazione secret Infisical..."
kubectl -n "${NAMESPACE}" wait --for=condition=Ready externalsecret/myteam-platform-secrets --timeout=120s

echo "Attesa rollout PostgreSQL StatefulSet..."
kubectl -n "${NAMESPACE}" rollout status statefulset/myteam-platform-postgres --timeout=180s

echo "Verifica probe pg_isready..."
kubectl -n "${NAMESPACE}" exec statefulset/myteam-platform-postgres -- pg_isready -U myteam_app -d myteam_platform

# ------------------------------------------------------------------------------
# FASE 3: JOB MIGRAZIONI DETERMINISTICO (FAIL-CLOSED GATE - INFRA-R2-05)
# ------------------------------------------------------------------------------
echo "=== FASE 3: JOB MIGRAZIONI (FAIL-CLOSED GATE) ==="

# Verifica se esiste già un Job di migrazione attualmente attivo (non cancellare un Job running!)
RUNNING_JOBS=$(kubectl -n "${NAMESPACE}" get jobs -l app.kubernetes.io/component=migration -o jsonpath='{range .items[?(@.status.active>0)]}{.metadata.name}{" "}{end}')
if [ -n "${RUNNING_JOBS}" ]; then
  echo "ERRORE: Rilevato Job di migrazione già attivo (${RUNNING_JOBS})!" >&2
  echo "Non è consentito cancellare o sovrapporre una migrazione in esecuzione." >&2
  echo "Attendere il completamento del Job attivo." >&2
  exit 1
fi

echo "Generazione manifest Kustomize migrazione con Job deterministico '${JOB_NAME}'..."
# Renderizza il manifest Kustomize sostituendo il nome del Job con quello univoco di release
TMP_MIGRATE_YAML=$(mktemp /tmp/myteam-migrate-XXXXXX.yaml)
kubectl kustomize "${STAGING_DIR}/02-migration" | sed "s/name: myteam-platform-migrate$/name: ${JOB_NAME}/" > "${TMP_MIGRATE_YAML}"

kubectl apply -f "${TMP_MIGRATE_YAML}"
rm -f "${TMP_MIGRATE_YAML}"

echo "Monitoraggio esecuzione migrazioni (Job: ${JOB_NAME}, timeout 180s)..."
if ! kubectl -n "${NAMESPACE}" wait --for=condition=complete "job/${JOB_NAME}" --timeout=180s; then
  echo "ERRORE CRITICO: Il Job di migrazione '${JOB_NAME}' è fallito o andato in timeout!" >&2
  echo "Dump dei log del pod di migrazione:" >&2
  kubectl -n "${NAMESPACE}" logs "job/${JOB_NAME}" --tail=50 >&2 || true
  echo "ROLLOUT BLOCCATO: Le applicazioni API e Web NON verranno distribuite (Fail-Closed)." >&2
  exit 1
fi
echo "Migrazioni database completate con successo per la release ${RELEASE_ID}."

# ------------------------------------------------------------------------------
# FASE 4: ROLLOUT APPLICATIVO (API & Web)
# ------------------------------------------------------------------------------
echo "=== FASE 4: ROLLOUT APPLICATIVO (API & Web) ==="
kubectl apply -k "${STAGING_DIR}/03-apps"

echo "Attesa disponibilità API Core..."
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-api --timeout=180s

echo "Attesa disponibilità Web Frontend..."
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-web --timeout=180s

# ------------------------------------------------------------------------------
# FASE 5: ABILITAZIONE HTTPROUTE & SMOKE
# ------------------------------------------------------------------------------
echo "=== FASE 5: ABILITAZIONE HTTPROUTE & SMOKE ==="
kubectl apply -k "${STAGING_DIR}/04-routing"

echo "Rollout staging completato con successo. Procedere con la verifica degli endpoint HTTPS."
