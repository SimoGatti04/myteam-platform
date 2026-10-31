#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MYTEAM-PLATFORM STAGING DEPLOYMENT RUNNER (FAIL-CLOSED STAGED ROLLOUT)
# ==============================================================================
# Esegue il rollout ordinato e fail-closed per staging su K3s in 4 fasi:
# 1. Bootstrap: Namespace, Storage PV/PVC, ExternalSecret, PostgreSQL, NetworkPolicy
# 2. Attesa Database Ready
# 3. Esecuzione e verifica del Job migrazioni SQL (fail-closed)
# 4. Rollout applicativo: API Core e Web Frontend
# 5. Routing: Abilitazione Traefik Gateway HTTPRoute e smoke test
# ==============================================================================

NAMESPACE="myteam-platform-staging"
STAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== FASE 1: BOOTSTRAP (Namespace, Storage, Secrets, DB, NetworkPolicy) ==="
kubectl apply -k "${STAGING_DIR}/01-bootstrap"

echo "=== FASE 2: ATTESA DATABASE READY ==="
echo "Attesa sincronizzazione secret Infisical..."
kubectl -n "${NAMESPACE}" wait --for=condition=Ready externalsecret/myteam-platform-secrets --timeout=120s

echo "Attesa rollout PostgreSQL StatefulSet..."
kubectl -n "${NAMESPACE}" rollout status statefulset/myteam-platform-postgres --timeout=180s

echo "Verifica probe pg_isready..."
kubectl -n "${NAMESPACE}" exec statefulset/myteam-platform-postgres -- pg_isready -U myteam_app -d myteam_platform

echo "=== FASE 3: JOB MIGRAZIONI (FAIL-CLOSED GATE) ==="
# Rimuove eventuali run precedenti del Job per permetterne la re-esecuzione deterministica
kubectl -n "${NAMESPACE}" delete job myteam-platform-migrate --ignore-not-found
kubectl apply -k "${STAGING_DIR}/02-migration"

echo "Monitoraggio esecuzione migrazioni (timeout 180s)..."
if ! kubectl -n "${NAMESPACE}" wait --for=condition=complete job/myteam-platform-migrate --timeout=180s; then
  echo "ERRORE CRITICO: Il Job di migrazione è fallito o andato in timeout!" >&2
  echo "Dump dei log del pod di migrazione:" >&2
  kubectl -n "${NAMESPACE}" logs -l app.kubernetes.io/component=migration --tail=50 >&2
  echo "ROLLOUT BLOCCATO: Le applicazioni API e Web NON verranno distribuite." >&2
  exit 1
fi
echo "Migrazioni database completate con successo."

echo "=== FASE 4: ROLLOUT APPLICATIVO (API & Web) ==="
kubectl apply -k "${STAGING_DIR}/03-apps"

echo "Attesa disponibilità API Core..."
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-api --timeout=180s

echo "Attesa disponibilità Web Frontend..."
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-web --timeout=180s

echo "=== FASE 5: ABILITAZIONE HTTPROUTE & SMOKE ==="
kubectl apply -k "${STAGING_DIR}/04-routing"

echo "Rollout staging completato con successo. Procedere con la verifica degli endpoint HTTPS."
