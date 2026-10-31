import asyncio
import os
import re
import sys
import json
import time
from playwright.async_api import async_playwright, expect

# Exit codes per development-environment protocol
EXIT_PASS = 0
EXIT_FAIL = 1
EXIT_NOT_RUN = 2

def classify_launch_error(err: Exception) -> tuple[int, str]:
    err_str = str(err).lower()
    sandbox_patterns = [
        "machportrendezvousserver",
        "bootstrap_check_in",
        "sandbox_init",
        "sandbox",
    ]
    if any(p in err_str for p in sandbox_patterns):
        return (
            EXIT_NOT_RUN,
            "[ENVIRONMENT BLOCKED] Chromium launch failed due to environment/sandbox security policy:\n"
            f"Error: {err}\n\n"
            "DIAGNOSTIC DETAILS:\n"
            "- Root Cause: macOS sandbox profile forbids bootstrap_check_in for MachPortRendezvousServer (1100)\n"
            "- Classification: NOT RUN (ENVIRONMENT BLOCKED)\n"
            "- Protocol Compliance: In accordance with dev-env and AGENTS.md rules, this is NOT marked as PASS.\n"
            "- Prerequisites to run on authorized host:\n"
            "    1. Host with GUI session or unsandboxed process access (require_escalated permissions)\n"
            "    2. Active PostgreSQL instance (TEST_DATABASE_URL)\n"
            "    3. Fastify API running on port 3000 (node --import tsx/esm tests/browser/start-test-api.ts)\n"
            "    4. Web frontend running on port 5173 (pnpm --filter @myteam/web dev --port 5173)\n"
            "    5. Run: python3 tests/browser/browser-e2e.py http://127.0.0.1:5173 http://127.0.0.1:3000"
        )
    if "executable doesn't exist" in err_str or "could not find browser" in err_str:
        return (
            EXIT_FAIL,
            f"[FAIL (CONFIGURATION / DEPENDENCY ERROR)] Chromium browser binary missing: {err}\n"
            "Run 'pnpm exec playwright install chromium' or install Chromium."
        )
    return (
        EXIT_FAIL,
        f"[FAIL (CONFIGURATION / RUNTIME ERROR)] Browser launch failed: {err}"
    )

async def run_e2e(web_url="http://127.0.0.1:5173", api_url="http://127.0.0.1:3000"):
    print("=" * 75)
    print("PLAYWRIGHT BROWSER E2E TEST: Real Onboarding & Lifecycle Verification")
    print(f"Target Web: {web_url}")
    print(f"Target API: {api_url}")
    print("=" * 75)

    screenshots_dir = os.path.abspath(os.environ.get("QA_BROWSER_SCREENSHOTS_DIR", os.path.join(os.path.dirname(__file__), "screenshots")))
    os.makedirs(screenshots_dir, exist_ok=True)

    scenario_results = {}
    failed_scenarios = []

    async with async_playwright() as p:
        try:
            # Nessun percorso assoluto hardcoded: usa l'override esplicito se fornito,
            # altrimenti il browser installato da Playwright (cache utente).
            executable_path = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH") or None
            if executable_path and not os.path.exists(executable_path):
                executable_path = None

            browser = await p.chromium.launch(
                executable_path=executable_path,
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox"]
            )
        except Exception as launch_err:
            code, diag = classify_launch_error(launch_err)
            print("\n" + "!" * 75)
            print(diag)
            print("!" * 75 + "\n")
            return code

        try:
            # =========================================================================
            # SCENARIO 0: Backend Offline Scenario
            # =========================================================================
            print("\n[SCENARIO 0] Backend Offline UI Handling...")
            offline_context = await browser.new_context(viewport={"width": 1280, "height": 800})
            offline_page = await offline_context.new_page()

            # Route /api/* to abort to simulate offline backend
            await offline_page.route("**/api/**", lambda route: route.abort("failed"))
            await offline_page.goto(web_url, wait_until="domcontentloaded")

            # Expect "Servizio non disponibile" or offline alert
            error_heading = offline_page.locator("h2:has-text('Servizio non disponibile')")
            await expect(error_heading).to_be_visible(timeout=5000)
            error_desc = offline_page.locator("text=Server non raggiungibile (offline o connessione assente)")
            await expect(error_desc).to_be_visible(timeout=5000)

            await offline_page.screenshot(path=os.path.join(screenshots_dir, "00-backend-offline.png"))
            await offline_context.close()
            print("  -> PASS: Backend offline state surfaced with clean error UI.")
            scenario_results["00_backend_offline"] = "PASS"

            # =========================================================================
            # SCENARIO 1: Initial Empty Database & Public Neutral Branding
            # =========================================================================
            context = await browser.new_context(viewport={"width": 1280, "height": 800})
            page = await context.new_page()

            print("\n[SCENARIO 1] Empty Database State & Neutral Branding...")
            async with page.expect_response(lambda r: "/api/v1/public/team" in r.url) as resp_info:
                await page.goto(web_url, wait_until="networkidle")

            team_resp = await resp_info.value
            assert team_resp.status == 404, f"Expected public team 404 on empty DB, got {team_resp.status}"

            empty_heading = page.locator("h2:has-text('Squadra non ancora pubblicata')")
            await expect(empty_heading).to_be_visible(timeout=5000)

            body_text = await page.inner_text("body")
            assert "MAPI GROUP" not in body_text, "Hardcoded 'MAPI GROUP' branding must NOT be present in real mode"
            assert "MODALITÀ DIMOSTRATIVA" not in body_text, "Demo mode banner must NOT be present in real mode"

            await page.screenshot(path=os.path.join(screenshots_dir, "01-desktop-empty-db-home.png"))
            print("  -> PASS: 404 unconfigured team rendered, no DEMO badge, no 'MAPI GROUP' branding.")
            scenario_results["01_empty_db_neutral_branding"] = "PASS"

            # =========================================================================
            # SCENARIO 2: Authentication Security & Error Handling (401, 403, 200)
            # =========================================================================
            print("\n[SCENARIO 2] Authentication & Access Control (401, 403, 200)...")
            admin_toggle_btn = page.get_by_role("button", name="Area Admin")
            await expect(admin_toggle_btn).to_be_visible()
            await admin_toggle_btn.click()

            # Verify Admin Login view
            login_heading = page.locator("h2:has-text('Accesso Amministrazione'), h2:has-text('Pannello Amministratore')").first
            await expect(login_heading).to_be_visible()

            # Token input: textarea (W2-R1) or input[type=password] (W1-R2.2)
            token_input = page.locator("textarea, input[type='password'], input[placeholder*='eyJ']").first
            await expect(token_input).to_be_visible()

            # Submit button: 'Valida e accedi' (W2-R1) or 'Accedi con Bearer Token' (W1-R2.2)
            submit_token_btn = page.get_by_role("button", name=re.compile(r"Accedi con Bearer Token|Valida e accedi", re.I))
            await expect(submit_token_btn).to_be_visible()

            # Sub-scenario 2A: 401 Unauthorized
            print("  -> Sub-scenario 2A: Testing 401 Unauthorized with invalid token...")
            await token_input.fill("invalid-token")
            async with page.expect_response(lambda r: "/api/v1/admin/team" in r.url) as r_401:
                await submit_token_btn.click()
            resp_401 = await r_401.value
            assert resp_401.status == 401, f"Expected 401 for invalid token, got {resp_401.status}"
            await expect(login_heading).to_be_visible()

            # Strict UI assertion: error alert must be visible on screen
            # In W2-R1, AdminLoginView renders:
            # - 401: Header 'Errore di Autenticazione', detail 'Autenticazione richiesta (HTTP 401)'
            # - 403: Header 'Permessi Insufficienti (HTTP 403)', detail 'platform:admin'
            error_401_alert = page.locator("text=Errore di Autenticazione").first
            error_401_detail = page.locator("text=HTTP 401").first
            try:
                await expect(error_401_alert).to_be_visible(timeout=3000)
                await expect(error_401_detail).to_be_visible(timeout=3000)
                print("  -> PASS: 401 error alert is visible in UI (WEB-BUG-01 RESOLVED in W2-R1).")
                await page.screenshot(path=os.path.join(screenshots_dir, "02a-auth-401-error-displayed.png"))
                scenario_results["02a_auth_401_ui"] = "PASS"
            except AssertionError:
                print("  -> FAIL (WEB-BUG-01): 401 error alert was NOT displayed in UI!")
                await page.screenshot(path=os.path.join(screenshots_dir, "02a-auth-401-error-lost.png"))
                scenario_results["02a_auth_401_ui"] = "FAIL (WEB-BUG-01: AdminLoginView unmounts, wiping errorMsg)"
                failed_scenarios.append("02a_auth_401_ui")

            # Sub-scenario 2B: 403 Forbidden
            print("  -> Sub-scenario 2B: Testing 403 Forbidden with forbidden token...")
            await token_input.fill("forbidden-token")
            async with page.expect_response(lambda r: "/api/v1/admin/team" in r.url) as r_403:
                await submit_token_btn.click()
            resp_403 = await r_403.value
            assert resp_403.status == 403, f"Expected 403 for forbidden token, got {resp_403.status}"
            await expect(login_heading).to_be_visible()

            # Strict UI assertion: error alert must be visible on screen
            error_403_alert = page.locator("text=Permessi Insufficienti (HTTP 403)").first
            error_403_detail = page.locator("text=platform:admin").first
            try:
                await expect(error_403_alert).to_be_visible(timeout=3000)
                await expect(error_403_detail).to_be_visible(timeout=3000)
                print("  -> PASS: 403 error alert is visible in UI (WEB-BUG-01 RESOLVED in W2-R1).")
                await page.screenshot(path=os.path.join(screenshots_dir, "02b-auth-403-error-displayed.png"))
                scenario_results["02b_auth_403_ui"] = "PASS"
            except AssertionError:
                print("  -> FAIL (WEB-BUG-01): 403 error alert was NOT displayed in UI!")
                await page.screenshot(path=os.path.join(screenshots_dir, "02b-auth-403-error-lost.png"))
                scenario_results["02b_auth_403_ui"] = "FAIL (WEB-BUG-01: AdminLoginView unmounts, wiping errorMsg)"
                failed_scenarios.append("02b_auth_403_ui")

            # Sub-scenario 2C: 200 OK Authorized
            print("  -> Sub-scenario 2C: Testing 200 OK with authorized test token...")
            await token_input.fill("test-admin-token")
            async with page.expect_response(lambda r: "/api/v1/admin/team" in r.url) as r_200:
                await submit_token_btn.click()
            resp_200 = await r_200.value
            assert resp_200.status == 200, f"Expected 200 for valid test token, got {resp_200.status}"

            # Verify authenticated state
            logout_btn = page.get_by_role("button", name="Esci")
            await expect(logout_btn).to_be_visible()
            back_public_btn = page.get_by_role("button", name="Vai a Sito Pubblico")
            await expect(back_public_btn).to_be_visible()

            await page.screenshot(path=os.path.join(screenshots_dir, "02-desktop-admin-authenticated.png"))
            print("  -> PASS: Authorized Bearer token accepted; Admin Dashboard unlocked.")
            scenario_results["02c_auth_200_session"] = "PASS"

            # =========================================================================
            # SCENARIO 3: Empty DB Onboarding in Impostazioni
            # =========================================================================
            print("\n[SCENARIO 3] Empty DB Onboarding in Impostazioni...")
            impostazioni_btn = page.get_by_role("button", name="Impostazioni", exact=True)
            await expect(impostazioni_btn).to_be_visible()

            async with page.expect_response(lambda r: "/api/v1/admin/seasons" in r.url and r.request.method == "GET") as r_seasons:
                await impostazioni_btn.click()
            resp_seasons = await r_seasons.value
            assert resp_seasons.status == 200
            seasons_data = await resp_seasons.json()
            assert len(seasons_data) == 0, "Seasons must initially be empty"

            # Verify empty DB banner
            empty_season_banner = page.locator("text=Nessuna stagione registrata a sistema (Database Iniziale Vuoto)")
            await expect(empty_season_banner).to_be_visible()

            # Click 'Crea la Prima Stagione'
            create_first_season_btn = page.get_by_role("button", name="Crea la Prima Stagione")
            await expect(create_first_season_btn).to_be_visible()
            await create_first_season_btn.click()

            # Modal 'Nuova Stagione Sportiva'
            season_modal_title = page.locator("h3:has-text('Nuova Stagione Sportiva')")
            await expect(season_modal_title).to_be_visible()

            season_label_input = page.locator("input[placeholder='es. 2026/2027']")
            await season_label_input.fill("2026/2027")

            date_inputs = page.locator("input[type='date']")
            await date_inputs.nth(0).fill("2026-09-01")
            await date_inputs.nth(1).fill("2027-06-30")

            modal_create_btn = page.locator("form").filter(has_text="Nuova Stagione Sportiva").locator("button[type='submit']")
            if not await modal_create_btn.is_visible():
                modal_create_btn = page.get_by_role("button", name="Crea Stagione")

            async with page.expect_response(lambda r: "/api/v1/admin/seasons" in r.url and r.request.method == "POST") as r_post_season:
                await modal_create_btn.click()
            resp_post_season = await r_post_season.value
            assert resp_post_season.status == 201, f"Expected 201 season created, got {resp_post_season.status}"
            created_season = await resp_post_season.json()
            assert created_season["label"] == "2026/2027"

            # Verify season indicator: local selection state vs server state
            local_indicator = page.locator("text=non ancora salvata sul server")
            await expect(local_indicator).to_be_visible()

            # Team configuration form with exact DOM placeholders
            team_name_input = page.locator("input[placeholder='es. Nome Società Sportiva']")
            await team_name_input.fill("ASD Real Aurora")

            crest_url_input = page.locator("input[placeholder='https://.../crest.png']")
            await crest_url_input.fill("https://example.com/crest.png")

            primary_color_input = page.locator("input[placeholder='#1e3a8a']")
            await primary_color_input.fill("#112233")

            secondary_color_input = page.locator("input[placeholder='#38bdf8']")
            await secondary_color_input.fill("#FFFFFF")

            # Save team settings
            save_team_btn = page.get_by_role("button", name="Salva Impostazioni")
            async with page.expect_response(lambda r: "/api/v1/admin/team" in r.url and r.request.method == "PUT") as r_put_team:
                await save_team_btn.click()
            resp_put_team = await r_put_team.value
            assert resp_put_team.status == 200, f"Expected 200 PUT team, got {resp_put_team.status}"
            saved_team = await resp_put_team.json()
            assert saved_team["name"] == "ASD Real Aurora"
            assert saved_team["currentSeasonId"] == created_season["id"]

            # Publish team
            publish_team_btn = page.get_by_role("button", name="Pubblica Squadra sul Server")
            await expect(publish_team_btn).to_be_visible()
            async with page.expect_response(lambda r: "/api/v1/admin/team/publish" in r.url and r.request.method == "POST") as r_pub_team:
                await publish_team_btn.click()
            resp_pub_team = await r_pub_team.value
            assert resp_pub_team.status == 200, f"Expected 200 POST publish team, got {resp_pub_team.status}"

            # Verify publication status badge in DOM ('Stato Sito: PUBBLICATO' & 'Squadra Ufficiale Attiva')
            published_status = page.locator("text=Stato Sito: PUBBLICATO")
            await expect(published_status).to_be_visible()
            official_badge = page.locator("text=Squadra Ufficiale Attiva")
            await expect(official_badge).to_be_visible()

            await page.screenshot(path=os.path.join(screenshots_dir, "03-desktop-team-published.png"))
            print("  -> PASS: Season created, team configured and published successfully on PostgreSQL.")
            scenario_results["03_onboarding_team_published"] = "PASS"

            # =========================================================================
            # SCENARIO 4: Opponent Creation & Draft Match Creation
            # =========================================================================
            print("\n[SCENARIO 4] Opponent Creation & Draft Match Creation...")
            admin_partite_nav = page.get_by_role("button", name="Partite").first
            await admin_partite_nav.click()

            # Switch to sub-tab 'Squadre Avversarie'
            avversari_tab = page.get_by_role("button", name=re.compile(r"Squadre Avversarie", re.I))
            await expect(avversari_tab).to_be_visible()
            await avversari_tab.click()

            # Input opponent with exact placeholder 'es. Atletico Bovisa'
            opp_name_input = page.locator("input[placeholder='es. Atletico Bovisa']")
            await opp_name_input.fill("US Virtus")
            save_opp_btn = page.get_by_role("button", name=re.compile(r"Salva Avversario", re.I))

            async with page.expect_response(lambda r: "/api/v1/admin/opponents" in r.url and r.request.method == "POST") as r_opp:
                await save_opp_btn.click()
            resp_opp = await r_opp.value
            assert resp_opp.status == 201, f"Expected 201 opponent, got {resp_opp.status}"
            created_opp = await resp_opp.json()
            assert created_opp["name"] == "US Virtus"

            # Verify opponent listed in anagrafica
            opp_item = page.locator("div:has-text('US Virtus')").first
            await expect(opp_item).to_be_visible()

            # Back to sub-tab 'Calendario & Bozze'
            calendario_tab = page.get_by_role("button", name=re.compile(r"Calendario & Bozze", re.I))
            await calendario_tab.click()

            # Open modal 'Nuova Partita'
            nuova_partita_btn = page.get_by_role("button", name="Nuova Partita")
            await expect(nuova_partita_btn).to_be_visible()
            await nuova_partita_btn.click()

            modal_match_title = page.locator("h3:has-text('Programma Nuova Partita')")
            await expect(modal_match_title).to_be_visible()

            # Fill match datetime
            match_datetime_input = page.locator("input[type='datetime-local']")
            await match_datetime_input.fill("2026-11-15T15:00")

            # Click 'Salva come Bozza'
            save_draft_btn = page.get_by_role("button", name="Salva come Bozza")
            async with page.expect_response(lambda r: "/api/v1/admin/matches" in r.url and r.request.method == "POST") as r_match:
                await save_draft_btn.click()
            resp_match = await r_match.value
            assert resp_match.status == 201, f"Expected 201 match created, got {resp_match.status}"
            created_match = await resp_match.json()
            assert created_match["status"] == "scheduled"
            assert created_match["publishedAt"] is None, "Draft match must have publishedAt == None"

            # Verify draft badge in admin table
            draft_badge = page.locator("text=BOZZA (NON PUBBLICATA)").first
            await expect(draft_badge).to_be_visible()
            publish_match_btn = page.get_by_role("button", name="Pubblica Partita").first
            await expect(publish_match_btn).to_be_visible()

            await page.screenshot(path=os.path.join(screenshots_dir, "04-desktop-draft-match-admin.png"))
            print("  -> PASS: Opponent created, match saved as draft with 'BOZZA (NON PUBBLICATA)' badge.")
            scenario_results["04_draft_match_created"] = "PASS"

            # =========================================================================
            # SCENARIO 5: Strict Isolation of Draft Match from Public Website
            # =========================================================================
            print("\n[SCENARIO 5] Strict Isolation of Draft Match from Public Website...")
            await back_public_btn.click()

            # Verify public partite navigation
            public_partite_nav = page.get_by_role("button", name="Partite").first
            async with page.expect_response(lambda r: "/api/v1/public/matches" in r.url) as r_pub_matches:
                await public_partite_nav.click()
            resp_pub_matches = await r_pub_matches.value
            assert resp_pub_matches.status == 200
            pub_matches_data = await resp_pub_matches.json()
            assert len(pub_matches_data.get("scheduled", [])) == 0, "Public scheduled matches must be 0 when match is in draft"

            public_body_text = await page.inner_text("body")
            assert "US Virtus" not in public_body_text, "Draft match opponent 'US Virtus' must NOT appear on public website"

            await page.screenshot(path=os.path.join(screenshots_dir, "05-desktop-public-draft-isolated.png"))
            print("  -> PASS: Draft match is strictly isolated, GET /public/matches returned empty.")
            scenario_results["05_draft_match_isolated"] = "PASS"

            # =========================================================================
            # SCENARIO 6: Explicit Match Publication & Public Projection
            # =========================================================================
            print("\n[SCENARIO 6] Explicit Match Publication & Public Display...")
            admin_btn = page.get_by_role("button", name="Area Admin")
            await admin_btn.click()

            admin_partite_tab = page.get_by_role("button", name="Partite").first
            await admin_partite_tab.click()

            publish_match_btn = page.get_by_role("button", name="Pubblica Partita").first
            async with page.expect_response(lambda r: "/api/v1/admin/matches/" in r.url and "/publish" in r.url and r.request.method == "POST") as r_pub_m:
                await publish_match_btn.click()
            resp_pub_m = await r_pub_m.value
            assert resp_pub_m.status == 200

            # Navigate back to public matches
            await back_public_btn.click()
            async with page.expect_response(lambda r: "/api/v1/public/matches" in r.url) as r_pub_matches2:
                await public_partite_nav.click()
            resp_pub_matches2 = await r_pub_matches2.value
            assert resp_pub_matches2.status == 200
            pub_matches_data2 = await resp_pub_matches2.json()
            assert len(pub_matches_data2.get("scheduled", [])) == 1, "Published match must now appear in public matches"
            assert pub_matches_data2["scheduled"][0]["opponentName"] == "US Virtus"

            # Verify text on public page
            match_card = page.locator("div:has-text('vs US Virtus')").first
            await expect(match_card).to_be_visible()

            await page.screenshot(path=os.path.join(screenshots_dir, "06-desktop-published-match-public.png"))
            print("  -> PASS: Match explicitly published, visible on public site with correct opponent.")
            scenario_results["06_match_published_public"] = "PASS"

            await context.close()

            # =========================================================================
            # SCENARIO 7: Mobile Viewport (390x844 - Smartphone Responsive)
            # =========================================================================
            print("\n--- MOBILE VIEWPORT TEST (390x844) ---")
            mobile_context = await browser.new_context(
                viewport={"width": 390, "height": 844},
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
            )
            mobile_page = await mobile_context.new_page()

            await mobile_page.goto(web_url, wait_until="networkidle")

            # Verify desktop nav is hidden and hamburger button is visible
            mobile_menu_btn = mobile_page.locator("button.mobile-toggle[aria-label='Apri Menu']")
            await expect(mobile_menu_btn).to_be_visible()

            # Open mobile drawer
            await mobile_menu_btn.click()
            await mobile_page.screenshot(path=os.path.join(screenshots_dir, "07-mobile-drawer-open.png"))

            # In drawer, click Partite
            mobile_partite_btn = mobile_page.locator("nav, div").filter(has_text="Partite").get_by_role("button", name="Partite").first
            async with mobile_page.expect_response(lambda r: "/api/v1/public/matches" in r.url) as r_mob_m:
                await mobile_partite_btn.click()
            resp_mob_m = await r_mob_m.value
            assert resp_mob_m.status == 200

            # Verify match is visible on mobile viewport
            mob_match = mobile_page.locator("text=vs US Virtus").first
            await expect(mob_match).to_be_visible()

            await mobile_page.screenshot(path=os.path.join(screenshots_dir, "08-mobile-public-matches.png"))
            print("  -> PASS: Mobile viewport 390x844 renders hamburger drawer and public matches cleanly.")
            scenario_results["07_mobile_responsive"] = "PASS"

            await mobile_context.close()
            await browser.close()

            print("\n" + "=" * 75)
            if failed_scenarios:
                print(f"BROWSER E2E GATE FINISHED WITH DETECTED DEFECTS ({len(failed_scenarios)} scenario(s) failed):")
                for s in failed_scenarios:
                    print(f"  - {s}: {scenario_results[s]}")
                print(f"Overall Exit Code: {EXIT_FAIL} (EXIT_FAIL)")
                print("=" * 75)
                return EXIT_FAIL
            else:
                print("BROWSER E2E GATE COMPLETE: ALL SCENARIOS VERIFIED WITH 100% SUCCESS")
                print(f"Overall Exit Code: {EXIT_PASS} (EXIT_PASS)")
                print("=" * 75)
                return EXIT_PASS

        except AssertionError as assert_err:
            print(f"\n[FAIL] Assertion failed: {assert_err}")
            return EXIT_FAIL
        except Exception as ex:
            print(f"\n[FAIL] Unexpected exception during browser test: {ex}")
            return EXIT_FAIL

if __name__ == "__main__":
    web_target = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5173"
    api_target = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:3000"
    code = asyncio.run(run_e2e(web_target, api_target))
    sys.exit(code)
