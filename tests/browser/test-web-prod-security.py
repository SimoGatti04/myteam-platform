#!/usr/bin/env python3
"""
Test vincolante di sicurezza sul frontend compilato in produzione.
Verifica sul frontend compilato in produzione:
1. Il form JWT manuale e il fallback DEMO non sono renderizzati.
2. La modalità DEMO non è attivabile via UI, ?demo=true o storage.
3. Il login Logto SSO configurato è visibile e utilizzabile come unico accesso admin.
4. Nessun pulsante o trigger permette di attivare la modalità demo.
"""
import asyncio
import sys
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
            assert await page.get_by_role("button", name="Passa a Demo", exact=True).count() == 0, "TEST 1 FAILED: Demo toggle is rendered with ?demo=true"
            assert await page.get_by_role("button", name="Attiva Modalità Demo", exact=True).count() == 0, "TEST 1 FAILED: Demo activation button is rendered with ?demo=true"

            print("  -> PASS: ?demo=true ignored and demo controls absent in production build.")
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
            assert await page2.get_by_role("button", name="Passa a Demo", exact=True).count() == 0, "TEST 2 FAILED: Demo toggle is rendered after storage injection"
            assert await page2.get_by_role("button", name="Attiva Modalità Demo", exact=True).count() == 0, "TEST 2 FAILED: Demo activation button is rendered after storage injection"

            print("  -> PASS: Storage manipulation ignored and demo controls absent in production build.")
            await context2.close()

            # -----------------------------------------------------------------
            # TEST 3: Navigazione in Area Admin:
            # - Login Logto SSO configurato visibile come accesso primario
            # - Form JWT manuale e demo fallback assenti in produzione
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

            # Attendi il titolo reale della AdminLoginView (heading semantico, non testo storico).
            login_heading = page3.get_by_role("heading", name="Pannello Amministratore", exact=True)
            await expect(login_heading).to_be_visible()

            # 3A. In questa build Logto è configurato: deve essere il percorso SSO visibile.
            logto_description = page3.get_by_text(
                "Autenticazione federata sicura basata su OpenID Connect Authorization Code Flow con PKCE (RFC 7636).",
                exact=True,
            )
            await expect(logto_description).to_be_visible()
            logto_button = page3.get_by_role("button", name="Accedi con Logto (SSO)", exact=True)
            await expect(logto_button).to_be_visible()
            await expect(logto_button).to_be_enabled()
            print("  -> PASS: Configured Logto SSO is visible and enabled.")

            # 3B. Verifica ASSENZA del form manuale JWT e dei suoi controlli.
            manual_form_label = page3.get_by_text("Inserimento manuale Bearer Token JWT (Collaudo)", exact=True)
            assert await manual_form_label.count() == 0, "TEST 3B FAILED: Manual JWT form label is present in production build!"
            manual_form = page3.locator("main form")
            assert await manual_form.count() == 0, "TEST 3B FAILED: Manual authentication form is present in production build!"
            manual_fields = page3.locator("textarea, input[placeholder*='eyJ']")
            assert await manual_fields.count() == 0, "TEST 3B FAILED: Manual JWT input is present in production build!"
            manual_submit = page3.get_by_role("button", name="Valida e accedi", exact=True)
            assert await manual_submit.count() == 0, "TEST 3B FAILED: Manual JWT submit button is present in production build!"
            print("  -> PASS: Manual JWT entry form and submit control are strictly absent.")

            # 3C. Verifica ASSENZA della sezione e del trigger Demo in Login.
            demo_section = page3.get_by_text("Collaudo grafico in Modalità Demo", exact=True)
            demo_button = page3.get_by_role("button", name="Attiva Modalità Demo", exact=True)
            assert await demo_section.count() == 0, "TEST 3C FAILED: Demo activation section is present in Admin Login!"
            assert await demo_button.count() == 0, "TEST 3C FAILED: Demo activation button is present in Admin Login!"
            print("  -> PASS: Demo activation section and button are strictly absent.")

            # 3D. Cross-check che la vista admin non mostri ulteriori bypass demo.
            body_login = await page3.inner_text("body")
            assert "Passa a Demo" not in body_login, "TEST 3D FAILED: Demo toggle is present in Admin Login!"
            assert "MODALITÀ DIMOSTRATIVA" not in body_login, "TEST 3D FAILED: Demo banner is present in Admin Login!"
            print("  -> PASS: No alternative demo/bypass mechanism is surfaced.")

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
