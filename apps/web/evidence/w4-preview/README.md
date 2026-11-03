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
pnpm --filter @myteam/web exec vite --port 4174 --strictPort --host 127.0.0.1
```

Entry points:

- Public match detail: <http://127.0.0.1:4174/?demo=true&preview=match-detail&match=m-last>
- Public empty state: <http://127.0.0.1:4174/?demo=true&preview=match-detail&match=m-last&previewState=empty>
- Public loading state: <http://127.0.0.1:4174/?demo=true&preview=match-detail&match=m-last&previewState=loading>
- Public error state: <http://127.0.0.1:4174/?demo=true&preview=match-detail&match=m-last&previewState=error>
- Admin report editor: <http://127.0.0.1:4174/?demo=true&preview=admin-report&match=m-last>
- Admin empty report (scheduled match): <http://127.0.0.1:4174/?demo=true&preview=admin-report&match=m-friendly-1>

All preview URLs require `demo=true`; `preview=*` links are ignored outside a demo-capable build. The preview ribbon is visible on every W4 route.

## User flow to review

1. Open the public match detail. Verify score, scorer/assist hierarchy, cards, period grouping and metadata at desktop and mobile widths.
2. Use **Stati anteprima** in the dialog footer to review `Completa`, `Caricamento`, `Vuoto`, `Errore`.
3. Open the admin report editor. Change the score, add a goal with assist, or edit/delete an existing event.
4. Use **Salva bozza locale** to confirm the local-only save feedback.
5. Use **Applica e vedi anteprima** to return to the public detail and see the edited result/event.
6. Use **Ripristina fixture** to discard every local edit. Closing the tab also discards it.

The same flow was automatically exercised in Chromium: score `4 - 2` and a 90' goal by Luca Sala (assist Marco Villa) appeared in the public detail with **zero `/api/` requests**.

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

Reproduce with:

```bash
PREVIEW_URL=http://127.0.0.1:4174 \
  /opt/homebrew/opt/python@3.14/bin/python3.14 capture_preview.py
```

## Fidelity and honest gaps

- **Data source:** explicit `DEMO_MATCH_DETAILS` fixtures. No real match/result data was available because Core C2 contracts for results/events are not published.
- **Persistence:** admin edits live only in `sessionStorage` (`myteam_w4_match_preview_v1`). There is no backend write, no database, no API contract.
- **Contract status:** the preview uses the existing Web-local `MatchDetail` shape. Core must publish the C2 DTO for results/events before this is production code.
- **Scope:** only results, goals, assists and yellow/red cards are modeled. Penalties, own goals, substitutions, lineups, live minute updates and multi-user concurrency are out of scope.
- **Security:** demo-only deep links are gated on the existing demo policy; production builds must continue to disable demo mode. No auth or production behavior was changed.
- **Testing:** unit/component tests and build pass. The screenshots and flow are owner-review evidence, **not** an E2E PASS against a real backend.
- **Accessibility:** dialog roles, labels, keyboard Escape and focusable match rows were added, but a full WCAG audit was not performed.

## Verification run

```bash
pnpm --filter @myteam/contracts build
pnpm --filter @myteam/web typecheck
pnpm --filter @myteam/web test     # 12 files, 145 tests
pnpm --filter @myteam/web build
```

Layout audit: no horizontal overflow at 1440×900 or 390×844; dialog fills the mobile viewport and is capped at 92vh on desktop. Background scroll is locked while dialogs are open.

## Cleanup

```bash
# stop the dedicated preview server
lsof -ti tcp:4174 | xargs -r kill -TERM

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
