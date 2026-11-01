#!/usr/bin/env python3
"""
Utility per il pinning deterministico dei digest OCI nei manifest Kustomize di staging.
Uso:
  python3 scripts/pin-release-images.py --api-digest sha256:... --web-digest sha256:...
"""
import argparse
import re
import sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
STAGING_DIR = ROOT / "deploy/staging"
MIG_KUST = STAGING_DIR / "02-migration/kustomization.yaml"
APPS_KUST = STAGING_DIR / "03-apps/kustomization.yaml"

DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

def pin_stage(kust_file: Path, api_digest: str, web_digest: str | None = None):
    with kust_file.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    images = data.get("images", [])
    for img in images:
        name = img.get("name", "")
        if "myteam-platform-api" in name:
            img.pop("newTag", None)
            img["digest"] = api_digest
        elif "myteam-platform-web" in name and web_digest:
            img.pop("newTag", None)
            img["digest"] = web_digest

    with kust_file.open("w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False)
    print(f"Aggiornato {kust_file}")

def main():
    parser = argparse.ArgumentParser(description="Pinna digest OCI nei manifest Kustomize")
    parser.add_argument("--api-digest", required=True, help="Digest sha256 dell'immagine API")
    parser.add_argument("--web-digest", required=True, help="Digest sha256 dell'immagine Web")
    args = parser.parse_args()

    if not DIGEST_RE.match(args.api_digest):
        print(f"ERRORE: API digest non valido: {args.api_digest}", file=sys.stderr)
        return 1
    if not DIGEST_RE.match(args.web_digest):
        print(f"ERRORE: Web digest non valido: {args.web_digest}", file=sys.stderr)
        return 1

    pin_stage(MIG_KUST, args.api_digest)
    pin_stage(APPS_KUST, args.api_digest, args.web_digest)
    print("Pinning completato con successo.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
