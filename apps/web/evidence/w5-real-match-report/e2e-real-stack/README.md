# W5 real-stack E2E — Chromium → Vite (W5 UI) → Fastify → PostgreSQL 16

**PASS (2026-11-04).** One bounded, repeatable run against a disposable local stack.
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
- **one SQL `UPDATE`** sets the seeded match to `status=completed`, because Core currently exposes no API transition to that status (see Gaps);
- seeded team/player/opponent names are synthetic E2E values.

## Observed results

API-level guards:

- `GET /api/v1/admin/team` without token → **401**
- same call with a signed token lacking the scope → **403**

Public fail-closed → success:

- `GET /public/matches/:id/scoreboard` before publish → **404**
- after publishing team + match, still no result → **404**
- browser opens the published match: UI shows *"Risultato non pubblicato"* (`e2e-01-public-404-before-result.png`)

Real UI writes (see `network-summary.json`):

- `PUT /api/v1/admin/matches/:id/result` `{teamScore:2, opponentScore:1}` → **200**, UI confirms *"Risultato salvato dal server"*
- `POST /api/v1/admin/matches/:id/events` goal / `team` / period 1 / minute 23 with persisted `playerId` and stable `clientEventId` → **201**, saved-events list 0 → 1
- `GET /public/matches/:id/scoreboard` → **200** with `2 - 1` and the goal (`e2e-04-public-200-after-save.png`)
- full page reload → public detail still `2 - 1` with events (`e2e-05-public-200-after-reload.png`)

Database proof (captured from the same container):

```
match_results:  2 | 1
match_events:   goal | team | period 1 | minute 23 | player_id set | client_event_id set
audit_events:   create/publish/configure ×13, source_kind=admin_entry, actor_subject=e2e-admin
```

`actor_subject` proves the JWT subject flowed end-to-end into the audit trail.

## Files

- `e2e-01-public-404-before-result.png` — published match, no result yet (real 404)
- `e2e-02-admin-saved-desktop.png` / `e2e-03-admin-saved-mobile.png` — report after PUT + POST
- `e2e-04-public-200-after-save.png` — public scoreboard from DB
- `e2e-05-public-200-after-reload.png` — after full reload
- `network-summary.json` — every `/api/**` request/response observed by the browser
- `checkpoints.txt`, `db-result.txt`, `db-events.txt`, `db-audit.txt`

## Reproduce

```bash
# prerequisites: docker with postgres:16, pnpm install, openssl, python3 with Playwright Chromium
PY_PLAYWRIGHT=python3 bash scripts/e2e-w5/run.sh
```

Ports, work directory and container are unique per run and removed by an EXIT trap
(the script verifies the container is gone and refuses to touch pre-existing containers).

## Gaps found (not Web regressions)

1. **No API transition to `status=completed`.** `POST /admin/matches` rejects it and `PATCH /admin/matches/:id/schedule` returns `completed_match_schedule_is_immutable`. Yet the public scoreboard only serves `status='completed'` matches. A real operator therefore cannot reach the reporting flow through product APIs today — Core decision needed.
2. `POST /admin/team/publish` and `POST /admin/matches/:id/publish` return `500` when called with `content-type: application/json` and no body (`FST_ERR_CTP_EMPTY_JSON_BODY` surfaced as internal error). Sending `{}` works; the error mapping could be a 400.
3. Team publication requires an HTTPS `crestUrl`.

These items are API/Core concerns; this evidence exists so QA2 can verify the Web layer against them rather than mocked HTTP.
