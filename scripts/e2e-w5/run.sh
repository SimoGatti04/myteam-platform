#!/bin/bash
# W5 real-stack E2E: real Chromium -> real Vite (apps/web) -> real Fastify (apps/api)
# -> real PostgreSQL 16. No page.route interception of /api/**; the only non-product
# pieces are (a) a local self-signed OIDC issuer used to sign short-lived test JWTs and
# (b) one SQL UPDATE that marks the seeded match completed, because Core currently
# exposes no API transition to status=completed (see evidence README).
#
# Requires: docker (postgres:16 image), pnpm deps installed, openssl,
#           python3 with Playwright + Chromium installed (PY_PLAYWRIGHT).
# Everything is disposable and removed by a trap.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=${REPO:-$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)}
PY=${PY_PLAYWRIGHT:-python3}
PG_PORT=${E2E_PG_PORT:-5440}; API_PORT=${E2E_API_PORT:-3000}; WEB_PORT=${E2E_WEB_PORT:-4177}; JWKS_PORT=${E2E_JWKS_PORT:-8450}
SUF=$(openssl rand -hex 3)
PG_NAME="w5e2e-pg-$SUF"
PG_PASS="e2e_local_only_$SUF"
DB=myteam_e2e
RUN=$(mktemp -d "${TMPDIR:-/tmp}/myteam-w5e2e.XXXXXX")
mkdir -p "$RUN/shots"
echo "RUN=$RUN"

pids=()
cleanup() {
  set +e
  for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null; done
  wait 2>/dev/null
  sleep 1
  docker rm -f "$PG_NAME" >/dev/null 2>&1
  rm -f "$REPO/apps/api/.e2e-keygen.mjs"
  echo "CLEANUP done; container gone: $(docker ps -a --format '{{.Names}}' | grep -c "^$PG_NAME$")"
}
trap cleanup EXIT

for p in $PG_PORT $API_PORT $WEB_PORT $JWKS_PORT; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "BLOCKED: port $p busy"; exit 1; fi
done
docker ps -a --format '{{.Names}}' | grep -q "^$PG_NAME$" && { echo "BLOCKED: container name exists"; exit 1; }

echo "== local TLS + JWKS + test JWT (NOT Logto) =="
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$RUN/key.pem" -out "$RUN/cert.pem" -days 1 \
  -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" -addext "basicConstraints=critical,CA:TRUE" >/dev/null 2>&1
printf '%s' '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="8" fill="#0ea5e9"/></svg>' > "$RUN/crest.svg"
cp "$SCRIPT_DIR/keygen.mjs" "$REPO/apps/api/.e2e-keygen.mjs"
ISS="https://127.0.0.1:$JWKS_PORT/"
( cd "$REPO/apps/api" && node .e2e-keygen.mjs "$RUN" "$ISS" "myteam-platform" "$RUN/jwks.json" )
TOKEN=$(cat "$RUN/token.txt"); TOKEN_NOSCOPE=$(cat "$RUN/token_noscope.txt")

"$PY" "$SCRIPT_DIR/jwks_server.py" "$RUN" "$JWKS_PORT" >"$RUN/jwks.log" 2>&1 &
pids+=($!)
for i in $(seq 1 30); do curl -s --cacert "$RUN/cert.pem" --max-time 2 "https://127.0.0.1:$JWKS_PORT/jwks.json" >/dev/null 2>&1 && break; sleep 0.3; done

echo "== disposable postgres:16 =="
docker run -d --name "$PG_NAME" -e POSTGRES_PASSWORD="$PG_PASS" -e POSTGRES_DB="$DB" -p 127.0.0.1:$PG_PORT:5432 postgres:16-alpine >/dev/null
for i in $(seq 1 60); do docker exec "$PG_NAME" pg_isready -U postgres -d "$DB" >/dev/null 2>&1 && break; sleep 0.5; done
DATABASE_URL="postgres://postgres:$PG_PASS@127.0.0.1:$PG_PORT/$DB"
echo "== migrations 0001+0002 =="
( cd "$REPO" && DATABASE_URL="$DATABASE_URL" pnpm --filter @myteam/api migrate )

echo "== real Fastify on :$API_PORT =="
( cd "$REPO/apps/api" && env DATABASE_URL="$DATABASE_URL" PORT=$API_PORT HOST=127.0.0.1 \
  LOGTO_ISSUER="$ISS" LOGTO_AUDIENCE="myteam-platform" LOGTO_JWKS_URL="https://127.0.0.1:$JWKS_PORT/jwks.json" \
  NODE_EXTRA_CA_CERTS="$RUN/cert.pem" node --import tsx src/index.ts ) >"$RUN/api.log" 2>&1 &
pids+=($!)
for i in $(seq 1 60); do curl -s --max-time 2 "http://127.0.0.1:$API_PORT/ready" >/dev/null 2>&1 && break; sleep 0.5; done

API="http://127.0.0.1:$API_PORT"
echo "== auth negatives =="
C401=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/admin/team")
C403=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_NOSCOPE" "$API/api/v1/admin/team")
echo "unauth=$C401 noscope=$C403"
[ "$C401" = "401" ] && [ "$C403" = "403" ] || { echo "FAIL auth negatives"; exit 1; }

adm() {
  local out code body
  out=$(curl -sS -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' "$@") || { echo "ADM_CURL_FAIL $*" >&2; return 1; }
  code=${out##*$'\n'}; body=${out%$'\n'*}
  if [ "$code" -ge 400 ]; then echo "ADM_FAIL code=$code body=$body" >&2; return 1; fi
  printf '%s' "$body"
}
jget() { "$PY" -c "import sys,json;print(json.load(sys.stdin)$1)"; }

echo "== seed via authenticated admin API =="
SID=$(adm -X POST "$API/api/v1/admin/seasons" -d '{"label":"E2E 2026/2027","startsOn":"2026-09-01","endsOn":"2027-06-30"}' | jget "['id']")
P1=$(adm -X POST "$API/api/v1/admin/players" -d '{"displayName":"Giocatore E2E Uno"}' | jget "['id']")
P2=$(adm -X POST "$API/api/v1/admin/players" -d '{"displayName":"Giocatore E2E Due"}' | jget "['id']")
adm -X POST "$API/api/v1/admin/roster-memberships" -d "{\"playerId\":\"$P1\",\"seasonId\":\"$SID\",\"jerseyNumber\":9,\"activeFrom\":\"2026-09-01\"}" >/dev/null
adm -X POST "$API/api/v1/admin/roster-memberships" -d "{\"playerId\":\"$P2\",\"seasonId\":\"$SID\",\"jerseyNumber\":10,\"activeFrom\":\"2026-09-01\"}" >/dev/null
OPPID=$(adm -X POST "$API/api/v1/admin/opponents" -d '{"name":"Avversario E2E"}' | jget "['id']")
COMPID=$(adm -X POST "$API/api/v1/admin/competitions" -d '{"name":"Campionato E2E","category":"league","isOfficial":true}' | jget "['id']")
CREST="https://127.0.0.1:$JWKS_PORT/crest.svg"
adm -X PUT "$API/api/v1/admin/team" -d "{\"name\":\"MAPI E2E\",\"crestUrl\":\"$CREST\",\"currentSeasonId\":\"$SID\"}" >/dev/null
MID=$(adm -X POST "$API/api/v1/admin/matches" -d "{\"seasonId\":\"$SID\",\"opponentId\":\"$OPPID\",\"competitionId\":\"$COMPID\",\"isOfficial\":true,\"scheduledAt\":\"2026-10-25T14:00:00.000Z\"}" | jget "['id']")
# TEST FIXTURE ONLY: Core exposes no API transition to status=completed
# (create rejects it; PATCH returns completed_match_schedule_is_immutable).
docker exec -i "$PG_NAME" psql -U postgres -d "$DB" -c "UPDATE matches SET status='completed' WHERE id='$MID';" >/dev/null
echo "season=$SID match=$MID"

echo "== before publish: public must fail closed =="
SB404=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/public/matches/$MID/scoreboard")
echo "scoreboard_before_publish=$SB404"
[ "$SB404" = "404" ] || { echo "FAIL: expected 404"; exit 1; }

echo "== publish team + match via admin API =="
adm -X POST "$API/api/v1/admin/team/publish" -d '{}' >/dev/null
adm -X POST "$API/api/v1/admin/matches/$MID/publish" -d '{}' >/dev/null
SB_AFTER_PUB_NO_RESULT=$(curl -s -o /dev/null -w '%{http_code}' "$API/api/v1/public/matches/$MID/scoreboard")
echo "scoreboard_after_publish_without_result=$SB_AFTER_PUB_NO_RESULT"
[ "$SB_AFTER_PUB_NO_RESULT" = "404" ] || { echo "FAIL: expected 404 without result"; exit 1; }

echo "== real Vite W5 on :$WEB_PORT (proxy -> :$API_PORT, no interception) =="
( cd "$REPO/apps/web" && exec pnpm exec vite --port $WEB_PORT --strictPort --host 127.0.0.1 ) >"$RUN/vite.log" 2>&1 &
pids+=($!)
for i in $(seq 1 60); do curl -s --max-time 2 "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1 && break; sleep 0.5; done

echo "== real Chromium UI -> Fastify -> PostgreSQL =="
E2E_WEB_BASE="http://127.0.0.1:$WEB_PORT" E2E_TOKEN="$TOKEN" E2E_OPPONENT="Avversario E2E" E2E_SHOTS="$RUN/shots" \
  "$PY" "$SCRIPT_DIR/browser_e2e.py" 2>&1 | tee "$RUN/browser.log"

echo "== DB evidence =="
docker exec -i "$PG_NAME" psql -U postgres -d "$DB" -c "select match_id, team_score, opponent_score from match_results;" | tee "$RUN/db_result.txt"
docker exec -i "$PG_NAME" psql -U postgres -d "$DB" -c "select match_id, kind, team_side, period, minute, player_id is not null as has_player, client_event_id is not null as has_client_id from match_events order by created_at;" | tee "$RUN/db_events.txt"
docker exec -i "$PG_NAME" psql -U postgres -d "$DB" -c "select operation, source_kind, actor_subject, count(*) from audit_events group by 1,2,3 order by 1;" | tee "$RUN/db_audit.txt"

echo "E2E_RUN_DIR=$RUN"
echo "ALL_CHECKS_PASS"
