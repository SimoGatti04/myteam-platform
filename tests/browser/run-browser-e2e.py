#!/usr/bin/env python3
"""Run browser E2E in two fresh API/schema lifecycles with verified cleanup."""
import argparse
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import importlib.util
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API_PORT, WEB_PORT = 3000, 5173
MARKER_RE = re.compile(r"^myteam-qa-test-api-3000\.schema$")
SCHEMA_RE = re.compile(r"^test_qa_[0-9a-f]{32}$")


def redact(text: str) -> str:
    return re.sub(r"(postgres(?:ql)?://[^:/\s]+:)[^@/\s]+(@)", r"\1[REDACTED]\2", text, flags=re.I)


def assert_port_free(port: int) -> None:
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError as exc:
            raise RuntimeError(f"required port {port} is already in use; refusing to interfere") from exc


def wait_http(url: str, process: subprocess.Popen, log_path: Path, timeout: float = 60) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"process exited {process.returncode} before readiness; see {log_path}")
        try:
            with urllib.request.urlopen(url, timeout=2):
                return
        except (urllib.error.URLError, TimeoutError, OSError):
            time.sleep(.25)
    raise RuntimeError(f"timed out waiting for {url}; see {log_path}")


def marker_path() -> Path:
    return Path(tempfile.gettempdir()) / f"myteam-qa-test-api-{API_PORT}.schema"


def start(command, env, log_path):
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, text=True)
    return process, log


def stop(process, log, label):
    if process.poll() is None:
        process.terminate()
    try:
        code = process.wait(timeout=35)
    except subprocess.TimeoutExpired:
        process.kill()
        code = process.wait(timeout=5)
        log.close()
        raise RuntimeError(f"{label} did not stop gracefully (forced termination, exit={code})")
    log.close()
    return code


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifacts-dir", type=Path, help="private output directory for per-run logs/screenshots")
    args = parser.parse_args()
    db_url = os.environ.get("TEST_DATABASE_URL", "")
    try:
        parsed = __import__("urllib.parse", fromlist=["urlparse"]).urlparse(db_url)
        if parsed.scheme not in ("postgres", "postgresql") or parsed.hostname not in ("localhost", "127.0.0.1", "::1"):
            raise RuntimeError("TEST_DATABASE_URL must target a loopback PostgreSQL test database")
        db_name = __import__("urllib.parse", fromlist=["unquote"]).unquote(parsed.path.lstrip("/"))
        if not db_name.endswith("_test"):
            raise RuntimeError("TEST_DATABASE_URL database name must end in _test")
        if importlib.util.find_spec("playwright") is None:
            raise RuntimeError("Python Playwright package is missing for the selected interpreter; use a configured authorized Python environment")
        assert_port_free(API_PORT)
        assert_port_free(WEB_PORT)
    except Exception as exc:
        print(f"BLOCKED/FAIL preflight: {exc}", file=sys.stderr)
        return 1

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = args.artifacts_dir or Path(tempfile.gettempdir()) / f"myteam-browser-e2e-{stamp}"
    out.mkdir(parents=True, exist_ok=False)
    if marker_path().exists():
        print(f"Refusing to start: existing API marker requires manual investigation: {marker_path()}", file=sys.stderr)
        return 1

    env = os.environ.copy()
    env["TEST_DATABASE_URL"] = db_url
    env["QA_TEST_API_PORT"] = str(API_PORT)
    env["VITE_ENABLE_DEMO"] = "false"
    vite = None
    vite_log = None
    overall = 0
    try:
        vite, vite_log = start(["pnpm", "--filter", "@myteam/web", "dev", "--", "--host", "127.0.0.1", "--port", str(WEB_PORT), "--strictPort"], env, out / "vite.log")
        wait_http(f"http://127.0.0.1:{WEB_PORT}", vite, out / "vite.log")
        for run_no in (1, 2):
            assert_port_free(API_PORT)
            if marker_path().exists():
                raise RuntimeError(f"stale marker before run {run_no}; refusing cleanup without ownership proof")
            run_dir = out / f"run-{run_no}"
            run_dir.mkdir()
            run_env = env.copy()
            run_env["QA_BROWSER_SCREENSHOTS_DIR"] = str(run_dir / "screenshots")
            api, api_log = start(["node", "--import", "tsx/esm", "tests/browser/start-test-api.ts"], run_env, run_dir / "api.log")
            try:
                wait_http("http://127.0.0.1:3000/health", api, run_dir / "api.log")
                if not marker_path().exists():
                    raise RuntimeError("API became ready without its persistent schema marker")
                marker_raw = marker_path().read_text(encoding="utf-8")
                marker = json.loads(marker_raw)
                schema = marker.get("schema", "")
                if not SCHEMA_RE.fullmatch(schema) or marker.get("database") != db_name or marker.get("pid") != api.pid:
                    raise RuntimeError("API marker does not match this run; refusing to continue")
                test = subprocess.run([sys.executable, str(ROOT / "tests/browser/browser-e2e.py"), f"http://127.0.0.1:{WEB_PORT}", "http://127.0.0.1:3000"], cwd=ROOT, env=run_env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                (run_dir / "browser.log").write_text(redact(test.stdout), encoding="utf-8")
                if test.returncode != 0:
                    overall = 1
                    print(f"run {run_no}: browser FAIL exit={test.returncode}; details={run_dir / 'browser.log'}")
                else:
                    print(f"run {run_no}: browser PASS exit=0")
            finally:
                api_code = stop(api, api_log, f"API run {run_no}")
                api_log_text = redact((run_dir / "api.log").read_text(encoding="utf-8"))
                (run_dir / "api.log").write_text(api_log_text, encoding="utf-8")
                if api_code != 0 or "QA_SCHEMA_CLEANUP_VERIFIED" not in api_log_text:
                    overall = 1
                    print(f"run {run_no}: cleanup FAIL exit={api_code}; see {run_dir / 'api.log'}")
                else:
                    print(f"run {run_no}: API cleanup verified by server")
                if marker_path().exists():
                    overall = 1
                    print(f"run {run_no}: marker remains: {marker_path()}")
                else:
                    print(f"run {run_no}: marker absent")
                verify = subprocess.run(["pnpm", "exec", "tsx", "tests/browser/verify-schema-absent.ts", schema], cwd=ROOT, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
                (run_dir / "schema-verification.log").write_text(redact(verify.stdout), encoding="utf-8")
                if verify.returncode != 0:
                    overall = 1
                    print(f"run {run_no}: independent schema verification FAIL; see {run_dir / 'schema-verification.log'}")
                else:
                    print(f"run {run_no}: independent schema absence verified")
        print(f"ARTIFACTS_DIR={out}")
        return overall
    except Exception as exc:
        print(f"HARNESS FAIL: {redact(str(exc))}; artifacts={out}", file=sys.stderr)
        return 1
    finally:
        if vite is not None:
            vite_code = stop(vite, vite_log, "Vite")
            if vite_code not in (0, -15, 143):
                print(f"Vite exited with {vite_code}", file=sys.stderr)
                overall = 1


if __name__ == "__main__":
    raise SystemExit(main())
