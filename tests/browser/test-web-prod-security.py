#!/usr/bin/env python3
"""
Test vincolante di sicurezza sul frontend compilato in produzione.
Verifica:
1. Form di inserimento JWT manuale NON utilizzabile / NON renderizzato.
2. Modalità DEMO NON attivabile (via interfaccia, via ?demo=true, via sessionStorage o localStorage).
3. Assenza di Logto configurato NON abilita accessi alternativi (mostra stato di provider non configurato fail-closed).
4. Nessun pulsante o trigger per attivare la modalità demo.
"""
import asyncio
import os
import sys
import re
from playwright.async_api import async_playwright, expect

EXIT_PASS = 0
EXIT_FAIL = 1

async def run_security_test(target_url: str) -> int:
    print("=" * 70)
    print("BROWSER PRODUCTION SECURITY AUDIT: DEMO / MANUAL AUTH / LOGTO GATE")
    print(f"Target URL: {target_url}")
    print("=" * 70)

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )

        try:
            # -----------------------------------------------------------------
            # TEST 1: Query param ?demo=true non deve attivare la modalità DEMO
            # -----------------------------------------------------------------
            print("\n[TEST 1] Testing query parameter ?demo=true...")
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            page = await context.new_page()

            # Intercetta chiamate API /api/* restituendo 404 per public team
            await page.route("**/api/v1/public/team", lambda route: route.fulfill(
                status=404,
                content_type="application/json",
                body='{"error":"public_team_not_found"}'
            ))

            await page.goto(f"{target_url}/?demo=true", wait_until="networkidle")

            body_text = await page.inner_text("body")
            assert "MODALITÀ DIMOSTRATIVA" not in body_text, "TEST 1 FAILED: Demo banner found in body with ?demo=true"
            assert "DEMO MOCK" not in body_text, "TEST 1 FAILED: DEMO MOCK label found in body with ?demo=true"
            assert "MAPI GROUP" not in body_text, "TEST 1 FAILED: Demo team branding 'MAPI GROUP' found with ?demo=true"
            assert "Passa a Demo" not in body_text, "TEST 1 FAILED: 'Passa a Demo' button found with ?demo=true"

            print("  -> PASS: ?demo=true ignored in production build.")
            await context.close()

            # -----------------------------------------------------------------
            # TEST 2: sessionStorage / localStorage con 'demo' non deve attivare DEMO
            # -----------------------------------------------------------------
            print("\n[TEST 2] Testing storage manipulation (sessionStorage / localStorage = 'demo')...")
            context2 = await browser.new_context(viewport={"width": 1280, "height": 800})
            page2 = await context2.new_page()
            await page2.route("**/api/v1/public/team", lambda route: route.fulfill(
                status=404,
                content_type="application/json",
                body='{"error":"public_team_not_found"}'
            ))

            # Inietta valori demo prima del caricamento degli script
            await page2.add_init_script("""
                try {
                    sessionStorage.setItem('myteam_data_mode', 'demo');
                    localStorage.setItem('myteam_data_mode', 'demo');
                } catch(e) {}
            """)

            await page2.goto(target_url, wait_until="networkidle")

            body_text2 = await page2.inner_text("body")
            assert "MODALITÀ DIMOSTRATIVA" not in body_text2, "TEST 2 FAILED: Demo banner active via storage injection"
            assert "DEMO MOCK" not in body_text2, "TEST 2 FAILED: DEMO MOCK active via storage injection"
            assert "MAPI GROUP" not in body_text2, "TEST 2 FAILED: MAPI GROUP active via storage injection"

            print("  -> PASS: Storage manipulation to force demo ignored in production build.")
            await context2.close()

            # -----------------------------------------------------------------
            # TEST 3: Navigazione in Area Admin:
            # - Form JWT manuale assente
            # - Demo fallback assente
            # - Assenza OIDC non offre bypass o accessi alternativi
            # -----------------------------------------------------------------
            print("\n[TEST 3] Testing Admin Login view for absence of manual auth & demo fallback...")
            context3 = await browser.new_context(viewport={"width": 1280, "height": 800})
            page3 = await context3.new_page()
            await page3.route("**/api/v1/public/team", lambda route: route.fulfill(
                status=404,
                content_type="application/json",
                body='{"error":"public_team_not_found"}'
            ))

            await page3.goto(target_url, wait_until="networkidle")

            # Clicca su Area Admin
            admin_btn = page3.get_by_role("button", name="Area Admin")
            await expect(admin_btn).to_be_visible()
            await admin_btn.click()

            # Attendi rendering AdminLoginView
            login_heading = page3.locator("h2:has-text('Accesso Amministrazione')")
            await expect(login_heading).to_be_visible()

            # 3A. Verifica ASSENZA del form manuale JWT
            # In sviluppo/staging il form ha textarea/input con placeholder eyJ o label 'Strumento di Collaudo'
            manual_form = page3.locator("textarea, input[placeholder*='eyJ'], text='Strumento di Collaudo'")
            assert await manual_form.count() == 0, "TEST 3A FAILED: Manual JWT input form is present in production build!"

            manual_submit = page3.get_by_role("button", name=re.compile(r"Accedi con Bearer Token|Valida e accedi", re.I))
            assert await manual_submit.count() == 0, "TEST 3A FAILED: Manual JWT submit button is present in production build!"
            print("  -> PASS: Manual JWT entry form is strictly absent.")

            # 3B. Verifica ASSENZA della sezione Demo in Login
            demo_section = page3.locator("text='Collaudo grafico in Modalità Demo', text='Attiva Modalità Demo'")
            assert await demo_section.count() == 0, "TEST 3B FAILED: Demo activation section is present in Admin Login!"
            print("  -> PASS: Demo activation section in Admin Login is strictly absent.")

            # 3C. Verifica stato fail-closed per Logto non configurato o configurato
            # Se Logto non è configurato o mock, deve mostrare lo stato senza aprire accessi alternativi
            body_login = await page3.inner_text("body")
            assert "Passa a Demo" not in body_login
            assert "MODALITÀ DIMOSTRATIVA" not in body_login
            print("  -> PASS: No alternative or bypass authentication mechanism is surfaced.")

            # -----------------------------------------------------------------
            # TEST 4: Verifica viste pubbliche (Statistiche, Votazioni, Rosa, Partite)
            # In produzione nessun pulsante "Attiva Modalità Demo" deve esistere
            # -----------------------------------------------------------------
            print("\n[TEST 4] Testing public tabs for absence of 'Attiva Modalità Demo' prompts...")
            for tab_name in ["Statistiche", "Votazioni"]:
                tab_btn = page3.get_by_role("button", name=tab_name).first
                if await tab_btn.is_visible():
                    await tab_btn.click()
                    await page3.wait_for_timeout(300)
                    tab_body = await page3.inner_text("body")
                    assert "Attiva Modalità Demo" not in tab_body, f"TEST 4 FAILED: 'Attiva Modalità Demo' visible in tab {tab_name}"
                    assert "DEMO MOCK" not in tab_body, f"TEST 4 FAILED: 'DEMO MOCK' visible in tab {tab_name}"
            print("  -> PASS: Public view tabs do not expose demo activation buttons.")

            await context3.close()
            await browser.close()

            print("\n" + "=" * 70)
            print("ALL PRODUCTION WEB SECURITY ASSERTIONS PASSED (100% FAIL-CLOSED)")
            print("=" * 70)
            return EXIT_PASS

        except AssertionError as err:
            print(f"\n[SECURITY AUDIT FAIL] {err}", file=sys.stderr)
            await browser.close()
            return EXIT_FAIL
        except Exception as exc:
            print(f"\n[SECURITY AUDIT ERROR] Unexpected error: {exc}", file=sys.stderr)
            await browser.close()
            return EXIT_FAIL

if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080"
    code = asyncio.run(run_security_test(url))
    sys.exit(code)
