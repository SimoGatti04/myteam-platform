# Core Readiness R3 — reconstruction report

**Date:** 2 November 2026
**Repository:** `SimoGatti04/myteam-platform`
**Branch:** `core/readiness-r3-reconstructed`
**Worktree:** worktree Git locale isolato, non versionato e non riproducibile da questo repository
**Verified base:** `origin/core/readiness-r1` @ `58145314fae1588616de8f9680332a27f4cfbe7e`
**Original I3 ancestor:** `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`

## Provenance and search result

The prior R2 SHA `21cfba4a33f1bf7f412881c256526fabe5231be4` and reported R3 SHA `843e9f4a6a34220ac0278e86a265572fe311708b` were not present in the local object database, branches, remote-tracking refs, available worktrees, or the targeted local candidate paths. The QA report cited a local R2 source worktree, but that worktree is no longer present. The report used here is `qa/platform-r2-infra-r3-review` @ `74e86803adf16da23c2f478201c33a28383bb3fc`, read in full. It records QA-READY-01-R2, including a PostgreSQL 16 `pool.max=1` reproduction and the expected checked-out pool counts after timeout.

This branch is therefore a **new reconstruction**, not restoration of or proof about either missing SHA. It is based on the locally verifiable R1 commit above. The recorded I3 base is the parent of the verified R1 commit. R2 behavior visible in the QA report (single-flight and a pool-waiter guard) is implemented afresh in the candidate; equivalence to the unavailable R2 source is not claimed.

## Root cause

`Promise.race()` bounds how long the caller waits; it does not cancel `pool.connect()`. If the application times out while the acquisition is queued and the pool later grants a client, the timed-out request no longer owns a continuation that releases the client. That leaves the client checked out, and repeated probes can consume the pool. The exact node-postgres behavior was independently reproduced against PostgreSQL 16 on this host (see tests below); the unavailable R2 source itself was not run.

## Remediation

- Use an explicit `pool.connect()` client lifecycle, then run only `SELECT 1`.
- Apply one overall 2,000 ms default deadline across acquisition and query. On query failure or timeout, pass a sanitized error to `client.release(error)` so node-postgres discards the connection rather than returning an in-flight/uncertain client to the pool.
- Attach success and rejection handlers to the acquisition promise immediately. If the acquisition resolves after probe completion, discard and release the late client exactly once; late rejection is observed.
- Keep a per-pool single-flight promise for concurrent callers. Preserve the `waitingCount` fail-fast guard (default maximum 2). If an uncancellable acquisition is still pending after timeout, subsequent probes fail closed without queuing another acquire until it settles.
- Clear timers on all completion paths, including synchronous `pool.connect()` failure. HTTP responses remain generic and contain no driver/database details. `/health` remains independent of PostgreSQL. `/ready` checks dependency connectivity only; it does not inspect schema/migration state or apply migrations.

No contract package or migration change was needed. The response contract remains `/ready` HTTP 200 when `SELECT 1` succeeds, otherwise 503 with the established safe body. Core's internal timeout remains 2 seconds; the external Kubernetes readiness budget is Infra-owned and the QA report recommends a 3-second margin.

## Verification evidence

| Check | Result | Evidence / limitation |
|---|---|---|
| PostgreSQL 16 reproduction of uncancelled `pool.connect()` + timeout race | **PASS (reproduction)** | With `max=1`, the timed-out acquisition remained checked out after the blocker was released: `totalCount=1`, `idleCount=0`, `waitingCount=0`. The reproduction then discarded its client and closed its pool. It modeled the QA-described acquisition lifecycle; it did not execute the unavailable R2 commit. |
| API unit suite, including readiness lifecycle and HTTP cases | **PASS** | 17 passed, 0 failed (14 readiness-focused cases). Covers timely acquire, sync/async acquisition errors, late acquire/rejection, query failure/timeout, single-flight, congestion, pool recovery, safe HTTP 503, and DB-independent `/health`. |
| PostgreSQL integration suite against disposable local PostgreSQL 16 | **PASS** | 2 passed, 0 failed, 0 skipped. Readiness test held the sole client, timed out a queued probe, released the holder, observed the late socket discarded (`totalCount=0`), then verified a subsequent `SELECT 1` and idle-pool recovery. Existing migration/public-flow integration also passed. |
| `pnpm check` build | **PASS** | contracts, API and Web builds completed. No Web files changed. |
| `pnpm check` typecheck | **PASS** | contracts, API (including test config) and Web typecheck completed. |
| `pnpm check` overall | **FAIL — stale QA fixture** | All 17 Core API unit tests and 4 of 5 `tests/api/*.test.ts` passed. The remaining pre-existing `tests/api/ready.test.ts` success fixture supplies only `query()`; the corrected readiness implementation requires a real `Pool`-compatible `connect()` and returned 503 for that incomplete mock. QA-owned files were not edited under the Core-only scope. Core-owned HTTP tests with a `connect()` fixture pass. This fixture needs a coordinated QA update before the repository-wide check can be green. |
| Full baseline test suite against the unavailable R2/R3 source | **NOT RUN** | Those commits are missing locally, so no before/after execution against the original implementation is possible. The acquisition mechanism was instead reproduced directly on real PostgreSQL 16. |
| Kubernetes staging probe / cluster | **NOT RUN** | No Infra/K3s interaction was authorized or performed. |

## Files changed

- `apps/api/src/persistence/readiness.ts`
- `apps/api/test/unit/readiness.test.ts`
- `apps/api/test/integration/readiness-pool.test.ts`
- `docs/STATUS.md`
- `docs/CORE-READINESS-R3-RECONSTRUCTION.md`

No `Infra`, `Web`, `iOS`, `CSI`, `packages/contracts`, or QA-owned `tests/` file was modified. No push, merge, deploy, or cluster operation was performed.

## Next gate

1. QA updates the query-only readiness mock to represent the supported PostgreSQL Pool client lifecycle, without changing the HTTP contract.
2. Re-run `pnpm check` and independent readiness QA on this reconstructed commit.
3. Infra separately verifies that its rendered kubelet `timeoutSeconds` exceeds Core's 2-second internal budget (the QA report identified 2 seconds as insufficient; 3 seconds was recommended).
4. Only after those gates can the joint I4 release decision be revisited. This report does not authorize merge or deployment.
