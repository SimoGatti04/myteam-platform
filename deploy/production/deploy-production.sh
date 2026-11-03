#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MYTEAM PLATFORM PRODUCTION — fail-closed staged rollout
#
# This script does not run by default. Without --apply it only renders and
# validates the manifests. With --apply it requires explicit owner/operator
# gates and a verified rollback path.
# ==============================================================================

NAMESPACE="myteam-platform-prod"
PRODUCTION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALUES="${PRODUCTION_VALUES:-${PRODUCTION_DIR}/production.values.json}"
LOCK_TOOL="${PRODUCTION_DIR}/../../scripts/k8s-lease-lock.py"
LOCK_NAME="myteam-platform-prod-deploy-lock"
LOCK_DURATION=180
LOCK_INTERVAL=30
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"
APPLY=0
if [[ "${1:-}" == "--apply" ]]; then
  APPLY=1
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 64
fi

require_gate() {
  local name="$1"
  if [[ "${!name:-}" != "YES" ]]; then
    echo "BLOCKED: ${name}=YES is required for production" >&2
    exit 2
  fi
}

ensure_namespace_owned_by_production() {
  local part env
  if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    if kubectl create namespace "${NAMESPACE}" >/dev/null 2>&1; then
      return 0
    fi
    kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || {
      echo "BLOCKED: cannot create or read namespace ${NAMESPACE}" >&2
      return 1
    }
  fi
  part="$(kubectl get namespace "${NAMESPACE}" -o jsonpath='{.metadata.labels.app\.kubernetes\.io/part-of}')"
  env="$(kubectl get namespace "${NAMESPACE}" -o jsonpath='{.metadata.labels.environment}')"
  if [[ "${part}" != "myteam-platform" || "${env}" != "production" ]]; then
    echo "BLOCKED: namespace ${NAMESPACE} exists without the production ownership labels" >&2
    return 1
  fi
}

RENDER_DIR=""
LOCK_OWNER="myteam-platform-prod/$(python3 -c 'import uuid; print(uuid.uuid4())')"
RUN_SUFFIX="${LOCK_OWNER##*/}"
RUN_SUFFIX="${RUN_SUFFIX//-/}"
RUN_SUFFIX="${RUN_SUFFIX:0:12}"
JOB_NAME="myteam-platform-prod-migrate-${RUN_SUFFIX}"
HEARTBEAT_PID=""
LOCK_ACQUIRED=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "${HEARTBEAT_PID}" ]]; then
    kill "${HEARTBEAT_PID}" 2>/dev/null || true
    wait "${HEARTBEAT_PID}" 2>/dev/null || true
  fi
  if [[ -n "${RENDER_DIR}" && -d "${RENDER_DIR}" ]]; then
    rm -rf -- "${RENDER_DIR}"
  fi
  if (( LOCK_ACQUIRED )); then
    python3 "${LOCK_TOOL}" release --namespace "${NAMESPACE}" --name "${LOCK_NAME}" --owner "${LOCK_OWNER}" || \
      echo "WARNING: production Lease not released; ownership was not confirmed. It will expire naturally." >&2
  fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "=== PRODUCTION RELEASE ${RELEASE_ID} ==="
if (( ! APPLY )); then
  python3 "${PRODUCTION_DIR}/validate-production.py"
  python3 "${PRODUCTION_DIR}/render-production.py" --check
  echo "CHECK ONLY: production values are not approved; no cluster connection was made."
  exit 0
fi

require_gate PRODUCTION_CHANGE_APPROVED
require_gate PRODUCTION_HOSTNAME_APPROVED
require_gate PRODUCTION_STORAGE_PROVISIONED
require_gate PRODUCTION_SECRETS_READY
require_gate PRODUCTION_IMAGES_VERIFIED
require_gate PRODUCTION_LOGTO_ONBOARDED
require_gate PRODUCTION_BACKUP_VERIFIED
require_gate PRODUCTION_ROLLBACK_READY

RENDER_DIR="$(mktemp -d "${TMPDIR:-/tmp}/myteam-prod-render-XXXXXX")"
python3 "${PRODUCTION_DIR}/render-production.py" --values "${VALUES}" --output "${RENDER_DIR}"
python3 "${PRODUCTION_DIR}/validate-production.py" --values "${VALUES}" --rendered "${RENDER_DIR}"

ensure_namespace_owned_by_production
python3 "${LOCK_TOOL}" acquire --namespace "${NAMESPACE}" --name "${LOCK_NAME}" \
  --owner "${LOCK_OWNER}" --duration "${LOCK_DURATION}"
LOCK_ACQUIRED=1
python3 "${LOCK_TOOL}" heartbeat --namespace "${NAMESPACE}" --name "${LOCK_NAME}" \
  --owner "${LOCK_OWNER}" --duration "${LOCK_DURATION}" --interval "${LOCK_INTERVAL}" \
  --parent-pid "$$" &
HEARTBEAT_PID=$!

echo "=== PHASE 1: BOOTSTRAP ==="
kubectl apply -f "${RENDER_DIR}/01-bootstrap.yaml"
kubectl -n "${NAMESPACE}" wait --for=condition=Ready externalsecret/myteam-platform-prod-secrets --timeout=180s
kubectl -n "${NAMESPACE}" rollout status statefulset/myteam-platform-prod-postgres --timeout=240s
# shellcheck disable=SC2016  # Expand inside PostgreSQL, not on the host.
kubectl -n "${NAMESPACE}" exec statefulset/myteam-platform-prod-postgres -- \
  sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "=== PHASE 2: FAIL-CLOSED MIGRATION ==="
RUNNING_JOBS="$(kubectl -n "${NAMESPACE}" get jobs -l app.kubernetes.io/component=migration \
  -o jsonpath='{range .items[?(@.status.active>0)]}{.metadata.name}{" "}{end}')"
if [[ -n "${RUNNING_JOBS}" ]]; then
  echo "BLOCKED: active migration Job(s): ${RUNNING_JOBS}. Nothing was deleted." >&2
  exit 1
fi
MIGRATION_FILE="${RENDER_DIR}/02-migration-${RUN_SUFFIX}.yaml"
sed "s/^  name: myteam-platform-prod-migrate$/  name: ${JOB_NAME}/" \
  "${RENDER_DIR}/02-migration.yaml" > "${MIGRATION_FILE}"
if ! grep -Fq "name: ${JOB_NAME}" "${MIGRATION_FILE}"; then
  echo "BLOCKED: could not create a unique migration Job name." >&2
  exit 1
fi
kubectl apply -f "${MIGRATION_FILE}"
if ! kubectl -n "${NAMESPACE}" wait --for=condition=complete "job/${JOB_NAME}" --timeout=300s; then
  echo "BLOCKED: migration ${JOB_NAME} failed; apps and routing were not applied." >&2
  kubectl -n "${NAMESPACE}" logs "job/${JOB_NAME}" --tail=80 >&2 || true
  exit 1
fi

echo "=== PHASE 3: APPLICATION ROLLOUT ==="
kubectl apply -f "${RENDER_DIR}/03-apps.yaml"
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-prod-api --timeout=240s
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-prod-web --timeout=240s

echo "=== PHASE 4: ROUTING ==="
kubectl apply -f "${RENDER_DIR}/04-routing.yaml"
echo "Production release ${RELEASE_ID} completed (run ${RUN_SUFFIX})."
echo "Rollback: reapply the previously recorded API/Web digests; do not reverse migrations automatically."
