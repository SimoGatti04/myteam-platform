# W4 — Match detail & admin report: early visual preview

**Status: OWNER REVIEW PREVIEW — NOT an E2E pass, not backend integration, not a production/staging deployment.**

This branch explores the public match detail (result, goals, assists, cards) and the admin reporting workflow before extending implementation. It uses the existing W3 public/admin shell and explicit, realistic demo fixtures. It does **not** fake a working Core API.

## Branch and base

- Branch: `web/w4-match-results-admin-preview`
- Base: protected `main` at `77cf1302c44d78a9ab547b6ebedabd304b801bff` (PR5/PR6 merged)
- Isolated git worktree used for the preview (disposable): `/private/tmp/myteam-platform-web-w4`
- Ownership respected: changes are confined to `apps/web/` (plus this evidence folder). No Core API, contracts, release, infra or production/staging writes.

## Local preview

The disposable preview server is intentionally on a dedicated port:

```bash
# from the worktree
pnpm --filter @myteam/web exec vite --port 4175 --strictPort --host 127.0.0.1
```

Entry points:

- Public match detail: <http://127.0.0.1:4175/?demo=true&preview=match-detail&match=m-last>
- Public empty state: <http://127.0.0.1:4175/?demo=true&preview=match-detail&match=m-last&previewState=empty>
- Public loading state: <http://127.0.0.1:4175/?demo=true&preview=match-detail&match=m-last&previewState=loading>
- Public error state: <http://127.0.0.1:4175/?demo=true&preview=match-detail&match=m-last&previewState=error>
- Admin report editor: <http://127.0.0.1:4175/?demo=true&preview=admin-report&match=m-last>
- Admin empty report (scheduled match): <http://127.0.0.1:4175/?demo=true&preview=admin-report&match=m-friendly-1>

All preview URLs require `demo=true`; `preview=*` links are ignored outside a demo-capable build. The preview ribbon is visible on every W4 route.

## User flow to review

1. Open the public match detail. Verify score, scorer/assist hierarchy, cards, period grouping and metadata at desktop and mobile widths.
2. Use **Stati anteprima** in the dialog footer to review `Completa`, `Caricamento`, `Vuoto`, `Errore`.
3. Open the admin report editor. Change the score, add a goal with assist, or edit/delete an existing event.
4. Use **Salva bozza locale** to confirm the local-only save feedback.
5. Use **Applica e vedi anteprima** to return to the public detail and see the edited result/event.
6. Use **Ripristina fixture** to discard every local edit. Closing the tab also discards it.

The same flow was automatically exercised in Chromium on 4 November 2026: score `4 - 2` and a 90' goal by Luca Sala (assist Marco Villa) appeared in the public detail with **zero `/api/` requests**. The edit existed only in `sessionStorage` (`myteam_w4_match_preview_v1`). All match, player and event data are synthetic fixtures; there is no backend, API or database integration, and this is **not E2E**.

## Evidence

All images are 1440×900 desktop or 390×844 mobile captures from the actual app code.

| File | What it shows |
| --- | --- |
| `01-public-match-detail-desktop.png` | Public result/goals/cards detail, desktop |
| `02-public-empty-desktop.png` | Explicit empty state |
| `03-public-loading-desktop.png` | Loading skeleton |
| `04-public-error-desktop.png` | Error state with retry; no substituted data |
| `05-public-match-detail-mobile.png` | Public detail, mobile |
| `06-admin-report-desktop.png` | Admin reporting workflow, desktop |
| `07-admin-report-with-local-goal-desktop.png` | Goal + assist added locally before save |
| `08-public-after-local-save-desktop.png` | Public detail after local apply |
| `09-admin-report-mobile.png` | Admin reporting workflow, mobile |
| `10-admin-report-validation-mobile.png` | Event-form validation, mobile |
| `11-admin-report-empty-mobile.png` | Empty report for a match without events, mobile |
| `12-admin-match-list-referto-desktop.png` | Admin match list entry point with the DEMO Referto action |

### Durable GitHub evidence (PR8 branch)

- Evidence index: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/README.md>
- Public detail, desktop: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/01-public-match-detail-desktop.png>
- Public detail, mobile: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/05-public-match-detail-mobile.png>
- Admin report, desktop: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/06-admin-report-desktop.png>
- Admin report, mobile: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/09-admin-report-mobile.png>
- Public detail after local apply: <https://github.com/SimoGatti04/myteam-platform/blob/web/w4-match-results-admin-preview/apps/web/evidence/w4-preview/08-public-after-local-save-desktop.png>

Reproduce with:

```bash
PREVIEW_URL=http://127.0.0.1:4175 \
  /opt/homebrew/opt/python@3.14/bin/python3.14 capture_preview.py
```

## Fidelity and honest gaps

- **Data source:** explicit `DEMO_MATCH_DETAILS` fixtures. No real match/result data was used; C2 results/events exist only as draft PR #7 and are not merged.
- **Persistence:** admin edits live only in `sessionStorage` (`myteam_w4_match_preview_v1`). There is no backend write, no database, no API contract.
- **Contract status:** the preview uses the existing Web-local `MatchDetail` shape. Core must publish the C2 DTO for results/events before this is production code.
- **Scope:** only results, goals, assists and yellow/red cards are modeled. Penalties, own goals, substitutions, lineups, live minute updates and multi-user concurrency are out of scope.
- **Security:** demo-only deep links are gated on the existing demo policy; production builds must continue to disable demo mode. No auth or production behavior was changed.
- **Testing:** unit/component tests and build pass. The screenshots and flow are owner-review evidence, **not** an E2E PASS against a real backend.
- **Accessibility:** dialog roles, labels, keyboard Escape and focusable match rows were added, but a full WCAG audit was not performed.

## C2 PR7 contract alignment (draft, not merged)

Compared against draft PR #7 (`core/c2-match-results-events`, `ef7a993`) on 4 November 2026. This table records gaps; none are implemented here.

| W4 preview (PR8) | C2 PR7 contract | Mismatch / decision |
| --- | --- | --- |
| `homeScore` / `awayScore`, `isHome`, home/away scoreboard | `teamScore` / `opponentScore`, `side: "team" \| "opponent"` | C2 does not persist home/away venue. UI venue orientation is an unsupported assumption. |
| `MatchDetailEvent.type` | `MatchEventDto.kind` | Field rename required. |
| `period: "1T" \| "2T"` | `period: 1 \| 2` | Encoding and ordering must be mapped. |
| `team: "home" \| "away"` | `side: "team" \| "opponent"` | Semantics differ, not just names. |
| Free-text `playerName` / `assistPlayerName` | `player` / `assist` = `{ id, displayName }`; team events require UUID `playerId`; opponent identity is null | Preview accepts typed names; C2 requires player identity and server-resolved names. |
| Minute `1..130` | Minute `1..120` within period | Range and per-period semantics differ. |
| Event edit and delete in the report form | `POST /matches/:id/events`, `GET /matches/:id/events`; no PATCH/DELETE | C2 has no correction API. |
| Score and events committed by one local action | `PUT /matches/:id/result` is separate from `POST /matches/:id/events` | No atomic “apply full report” endpoint. |
| `potmPlayerName`, `round`, `field`, standing positions | Absent from `PublicMatchScoreboardDto` | These fields remain fixture-only until a product/Core decision. |
| String IDs such as `m-last` | UUIDs required | Demo-only fixtures are not contract-valid IDs. |
| Detail rendered from local fixtures | New `GET /api/v1/public/matches/:id/scoreboard` | Web must adopt the scoreboard endpoint; `/public/matches/:id` stays unchanged. |

### Decisions awaiting owner

1. Model home/away explicitly, or expose team/opponent as the product vocabulary?
2. Are minutes period-relative (`period` + minute) as in C2, or an absolute/recovery clock?
3. Should C2 add audited edit/delete, or is append-only event entry acceptable?
4. Is the result authoritative when events are incomplete, and should the UI state that completeness is unknown?
5. Should corrections to an already published match appear immediately, or require a separate publication gate?
6. Must scorers be validated against the match lineup/season roster, beyond “player exists”?
7. Do POTM, field, round and standings belong in C2, or stay as separate public content?
8. Is one-step “apply result + events” a required admin workflow, or are two explicit steps acceptable?
9. May a match without a scheduled date be completed with a result, as C2 currently allows?

## Verification run

```bash
pnpm --filter @myteam/contracts build
pnpm --filter @myteam/web typecheck
pnpm --filter @myteam/web test     # 12 files, 145 tests
pnpm --filter @myteam/web build
pnpm check                         # PASS: build, typecheck, API tests
```

Fresh Chromium capture on 4 November 2026 reproduced the committed desktop/mobile evidence; hashes matched byte-for-byte except the animated loading frame. Layout audit: no horizontal overflow at 1440×900 or 390×844; dialog fills the mobile viewport and is capped at 92vh on desktop. Background scroll is locked while dialogs are open.

## Cleanup

```bash
# stop the dedicated preview server (use the port you started)
lsof -ti tcp:4175 | xargs -r kill -TERM

# after owner review and merge/abandon
git worktree remove /private/tmp/myteam-platform-web-w4
```

The browser `sessionStorage` data disappears when the review tab/context is closed; **Ripristina fixture** clears it immediately.

## Acceptance questions for the owner

1. Is the public match-detail direction right: scoreboard first, then period-grouped goals/cards with home/away sides and assist hierarchy?
2. Does the admin workflow match the expected order — score, events, local save, public preview — or should result entry be a separate step/approval?
3. Are the event fields sufficient for C2 coordination (team, period, minute, player, assist), or should penalties/own goals/substitutions be included now?
4. Is the explicit `DEMO` / `ANTEPRIMA LOCALE` / `sessionStorage` labeling sufficient, or should this preview live behind a stricter separate review route?
5. Do you approve this branch for a draft PR / extended implementation after Core C2 publishes the contract? No merge is proposed before review.
