"""Regression guards for staging and release helper scripts.

These tests are intentionally synthetic: they never contact Kubernetes, GitHub,
or an OCI registry and never read credential material.
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# validate-release-images.py imports PyYAML. Keep the regression test runnable
# on a stock Python image without adding a runtime dependency just for import.
if importlib.util.find_spec("yaml") is None:
    yaml_stub = types.ModuleType("yaml")
    yaml_stub.safe_load_all = lambda _text: []  # type: ignore[attr-defined]
    sys.modules["yaml"] = yaml_stub


class LeaseTimestampTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module("k8s_lease_lock", ROOT / "scripts/k8s-lease-lock.py")

    def test_timestamp_is_rfc3339_microseconds_utc(self) -> None:
        value = datetime(2026, 11, 3, 1, 2, 3, 456789, tzinfo=timezone.utc)
        rendered = self.module.timestamp(value)
        self.assertEqual(rendered, "2026-11-03T01:02:03.456789Z")
        self.assertRegex(rendered, r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")
        self.assertEqual(self.module.parse_time(rendered), value)

    def test_timestamp_keeps_six_digits_when_microsecond_is_zero(self) -> None:
        value = datetime(2026, 11, 3, 1, 2, 3, tzinfo=timezone.utc)
        self.assertEqual(self.module.timestamp(value), "2026-11-03T01:02:03.000000Z")


class AttestationCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_module("validate_release_images", ROOT / "scripts/validate-release-images.py")

    def test_source_digest_is_bare_full_sha(self) -> None:
        digest = "a" * 64
        source_commit = "b" * 40
        captured: dict[str, list[str]] = {}

        class Result:
            returncode = 0
            stderr = ""
            stdout = json.dumps([
                {
                    "verificationResult": {
                        "statement": {
                            "subject": [{"digest": {"sha256": digest}}],
                        }
                    }
                }
            ])

        def fake_run(command, **_kwargs):
            captured["command"] = list(command)
            return Result()

        original = self.module.subprocess.run
        self.module.subprocess.run = fake_run
        try:
            self.module.verify_attestation(
                "ghcr.io/simogatti04/myteam-platform-api",
                digest,
                source_commit,
                ".github/workflows/release-artifacts.yml",
            )
        finally:
            self.module.subprocess.run = original

        command = captured["command"]
        index = command.index("--source-digest")
        self.assertEqual(command[index + 1], source_commit)
        self.assertFalse(command[index + 1].startswith("sha1:"))
        self.assertNotIn("--source-commit", command)


class StagingDeployScriptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.path = ROOT / "deploy/staging/deploy-stage.sh"
        self.text = self.path.read_text()

    def test_pg_isready_uses_container_environment(self) -> None:
        expected = "sh -ec 'pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"'"
        self.assertIn(expected, self.text)
        self.assertNotIn("pg_isready -U myteam_app -d myteam_platform", self.text)

    def test_shell_syntax(self) -> None:
        result = subprocess.run(["bash", "-n", str(self.path)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
