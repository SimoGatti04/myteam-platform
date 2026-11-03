"""Static and pure-function guards for the environment-aware image release pipeline.

Kept dependency-free (no PyYAML): the workflow is inspected structurally by
indentation so the suite runs on a stock Python interpreter.
"""
from __future__ import annotations

import importlib.util
import re
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release-artifacts.yml"

# nginx 1.27 reached upstream end-of-life on 2025-06-24 (endoflife.date/nginx) and
# receives no security fixes: the Web runner must stay on a supported stable branch.
NGINX_MIN_SUPPORTED = (1, 28)
NGINX_EOL_BRANCHES = {(1, 27)}

def indented_block(text: str, header: str) -> str:
    """Return the lines nested under the first exact `header` line."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.strip() != header:
            continue
        indent = len(line) - len(line.lstrip())
        nested: list[str] = []
        for follower in lines[index + 1:]:
            if not follower.strip():
                continue
            if len(follower) - len(follower.lstrip()) <= indent:
                break
            nested.append(follower)
        return "\n".join(nested)
    raise AssertionError(f"missing workflow block: {header}")

def step_block(text: str, marker: str) -> str:
    """Return the workflow step (list item) whose header line contains marker."""
    for chunk in text.split("\n      - "):
        if marker in chunk.splitlines()[0]:
            return chunk
    raise AssertionError(f"missing workflow step: {marker}")

def load_web_config_module():
    path = ROOT / "scripts/resolve-release-web-config.py"
    spec = importlib.util.spec_from_file_location("resolve_release_web_config", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class WebReleaseConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.module = load_web_config_module()
        cls.production = {
            "endpoint": "https://auth.simogatti.it/oidc",
            "app_id": "production-public-client",
            "api_resource": "https://team.example.test/api",
            "redirect_uri": "https://team.example.test/callback",
            "post_logout_redirect_uri": "https://team.example.test",
        }

    def test_staging_preserves_historical_defaults(self) -> None:
        resolved = self.module.resolve("staging", {"app_id": "staging-client"}, "")
        self.assertEqual(resolved["endpoint"], "https://auth.simogatti.it/oidc")
        self.assertEqual(resolved["api_resource"], "https://team-staging.simogatti.it/api")
        self.assertEqual(resolved["redirect_uri"], "https://team-staging.simogatti.it/callback")
        self.assertEqual(resolved["post_logout_redirect_uri"], "https://team-staging.simogatti.it")

    def test_production_requires_every_public_value_and_confirmation(self) -> None:
        with self.assertRaisesRegex(self.module.ConfigError, "confirmation"):
            self.module.resolve("production", self.production, "")
        incomplete = dict(self.production)
        incomplete["redirect_uri"] = ""
        with self.assertRaisesRegex(self.module.ConfigError, "VITE_LOGTO_REDIRECT_URI"):
            self.module.resolve("production", incomplete, "PRODUCTION")

    def test_production_rejects_staging_host(self) -> None:
        unsafe = dict(self.production)
        unsafe["redirect_uri"] = "https://team-staging.simogatti.it/callback"
        with self.assertRaisesRegex(self.module.ConfigError, "must not use the staging host"):
            self.module.resolve("production", unsafe, "PRODUCTION")

    def test_production_accepts_complete_explicit_configuration(self) -> None:
        resolved = self.module.resolve("production", self.production, "PRODUCTION")
        self.assertEqual(resolved, self.production)

    def test_environment_output_is_github_env_compatible(self) -> None:
        resolved = self.module.resolve("production", self.production, "PRODUCTION")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "github-env"
            self.module.write_values(path, resolved)
            lines = path.read_text().splitlines()
        self.assertIn("VITE_LOGTO_APP_ID=production-public-client", lines)
        self.assertIn("VITE_LOGTO_REDIRECT_URI=https://team.example.test/callback", lines)
        self.assertEqual(len(lines), 5)

class DockerBaseImageTests(unittest.TestCase):
    def test_release_dockerfiles_pin_base_index_digests(self) -> None:
        for name in ("Dockerfile.api", "Dockerfile.web"):
            text = (ROOT / "deploy/docker" / name).read_text()
            from_lines = [line for line in text.splitlines() if line.startswith("FROM ")]
            self.assertTrue(from_lines)
            for line in from_lines:
                self.assertRegex(line, r"@sha256:[0-9a-f]{64}(?:\s|$)", line)

    def test_web_runner_uses_supported_nginx_and_stays_non_root(self) -> None:
        text = (ROOT / "deploy/docker/Dockerfile.web").read_text()
        runner = [line for line in text.splitlines() if line.startswith("FROM ") and "nginx" in line]
        self.assertEqual(len(runner), 1, runner)
        found = re.search(r"nginx:(\d+)\.(\d+)\.(\d+)-alpine-slim@sha256:([0-9a-f]{64})", runner[0])
        self.assertIsNotNone(found, f"unexpected nginx runner line: {runner[0]}")
        major, minor, _patch, _digest = found.groups()
        branch = (int(major), int(minor))
        self.assertNotIn(branch, NGINX_EOL_BRANCHES, "nginx 1.27 is EOL since 2025-06-24")
        self.assertGreaterEqual(branch, NGINX_MIN_SUPPORTED, "nginx runner is below the supported stable branch")
        self.assertNotIn("nginx:1.27", text)
        # Non-root runtime and writable pid/paths must survive the base image bump.
        self.assertIn("USER nginx", text)
        conf = (ROOT / "deploy/docker/nginx.conf").read_text()
        self.assertIn("pid /tmp/nginx.pid;", conf)
        self.assertIn("listen 8080 default_server;", conf)

class ReleaseWorkflowContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.text = WORKFLOW.read_text()
        cls.inputs = indented_block(cls.text, "inputs:")

    def test_target_environment_defaults_to_staging_and_offers_production(self) -> None:
        target = indented_block(self.inputs, "target_environment:")
        self.assertIn("default: staging", target)
        self.assertIn("type: choice", target)
        self.assertLess(target.index("- staging"), target.index("- production"))

    def test_production_public_oidc_inputs_are_explicit(self) -> None:
        for name in (
            "web_logto_app_id",
            "web_logto_endpoint",
            "web_logto_api_resource",
            "web_logto_redirect_uri",
            "web_logto_post_logout_redirect_uri",
            "production_confirmation",
        ):
            self.assertIn(f"{name}:", self.inputs)
        self.assertIn("default: ''", indented_block(self.inputs, "web_logto_endpoint:"))

    def test_main_and_exact_source_guards_remain(self) -> None:
        self.assertIn('"$GITHUB_REF" == "refs/heads/main"', self.text)
        self.assertIn('"$SOURCE_COMMIT" == "$GITHUB_SHA"', self.text)
        self.assertIn("persist-credentials: false", self.text)

    def test_oidc_values_are_resolved_before_the_web_build(self) -> None:
        self.assertLess(
            self.text.index("Resolve and validate public Web OIDC build inputs"),
            self.text.index("id: web\n"),
        )

    def test_all_public_web_values_reach_the_build(self) -> None:
        args = indented_block(step_block(self.text, "Build and push Web image"), "build-args: |")
        for name in (
            "VITE_LOGTO_ENDPOINT",
            "VITE_LOGTO_APP_ID",
            "VITE_LOGTO_API_RESOURCE",
            "VITE_LOGTO_REDIRECT_URI",
            "VITE_LOGTO_POST_LOGOUT_REDIRECT_URI",
        ):
            self.assertIn(f"{name}=${{{{ steps.web_oidc.outputs.{name} }}}}", args)

    def test_attestations_and_environment_scoped_handoff_remain(self) -> None:
        self.assertEqual(self.text.count("uses: actions/attest@"), 4)
        self.assertIn("sha-${{ env.TARGET_ENVIRONMENT }}-${{ env.SOURCE_COMMIT }}", self.text)
        self.assertIn("release-artifacts-${{ env.TARGET_ENVIRONMENT }}", self.text)
        self.assertIn('"targetEnvironment": os.environ["TARGET_ENVIRONMENT"]', self.text)

if __name__ == "__main__":
    unittest.main()
