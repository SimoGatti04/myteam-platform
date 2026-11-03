# MYTEAM-PLATFORM — INFRA S1-R4 Recovery / Rebuild Report

**Date:** 2 November 2026
**Repository root:** `/Users/gatti/Workspace/myteam-platform`
**Execution worktree:** `/Users/gatti/.codex/worktrees/infra-s1-r4-release-hardening/myteam-platform`
**Branch:** `infra/s1-r4-reconstruction-20261102`
**Verified base:** `infra/s1-r3-release-hardening` @ `1d4188f1aebced0af3666c0e22250ed928c58ffd`
**Prior claimed target:** `adb1ed3947b0cdf2a9f67ba190c4cbe74149a7fd` — **NOT RECOVERABLE LOCALLY**
**QA2:** `qa/platform-r3-infra-r4-review` @ `480b3006b22d239de50ea6b04b2d71d1ba4e265b`; report `docs/qa/CHECKPOINT-PLATFORM-R3-INFRA-R4-REPORT.md`
**Resulting checkpoint SHA:** reported in the handoff after this report is committed; it is a new reconstruction, not the prior claimed SHA.

## 1. Executive Summary

The exact previously claimed R4 commit could not be recovered. Read-only inspection found that the task-named worktree was clean and detached at the R3 base, not at R4. The claimed commit object was absent from the repository object database and all scanned reflogs/refs; the task worktree's prior `/private/tmp/myteam-platform-s1-r4` path no longer existed. Read-only searches under the workspace, Codex worktrees and `/private/tmp` found no project-specific R4 bundle/backup. Generic bundles found in the search were unrelated. No fetch, reset, clean, prune, worktree removal or other destructive alignment was performed.

A new isolated branch was created directly from the verified R3 base. A minimal Infra-owned reconstruction addresses Lease ownership/concurrency, readiness timeout, ExternalSecret bootstrap behavior and OCI release validation/pinning procedure. The QA-owned browser test was not changed. No shared `infra/` repository, application code, tests, GitHub workflows, cluster, registry, DNS, Cloudflare, database, secrets or remote Git refs were modified.

**Verdict: INFRA S1-R4 RECONSTRUCTION — PARTIAL, READY FOR INDEPENDENT QA OF THE IMPLEMENTED INFRA SCOPE.** The release cannot be called fully validated: browser security remains QA-owned/open, and real image digests/attestations and live environment prerequisites are not available or were not exercised.

## 2. Recovery and Git Identity

| Check | Result |
|---|---|
| Canonical root identity | The execution worktree resolves to the Git common directory `/Users/gatti/Workspace/myteam-platform/.git`; it is the requested MAPI Platform monorepo, not MyTeam Video or a separate repository. |
| Starting worktree | Clean, detached at `1d4188f1aebced0af3666c0e22250ed928c58ffd`. |
| Base identity | The base commit has parent `b925c9622c498818157b68d24ea4af38f6e304da`; it is the R3 tip and is an ancestor of the reconstruction branch. |
| Claimed R4 object | `git cat-file` could not resolve `adb1ed3947b0cdf2a9f67ba190c4cbe74149a7fd`; `git fsck --full --no-reflogs --unreachable` did not find it. |
| Reflogs/refs | No matching SHA or R4 development ref found. The QA2 branch/report was present and read; it confirms the R4 object and report were unavailable to QA2. |
| Worktree/backups | The prior `/private/tmp/myteam-platform-s1-r4` worktree path was absent. Read-only search of `/Users/gatti/Workspace`, `/Users/gatti/.codex`, and `/private/tmp` (bounded to depth 6) found no project-specific R4 bundle or backup. No unrelated stale worktree metadata was pruned. |
| New branch | `infra/s1-r4-reconstruction-20261102`, created from the verified R3 base in the task-owned worktree. |

This branch and its future commit must not be represented as the missing historical R4 SHA or as a recovered exact state.

## 3. Implemented Remediation

### 3.1 P1 — Kubernetes Lease lock

**Changed:** `scripts/k8s-lease-lock.py`, `deploy/staging/deploy-stage.sh`.

- Acquire with Kubernetes `create` so initial ownership is atomic; namespace bootstrap uses idempotent `create` and verifies existence before lock acquisition rather than skipping the lock.
- Stale takeover and heartbeat renewal use `replace` with the observed `resourceVersion` (compare-and-swap); a lost conflict fails closed.
- Runner owner is a per-invocation UUID, not a reused release label. Lease expiry is based on `renewTime` (or `acquireTime`) and `leaseDurationSeconds`; malformed/unknown timestamps are not stolen.
- The heartbeat runs while the staged deployment is in progress and signals the runner to stop if ownership cannot be renewed.
- Release verifies the current holder and uses a version-guarded update to clear the holder. A non-owner cannot release it. On uncertainty the lock is left to expire rather than forcibly deleted.
- Every run creates a unique migration Job name. Existing completed Jobs are left untouched; any active migration Job blocks the new run. The script contains no migration-Job deletion.
- Kustomize migration stage, migration completion, application rollout, and routing remain sequential and fail-closed.

**Evidence:** synthetic, in-process fake-API concurrency checks passed for two competing acquirers (one winner), stale takeover, CAS renewal, denial of foreign release and owner release. `bash -n` passed. No K3s calls were made. These are synthetic checks, not Kubernetes API-server tests; real API conflict, process-kill and RBAC behavior remain **NOT RUN**.

### 3.2 P1 — Readiness and bootstrap prerequisites

**Changed:** `deploy/staging/03-apps/api.yaml`, `deploy/staging/01-bootstrap/external-secret.yaml`.

- API readiness uses `timeoutSeconds: 3`, `periodSeconds: 5`, and `failureThreshold: 3`; liveness remains `/health`. Startup probe remains `/health` with 3-second periods and threshold 20 (nominal 60-second startup window).
- The manifest comment records the approximately 2-second Core readiness budget as an expectation to verify on the actual integrated candidate; the extra second is headroom, not proof that a particular Core R3 artifact is present.
- ExternalSecret `creationPolicy` changes from `Merge` to `Owner`, so a fresh namespace can create its target Secret rather than relying on an undocumented pre-created Secret.
- PostgreSQL remains `postgres:16-alpine` with UID/GID/fsGroup 70, matching the inspected image policy and preflight requirement.

**Evidence:** all four Kustomize stage renders passed; rendered readiness values and static manifest fields were inspected. Core R3 integration, live External Secrets Operator behavior, GHCR pull credentials and node storage ownership/capacity were **NOT RUN**. No manifest was applied to a cluster.

### 3.3 P1 — OCI source provenance and immutable release gate

**Changed:** `scripts/pin-release-images.py`, `scripts/validate-release-images.py`.

- Pinning now requires a full 40-character source commit and exact `sha256:<64 lowercase hex>` digests for API and Web; the API digest is applied to both migration Job and API Deployment. The commit must equal the source checkout's Git HEAD at pin time.
- Pinning writes `deploy/staging/release-provenance.json` with the repository, source commit, exact API/Web digest mapping and an explicit `pending` verification state. Pinning is a declaration, not itself proof of provenance.
- The strict release gate (`--require-provenance --check-registry`) rejects absent/discordant provenance, tag-only references, repository/digest mismatches and API/Job image mismatches. It requires an explicit full `--source-commit` and trusted `--signer-workflow`; `gh attestation verify` must validate each immutable OCI image, repository, signer workflow, SLSA predicate and the bare full 40-character source commit. It also checks that the verified statement subject contains the selected digest.
- The no-flag mode is explicitly described as local manifest-shape checking only and prints **NOT RELEASE VERIFIED**; it is not a provenance or registry PASS.
- The installed `gh attestation verify --help` confirms the local CLI supports `--repo`, `--signer-workflow`, `--source-digest`, and JSON verification output. The existing `docker-ci.yml` does not produce/publish the release images or attestations; the trusted release-builder identity must be selected and attestation generation authorized before a real release check can pass.

**Evidence:** synthetic pinning test passed against temporary fixture manifests; synthetic attestation-policy tests passed for exact digest/source/signer arguments and missing-attestation rejection. Post-staging empirical correction (3 November 2026): `gh` 2.103.3 verified the published API digest only with the bare 40-character SHA and rejected a `sha1:` prefix; see `STAGING-SCRIPT-EVIDENCE.md`. The default validator passed only the local structure/API-migration check and explicitly reported release verification **NOT RUN**. The strict gate was invoked against current unpinned manifests and failed closed because `release-provenance.json` is absent. The original remediation run performed no GHCR push, image build, registry read, or real attestation check; the later read-only verification is recorded above. Therefore OCI **remediation tooling is implemented; release provenance remains OPEN until real artifacts and attestations exist and verify**.

### 3.4 P2 — Production Playwright security

**Status: OPEN / QA-OWNED.** No file under `tests/` or Web application source was changed, and the production browser test was not run. The QA2 independent gate owns that test boundary. The selector/storage failure from the prior QA remains unverified until QA2 tests an available target or coordinates a separately authorized change with the QA owner.

## 4. Staging Preconditions Retained

- Homelab-specific settings remain the responsibility of the separate Infra repository/DEPLOY-ENV workstream; that repository and its overlays were not opened for writing.
- The generic staging API/Web/migration Pod specs do not add GHCR credentials or a homelab ServiceAccount. The future environment overlay must create/provide the pull Secret and associate it through the selected ServiceAccount before pulling private images.
- The PostgreSQL host path/PV must be provisioned with UID/GID `70:70`, mode `0700`, and capacity validated against current node headroom. This task performed no `sudo`, host-path creation, or storage mutation.
- Off-node backups and an isolated restore test remain mandatory before staging GO. No backup or restore was run.
- ExternalSecret live store access and secret-key population remain unverified; values were not read or exposed.
- No tag was presented as an immutable release. Current Kustomize tags are inherited placeholders/candidate references, not validated release artifacts. Digest pinning and signed provenance are future release gates.

## 5. Verification Record

| Check | Result | Scope / limitation |
|---|---|---|
| Base SHA and ancestry | **PASS** | Exact R3 commit inspected; ancestor relationship verified. |
| Claimed R4 recovery scan | **NOT RECOVERABLE** | `cat-file`, refs/reflogs, unreachable-object scan, surviving worktree and bounded bundle/backup search. |
| `bash -n deploy/staging/deploy-stage.sh` | **PASS** | Syntax only; no cluster commands executed. |
| Python compilation for the three Infra scripts | **PASS** | Run using Python 3.12 via uv; PyYAML supplied as an ephemeral uv dependency cached under `/private/tmp`, not added to the repository. |
| Kustomize `01-bootstrap`, `02-migration`, `03-apps`, `04-routing` | **PASS** | Client-side render only; no API-server validation or apply. |
| Lease locking concurrency/ownership synthetic tests | **PASS** | Fake Kubernetes API; one winner under two contenders, stale CAS, renew, foreign-release denial and owned release. |
| OCI pin/provenance synthetic tests | **PASS** | Temporary fixture files and mocked attestation verifier; not a real signed attestation. |
| Default release-image validation | **PASS — STRUCTURAL ONLY** | API/Job consistency and manifest shape. Output explicitly says not release verified. |
| Strict release gate | **FAIL-CLOSED AS EXPECTED** | Current digest/provenance release artifacts are absent. This is not a registry failure result. |
| `git diff --check` | **PASS** | No whitespace errors in current diff. |
| Playwright/browser production test | **NOT RUN** | QA-owned; browser gate not independently reproduced in this work. |
| Docker smoke/build | **NOT RUN** | No image build or runtime needed for scoped synthetic remediation; no Docker operation initiated. |
| Real GitHub attestation / GHCR check | **NOT RUN** | No release images/digests or authorized attestation-producing workflow available. |
| K3s / Infisical / Cloudflare / DNS / DB / backup restore | **NOT RUN** | Explicitly outside scope; no live mutations. |

## 6. Change Boundary and Handoff

Expected committed files are limited to:

- `deploy/staging/deploy-stage.sh`
- `deploy/staging/01-bootstrap/external-secret.yaml`
- `deploy/staging/03-apps/api.yaml`
- `scripts/k8s-lease-lock.py`
- `scripts/pin-release-images.py`
- `scripts/validate-release-images.py`
- this remediation report

No changes were made to Core, Web application source, QA-owned tests, the separate Infra repository, GitHub workflow files, lockfiles, secrets or runtime systems. The canonical checkout's pre-existing untracked files were not changed. No remote operation, push, merge, deploy, Terraform or Cloudflare operation was performed.

**Next gate:** QA2 independently reviews this newly labeled reconstruction branch and owns the browser security verification. Separately, the release owner must provide an authorized image build/attestation workflow and exact trusted signer identity; then digest pinning and the strict gate can be run against the actual candidate. The final commit SHA is new and has R3 as its parent; it does not restore or replace the missing `adb1ed…` commit.
