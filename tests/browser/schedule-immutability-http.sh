#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# QA — Regressione CORE-BUG-01 via HTTP reale (non Fastify.inject)
#
# Richiede:
#   - API Core in esecuzione su $API_BASE, configurata con
#     verifyAdminToken sostitutivo che accetta "Bearer $QA_ADMIN_TOKEN"
#     (vedi tests/browser/start-test-api.ts) e database PostgreSQL isolato;
#   - variabili PG_CONTAINER / PG_USER / PG_DB / QA_SCHEMA per ispezionare
#     lo schema temporaneo usato da quella API.
#
# Verifica:
#   1. 400 completed_match_schedule_is_immutable su partita completata;
#   2. stato e data originari invariati nel database;
#   3. nessuna nuova riga in match_schedule_history / audit_events;
#   4. secondo tentativo identico -> ancora 400 e contatori invariati;
#   5. nessuna regressione: partita non completata resta modificabile (200).
#
# Nessun PASS viene stampato prima dell'assert corrispondente.
# ---------------------------------------------------------------------------
set -uo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:3000}"
QA_ADMIN_TOKEN="${QA_ADMIN_TOKEN:-test-admin-token}"
: "${QA_SCHEMA:?QA_SCHEMA required (isolated test schema)}"
PG_CONTAINER="${PG_CONTAINER:-myteam-platform-postgres-1}"
PG_USER="${PG_USER:-myteam}"
PG_DB="${PG_DB:-myteam_platform_test}"

FAILURES=0
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

json_get() { # json_get <key>  (stdin = json)
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get(sys.argv[1], ""))' "$1"
}

sql() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" | tr -d '[:space:]'; }

req() { # req METHOD PATH BODY
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -o /tmp/qa-http-body.json -w '%{http_code}' -X "$method" \
      -H "Authorization: Bearer $QA_ADMIN_TOKEN" -H 'Content-Type: application/json' \
      --data "$body" "$API_BASE$path"
  else
    curl -sS -o /tmp/qa-http-body.json -w '%{http_code}' -X "$method" \
      -H "Authorization: Bearer $QA_ADMIN_TOKEN" "$API_BASE$path"
  fi
}

printf 'QA HTTP immutability regression -> %s (schema %s)\n' "$API_BASE" "$QA_SCHEMA"

CODE=$(curl -sS -o /dev/null -w '%{http_code}' "$API_BASE/api/v1/public/team")
[ "$CODE" = "404" ] || { fail "API non raggiungibile o DB non vuoto (public/team -> $CODE)"; exit 1; }
pass "API attiva e database vuoto (public/team 404)"

CODE=$(req POST /api/v1/admin/seasons '{"label":"2026/2027","startsOn":"2026-09-01","endsOn":"2027-06-30"}')
SEASON=$(json_get id < /tmp/qa-http-body.json)
[ "$CODE" = "201" ] && [ -n "$SEASON" ] || { fail "creazione stagione (HTTP $CODE)"; exit 1; }
pass "stagione creata ($SEASON)"

CODE=$(req PUT /api/v1/admin/team "{\"name\":\"QA Immutability FC\",\"crestUrl\":\"https://assets.example.org/crests/qa-immutability.png\",\"primaryColor\":\"#1E3A8A\",\"secondaryColor\":\"#38BDF8\",\"currentSeasonId\":\"$SEASON\"}")
[ "$CODE" = "200" ] || { fail "configurazione squadra (HTTP $CODE)"; exit 1; }
CODE=$(req POST /api/v1/admin/team/publish)
[ "$CODE" = "200" ] || { fail "pubblicazione squadra (HTTP $CODE: $(cat /tmp/qa-http-body.json))"; exit 1; }
pass "squadra configurata e pubblicata"

CODE=$(req POST /api/v1/admin/opponents '{"name":"QA Avversaria Sintetica","shortName":"QAS"}')
OPPONENT=$(json_get id < /tmp/qa-http-body.json)
[ "$CODE" = "201" ] || { fail "creazione avversaria (HTTP $CODE)"; exit 1; }
pass "avversaria creata"

CODE=$(req POST /api/v1/admin/matches "{\"seasonId\":\"$SEASON\",\"opponentId\":\"$OPPONENT\",\"isOfficial\":true,\"scheduledAt\":\"2026-11-01T15:00:00.000Z\"}")
MATCH=$(json_get id < /tmp/qa-http-body.json)
STATUS=$(json_get status < /tmp/qa-http-body.json)
[ "$CODE" = "201" ] && [ "$STATUS" = "scheduled" ] || { fail "creazione partita (HTTP $CODE, status=$STATUS)"; exit 1; }
pass "partita creata come scheduled ($MATCH)"

sql "UPDATE \"$QA_SCHEMA\".matches SET status='completed' WHERE id='$MATCH'" >/dev/null
BEFORE_STATUS=$(sql "SELECT status FROM \"$QA_SCHEMA\".matches WHERE id='$MATCH'")
BEFORE_DATE=$(sql "SELECT scheduled_at FROM \"$QA_SCHEMA\".matches WHERE id='$MATCH'")
BEFORE_HIST=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".match_schedule_history WHERE match_id='$MATCH'")
BEFORE_AUDIT=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".audit_events WHERE entity_id='$MATCH'")
[ "$BEFORE_STATUS" = "completed" ] || { fail "setup DB: status non impostato a completed ($BEFORE_STATUS)"; exit 1; }
pass "stato forzato a completed nel database di test (data=$BEFORE_DATE, storico=$BEFORE_HIST, audit=$BEFORE_AUDIT)"

CODE=$(req PATCH "/api/v1/admin/matches/$MATCH/schedule" '{"status":"postponed","scheduledAt":"2026-12-20T18:30:00.000Z"}')
BODY=$(cat /tmp/qa-http-body.json)
[ "$CODE" = "400" ] || fail "attesa HTTP 400 su partita completata, ricevuto $CODE"
[ "$CODE" = "400" ] && pass "PATCH su partita completata rifiutato con HTTP 400"
[ "$BODY" = '{"error":"completed_match_schedule_is_immutable"}' ] \
  && pass "codice errore corretto: completed_match_schedule_is_immutable" \
  || fail "codice errore inatteso: $BODY"

AFTER_STATUS=$(sql "SELECT status FROM \"$QA_SCHEMA\".matches WHERE id='$MATCH'")
AFTER_DATE=$(sql "SELECT scheduled_at FROM \"$QA_SCHEMA\".matches WHERE id='$MATCH'")
AFTER_HIST=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".match_schedule_history WHERE match_id='$MATCH'")
AFTER_AUDIT=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".audit_events WHERE entity_id='$MATCH'")
[ "$AFTER_STATUS" = "$BEFORE_STATUS" ] && pass "stato invariato ($AFTER_STATUS)" || fail "stato mutato: $BEFORE_STATUS -> $AFTER_STATUS"
[ "$AFTER_DATE" = "$BEFORE_DATE" ] && pass "data invariata ($AFTER_DATE)" || fail "data mutata: $BEFORE_DATE -> $AFTER_DATE"
[ "$AFTER_HIST" = "$BEFORE_HIST" ] && pass "nessuna nuova riga di storico ($AFTER_HIST)" || fail "storico mutato: $BEFORE_HIST -> $AFTER_HIST"
[ "$AFTER_AUDIT" = "$BEFORE_AUDIT" ] && pass "nessun nuovo evento audit ($AFTER_AUDIT)" || fail "audit mutato: $BEFORE_AUDIT -> $AFTER_AUDIT"

CODE=$(req PATCH "/api/v1/admin/matches/$MATCH/schedule" '{"status":"postponed","scheduledAt":"2026-12-20T18:30:00.000Z"}')
HIST2=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".match_schedule_history WHERE match_id='$MATCH'")
AUDIT2=$(sql "SELECT count(*) FROM \"$QA_SCHEMA\".audit_events WHERE entity_id='$MATCH'")
[ "$CODE" = "400" ] && pass "secondo tentativo rifiutato con HTTP 400 (idempotenza del rifiuto)" || fail "secondo tentativo: atteso 400, ricevuto $CODE"
[ "$HIST2" = "$BEFORE_HIST" ] && [ "$AUDIT2" = "$BEFORE_AUDIT" ] \
  && pass "contatori invariati dopo il secondo tentativo ($HIST2|$AUDIT2)" \
  || fail "contatori variati dopo il secondo tentativo ($HIST2|$AUDIT2)"

CODE=$(req POST /api/v1/admin/matches "{\"seasonId\":\"$SEASON\",\"opponentId\":\"$OPPONENT\",\"isOfficial\":true,\"scheduledAt\":\"2026-11-08T15:00:00.000Z\"}")
MATCH2=$(json_get id < /tmp/qa-http-body.json)
CODE=$(req PATCH "/api/v1/admin/matches/$MATCH2/schedule" '{"status":"postponed","scheduledAt":"2026-11-22T15:00:00.000Z"}')
BODY=$(cat /tmp/qa-http-body.json)
NEW_STATUS=$(json_get status < /tmp/qa-http-body.json)
[ "$CODE" = "200" ] && [ "$NEW_STATUS" = "postponed" ] \
  && pass "nessuna regressione: partita non completata modificabile (200, status=postponed)" \
  || fail "regressione su partita non completata: HTTP $CODE $BODY"

printf '\nQA HTTP immutability regression: %s\n' "$([ "$FAILURES" -eq 0 ] && echo 'ALL CHECKS PASSED' || echo "FAILURES=$FAILURES")"
exit $([ "$FAILURES" -eq 0 ] && echo 0 || echo 1)
