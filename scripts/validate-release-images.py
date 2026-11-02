#!/usr/bin/env python3
"""Validate staging image references; strict release mode verifies signed SLSA provenance.

Default mode is a local manifest-shape check only and must not be treated as
release approval. Use --require-provenance for deployment/release validation.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / "deploy/staging"
PROVENANCE = STAGING / "release-provenance.json"
REPOSITORY = "SimoGatti04/myteam-platform"
API = "ghcr.io/simogatti04/myteam-platform-api"
WEB = "ghcr.io/simogatti04/myteam-platform-web"
DIGEST = re.compile(r"^(.+)@sha256:([0-9a-f]{64})$")
TAG = re.compile(r"^.+:[0-9]{8}-[0-9a-f]{7,}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
MOBILE_TAGS = {"latest", "staging-latest", "prod-latest", "dev", "edge", "test"}


def render(stage: str) -> list[dict]:
    result = subprocess.run(
        ["kubectl", "kustomize", str(STAGING / stage)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"kubectl kustomize {stage} failed: {result.stderr.strip()}")
    return [item for item in yaml.safe_load_all(result.stdout) if item]


def image_in(docs: list[dict], kind: str, name: str, container_name: str) -> str | None:
    for doc in docs:
        if doc.get("kind") != kind or doc.get("metadata", {}).get("name") != name:
            continue
        spec = doc.get("spec", {})
        podspec = (spec.get("template", {}).get("spec", {}) if kind in ("Job", "Deployment") else {})
        for container in podspec.get("containers", []):
            if container.get("name") == container_name:
                return container.get("image")
    return None


def subject_has_digest(output: object, digest: str) -> bool:
    if not isinstance(output, list):
        return False
    for entry in output:
        if not isinstance(entry, dict):
            continue
        statement = (entry.get("verificationResult") or {}).get("statement")
        if not isinstance(statement, dict):
            continue
        subjects = statement.get("subject", [])
        if not isinstance(subjects, list):
            continue
        for subject in subjects:
            if isinstance(subject, dict) and (subject.get("digest") or {}).get("sha256") == digest:
                return True
    return False


def verify_attestation(image: str, digest: str, source_commit: str, signer_workflow: str) -> None:
    command = [
        "gh", "attestation", "verify", f"oci://{image}",
        "--repo", REPOSITORY,
        "--signer-workflow", signer_workflow,
        "--source-digest", f"sha1:{source_commit}",
        "--format", "json",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise RuntimeError(f"GitHub attestation verification failed for {image}: {result.stderr.strip()}")
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"gh returned invalid verification JSON for {image}: {exc}") from exc
    if not subject_has_digest(parsed, digest):
        raise RuntimeError(f"verified attestation output does not bind subject digest sha256:{digest}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-provenance", action="store_true",
                        help="require exact OCI digest references and verified GitHub SLSA provenance")
    parser.add_argument("--source-commit", help="full source commit SHA expected in signed provenance")
    parser.add_argument("--signer-workflow", help="exact trusted GitHub Actions signer workflow path")
    parser.add_argument("--check-registry", action="store_true",
                        help="verify OCI images and attestations via GitHub/registry (requires strict mode)")
    args = parser.parse_args()
    if args.check_registry and not args.require_provenance:
        parser.error("--check-registry requires --require-provenance")
    if args.require_provenance:
        if not args.source_commit or not COMMIT.fullmatch(args.source_commit):
            parser.error("strict mode requires --source-commit with a full 40-character SHA")
        if not args.signer_workflow:
            parser.error("strict mode requires --signer-workflow to pin the trusted build identity")

    try:
        migration = render("02-migration")
        apps = render("03-apps")
        images = {
            "migration": image_in(migration, "Job", "myteam-platform-migrate", "migrate"),
            "api": image_in(apps, "Deployment", "myteam-platform-api", "api"),
            "web": image_in(apps, "Deployment", "myteam-platform-web", "web"),
        }
        if any(not value for value in images.values()):
            raise RuntimeError(f"could not resolve all required images from rendered manifests: {images}")
        if images["migration"] != images["api"]:
            raise RuntimeError("migration Job image and API Deployment image differ")

        for role, reference in images.items():
            tail = reference.rsplit("/", 1)[-1]
            tag = tail.split(":", 1)[1] if ":" in tail else ""
            if tag in MOBILE_TAGS:
                raise RuntimeError(f"{role} uses forbidden mutable tag {tag!r}")

        if not args.require_provenance:
            for role, reference in images.items():
                if not DIGEST.fullmatch(reference) and not TAG.fullmatch(reference):
                    raise RuntimeError(f"{role} reference is neither digest-pinned nor a recognized dated commit tag: {reference}")
            print("PASS: local manifest structure/API-migration consistency.")
            print("NOT RELEASE VERIFIED: signed provenance and registry were not checked.")
            return 0

        if not args.check_registry:
            raise RuntimeError("strict release mode requires --check-registry; refusing syntax-only provenance")
        if not PROVENANCE.is_file():
            raise RuntimeError(f"required provenance record is missing: {PROVENANCE}")
        record = json.loads(PROVENANCE.read_text(encoding="utf-8"))
        if record.get("schemaVersion") != 1 or record.get("sourceRepository") != f"https://github.com/{REPOSITORY}":
            raise RuntimeError("provenance schema or source repository does not match the approved repository")
        if record.get("sourceCommit") != args.source_commit:
            raise RuntimeError("provenance sourceCommit does not match --source-commit")
        artifacts = record.get("artifacts", {})
        for role, reference, repository in (("api", images["api"], API), ("migration", images["migration"], API), ("web", images["web"], WEB)):
            match = DIGEST.fullmatch(reference)
            if not match:
                raise RuntimeError(f"{role} is not pinned by exact OCI digest: {reference}")
            image_repo, digest = match.groups()
            if image_repo != repository:
                raise RuntimeError(f"{role} image repository mismatch: {image_repo}")
            artifact_role = "api" if role == "migration" else role
            artifact = artifacts.get(artifact_role, {})
            if artifact.get("repository") != repository or artifact.get("digest") != f"sha256:{digest}":
                raise RuntimeError(f"{role} digest/repository is absent or discordant in release provenance")

        if record.get("verification", {}).get("status") != "pending":
            raise RuntimeError("expected a pending provenance record; do not trust a self-asserted verified status")
        # Verify API once: its digest must also be used by the migration Job.
        for role, reference in (("api", images["api"]), ("web", images["web"])):
            digest = DIGEST.fullmatch(reference).group(2)
            verify_attestation(reference, digest, args.source_commit, args.signer_workflow)
            print(f"PASS: signed source provenance matches {role} image digest and commit")
        print("PASS: API, migration Job and Web are digest-pinned to the release provenance record.")
        print("PASS: GitHub SLSA attestations verified against repository, signer workflow and source commit.")
        return 0
    except (OSError, json.JSONDecodeError, RuntimeError, yaml.YAMLError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
