#!/usr/bin/env python3
"""Production-build Chromium regression for W3-PWA-01 and v1 -> W3-R1 migration.

Precondition: build the Web production bundle first, then run with the environment's
Python Playwright package. Uses an isolated browser context and fake OAuth values.
"""
import asyncio
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[3]
DIST = ROOT / "apps/web/dist"
BASELINE = "2154d166c6600db49dadb945eb746541218a0417"
CHROME = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH") or "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if not (DIST / "index.html").is_file():
    raise SystemExit("BLOCKED: production build missing; run pnpm --filter @myteam/web build")
old_sw = subprocess.check_output(
    ["git", "show", f"{BASELINE}:apps/web/public/sw.js"], cwd=ROOT, text=True
)
new_sw = (ROOT / "apps/web/public/sw.js").read_text(encoding="utf-8")
server_state = {"version": "old", "callbacks": 0}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/sw.js":
            body = (old_sw if server_state["version"] == "old" else new_sw).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/callback":
            server_state["callbacks"] += 1
        target = DIST / path.lstrip("/")
        if path in ("/", "/index.html") or not target.is_file():
            target = DIST / "index.html"  # production SPA fallback
        body = target.read_bytes()
        content_type = (
            "text/html" if target.name == "index.html" else
            "text/css" if target.suffix == ".css" else
            "application/javascript" if target.suffix == ".js" else
            "application/octet-stream"
        )
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        if target.name == "index.html":
            self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


async def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        async with async_playwright() as playwright:
            launch_options = {"headless": True, "args": ["--no-sandbox"]}
            if Path(CHROME).is_file():
                launch_options["executable_path"] = CHROME
            browser = await playwright.chromium.launch(**launch_options)
            context = await browser.new_context(service_workers="allow")
            first = await context.new_page()
            await first.goto(base + "/")
            await first.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
            await first.goto(base + "/callback?code=SYNTHETIC_CODE_83&state=SYNTHETIC_STATE_42")
            old_cached = await first.evaluate("""(async()=>{
              const c=await caches.open('myteam-pwa-v1');
              return (await c.keys()).some(r=>r.url.includes('SYNTHETIC_CODE_83')&&r.url.includes('SYNTHETIC_STATE_42'))
            })()""")
            assert old_cached, "Expected baseline v1 reproduction: callback URL was not cached"

            second = await context.new_page()
            await second.goto(base + "/")
            await second.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
            await first.evaluate("caches.open('unrelated-application-cache').then(c=>c.put('/private-data',new Response('SYNTHETIC_PRIVATE_DATA')))")

            server_state["version"] = "new"
            waiting = await first.evaluate("""(async()=>{
              const r=await navigator.serviceWorker.getRegistration(); await r.update();
              return new Promise(resolve=>{let n=0;const t=setInterval(()=>{
                if(r.waiting||++n>100){clearInterval(t);resolve(!!r.waiting)}
              },100)})
            })()""")
            assert waiting, "New worker did not wait while the previous worker was active"
            old_active = await first.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.active?.state==='activated')")
            assert old_active, "No activated worker was present during waiting state"
            await first.evaluate("window.__controllerChanged=false; navigator.serviceWorker.addEventListener('controllerchange',()=>window.__controllerChanged=true,{once:true})")
            await second.evaluate("window.__controllerChanged=false; navigator.serviceWorker.addEventListener('controllerchange',()=>window.__controllerChanged=true,{once:true})")
            await first.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.waiting.postMessage({type:'SKIP_WAITING'}))")
            await first.wait_for_function("window.__controllerChanged===true", timeout=10000)
            await second.wait_for_function("window.__controllerChanged===true", timeout=10000)
            await first.wait_for_function("caches.keys().then(k=>!k.includes('myteam-pwa-v1')&&k.includes('myteam-pwa-v2')&&k.includes('unrelated-application-cache'))", timeout=10000)

            before = server_state["callbacks"]
            response = await second.goto(base + "/callback?code=SYNTHETIC_CODE_ONLINE&state=SYNTHETIC_STATE_ONLINE")
            assert response is not None and response.status == 200, "Online callback did not complete via network"
            assert server_state["callbacks"] == before + 1, "Online callback did not reach the local network server"
            caches_after = await second.evaluate("""(async()=>{
              const out={}; for(const n of await caches.keys()){
                const c=await caches.open(n); out[n]=(await c.keys()).map(r=>r.url)
              } return out
            })()""")
            urls = [url for entries in caches_after.values() for url in entries]
            assert not any("SYNTHETIC_CODE" in u or "SYNTHETIC_STATE" in u or "/callback" in u for u in urls), "OAuth callback key found in Cache Storage"
            assert "unrelated-application-cache" in caches_after, "Unrelated application cache was deleted"

            await context.set_offline(True)
            offline_error = ""
            try:
                await second.goto(base + "/callback?code=SYNTHETIC_CODE_OFFLINE&state=SYNTHETIC_STATE_OFFLINE", timeout=5000)
            except Exception as error:
                offline_error = str(error)
            assert "ERR_INTERNET_DISCONNECTED" in offline_error, f"Offline callback returned a document instead of failing closed: {offline_error}"
            await context.set_offline(False)
            print("PASS Chromium production-build P1: baseline v1 caches synthetic callback; updated worker waits; explicit SKIP_WAITING activates and claims both tabs; v1 cache removed, unrelated cache preserved; online callback reached network but was not cached; offline callback returned ERR_INTERNET_DISCONNECTED, not shell 200.")
            await context.close()
            await browser.close()
    finally:
        server.shutdown()
        server.server_close()


asyncio.run(main())
