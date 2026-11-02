# API/Web OCI release-artifacts runbook

**Scope:** build and attest the API and Web OCI images only. This workflow does not edit staging manifests, deploy to K3s, or make an image digest a release approval.

## Workflow contract

`.github/workflows/release-artifacts.yml` is manual-only. It refuses non-`main` dispatches, non-full SHA input, and any source SHA other than the exact `GITHUB_SHA` of that run. First merge the reviewed BUILD workflow/runbook change through the normal protected-main review process. Dispatch only after that merge, from `main`, with `source_commit` set to the exact full SHA of the resulting protected-main commit selected for the run. The workflow checks out and rechecks that same SHA. That integration SHA may differ from both I4 (`e567deee…`) and the BUILD branch commit; do not pass either older SHA unless it is itself the `GITHUB_SHA` of a permitted main dispatch. This deliberately prevents labeling an arbitrary/unmerged checkout as trusted source; do not weaken the guard or infer provenance.

The Web client ID is a public, non-secret build input and is required. Confirm it is the approved value for the intended target before dispatch. Other Web OIDC defaults are the staging values defined in `deploy/docker/Dockerfile.web`; verify these with the release owner before a real build. Never pass credentials as build arguments.

The workflow creates two GHCR images and GitHub artifact attestations for each image. It disables the optional artifact-metadata storage-record feature, which is organization-only and not required for registry attestations in this personal-owner repository: SLSA build provenance and an SPDX SBOM generated from the pushed image and separately attested. It uses a unique run-specific locator tag, but the immutable artifact identity is the returned OCI digest; staging must pin `repository@sha256:…`, never rely on the tag. The Dockerfiles currently use version tags for base images (`node:26-alpine`, `nginx:1.27-alpine-slim`), not digest-pinned bases. The pushed output digest is immutable, but this workflow does not promise byte-for-byte reproducibility across future rebuilds; pin and review base-image digests in a separate BUILD change before claiming that guarantee.

The uploaded `release-provenance.json` is a handoff record with `verification.status: pending`; it is not a self-asserted verification result and does not modify `deploy/staging/`.

## Preconditions before a real dispatch

1. Review and merge this workflow/runbook. Confirm `main` requires review/checks for changes, including workflow changes. Confirm the repo is eligible for GitHub artifact attestations and has Actions package-write permission for both GHCR packages.
2. The release owner / Infra owner must explicitly approve the exact GitHub CLI signer identity `github.com/SimoGatti04/myteam-platform/.github/workflows/release-artifacts.yml` as the trusted signer expected by the strict validator. `gh attestation verify --signer-workflow` expects `[host/]<owner>/<repo>/<path>/<workflow>`, not a repository-relative workflow path and not a `@refs/heads/main` suffix. The workflow itself enforces dispatch from `refs/heads/main`; the signer-workflow selector pins the workflow identity, while `--source-commit` pins the source commit. Do not run a staging gate until the trusted identity is agreed.
3. Confirm the Web public client ID and the Dockerfile's staging OIDC endpoints/redirects. No secret is needed by this workflow beyond the ephemeral `GITHUB_TOKEN` provided to Actions; it is not stored or printed.
4. Dispatch **from `main`** with `source_commit` equal to the full SHA displayed for that `main` run. If it is not the exact approved source SHA, stop. A workflow-only merge creates a new Git SHA; record and QA/release-review that SHA rather than claiming an older I4 SHA was built.

## Handoff to Infra (not performed here)

1. Download `release-artifacts-<source SHA>` from the successful run and retain its provenance JSON and both SPDX files with the run URL/ID.
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
