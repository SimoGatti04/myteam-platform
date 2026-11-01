#!/usr/bin/env python3
"""
Validatore di conformità e immutabilità delle immagini di release (INFRA-R2-03).
1. Ispeziona il rendering Kustomize degli stadi 02-migration e 03-apps.
2. Rifiuta tag mobili o non deterministici (latest, staging-latest, prod-latest, dev, edge, test).
3. Verifica che il Job di migrazione e il Deployment API utilizzino la medesima immagine (stesso repository e stesso riferimento).
4. Verifica il formato del digest (sha256:64hex) o tag identificativo commit (YYYYMMDD-hash).
5. Se invocato con --require-digest, fallisce se le immagini non contengono un digest OCI verificabile.
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
STAGING_DIR = ROOT / "deploy/staging"

DISALLOWED_TAGS = {"latest", "staging-latest", "prod-latest", "dev", "edge", "test"}
DIGEST_PATTERN = re.compile(r"^.+@sha256:[0-9a-f]{64}$")
COMMIT_TAG_PATTERN = re.compile(r"^.+:[0-9]{8}-[0-9a-f]{7,}$")

def get_kustomize_docs(stage_dir: Path):
    res = subprocess.run(["kubectl", "kustomize", str(stage_dir)], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"kubectl kustomize {stage_dir} failed:\n{res.stderr}")
    return list(yaml.safe_load_all(res.stdout))

def main() -> int:
    parser = argparse.ArgumentParser(description="Valida immagini Kustomize per il rilascio")
    parser.add_argument("--require-digest", action="store_true", help="Richiede digest OCI sha256 obbligatorio")
    args = parser.parse_args()

    print("=" * 70)
    print("VALIDATORE IMMAGINI DI RELEASE E PINNING DIGEST (INFRA-R2-03)")
    print("=" * 70)

    try:
        mig_docs = get_kustomize_docs(STAGING_DIR / "02-migration")
        apps_docs = get_kustomize_docs(STAGING_DIR / "03-apps")
    except Exception as exc:
        print(f"ERRORE DI RENDERING: {exc}", file=sys.stderr)
        return 1

    migrate_api = None
    for doc in mig_docs:
        if not doc:
            continue
        if doc.get("kind") == "Job":
            containers = doc.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
            for c in containers:
                if c.get("name") in ("migrate", "api"):
                    migrate_api = c.get("image")

    deploy_api = None
    deploy_web = None
    for doc in apps_docs:
        if not doc:
            continue
        if doc.get("kind") == "Deployment":
            name = doc.get("metadata", {}).get("name")
            containers = doc.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
            for c in containers:
                c_name = c.get("name")
                if "api" in name or c_name == "api":
                    deploy_api = c.get("image")
                elif "web" in name or c_name == "web":
                    deploy_web = c.get("image")

    print(f"Migration Job Image:   {migrate_api}")
    print(f"Deployment API Image:  {deploy_api}")
    print(f"Deployment Web Image:  {deploy_web}")

    if not migrate_api or not deploy_api or not deploy_web:
        print("ERRORE: Impossibile risolvere tutte le immagini attese dai manifest!", file=sys.stderr)
        return 1

    all_images = [
        ("Migration Job", migrate_api),
        ("Deployment API", deploy_api),
        ("Deployment Web", deploy_web)
    ]

    # 1. Rifiuto categorico di tag mobili o non deterministici
    for label, img in all_images:
        for bad in DISALLOWED_TAGS:
            if f":{bad}" in img:
                print(f"ERRORE: {label} utilizza un tag mobile vietato ({img})!", file=sys.stderr)
                return 1

    # 2. Controllo coerenza immagine API tra Migration Job e Deployment API
    if migrate_api != deploy_api:
        print(f"ERRORE: Discrepanza tra l'immagine del Job di migrazione e dell'API di runtime!", file=sys.stderr)
        print(f"  Migration:  {migrate_api}", file=sys.stderr)
        print(f"  Deployment: {deploy_api}", file=sys.stderr)
        return 1
    print("  -> Coerenza API Migration <-> Runtime: PASS (immagini identiche)")

    # 3. Controllo formato digest o tag di release
    for label, img in all_images:
        is_digest = bool(DIGEST_PATTERN.match(img))
        is_commit_tag = bool(COMMIT_TAG_PATTERN.match(img))

        if is_digest:
            print(f"  -> {label}: PASS (digest OCI verificabile: {img.split('@')[1]})")
        elif args.require_digest:
            print(f"ERRORE: {label} non è ancorata a un digest OCI valido (--require-digest attivo): {img}", file=sys.stderr)
            return 1
        elif is_commit_tag:
            print(f"  -> {label}: PASS CONVERGENTE (tag tracciato su commit: {img.split(':')[-1]})")
        else:
            print(f"ERRORE: {label} formato immagine sconosciuto o non conforme: {img}", file=sys.stderr)
            return 1

    print("\n" + "=" * 70)
    print("VALIDAZIONE IMMAGINI DI RELEASE COMPLETATA CON SUCCESSO")
    print("=" * 70)
    return 0

if __name__ == "__main__":
    sys.exit(main())
