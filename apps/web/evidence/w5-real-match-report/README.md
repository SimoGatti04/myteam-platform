# W5 — real-mode match report & public scoreboard (integration slice)

**Status: BOUNDED IMPLEMENTATION PREVIEW — NOT an E2E pass, NOT a backend/database integration, NOT a deployment.**
The owner approved the W4 visual baseline; this slice replaces the fixture-only data path with the Core C2 contract
where the API exists, keeping the approved layout.

## What is real vs synthetic

| Aspect | Reality in this evidence |
| --- | --- |
| React UI, routes, auth guard, API client | **Real application code** from `apps/web/` (no test harness, no storybook) |
| HTTP responses in the screenshots | **Intercepted with synthetic fixtures** shaped on the C2 DTOs — no Core API process, no PostgreSQL, no Logto/OIDC |
| Auth in the browser session | Development-only manual token (the existing `isManualAuthAllowed` dev path); no real credentials |
| Demo W4 mode | Unchanged: explicit fixtures, `sessionStorage` only, `?demo=true` ribbon, separated from real mode |
| Backend, staging, production | **Untouched.** No writes outside the local preview |

Consequently the screenshots prove rendering and client-side workflow, **not** server persistence.

## Branch / dependencies

- Branch: `web/w5-real-match-report-integration` (draft PR, not merged)
- Base: protected `main` @ `08763f60bbf0550b8a5f212c5a552da6cbaec9c3`
- Rebuilt on the W4 preview (PR #8 @ `5305511`) and merged with Core C2 head **`43f6613`** (PR #7, reconciled with `main`)
- Scope: `apps/web/` only. No edits to `apps/api`, `packages/contracts`, root docs, infra or release files.

## Screenshots

Captured from the actual app served by the local Vite dev server, at 1440×900 and 390×844.

1. `01-public-detail-desktop.png` — public scoreboard, completed match (`MAPI` vs opponent, period-grouped events)
2. `02-public-detail-mobile.png` — same state at mobile width
3. `03-admin-report-desktop.png` — admin report loaded: server result + immutable saved events
4. `04-admin-report-after-save-desktop.png` — after a score save (**PUT**) and one event send (**POST** with `clientEventId`)
5. `05-admin-report-after-save-mobile.png` — mobile layout of the same state
6. `06-public-detail-after-admin.png` — public view re-read from the (mocked) server state: 3–1 with the new event

Observed state during the run (from the automation log):

- public dialog rendered `2 - 1` with 1 goal + 1 card before any admin action;
- `PUT /api/v1/admin/matches/:id/result` body `{ "teamScore": 3, "opponentScore": 1 }`; UI confirmed *"Risultato salvato dal server"*;
- `POST /api/v1/admin/matches/:id/events` body included `kind: goal`, `side: team`, `period: 1`, `minute: 23`,
  `playerId: <persisted UUID>`, `assistPlayerId: null`, `clientEventId: <stable UUID>`;
- saved event rows went 2 → 3, and the public view then showed `3 - 1`;
- real-mode DOM contained no demo fixture strings and no `ANTEPRIMA W4` ribbon.

## States covered by component tests instead of browser capture

Not captured in this browser run (deliberately stopped before further selector work):

- public empty events, public "not published" (404), public error/retry, loading skeleton;
- W4 demo isolation ribbon.

These are asserted by `apps/web/test/w5-real-match-report.test.tsx` (Vitest + React Testing Library), which also covers
payload shapes, auth-header scoping, idempotent retry with the same `clientEventId`, partial failure, and absence of demo data.

## Contract notes

- `side: "team" | "opponent"` — no home/away inference; the UI labels the team side `MAPI` and the other side with the opponent name.
- `period: 1 | 2`, `minute` 1–120 within the period.
- Player and assist are persisted UUIDs from the roster/players endpoints; no free-text identity.
- Result save and event creation are **separate transactions**, with explicit partial-failure messaging and a server re-read after each send.
- C2 exposes no PATCH/DELETE for saved events: saved rows are displayed immutable with an explicit notice; only unsent drafts can be removed.

## Known gaps

- No PATCH/DELETE for saved events (upstream limitation).
- Final browser verification against a real Core API instance and PostgreSQL remains a separate QA gate.
- Real-mode venue/home-away remains ungrounded until a contract exists.

## Reproduction

```bash
# from this branch, with dependencies installed
pnpm --filter @myteam/web exec vite --port <free-port> --strictPort --host 127.0.0.1
```

Real mode is the default in the dev build (`?demo=true` switches to the W4 fixture preview). A real backend is required for
genuine data; the screenshots above used intercepted synthetic responses.
