#!/usr/bin/env python3
"""Fail-closed static validation for the production manifests.

Template mode validates the committed skeleton and reports placeholders as
expected blockers. Rendered mode requires approved values and checks isolation
and immutability invariants before any manual deployment.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from production_config import (
    LEGACY_HOSTS,
    NAMESPACE,
    PLACEHOLDER_RE,
    STAGING_MARKERS,
    load_values,
    validate_values,
)

ROOT = Path(__file__).resolve().parent
STAGES = ("01-bootstrap", "02-migration", "03-apps", "04-routing")


def read_tree(paths: list[Path]) -> str:
    return "\n".join(path.read_text(encoding="utf-8") for path in paths)


def template_checks() -> None:
    text = read_tree(sorted(ROOT.glob("0*/*.yaml")))
    if "namespace: myteam-platform-staging" in text or "team-staging.simogatti.it" in text:
        raise ValueError("production template contains staging identifiers")
    if "myteam.simogatti.it" in text:
        raise ValueError("production template contains the protected legacy hostname")
    if "staging-latest" in text or re.search(r":latest(?:\s|$)", text):
        raise ValueError("production template contains a mutable latest tag")
    if "namespace: myteam-platform-prod" not in text:
        raise ValueError("production namespace is missing")
    if "remoteRef:\n        key: /myteam-platform/prod/" not in text:
        raise ValueError("production ExternalSecret does not use /myteam-platform/prod/")
    if "/myteam-platform/staging/" in text:
        raise ValueError("production ExternalSecret contains a staging path")
    if "persistentVolumeReclaimPolicy: Retain" not in text or "/srv/myteam-platform-prod/postgres" not in text:
        raise ValueError("production storage is not an isolated Retain volume")
    if "backoffLimit: 0" not in text:
        raise ValueError("production migration job must fail closed with backoffLimit: 0")
    if "kind: NetworkPolicy" not in text or "name: default-deny-all" not in text:
        raise ValueError("production network policy baseline is missing")
    if "hostnames:\n    - __PRODUCTION_HOSTNAME__" not in text:
        raise ValueError("production HTTPRoute must remain hostname-gated")
    if not PLACEHOLDER_RE.search(text):
        raise ValueError("production template unexpectedly has no gate placeholders")


def rendered_checks(directory: Path, values_path: Path) -> None:
    values = load_values(values_path)
    validate_values(values, require_ready=True)
    files = [directory / f"{stage}.yaml" for stage in STAGES]
    missing = [str(path) for path in files if not path.is_file()]
    if missing:
        raise ValueError(f"missing rendered stages: {', '.join(missing)}")
    text = read_tree(files)
    if PLACEHOLDER_RE.search(text) or "__PRODUCTION_" in text:
        raise ValueError("rendered manifests still contain placeholders")
    if "namespace: myteam-platform-staging" in text or "team-staging.simogatti.it" in text:
        raise ValueError("rendered manifests contain staging identifiers")
    for host in LEGACY_HOSTS | STAGING_MARKERS:
        if host in text:
            raise ValueError(f"rendered manifests contain protected hostname {host}")
    if "staging-latest" in text or re.search(r":latest(?:\s|$)", text):
        raise ValueError("rendered manifests contain a mutable latest tag")
    if f"namespace: {NAMESPACE}" not in text:
        raise ValueError("rendered manifests do not use the production namespace")
    if "/myteam-platform/staging/" in text:
        raise ValueError("rendered manifests contain a staging secret path")
    if "/myteam-platform/prod/" not in text:
        raise ValueError("rendered manifests do not use the production secret path")
    if "persistentVolumeReclaimPolicy: Retain" not in text:
        raise ValueError("rendered PostgreSQL volume must retain data")
    if "backoffLimit: 0" not in text:
        raise ValueError("rendered migration job is not fail-closed")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rendered", type=Path)
    parser.add_argument("--values", type=Path, default=ROOT / "production.values.json")
    args = parser.parse_args()
    try:
        template_checks()
        print("PASS: production template isolation checks")
        if args.rendered:
            rendered_checks(args.rendered, args.values)
            print("PASS: production rendered manifest release checks")
        else:
            print("TEMPLATE ONLY: real hostname, storage, digests and Logto client remain gated")
    except (OSError, ValueError) as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
