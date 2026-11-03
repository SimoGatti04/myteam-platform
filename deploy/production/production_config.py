"""Validation helpers for the production manifest values.

Standard-library only so the same checks run locally and in CI without a YAML
dependency. The values file contains public configuration only; credentials
remain in Infisical under /myteam-platform/prod/.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

NAMESPACE = "myteam-platform-prod"
LEGACY_HOSTS = {"myteam.simogatti.it", "www.myteam.simogatti.it"}
STAGING_MARKERS = {"team-staging.simogatti.it", "myteam-platform-staging"}
HOST_RE = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
NODE_RE = re.compile(r"^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$")
CAPACITY_RE = re.compile(r"^[1-9][0-9]*(?:Mi|Gi|Ti)$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
API_IMAGE_RE = re.compile(r"^ghcr\.io/simogatti04/myteam-platform-api@sha256:[0-9a-f]{64}$")
WEB_IMAGE_RE = re.compile(r"^ghcr\.io/simogatti04/myteam-platform-web@sha256:[0-9a-f]{64}$")
POSTGRES_IMAGE_RE = re.compile(r"^postgres:(?:16(?:\.[0-9]+){0,2}(?:-[a-z0-9]+)?)@sha256:[0-9a-f]{64}$")
PLACEHOLDER_RE = re.compile(r"(?:REPLACE_WITH|__PRODUCTION_[A-Z0-9_]+__)")


def load_values(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        values = json.load(handle)
    if not isinstance(values, dict):
        raise ValueError("production values must be a JSON object")
    return values


def _text(values: dict[str, Any], *path: str) -> str:
    node: Any = values
    for key in path:
        if not isinstance(node, dict) or key not in node:
            raise ValueError(f"missing production value: {'.'.join(path)}")
        node = node[key]
    if not isinstance(node, str) or not node.strip():
        raise ValueError(f"production value must be a non-empty string: {'.'.join(path)}")
    return node.strip()


def validate_values(values: dict[str, Any], *, require_ready: bool) -> None:
    if values.get("schemaVersion") != 1:
        raise ValueError("production values schemaVersion must be 1")
    if _text(values, "namespace") != NAMESPACE:
        raise ValueError(f"production namespace must be {NAMESPACE}")

    hostname = _text(values, "hostname", "value").lower()
    if not HOST_RE.fullmatch(hostname):
        raise ValueError(f"invalid production hostname: {hostname}")
    if hostname in LEGACY_HOSTS or hostname in STAGING_MARKERS:
        raise ValueError(f"production hostname collides with a protected legacy/staging host: {hostname}")
    if values.get("hostname", {}).get("approved") is not True and require_ready:
        raise ValueError("production hostname is not owner-approved; set hostname.approved=true only after the decision gate")

    node = _text(values, "storage", "node")
    capacity = _text(values, "storage", "capacity")
    api = _text(values, "images", "api").lower()
    web = _text(values, "images", "web").lower()
    postgres = _text(values, "images", "postgres").lower()
    source_commit = _text(values, "release", "sourceCommit").lower()

    if require_ready:
        if not NODE_RE.fullmatch(node):
            raise ValueError(f"invalid storage node: {node}")
        if not CAPACITY_RE.fullmatch(capacity):
            raise ValueError(f"invalid storage capacity: {capacity}")
        if not API_IMAGE_RE.fullmatch(api):
            raise ValueError("API image must be ghcr.io/simogatti04/myteam-platform-api@sha256:<64 hex>")
        if not WEB_IMAGE_RE.fullmatch(web):
            raise ValueError("Web image must be ghcr.io/simogatti04/myteam-platform-web@sha256:<64 hex>")
        if not POSTGRES_IMAGE_RE.fullmatch(postgres):
            raise ValueError("PostgreSQL image must be postgres:16[.x[.y]]@sha256:<64 hex>")
        if not COMMIT_RE.fullmatch(source_commit):
            raise ValueError("release.sourceCommit must be a full 40-character lowercase SHA")

    issuer = _text(values, "logto", "issuer")
    if issuer != "https://auth.simogatti.it/oidc":
        raise ValueError("Logto issuer must be the approved shared production issuer https://auth.simogatti.it/oidc")
    api_resource = _text(values, "logto", "apiResource")
    if not HOST_RE.fullmatch(api_resource.removeprefix("https://").removesuffix("/api")) or not api_resource.endswith("/api"):
        raise ValueError("Logto apiResource must be https://<approved-host>/api")
    if api_resource != f"https://{hostname}/api":
        raise ValueError("Logto apiResource must match the production hostname")
    web_app_id = _text(values, "logto", "webAppId")
    if require_ready and PLACEHOLDER_RE.search(web_app_id):
        raise ValueError("Logto webAppId is not approved")

    if require_ready:
        raw = json.dumps(values, sort_keys=True)
        if PLACEHOLDER_RE.search(raw):
            raise ValueError("production values still contain placeholders; render is blocked")
