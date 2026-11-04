import json, os, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ["E2E_WEB_BASE"]
TOKEN = os.environ["E2E_TOKEN"]
OPP = os.environ["E2E_OPPONENT"]
SHOTS = os.environ["E2E_SHOTS"]
os.makedirs(SHOTS, exist_ok=True)
api_calls = []

def shot(page, name):
    p = f"{SHOTS}/{name}.png"
    page.screenshot(path=p)
    print("SHOT", p, flush=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="it-IT")
    ctx.add_init_script(
        "sessionStorage.setItem('myteam_admin_auth_token', %s);"
        "sessionStorage.setItem('myteam_data_mode','real');" % json.dumps(TOKEN)
    )
    page = ctx.new_page()
    pageerrors = []
    page.on("pageerror", lambda e: pageerrors.append(str(e)))

    def on_response(r):
        if "/api/" in r.url:
            api_calls.append({"method": r.request.method, "url": r.url.replace(BASE, ""), "status": r.status})

    page.on("response", on_response)
    admin_auth_headers = []
    def on_request(r):
        if "/api/v1/admin" in r.url:
            admin_auth_headers.append(r.headers.get("authorization", ""))
    page.on("request", on_request)

    # 1) Public detail while published but no result yet => real API 404 state
    page.goto(BASE + "/", wait_until="load")
    page.locator("button:visible").filter(has_text="Partite").first.click()
    page.get_by_text(OPP, exact=False).first.click()
    dlg = page.get_by_role("dialog").first
    dlg.wait_for()
    expect(dlg).to_contain_text("Risultato non pubblicato", timeout=10000)
    print("CHECKPOINT public_before_result=unpublished_404", flush=True)
    shot(page, "01-public-404-before-result")
    page.keyboard.press("Escape")

    # 2) Admin: real PUT result + real POST event through the UI
    page.locator("button:visible").filter(has_text="Area Admin").first.click()
    page.locator("button:visible").filter(has_text="Partite").first.click()
    page.get_by_text(OPP, exact=False).first.wait_for()
    page.locator("button:visible").filter(has_text="Referto").first.click()
    rep = page.get_by_role("dialog", name="Referto partita")
    rep.wait_for()
    expect(rep).to_contain_text("Risultato finale")
    page.get_by_label("Punteggio MAPI").fill("2")
    page.get_by_label("Punteggio " + OPP).fill("1")
    page.locator("button:visible").filter(has_text="Salva risultato").first.click()
    expect(rep.get_by_text("Risultato salvato dal server", exact=False).first).to_be_visible(timeout=15000)
    print("CHECKPOINT result_saved_via_ui", flush=True)

    page.get_by_label("Minuto nel tempo").fill("23")
    page.get_by_label("Marcatore").select_option(index=1)
    page.locator("button:visible").filter(has_text="Aggiungi bozza").first.click()
    expect(rep.locator(".w4-badge--local")).to_be_visible()
    page.locator("button:visible").filter(has_text="Invia 1 eventi").first.click()
    page.wait_for_timeout(1200)
    rows = rep.locator("ul[aria-label='Eventi salvati sul server'] li").count()
    print("CHECKPOINT events_saved_via_ui rows=%d" % rows, flush=True)
    assert rows >= 1, "expected saved event rows from DB"
    shot(page, "02-admin-saved-desktop")
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(250)
    shot(page, "03-admin-saved-mobile")
    page.set_viewport_size({"width": 1440, "height": 900})

    # 3) Public re-read from DB (same session, then hard reload)
    page.locator("button:visible").filter(has_text="Vedi scheda pubblica").first.click()
    pub = page.get_by_role("dialog").first
    pub.wait_for()
    expect(pub).to_contain_text("2 - 1", timeout=10000)
    print("CHECKPOINT public_after_save=2-1", flush=True)
    shot(page, "04-public-200-after-save")
    page.keyboard.press("Escape")

    page.goto(BASE + "/", wait_until="load")
    page.locator("button:visible").filter(has_text="Partite").first.click()
    page.get_by_text(OPP, exact=False).first.click()
    pub2 = page.get_by_role("dialog").first
    pub2.wait_for()
    expect(pub2).to_contain_text("2 - 1", timeout=10000)
    expect(pub2).to_contain_text("Gol")
    print("CHECKPOINT public_after_reload=2-1_with_events", flush=True)
    shot(page, "05-public-200-after-reload")

    print("CHECKPOINT pageerrors=%s" % pageerrors, flush=True)
    assert not pageerrors, pageerrors
    browser.close()

print("NETWORK")
for c in api_calls:
    print(json.dumps(c, ensure_ascii=False))
print("ADMIN_AUTH_HEADER_PRESENT", all(h.lower().startswith("bearer ") for h in admin_auth_headers), len(admin_auth_headers))
summary = {
    "api_calls": api_calls,
    "public_404": any(c["status"] == 404 and c["url"].endswith("/scoreboard") for c in api_calls),
    "result_put": any(c["method"] == "PUT" and c["status"] == 200 and c["url"].endswith("/result") for c in api_calls),
    "event_post": any(c["method"] == "POST" and c["status"] == 201 and c["url"].endswith("/events") for c in api_calls),
    "scoreboard_200": any(c["method"] == "GET" and c["status"] == 200 and c["url"].endswith("/scoreboard") for c in api_calls),
    "admin_auth_header_ok": all(h.lower().startswith("bearer ") for h in admin_auth_headers) and len(admin_auth_headers) > 0,
}
print("SUMMARY " + json.dumps(summary))
assert summary["public_404"] and summary["result_put"] and summary["event_post"] and summary["scoreboard_200"] and summary["admin_auth_header_ok"], summary
print("BROWSER_E2E_PASS")
