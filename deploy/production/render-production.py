#!/usr/bin/env python3
"""Render the production Kustomize stages into a temporary deployable directory.

This command never applies to Kubernetes. Real values are public configuration
from production.values.json; credentials stay in Infisical.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from production_config import load_values, validate_values

ROOT = Path(__file__).resolve().parent
STAGES = ("01-bootstrap", "02-migration", "03-apps", "04-routing")
TOKENS = {
    "__PRODUCTION_HOSTNAME__": ("hostname", "value"),
    "__PRODUCTION_STORAGE_NODE__": ("storage", "node"),
    "__PRODUCTION_STORAGE_CAPACITY__": ("storage", "capacity"),
    "__PRODUCTION_POSTGRES_IMAGE__": ("images", "postgres"),
    "__PRODUCTION_API_IMAGE__": ("images", "api"),
    "__PRODUCTION_WEB_IMAGE__": ("images", "web"),
    "__PRODUCTION_SOURCE_COMMIT__": ("release", "sourceCommit"),
}


def value_at(values: dict, path: tuple[str, str]) -> str:
    return str(values[path[0]][path[1]]).strip()


def render(values_path: Path, output: Path) -> list[Path]:
    values = load_values(values_path)
    validate_values(values, require_ready=True)
    replacements = {token: value_at(values, path) for token, path in TOKENS.items()}
    output.mkdir(parents=True, exist_ok=True)
    rendered: list[Path] = []
    for stage in STAGES:
        result = subprocess.run(
            ["kubectl", "kustomize", str(ROOT / stage)],
            capture_output=True, text=True, check=False,
        )
        if result.returncode:
            raise RuntimeError(f"kubectl kustomize {stage} failed: {result.stderr.strip()}")
        text = result.stdout
        for token, value in replacements.items():
            text = text.replace(token, value)
        if "__PRODUCTION_" in text or "REPLACE_WITH_" in text:
            raise RuntimeError(f"unresolved production placeholder remains in {stage}")
        destination = output / f"{stage}.yaml"
        destination.write_text(text, encoding="utf-8")
        rendered.append(destination)
    return rendered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--values", type=Path, default=ROOT / "production.values.json")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true", help="render to a temporary directory and discard it")
    args = parser.parse_args()
    if args.check and args.output:
        parser.error("--check and --output are mutually exclusive")
    if not args.check and args.output is None:
        parser.error("--output is required unless --check is used")

    try:
        if args.check:
            with tempfile.TemporaryDirectory(prefix="myteam-prod-render-") as directory:
                rendered = render(args.values, Path(directory))
                for path in rendered:
                    print(f"PASS rendered {path.name}")
        else:
            for path in render(args.values, args.output):
                print(path)
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"BLOCKED: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
