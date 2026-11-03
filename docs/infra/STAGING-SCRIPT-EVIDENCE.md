# Staging script format evidence (3 November 2026)

**Scope:** read-only engineering evidence for two post-staging defects. No live cluster, staging, production, registry-write, or credential operation was performed.

## Kubernetes Lease `MicroTime`

The API type is `coordination.k8s.io/v1` `Lease.spec.acquireTime` / `renewTime`. In Kubernetes v1.34, `staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/micro_time.go` defines:

```go
const RFC3339Micro = "2006-01-02T15:04:05.000000Z07:00"
```

`MicroTime.UnmarshalJSON` parses with that exact layout. A local Go 1.27 standard-library reproduction of the same layout produced:

```text
2026-11-03T00:00:00Z          => cannot parse "Z" as ".000000"
2026-11-03T00:00:00.000000Z   => OK
2026-11-03T00:00:00.123456Z   => OK
```

**Required wire format:** six fractional digits, e.g. `2026-11-03T00:00:00.000000Z`. `scripts/k8s-lease-lock.py` must use `isoformat(timespec="microseconds")`, not whole seconds.

Authoritative source:
`https://github.com/kubernetes/kubernetes/blob/v1.34.0/staging/src/k8s.io/apimachinery/pkg/apis/meta/v1/micro_time.go`

## `gh attestation verify --source-digest`

`gh` 2.103.3 compares `--source-digest` exactly against the certificate extension `SourceRepositoryDigest`. Against published MAPI API image:

```text
ghcr.io/simogatti04/myteam-platform-api@sha256:f7d3cb0219367e21cd73d919f04d2ddf1f09a6da70680b22c3c538e4bd7bd83b
```

with signer `github.com/SimoGatti04/myteam-platform/.github/workflows/release-artifacts.yml`:

```text
--source-digest 7a010fd5362ba01bc9cf1260684128c4e263a453
  exit 0; certificate sourceRepositoryDigest = 7a010fd5362ba01bc9cf1260684128c4e263a453

--source-digest sha1:7a010fd5362ba01bc9cf1260684128c4e263a453
  exit 1; expected SourceRepositoryDigest to be sha1:...,
          got 7a010fd5362ba01bc9cf1260684128c4e263a453
```

**Required validator argument:** bare full 40-character SHA. The `sha1:` prefix is invalid for this certificate extension and must not be added.

Reproducible read-only gate:

```sh
gh attestation verify \
  oci://ghcr.io/simogatti04/myteam-platform-api@sha256:f7d3cb0219367e21cd73d919f04d2ddf1f09a6da70680b22c3c538e4bd7bd83b \
  --repo SimoGatti04/myteam-platform \
  --signer-workflow github.com/SimoGatti04/myteam-platform/.github/workflows/release-artifacts.yml \
  --source-digest 7a010fd5362ba01bc9cf1260684128c4e263a453 \
  --format json
```

The command uses existing GitHub authentication and does not print the credential. Image digest, repository, signer, source SHA, and certificate fields above are public/non-secret provenance metadata.
