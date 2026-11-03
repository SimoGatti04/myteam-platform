# API/Web OCI release-artifacts runbook

**Scope:** build and attest the API and Web OCI images only. This workflow does not edit staging manifests, deploy to K3s, or make an image digest a release approval.

## Workflow contract

`.github/workflows/release-artifacts.yml` is manual-only. It refuses non-`main` dispatches, non-full SHA input, and any source SHA other than the exact `GITHUB_SHA` of that run. First merge the reviewed BUILD workflow/runbook change through the normal protected-main review process. Dispatch only after that merge, from `main`, with `source_commit` set to the exact full SHA of the resulting protected-main commit selected for the run. The workflow checks out and rechecks that same SHA. That integration SHA may differ from both I4 (`e567deee…`) and the BUILD branch commit; do not pass either older SHA unless it is itself the `GITHUB_SHA` of a permitted main dispatch. This deliberately prevents labeling an arbitrary/unmerged checkout as trusted source; do not weaken the guard or infer provenance.

`target_environment` defaults to `staging`; a production dispatch requires literal `production_confirmation=PRODUCTION` plus explicit public values for the Logto Web client ID, issuer/OIDC endpoint, API resource, redirect URI and post-logout redirect URI. Production validation rejects staging-host URLs and never falls back to staging metadata. Staging retains the historical public OIDC defaults; its Web client ID remains required. Confirm every value with the release owner before dispatch and never pass credentials as build arguments. See `docs/release/PRODUCTION-RELEASE-DESIGN.md` for the production decision and deployment gate.

The workflow creates two GHCR images and GitHub artifact attestations for each image. It disables the optional artifact-metadata storage-record feature, which is organization-only and not required for registry attestations in this personal-owner repository: SLSA build provenance and an SPDX SBOM generated from the pushed image and separately attested. It uses a target-and-run-specific locator tag, but the immutable artifact identity is the returned OCI digest; staging and production must pin `repository@sha256:…`, never rely on the tag. The Dockerfiles pin their Node and Nginx base-image indexes by digest, and dependencies install from the frozen lockfile. That removes mutable base-tag drift, but the evidence of a release remains the attested output digest and exact source commit, not an assumption that independent rebuilds must be byte-identical.

The uploaded `release-artifacts-<environment>-<source SHA>` bundle contains a `release-provenance.json` handoff record with `verification.status: pending` and `targetEnvironment`; it is not a self-asserted verification result and does not modify `deploy/staging/` or any future production manifests.

## Preconditions before a real dispatch

1. Review and merge this workflow/runbook. Confirm `main` requires review/checks for changes, including workflow changes. Confirm the repo is eligible for GitHub artifact attestations and has Actions package-write permission for both GHCR packages.
2. The release owner / Infra owner must explicitly approve the exact GitHub CLI signer identity `github.com/SimoGatti04/myteam-platform/.github/workflows/release-artifacts.yml` as the trusted signer expected by the strict validator. `gh attestation verify --signer-workflow` expects `[host/]<owner>/<repo>/<path>/<workflow>`, not a repository-relative workflow path and not a `@refs/heads/main` suffix. The workflow itself enforces dispatch from `refs/heads/main`; the signer-workflow selector pins the workflow identity, while `--source-commit` pins the source commit. Do not run a staging gate until the trusted identity is agreed.

`--source-digest` format contract: the strict validator passes the bare full 40-character source SHA. GitHub CLI 2.103.3 compares it exactly against the certificate `SourceRepositoryDigest`; adding a `sha1:` prefix fails verification. This was confirmed against the published `7a010fd…` API image; the reproducible read-only command and evidence are in `docs/infra/STAGING-SCRIPT-EVIDENCE.md`.
3. Confirm the target environment and its approved public Web client ID/issuer/API resource/redirect/logout values. For production, complete the decisions listed in `docs/release/PRODUCTION-RELEASE-DESIGN.md`; do not reuse the staging Web client ID or staging URLs. No secret is needed by this workflow beyond the ephemeral `GITHUB_TOKEN` provided to Actions; it is not stored or printed.
4. Dispatch **from `main`** with `source_commit` equal to the full SHA displayed for that `main` run. If it is not the exact approved source SHA, stop. A workflow-only merge creates a new Git SHA; record and QA/release-review that SHA rather than claiming an older I4 SHA was built.

## Handoff to Infra (not performed here)

1. Download `release-artifacts-<environment>-<source SHA>` from the successful run and retain its provenance JSON and both SPDX files with the run URL/ID.
2. Independently verify each registry digest and its GitHub attestation against repository `SimoGatti04/myteam-platform`, the approved signer workflow, and the exact source SHA. The strict gate remains authoritative; expected invocation after Infra has pinned the staging manifests and placed the pending JSON at `deploy/staging/release-provenance.json`:

   ```sh
   python3 scripts/validate-release-images.py \
     --require-provenance --check-registry \
     --source-commit <full-source-sha> \
     --signer-workflow github.com/SimoGatti04/myteam-platform/.github/workflows/release-artifacts.yml
   ```

3. Only Infra may run `scripts/pin-release-images.py` to update staging Kustomize references and install the downloaded pending record. Run the strict validator after that change. A pass is necessary but not sufficient for staging GO; deployment, secrets, database, backup/restore, and runtime gates remain separate.

## Local non-publishing smoke

On macOS with Docker daemon available, use the exact source checkout and a non-production fake client ID. Build without `--push` and do not log in to GHCR:

```sh
docker buildx build --load -f deploy/docker/Dockerfile.api -t myteam-api:local-smoke .
docker buildx build --load -f deploy/docker/Dockerfile.web \
  --build-arg VITE_APP_ENV=production \
  --build-arg VITE_ENABLE_DEMO=false \
  --build-arg VITE_LOGTO_APP_ID=local-smoke-client \
  -t myteam-web:local-smoke .
```

These commands only build local smoke images; they do not create attestations or qualify a release.
