#!/usr/bin/env python3
"""Pin staging images to digests and record the source commit to verify.

This writes a release candidate declaration only. It does not create or verify
an attestation; the release gate separately verifies GitHub SLSA provenance.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
STAGING = ROOT / "deploy/staging"
MIGRATION_KUSTOMIZATION = STAGING / "02-migration/kustomization.yaml"
APPS_KUSTOMIZATION = STAGING / "03-apps/kustomization.yaml"
PROVENANCE = STAGING / "release-provenance.json"
API_REPOSITORY = "ghcr.io/simogatti04/myteam-platform-api"
WEB_REPOSITORY = "ghcr.io/simogatti04/myteam-platform-web"
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


def atomic_write(path: Path, content: str) -> None:
    prior_mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.chmod(temp_name, prior_mode)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def current_commit() -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode:
        raise RuntimeError(f"cannot resolve Git HEAD: {result.stderr.strip()}")
    return result.stdout.strip()


def pin(path: Path, api_digest: str, web_digest: str | None = None) -> None:
    text = path.read_text(encoding="utf-8")
    parsed = yaml.safe_load(text)  # validate the existing document before editing
    if not isinstance(parsed, dict) or not isinstance(parsed.get("images"), list):
        raise ValueError(f"missing valid images mapping in {path}")

    wanted = {API_REPOSITORY: api_digest}
    if web_digest:
        wanted[WEB_REPOSITORY] = web_digest
    lines = text.splitlines(keepends=True)
    image_blocks: dict[str, tuple[int, int]] = {}
    starts = [i for i, line in enumerate(lines) if re.match(r"^  - name:\s*", line)]
    for index, start in enumerate(starts):
        finish = starts[index + 1] if index + 1 < len(starts) else len(lines)
        match = re.match(r"^  - name:\s*(\S+)\s*$", lines[start].rstrip("\r\n"))
        if match:
            image_blocks[match.group(1)] = (start, finish)

    replacements: dict[int, list[str]] = {}
    parsed_names = [item.get("name") for item in parsed["images"] if isinstance(item, dict)]
    for repository, digest in wanted.items():
        if parsed_names.count(repository) != 1 or repository not in image_blocks:
            raise ValueError(f"expected exactly one image mapping {repository} in {path}")
        start, finish = image_blocks[repository]
        block = lines[start:finish]
        kept: list[str] = []
        wrote_digest = False
        for line in block:
            if re.match(r"^\s+(?:newTag|digest):\s*", line):
                if not wrote_digest:
                    kept.append(f"    digest: {digest}\n")
                    wrote_digest = True
                continue
            kept.append(line)
        if not wrote_digest:
            kept.append(f"    digest: {digest}\n")
        replacements[start] = kept

    updated: list[str] = []
    i = 0
    while i < len(lines):
        if i in replacements:
            updated.extend(replacements[i])
            # The next image block start (or end of document) delimits the replaced block.
            block_name = next(name for name, bounds in image_blocks.items() if bounds[0] == i)
            block_end = image_blocks[block_name][1]
            i = block_end
        else:
            updated.append(lines[i])
            i += 1
    atomic_write(path, "".join(updated))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-digest", required=True, help="sha256:<64 lowercase hex>")
    parser.add_argument("--web-digest", required=True, help="sha256:<64 lowercase hex>")
    parser.add_argument("--commit", required=True, help="full 40-hex source commit that built the images")
    args = parser.parse_args()
    if not DIGEST.fullmatch(args.api_digest) or not DIGEST.fullmatch(args.web_digest):
        print("ERROR: image digests must be sha256 followed by 64 lowercase hex characters", file=sys.stderr)
        return 2
    if not COMMIT.fullmatch(args.commit):
        print("ERROR: --commit must be a full 40-character lowercase Git SHA", file=sys.stderr)
        return 2
    try:
        head = current_commit()
        if args.commit != head:
            raise ValueError(f"source commit {args.commit} does not match this checkout HEAD {head}")
        pin(MIGRATION_KUSTOMIZATION, args.api_digest)
        pin(APPS_KUSTOMIZATION, args.api_digest, args.web_digest)
        record = {
            "schemaVersion": 1,
            "sourceRepository": "https://github.com/SimoGatti04/myteam-platform",
            "sourceCommit": args.commit,
            "artifacts": {
                "api": {"repository": API_REPOSITORY, "digest": args.api_digest},
                "web": {"repository": WEB_REPOSITORY, "digest": args.web_digest},
            },
            "verification": {
                "method": "GitHub SLSA provenance attestation",
                "status": "pending",
            },
        }
        atomic_write(PROVENANCE, json.dumps(record, indent=2) + "\n")
    except (OSError, ValueError, RuntimeError, yaml.YAMLError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"Pinned API, migration Job and Web to OCI digests for source commit {args.commit}.")
    print("Attestation verification remains pending; run the strict release validator before deployment.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
