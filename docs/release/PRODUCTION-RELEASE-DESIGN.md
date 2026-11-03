# Production Web+API release design

**Status:** PROPOSED build/tooling preparation. No production image has been built or published, no production namespace, route, secret, migration, database or workload exists, and no production hostname or Logto client metadata has been approved in this repository.

## Current source facts

- `.github/workflows/release-artifacts.yml` is manual-only and accepts a dispatch only from `refs/heads/main`, at an exact full source SHA. It publishes API and Web OCI images to GHCR, creates SLSA provenance and SPDX SBOM attestations, and uploads a pending handoff record.
- The Web image embeds public OIDC configuration at build time. Before this change its Dockerfile defaults were staging values, so a production build could silently reuse the staging API resource and redirect if only the client ID was replaced.
- The API and Web Dockerfiles now pin their Node and Nginx base-image indexes by digest and install from the frozen lockfile. The attested output digest remains the release identity.
- `deploy/staging/` is a complete staging-only deployment path with namespace `myteam-platform-staging`, staging ExternalSecret keys, a migration Job, application Deployments and the `team-staging.simogatti.it` HTTPRoute. It must not be copied or applied to production unchanged.

## Build contract

The existing release workflow is environment-parametric and keeps `staging` as its default:

1. `source_commit` must equal the exact protected-`main` SHA of the workflow run.
2. `target_environment` is `staging` or `production`.
3. A production run additionally requires literal `production_confirmation=PRODUCTION` and all of these public, non-secret inputs:
   - `web_logto_app_id`
   - `web_logto_endpoint` (issuer/OIDC endpoint)
   - `web_logto_api_resource` (API audience)
   - `web_logto_redirect_uri`
   - `web_logto_post_logout_redirect_uri`
4. `scripts/resolve-release-web-config.py` rejects incomplete production configuration, non-HTTPS URLs, credentials, query strings, fragments, newlines, and any production URL using `team-staging.simogatti.it`. It writes the validated values to `GITHUB_ENV` without printing them.
5. Staging keeps the historical OIDC endpoint, API resource, callback and post-logout defaults. Its Web client ID remains required.
6. Both images receive a target-scoped tag and `com.myteam-platform.environment` label. The tag is only a locator: deployment must pin the returned `repository@sha256:...` digest. The pending provenance record includes `targetEnvironment`.

The workflow builds immutable image bytes and attestations. It does not deploy, update manifests, create a production namespace, or approve a release.

## Required owner decisions before production manifests

These values are deliberately absent from source until approved:

- production public Web hostname and route/DNS owner;
- production Logto public SPA client ID, distinct from the staging Web client ID;
- production issuer/OIDC endpoint, API resource/audience, redirect URI and post-logout URI, registered in Logto;
- production K3s namespace and ExternalSecret path/keys;
- production PostgreSQL service, backup/restore, retention and migration ownership;
- production rollout approval and trusted attestation signer.

The issuer may be the shared Logto instance only if the Infra/Logto owner explicitly approves it and the client/redirect/resource are production-specific.

## Separate deployment shape to implement after the decisions

Production deployment must be a new `deploy/production/` path, not a parameterized switch inside `deploy/staging/`:

1. **Bootstrap:** distinct namespace, default-deny NetworkPolicies, production ExternalSecret references and production database/storage.
2. **Secrets:** use `/myteam-platform/production/*` (or another Infra-approved production path). Never read staging ExternalSecret keys or commit values.
3. **Migration:** a uniquely named Job using the same digest as the API Deployment; wait for completion before application rollout.
4. **Applications:** API and Web Deployments pinned to the verified production image digests. API runtime Logto issuer/audience come from the production Secret; Web OIDC values are the ones embedded in the verified Web image.
5. **Routing:** the production HTTPRoute is applied only after both Deployments pass readiness, using the approved production hostname.
6. **Evidence:** retain the run URL, manifest diff, image digests, SBOMs, attestation verification and deployment smoke results.

No placeholder production hostname or client ID should be committed because either could produce a valid-looking but wrong image or manifest.

## Gate sequence

1. Merge and review this tooling through protected `main`; confirm the workflow/runbook signer identity.
2. Obtain the owner decisions above and register the production Logto client/redirect/audience.
3. Dispatch the workflow from protected `main` with `target_environment=production`, the exact `main` SHA, `production_confirmation=PRODUCTION`, and the approved public metadata.
4. Independently verify both OCI digests, SBOMs and attestations against the exact source SHA and signer workflow. Reject any digest or metadata mismatch.
5. Add reviewed production manifests with digests pinned and run the strict validator; do not deploy yet.
6. Deploy bootstrap, secrets/database, migration, applications, then routing as separate reviewed gates. Production remains unchanged until its explicit deployment authorization.
