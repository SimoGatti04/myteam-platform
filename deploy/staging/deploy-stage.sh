#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# MYTEAM PLATFORM STAGING — fail-closed staged rollout
# The lock is a Kubernetes Lease acquired before any stage except the
# idempotent namespace bootstrap required to host that Lease.
# ==============================================================================

NAMESPACE="myteam-platform-staging"
STAGING_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_ID="${RELEASE_ID:-$(date -u +%Y%m%d%H%M%S)}"
LOCK_NAME="myteam-platform-deploy-lock"
LOCK_TOOL="${STAGING_DIR}/../../scripts/k8s-lease-lock.py"
LOCK_DURATION=180
LOCK_INTERVAL=30

# Unique process identity prevents reuse/collision when the same release is
# retried. A separate unique Job suffix prevents collisions with prior runs.
LOCK_OWNER="myteam-platform/$(python3 -c 'import uuid; print(uuid.uuid4())')"
RUN_SUFFIX="${LOCK_OWNER##*/}"
RUN_SUFFIX="${RUN_SUFFIX//-/}"
RUN_SUFFIX="${RUN_SUFFIX:0:12}"
JOB_NAME="myteam-platform-migrate-${RUN_SUFFIX}"
HEARTBEAT_PID=""
LOCK_ACQUIRED=0
TEMP_MIGRATE_YAML=""

cleanup() {
  local original_status=$?
  trap - EXIT INT TERM
  if [[ -n "${HEARTBEAT_PID}" ]]; then
    kill "${HEARTBEAT_PID}" 2>/dev/null || true
    wait "${HEARTBEAT_PID}" 2>/dev/null || true
  fi
  if [[ -n "${TEMP_MIGRATE_YAML}" ]]; then
    rm -f -- "${TEMP_MIGRATE_YAML}"
  fi
  if (( LOCK_ACQUIRED )); then
    python3 "${LOCK_TOOL}" release --namespace "${NAMESPACE}" --name "${LOCK_NAME}" --owner "${LOCK_OWNER}" || \
      echo "WARNING: Lease not released; ownership was not confirmed. It will expire naturally." >&2
  fi
  exit "${original_status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

ensure_lock_namespace() {
  # Bootstrap is idempotent and create is atomic. Concurrent first-run
  # contenders may both observe absence; AlreadyExists is accepted only after
  # a successful read confirms the namespace now exists.
  if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    return 0
  fi
  if kubectl create namespace "${NAMESPACE}" >/dev/null 2>&1; then
    return 0
  fi
  if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
    return 0
  fi
  echo "ERROR: Cannot ensure namespace ${NAMESPACE}; deployment stopped before lock acquisition." >&2
  return 1
}

echo "=== STAGING RELEASE ${RELEASE_ID} / RUN ${RUN_SUFFIX} ==="
echo "Ensuring lock namespace, then acquiring an exclusive Lease..."
ensure_lock_namespace
python3 "${LOCK_TOOL}" acquire --namespace "${NAMESPACE}" --name "${LOCK_NAME}" \
  --owner "${LOCK_OWNER}" --duration "${LOCK_DURATION}"
LOCK_ACQUIRED=1
python3 "${LOCK_TOOL}" heartbeat --namespace "${NAMESPACE}" --name "${LOCK_NAME}" \
  --owner "${LOCK_OWNER}" --duration "${LOCK_DURATION}" --interval "${LOCK_INTERVAL}" \
  --parent-pid "$$" &
HEARTBEAT_PID=$!

# FASE 1 — bootstrap namespace metadata, storage, secrets, PostgreSQL, policy.
echo "=== FASE 1: BOOTSTRAP ==="
kubectl apply -k "${STAGING_DIR}/01-bootstrap"

# FASE 2 — hard gate: credentials and PostgreSQL must be Ready before migration.
echo "=== FASE 2: DATABASE READY ==="
kubectl -n "${NAMESPACE}" wait --for=condition=Ready externalsecret/myteam-platform-secrets --timeout=120s
kubectl -n "${NAMESPACE}" rollout status statefulset/myteam-platform-postgres --timeout=180s
# shellcheck disable=SC2016  # Expand inside PostgreSQL, not on the host.
kubectl -n "${NAMESPACE}" exec statefulset/myteam-platform-postgres -- \
  sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# FASE 3 — never delete or replace an existing migration Job. Each invocation
# gets a unique name. Any active migration (including one started elsewhere)
# blocks this run; completed jobs from previous releases remain untouched.
echo "=== FASE 3: MIGRATIONS (FAIL-CLOSED) ==="
RUNNING_JOBS="$(kubectl -n "${NAMESPACE}" get jobs -l app.kubernetes.io/component=migration \
  -o jsonpath='{range .items[?(@.status.active>0)]}{.metadata.name}{" "}{end}')"
if [[ -n "${RUNNING_JOBS}" ]]; then
  echo "ERROR: Active migration Job(s) detected: ${RUNNING_JOBS}. No Job was deleted." >&2
  exit 1
fi

TEMP_MIGRATE_YAML="$(mktemp "${TMPDIR:-/tmp}/myteam-migrate-XXXXXX.yaml")"
kubectl kustomize "${STAGING_DIR}/02-migration" |
  sed "s/^  name: myteam-platform-migrate$/  name: ${JOB_NAME}/" > "${TEMP_MIGRATE_YAML}"
if ! grep -Fq "name: ${JOB_NAME}" "${TEMP_MIGRATE_YAML}"; then
  echo "ERROR: Could not render a unique migration Job name; refusing apply." >&2
  exit 1
fi
kubectl apply -f "${TEMP_MIGRATE_YAML}"
rm -f -- "${TEMP_MIGRATE_YAML}"
TEMP_MIGRATE_YAML=""

if ! kubectl -n "${NAMESPACE}" wait --for=condition=complete "job/${JOB_NAME}" --timeout=300s; then
  echo "ERROR: Migration Job ${JOB_NAME} failed or timed out; application and routing stages are blocked." >&2
  kubectl -n "${NAMESPACE}" logs "job/${JOB_NAME}" --tail=50 >&2 || true
  exit 1
fi

# FASE 4 — only after successful migration.
echo "=== FASE 4: APPLICATION ROLLOUT ==="
kubectl apply -k "${STAGING_DIR}/03-apps"
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-api --timeout=180s
kubectl -n "${NAMESPACE}" rollout status deployment/myteam-platform-web --timeout=180s

# FASE 5 — routing is the final stage, after healthy app rollouts.
echo "=== FASE 5: ROUTING / TRAFFIC ==="
kubectl apply -k "${STAGING_DIR}/04-routing"
echo "Staging release ${RELEASE_ID} completed (run ${RUN_SUFFIX})."
