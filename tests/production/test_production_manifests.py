"""Static and synthetic regression checks for deploy/production.

No cluster, registry, Infisical or Logto access is performed.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROD = ROOT / "deploy/production"
STAGES = ("01-bootstrap", "02-migration", "03-apps", "04-routing")


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=False)


def ready_values() -> dict:
    values = json.loads((PROD / "production.values.json").read_text(encoding="utf-8"))
    values["hostname"]["approved"] = True
    values["storage"]["node"] = "storage-node.example"
    values["storage"]["capacity"] = "20Gi"
    values["images"]["api"] = "ghcr.io/simogatti04/myteam-platform-api@sha256:" + "a" * 64
    values["images"]["web"] = "ghcr.io/simogatti04/myteam-platform-web@sha256:" + "b" * 64
    values["images"]["postgres"] = "postgres:16.10@sha256:" + "c" * 64
    values["release"]["sourceCommit"] = "d" * 40
    values["logto"]["webAppId"] = "synthetic-prod-web-app"
    return values


class ProductionManifestTests(unittest.TestCase):
    def test_all_stages_render(self) -> None:
        for stage in STAGES:
            result = run("kubectl", "kustomize", str(PROD / stage))
            self.assertEqual(result.returncode, 0, f"{stage}: {result.stderr}")
            self.assertIn("namespace: myteam-platform-prod", result.stdout)

    def test_template_isolation_and_expected_blockers(self) -> None:
        result = run("python3", str(PROD / "validate-production.py"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("TEMPLATE ONLY", result.stdout)

    def test_unapproved_hostname_blocks_render(self) -> None:
        result = run("python3", str(PROD / "render-production.py"), "--check")
        self.assertEqual(result.returncode, 2)
        self.assertIn("owner-approved", result.stderr)

    def test_ready_synthetic_values_render_and_validate(self) -> None:
        with tempfile.TemporaryDirectory(prefix="prod-test-") as directory:
            tmp = Path(directory)
            values_path = tmp / "values.json"
            output = tmp / "rendered"
            values_path.write_text(json.dumps(ready_values()), encoding="utf-8")
            rendered = run(
                "python3", str(PROD / "render-production.py"),
                "--values", str(values_path), "--output", str(output),
            )
            self.assertEqual(rendered.returncode, 0, rendered.stderr)
            text = "\n".join((output / f"{stage}.yaml").read_text() for stage in STAGES)
            self.assertNotIn("__PRODUCTION_", text)
            self.assertNotIn("REPLACE_WITH_", text)
            self.assertNotIn("myteam-platform-staging", text)
            self.assertNotIn("team-staging.simogatti.it", text)
            self.assertNotIn("myteam.simogatti.it", text)
            self.assertIn("sha256:" + "a" * 64, text)
            validated = run(
                "python3", str(PROD / "validate-production.py"),
                "--values", str(values_path), "--rendered", str(output),
            )
            self.assertEqual(validated.returncode, 0, validated.stderr)
            self.assertIn("rendered manifest release checks", validated.stdout)

    def test_staging_and_legacy_hostnames_are_rejected(self) -> None:
        for hostname in ("team-staging.simogatti.it", "myteam.simogatti.it"):
            with self.subTest(hostname=hostname), tempfile.TemporaryDirectory(prefix="prod-test-") as directory:
                values = ready_values()
                values["hostname"]["value"] = hostname
                values["logto"]["apiResource"] = f"https://{hostname}/api"
                path = Path(directory) / "values.json"
                path.write_text(json.dumps(values), encoding="utf-8")
                result = run("python3", str(PROD / "render-production.py"), "--values", str(path), "--check")
                self.assertEqual(result.returncode, 2)
                self.assertIn("protected legacy/staging host", result.stderr)

    def test_tag_only_images_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory(prefix="prod-test-") as directory:
            values = ready_values()
            values["images"]["api"] = "ghcr.io/simogatti04/myteam-platform-api:prod"
            path = Path(directory) / "values.json"
            path.write_text(json.dumps(values), encoding="utf-8")
            result = run("python3", str(PROD / "render-production.py"), "--values", str(path), "--check")
            self.assertEqual(result.returncode, 2)
            self.assertIn("API image must be", result.stderr)

    def test_no_staging_secret_path_or_data_copy(self) -> None:
        text = "\n".join(
            path.read_text(encoding="utf-8")
            for path in sorted((PROD / "01-bootstrap").glob("*.yaml"))
        )
        self.assertNotIn("/myteam-platform/staging/", text)
        self.assertIn("/myteam-platform/prod/POSTGRES_DB", text)
        self.assertIn("/srv/myteam-platform-prod/postgres", text)
        self.assertIn("persistentVolumeReclaimPolicy: Retain", text)


    def test_mutable_latest_tag_is_rejected_in_rendered_output(self) -> None:
        """Guards the mutable-tag regex itself, not just the happy path."""
        with tempfile.TemporaryDirectory(prefix="prod-test-") as directory:
            tmp = Path(directory)
            values_path = tmp / "values.json"
            output = tmp / "rendered"
            values_path.write_text(json.dumps(ready_values()), encoding="utf-8")
            rendered = run(
                "python3", str(PROD / "render-production.py"),
                "--values", str(values_path), "--output", str(output),
            )
            self.assertEqual(rendered.returncode, 0, rendered.stderr)
            apps = output / "03-apps.yaml"
            apps.write_text(
                apps.read_text(encoding="utf-8").replace(
                    "myteam-platform-api@sha256:" + "a" * 64,
                    "myteam-platform-api:latest",
                ).replace(
                    "myteam-platform-web@sha256:" + "b" * 64,
                    "myteam-platform-web:latest",
                ),
                encoding="utf-8",
            )
            result = run(
                "python3", str(PROD / "validate-production.py"),
                "--values", str(values_path), "--rendered", str(output),
            )
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn("mutable latest tag", result.stderr)

if __name__ == "__main__":
    unittest.main()
