#!/usr/bin/env python3
"""Fail-closed Kubernetes Lease lock used by deploy-stage.sh.

All mutations use create (atomic absent-name acquisition) or replace with the
observed resourceVersion (optimistic compare-and-swap). No dependency beyond
Python's standard library and kubectl is required.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Any


def kubectl(args: list[str], payload: dict[str, Any] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["kubectl", *args],
        input=json.dumps(payload) if payload is not None else None,
        capture_output=True,
        text=True,
        check=False,
    )


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp(value: datetime | None = None) -> str:
    return (value or utc_now()).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def manifest(namespace: str, name: str, owner: str, duration: int, *, rv: str | None = None,
             transitions: int = 0, acquired: str | None = None) -> dict[str, Any]:
    meta: dict[str, Any] = {"name": name, "namespace": namespace}
    if rv:
        meta["resourceVersion"] = rv
    now = timestamp()
    return {
        "apiVersion": "coordination.k8s.io/v1",
        "kind": "Lease",
        "metadata": meta,
        "spec": {
            "holderIdentity": owner,
            "leaseDurationSeconds": duration,
            "acquireTime": acquired or now,
            "renewTime": now,
            "leaseTransitions": transitions,
        },
    }


def get_lease(namespace: str, name: str) -> tuple[dict[str, Any] | None, str]:
    result = kubectl(["-n", namespace, "get", "lease", name, "-o", "json"])
    if result.returncode:
        return None, result.stderr.strip()
    try:
        value = json.loads(result.stdout)
        if not isinstance(value, dict) or value.get("kind") != "Lease":
            return None, "kubectl returned an unexpected Lease object"
        return value, ""
    except json.JSONDecodeError as exc:
        return None, f"invalid JSON from kubectl: {exc}"


def is_expired(obj: dict[str, Any], now: datetime | None = None) -> bool:
    spec = obj.get("spec") or {}
    holder = spec.get("holderIdentity")
    if not holder:
        return True
    renewed = parse_time(spec.get("renewTime")) or parse_time(spec.get("acquireTime"))
    duration = spec.get("leaseDurationSeconds")
    if renewed is None or not isinstance(duration, int) or duration <= 0:
        return False  # malformed/unknown lease is not safe to steal
    return (now or utc_now()) >= renewed + timedelta(seconds=duration)


def replace_lease(obj: dict[str, Any]) -> subprocess.CompletedProcess[str]:
    return kubectl(["replace", "-f", "-"], obj)


def acquire(namespace: str, name: str, owner: str, duration: int) -> int:
    proposed = manifest(namespace, name, owner, duration)
    created = kubectl(["create", "-f", "-"], proposed)
    if created.returncode == 0:
        print(f"Lease acquired: {namespace}/{name} owner={owner}")
        return 0

    # The create may have failed for reasons other than AlreadyExists. Read the
    # resource to distinguish contention from RBAC/API/connectivity failures.
    for _ in range(3):
        current, error = get_lease(namespace, name)
        if current is None:
            print(f"Lease create failed: {created.stderr.strip()}; get failed: {error}", file=sys.stderr)
            return 1
        if not is_expired(current):
            holder = (current.get("spec") or {}).get("holderIdentity", "unknown")
            print(f"Lease is held by active owner {holder!r}; refusing concurrent deployment.", file=sys.stderr)
            return 1

        meta = current.get("metadata") or {}
        spec = current.get("spec") or {}
        rv = meta.get("resourceVersion")
        if not rv:
            print("Lease has no resourceVersion; refusing unsafe takeover.", file=sys.stderr)
            return 1
        old_owner = spec.get("holderIdentity")
        updated = json.loads(json.dumps(current))
        updated["metadata"]["resourceVersion"] = str(rv)
        updated.setdefault("spec", {}).update({
            "holderIdentity": owner,
            "leaseDurationSeconds": duration,
            "acquireTime": timestamp(),
            "renewTime": timestamp(),
            "leaseTransitions": int(spec.get("leaseTransitions") or 0) + (1 if old_owner else 0),
        })
        result = replace_lease(updated)
        if result.returncode == 0:
            print(f"Expired Lease atomically acquired: {namespace}/{name} owner={owner}")
            return 0
        # A conflict means another contender renewed/took over; re-read and
        # retry a bounded number of times. Other errors are fail-closed too.
        if "Conflict" not in result.stderr and "object has been modified" not in result.stderr:
            print(f"Lease takeover failed: {result.stderr.strip()}", file=sys.stderr)
            return 1
    print("Lease changed during takeover; acquisition lost the compare-and-swap race.", file=sys.stderr)
    return 1


def renew(namespace: str, name: str, owner: str) -> int:
    current, error = get_lease(namespace, name)
    if current is None:
        print(f"Cannot renew Lease: {error}", file=sys.stderr)
        return 1
    spec = current.get("spec") or {}
    if spec.get("holderIdentity") != owner:
        print("Lease renewal refused: this process is no longer the owner.", file=sys.stderr)
        return 1
    rv = (current.get("metadata") or {}).get("resourceVersion")
    if not rv:
        print("Lease renewal refused: resourceVersion is missing.", file=sys.stderr)
        return 1
    update = json.loads(json.dumps(current))
    update["metadata"]["resourceVersion"] = str(rv)
    update.setdefault("spec", {})["renewTime"] = timestamp()
    result = replace_lease(update)
    if result.returncode:
        print(f"Lease renewal compare-and-swap failed: {result.stderr.strip()}", file=sys.stderr)
        return 1
    return 0


def release(namespace: str, name: str, owner: str) -> int:
    current, error = get_lease(namespace, name)
    if current is None:
        print(f"Lease release refused: cannot verify ownership ({error}).", file=sys.stderr)
        return 1
    spec = current.get("spec") or {}
    if spec.get("holderIdentity") != owner:
        print("Lease release refused: this process is not the current owner.", file=sys.stderr)
        return 1
    rv = (current.get("metadata") or {}).get("resourceVersion")
    if not rv:
        print("Lease release refused: resourceVersion is missing.", file=sys.stderr)
        return 1
    update = json.loads(json.dumps(current))
    update["metadata"]["resourceVersion"] = str(rv)
    update.setdefault("spec", {})["holderIdentity"] = ""
    update["spec"]["renewTime"] = timestamp()
    result = replace_lease(update)
    if result.returncode:
        print(f"Lease release compare-and-swap failed; lock will expire naturally: {result.stderr.strip()}", file=sys.stderr)
        return 1
    print(f"Lease released: {namespace}/{name} owner={owner}")
    return 0


def heartbeat(namespace: str, name: str, owner: str, duration: int, interval: int, parent_pid: int) -> int:
    while True:
        time.sleep(interval)
        if renew(namespace, name, owner):
            # Ensure the deploy runner stops if ownership is lost; continuing
            # after a missed renewal could permit overlapping migrations.
            try:
                os.kill(parent_pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            return 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("acquire", "renew", "release", "heartbeat"))
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--owner", required=True)
    parser.add_argument("--duration", type=int, default=180)
    parser.add_argument("--interval", type=int, default=30)
    parser.add_argument("--parent-pid", type=int, default=0)
    args = parser.parse_args()
    if args.duration < 3 or args.interval < 1 or args.interval >= args.duration:
        parser.error("duration must be >=3s and heartbeat interval must be shorter than duration")
    if args.action == "acquire":
        return acquire(args.namespace, args.name, args.owner, args.duration)
    if args.action == "renew":
        return renew(args.namespace, args.name, args.owner)
    if args.action == "release":
        return release(args.namespace, args.name, args.owner)
    if not args.parent_pid:
        parser.error("heartbeat requires --parent-pid")
    return heartbeat(args.namespace, args.name, args.owner, args.duration, args.interval, args.parent_pid)


if __name__ == "__main__":
    raise SystemExit(main())
