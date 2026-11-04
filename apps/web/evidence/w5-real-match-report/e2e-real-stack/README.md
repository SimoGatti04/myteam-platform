# W5 real-stack E2E — Chromium → Vite (W5 UI) → Fastify → PostgreSQL 16

**PASS (2026-11-04, harness corrected).** One bounded, repeatable run against a disposable local stack.
Unlike `../README.md` (synthetic intercepted HTTP), **no `/api/**` request was intercepted**:
every browser call below went over the network to the real Fastify process and was persisted in PostgreSQL.

## Topology actually executed

| Layer | What ran |
| --- | --- |
| Browser | Real Chromium (Playwright, desktop 1440×900 + mobile 390×844), real `apps/web` dev bundle from Vite |
| Web → API | Vite dev server on a loopback port, proxying `/api` to the Fastify process (no `page.route`) |
| API | `apps/api` Fastify on loopback, migrations 0001 + 0002 applied, Bearer JWT verified with `jose` against a JWKS URL |
| Auth | **Local self-signed OIDC issuer (NOT Logto)**: RSA key + HTTPS JWKS; short-lived RS256 token with `aud=myteam-platform`, `scope=platform:admin` |
| Database | Disposable `postgres:16-alpine` container, unique name/port, removed by trap |
| Seed | Authentic admin API calls (`POST /seasons`, `/players`, `/roster-memberships`, `/opponents`, `/competitions`, `PUT /team`, `POST /matches`, publish team/match) |

Test-only deviations, stated explicitly:

- the signing issuer is a local TLS fixture, not Logto/Infisical and not real credentials;
- the browser session uses the app's **existing dev-only manual-token path** (`sessionStorage`, `isManualAuthAllowed`) so the real API performs real JWT verification and the `Authorization` header is observed on every admin request;
- seeded team/player/opponent names are synthetic E2E values.

**No SQL writes.** The harness contains **no** `INSERT`/`UPDATE`/`DELETE` against domain tables;
every state change below was produced by the product API. The `psql` usage is **SELECT-only proof**
plus Postgres readiness checks (`pg_isready`).

## Match lifecycle is driven by the product

The match is seeded as `status=scheduled` and published (`published_at` set). The transition to
`completed` is produced **only** by the W5 browser action
`PUT /api/v1/admin/matches/:id/result` (`apps/api/src/platform/service.ts` → `upsertMatchResult`),
which also appends `match_schedule_history(status='completed')` and an
`audit_events(operation='complete', source_kind='admin_entry')` row in the same transaction.

The harness asserts that after the browser run:

| Assertion (SQL `SELECT`) | Expected | Result |
| --- | --- | --- |
| `matches.status` | `completed` | ✅ |
| `audit_events` `operation='complete'` for the match, `source_kind='admin_entry'`, `actor_subject='e2e-admin'` | count `1` | ✅ |
| `match_results` `team_score=2, opponent_score=1` | count `1` | ✅ |
| `match_events` goal / `team` / period 1 / minute 23, `player_id` + `client_event_id` set | count `1` | ✅ |
| `match_schedule_history` `status='completed'` | count `1` | ✅ |

The run prints `DB_ASSERT status=… complete_audit=… result=… event=… history=…` and **aborts with a
non-zero exit** on any mismatch; this run exited `0` and reported `ALL_CHECKS_PASS`.

Independent corroboration that `status=completed` really came from the API path: the public
`GET /api/v1/public/matches/:id/scoreboard` only serves `completed` matches, and it moved from
`404` before the UI save to `200` with `2 - 1` immediately after the same browser session.

## Observed results

API-level guards:

- `GET /api/v1/admin/team` without token → **401**
- same call with a signed token lacking `platform:admin` → **403**

Public fail-closed:

- before the match was published → `GET /public/matches/:id/scoreboard` **404**
- after publishing team + match but with **no result** → **404**
- browser opens the published match: UI shows *"Risultato non pubblicato"* (`e2e-01-public-404-before-result.png`)

Real UI writes (see `network-summary.json`, 50 observed `/api/**` calls):

- `PUT /api/v1/admin/matches/:id/result` `{teamScore:2, opponentScore:1}` → **200**, UI confirms *"Risultato salvato dal server"*
- `POST /api/v1/admin/matches/:id/events` goal / `team` / period 1 / minute 23 with persisted `playerId` and stable `clientEventId` → **201**, saved-events list 0 → 1
- `GET /public/matches/:id/scoreboard` → **200** with `2 - 1` and the goal (`e2e-04-public-200-after-save.png`)
- full page reload → public detail still `2 - 1` with events (`e2e-05-public-200-after-reload.png`)

Database proof (captured from the same container, SELECT only):

```
match_results:  2 | 1
match_events:   goal | team | period 1 | minute 23 | player_id set | client_event_id set
audit_events:   operation=complete ×1 (source_kind=admin_entry, actor_subject=e2e-admin)
                create ×10, publish ×2, configure ×1 — all admin_entry / e2e-admin
```

`actor_subject` proves the JWT subject flowed end-to-end into the audit trail.

## Files

- `e2e-01-public-404-before-result.png` — published match, no result yet (real 404)
- `e2e-02-admin-saved-desktop.png` / `e2e-03-admin-saved-mobile.png` — report after PUT + POST
- `e2e-04-public-200-after-save.png` — public scoreboard from DB
- `e2e-05-public-200-after-reload.png` — after full reload
- `network-summary.json` — every `/api/**` request/response observed by the browser
- `checkpoints.txt`, `db-result.txt`, `db-events.txt`, `db-audit.txt`

All files are screenshot/SELECT output only — no tokens, no private keys, no local absolute paths.

## Reproduce

```bash
# prerequisites: docker with postgres:16, pnpm install, openssl, python3 with Playwright Chromium
PY_PLAYWRIGHT=python3 bash scripts/e2e-w5/run.sh
```

## Isolation and cleanup guarantees

The harness is designed to be safe to run next to other projects:

- **Ports** 3000/4177/5440/8450 are pre-checked with `lsof`; the script refuses to start if any is busy
  (override with `E2E_*_PORT`). No port is ever killed.
- **Container** and **anonymous volume** names are unique per run (`w5e2e-pg-<random>`). The script refuses
  to start if that name already exists.
- Cleanup runs from an `EXIT` trap and uses `docker rm -fv <own container>` — this removes **only** that
  container and its own anonymous volume. It never runs `docker volume prune`, never removes volumes by
  label/filter, and never touches pre-existing containers or volumes belonging to other projects.
- The trap verifies and reports `own volume removed: yes` and `own keygen removed: yes`.
- The temporary run directory (`mktemp -d`) holds a throwaway RSA private key (`key.pem`) and two
  short-lived test JWTs (`token.txt`, `token_noscope.txt`); the trap deletes all three. Only sanitized
  screenshots and SELECT output are retained/copied into this evidence folder, and none of the key/token
  material is committed.
- The throwaway JWKS signer module is copied to `apps/api/.e2e-keygen-<random>.mjs` with a guard: if that
  exact path already exists the script aborts instead of overwriting, and the trap deletes **only** the file
  this invocation created. Any pre-existing local file is never clobbered or removed.

## Gaps found (not Web regressions, API/Core concerns)

1. `POST /admin/team/publish` and `POST /admin/matches/:id/publish` return `500` when called with
   `content-type: application/json` and no body (`FST_ERR_CTP_EMPTY_JSON_BODY` surfaced as internal error).
   Sending `{}` works; the error mapping could be a `400`.
2. Team publication requires an HTTPS `crestUrl`.

These items are API/Core concerns; this evidence exists so QA2 can verify the Web layer against them rather
than against mocked HTTP.
