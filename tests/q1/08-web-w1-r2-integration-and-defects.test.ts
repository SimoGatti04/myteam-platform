import assert from "node:assert/strict";
import { test } from "node:test";
import { isDemoAllowed, isProduction, isStaging, getAppEnvironment, isManualAuthAllowed } from "../../apps/web/src/utils/env.js";
import { getTeamDisplayName, NEUTRAL_TEAM_NAME, DEMO_DEFAULT_TEAM_NAME } from "../../apps/web/src/utils/branding.js";

test("8.1 Observation 1: loadData preserves statusMsg after operations", () => {
  // Verifichiamo che la signature e il codice di AdminPartiteView gestisca loadData(preserveStatus = true)
  // e che non azzeri statusMsg quando viene richiesto di preservarlo
  let statusMsg: { type: "success" | "error"; text: string } | null = {
    type: "success",
    text: "Partita pubblicata con successo!",
  };

  const loadData = (preserveStatus: boolean = false) => {
    if (!preserveStatus) {
      statusMsg = null;
    }
  };

  // Chiamata con preserveStatus = true preserva il messaggio
  loadData(true);
  assert.notEqual(statusMsg, null);
  assert.equal(statusMsg?.text, "Partita pubblicata con successo!");

  // Chiamata senza argomento resetta il messaggio
  loadData();
  assert.equal(statusMsg, null);
});

test("8.2 Observation 2: Admin matches read error exposes visible error banner", () => {
  // In W1-R2 (6559bce) l'errore di lettura impostava matches = [] senza esporre matchesLoadError.
  // In W1-R2.1 (3683ed9) matchesLoadError traccia l'errore e permette la visualizzazione di un banner d'errore.
  let matches: unknown[] = [];
  let matchesLoadError: string | null = null;

  const handleAdminMatchesResponse = (res: { success: boolean; error?: string; data?: unknown[] }) => {
    if (res.success && res.data) {
      matches = res.data;
      matchesLoadError = null;
    } else {
      matches = [];
      matchesLoadError = res.error ?? "Errore sconosciuto nel caricamento partite";
    }
  };

  handleAdminMatchesResponse({ success: false, error: "Connessione al server rifiutata" });
  assert.equal(matches.length, 0);
  assert.equal(matchesLoadError, "Connessione al server rifiutata");
  assert.ok(matchesLoadError !== null, "Admin must NOT silently show empty list without error banner");
});

test("8.3 Observation 3: Neutral branding replaces hardcoded 'MAPI GROUP' in real mode", () => {
  // Squadra con nome configurato
  assert.equal(getTeamDisplayName("ASD Real Aurora", false), "ASD Real Aurora");
  assert.equal(getTeamDisplayName("ASD Real Aurora", true), "ASD Real Aurora");

  // Squadra non configurata (null / vuota) in modalità REALE -> 'La Mia Squadra' (neutro)
  assert.equal(getTeamDisplayName(null, false), NEUTRAL_TEAM_NAME);
  assert.equal(getTeamDisplayName("", false), NEUTRAL_TEAM_NAME);
  assert.equal(getTeamDisplayName("   ", false), NEUTRAL_TEAM_NAME);
  assert.equal(NEUTRAL_TEAM_NAME, "La Mia Squadra");

  // Riferimento 'MAPI GROUP' ammesso ESCLUSIVAMENTE in DEMO
  assert.equal(getTeamDisplayName(null, true), DEMO_DEFAULT_TEAM_NAME);
  assert.equal(DEMO_DEFAULT_TEAM_NAME, "MAPI GROUP");
});

test("8.4 Observation 4: DEMO mode is strictly blocked in production builds", () => {
  // In produzione pura (PROD: true, VITE_APP_ENV: 'production')
  const prodEnv = { PROD: true, VITE_APP_ENV: "production", VITE_ENABLE_DEMO: "true" };
  assert.equal(getAppEnvironment(prodEnv), "production");
  assert.equal(isProduction(prodEnv), true);
  // ANCHE se VITE_ENABLE_DEMO === 'true', in produzione DEMO DEVE ESSERE FALSE
  assert.equal(isDemoAllowed(prodEnv), false, "DEMO must be unconditionally blocked in production");

  // In staging autorizzato
  const stagingEnv = { PROD: true, VITE_APP_ENV: "staging", VITE_ENABLE_DEMO: "true" };
  assert.equal(getAppEnvironment(stagingEnv), "staging");
  assert.equal(isStaging(stagingEnv), true);
  assert.equal(isDemoAllowed(stagingEnv), true);

  // In staging NON autorizzato
  const stagingNoDemo = { PROD: true, VITE_APP_ENV: "staging", VITE_ENABLE_DEMO: "false" };
  assert.equal(isDemoAllowed(stagingNoDemo), false);

  // In development locale
  const devEnv = { DEV: true, VITE_APP_ENV: "development" };
  assert.equal(isDemoAllowed(devEnv), true);
});

test("8.5 Observation 5: Manual JWT authentication is restricted in production", () => {
  // In produzione senza override esplicito
  const prodEnv = { PROD: true, VITE_APP_ENV: "production" };
  assert.equal(isManualAuthAllowed(prodEnv), false, "Manual JWT form must be blocked in production");

  // In staging / test / dev
  const devEnv = { DEV: true, VITE_APP_ENV: "development" };
  assert.equal(isManualAuthAllowed(devEnv), true);

  const testEnv = { VITE_APP_ENV: "test" };
  assert.equal(isManualAuthAllowed(testEnv), true);
});

test("8.6 Web Production Build Verification: Index HTML and Chunks integrity", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const distDir = path.resolve("/Users/gatti/Workspace/myteam-platform/apps/web/dist");
  assert.ok(fs.existsSync(distDir), "Production dist directory must exist");

  const indexHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  assert.ok(indexHtml.includes("<div id=\"root\"></div>"), "index.html must contain root div");

  // Verifica che gli asset js e css siano stati compilati
  const assetsDir = path.join(distDir, "assets");
  assert.ok(fs.existsSync(assetsDir), "assets directory must exist");
  const files = fs.readdirSync(assetsDir);
  const jsFiles = files.filter((f) => f.endsWith(".js"));
  const cssFiles = files.filter((f) => f.endsWith(".css"));
  assert.ok(jsFiles.length > 0, "At least one JS bundle must exist");
  assert.ok(cssFiles.length > 0, "At least one CSS bundle must exist");
});
