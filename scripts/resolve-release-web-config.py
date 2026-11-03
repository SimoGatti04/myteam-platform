#!/usr/bin/env python3
"""Resolve and validate public Web OIDC build inputs for a release target.

Production has no implicit fallback: the issuer, public SPA client ID, API
resource, redirect URI and post-logout redirect URI must all be supplied and
must not use the staging host. Staging preserves the historical defaults.
Only public, non-secret OIDC metadata is accepted.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

APP_ID = re.compile(r"^[A-Za-z0-9._-]{1,200}$")
STAGING_HOST = "team-staging.simogatti.it"
STAGING_DEFAULTS = {
    "endpoint": "https://auth.simogatti.it/oidc",
    "api_resource": f"https://{STAGING_HOST}/api",
    "redirect_uri": f"https://{STAGING_HOST}/callback",
    "post_logout_redirect_uri": f"https://{STAGING_HOST}",
}
OUTPUT_NAMES = {
    "endpoint": "VITE_LOGTO_ENDPOINT",
    "app_id": "VITE_LOGTO_APP_ID",
    "api_resource": "VITE_LOGTO_API_RESOURCE",
    "redirect_uri": "VITE_LOGTO_REDIRECT_URI",
    "post_logout_redirect_uri": "VITE_LOGTO_POST_LOGOUT_REDIRECT_URI",
}
PRODUCTION_REQUIRED = tuple(OUTPUT_NAMES)


class ConfigError(ValueError):
    pass


def validate_https_url(field: str, value: str) -> str:
    value = value.strip()
    if not value or any(character in value for character in "\r\n"):
        raise ConfigError(f"{field} must be a non-empty single-line HTTPS URL")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ConfigError(f"{field} must be an absolute HTTPS URL")
    if parsed.username or parsed.password:
        raise ConfigError(f"{field} must not contain user credentials")
    if parsed.fragment or parsed.query:
        raise ConfigError(f"{field} must not contain a query string or fragment")
    return value


def resolve(environment: str, values: dict[str, str], confirmation: str) -> dict[str, str]:
    if environment not in {"staging", "production"}:
        raise ConfigError("environment must be 'staging' or 'production'")

    resolved = {key: (values.get(key) or "").strip() for key in PRODUCTION_REQUIRED}
    if environment == "staging":
        for key, default in STAGING_DEFAULTS.items():
            if not resolved[key]:
                resolved[key] = default
    else:
        if confirmation != "PRODUCTION":
            raise ConfigError("production requires confirmation exactly equal to 'PRODUCTION'")
        missing = [OUTPUT_NAMES[key] for key in PRODUCTION_REQUIRED if not resolved[key]]
        if missing:
            raise ConfigError("production requires explicit values for: " + ", ".join(missing))
        for key in ("endpoint", "api_resource", "redirect_uri", "post_logout_redirect_uri"):
            if STAGING_HOST in resolved[key].lower():
                raise ConfigError(f"production {OUTPUT_NAMES[key]} must not use the staging host")
            validate_https_url(OUTPUT_NAMES[key], resolved[key])

    if not APP_ID.fullmatch(resolved["app_id"]):
        raise ConfigError("VITE_LOGTO_APP_ID has an unexpected format")
    if environment == "staging":
        for key in ("endpoint", "api_resource", "redirect_uri", "post_logout_redirect_uri"):
            validate_https_url(OUTPUT_NAMES[key], resolved[key])
    return resolved


def write_values(path: Path, resolved: dict[str, str]) -> None:
    with path.open("a", encoding="utf-8") as stream:
        for key in PRODUCTION_REQUIRED:
            value = resolved[key]
            if any(character in value for character in "\r\n"):
                raise ConfigError(f"{OUTPUT_NAMES[key]} contains a newline")
            stream.write(f"{OUTPUT_NAMES[key]}={value}\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=("staging", "production"))
    parser.add_argument("--endpoint", default="")
    parser.add_argument("--app-id", default="")
    parser.add_argument("--api-resource", default="")
    parser.add_argument("--redirect-uri", default="")
    parser.add_argument("--post-logout-redirect-uri", default="")
    parser.add_argument("--confirmation", default="")
    parser.add_argument("--github-env", type=Path)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    try:
        resolved = resolve(
            args.environment,
            {
                "endpoint": args.endpoint,
                "app_id": args.app_id,
                "api_resource": args.api_resource,
                "redirect_uri": args.redirect_uri,
                "post_logout_redirect_uri": args.post_logout_redirect_uri,
            },
            args.confirmation,
        )
        targets = [args.github_env or os.environ.get("GITHUB_ENV"), args.github_output or os.environ.get("GITHUB_OUTPUT")]
        targets = [Path(target) for target in targets if target]
        if not targets:
            raise ConfigError("--github-env/--github-output or the corresponding GitHub environment is required")
        for target in targets:
            write_values(target, resolved)
        print(f"PASS: resolved {args.environment} public Web OIDC build inputs.")
        return 0
    except (ConfigError, OSError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
