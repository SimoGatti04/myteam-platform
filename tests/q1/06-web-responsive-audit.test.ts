import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Trova la root del pacchetto apps/web usando percorsi relativi indipendenti dalla macchina
function findWebRoot(): string {
  const localWeb = join(process.cwd(), "apps/web");
  if (existsSync(join(localWeb, "index.html"))) {
    return localWeb;
  }
  // Sibling worktree fallback se siamo in un worktree isolato
  const siblingWeb = join(process.cwd(), "../myteam-platform/apps/web");
  if (existsSync(join(siblingWeb, "index.html"))) {
    return siblingWeb;
  }
  return localWeb;
}

const webRoot = findWebRoot();

test("6.1 Web App Architecture & Responsiveness Static Audit", {
  skip: !existsSync(join(webRoot, "index.html")) ? "apps/web/index.html not found; skipping web static audit in non-web worktree" : false
}, () => {
  const indexPath = join(webRoot, "index.html");

  const html = readFileSync(indexPath, "utf8");
  assert.ok(html.includes("width=device-width"), "Viewport meta tag must declare width=device-width");
  assert.ok(html.includes("manifest.json"), "PWA manifest must be referenced");

  // Check manifest.json
  const manifestPath = join(webRoot, "public/manifest.json");
  assert.ok(existsSync(manifestPath), "manifest.json must exist in public/");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.display, "standalone", "PWA display mode must be standalone");
  assert.ok(manifest.icons && manifest.icons.length > 0, "PWA manifest must define icons");

  // Check CSS theme contains neutral scales and CSS custom properties
  const themePath = join(webRoot, "src/styles/theme.css");
  assert.ok(existsSync(themePath), "theme.css must exist");
  const css = readFileSync(themePath, "utf8");
  assert.match(css, /--brand-primary:/, "CSS custom property --brand-primary must be defined");
  assert.match(css, /--brand-secondary:/, "CSS custom property --brand-secondary must be defined");

  // Check Navbar defines responsive toggle
  const navbarPath = join(webRoot, "src/components/Navbar.tsx");
  assert.ok(existsSync(navbarPath), "Navbar.tsx must exist");
  const navbar = readFileSync(navbarPath, "utf8");
  assert.match(navbar, /mobileMenuOpen/, "Navbar must implement mobile responsive menu state");
});

test("6.2 Web Build Artifacts Verification", {
  skip: !existsSync(join(webRoot, "dist/index.html")) ? "dist/index.html not present; run pnpm --filter @myteam/web build first" : false
}, () => {
  const distIndex = join(webRoot, "dist/index.html");
  const distHtml = readFileSync(distIndex, "utf8");
  assert.match(distHtml, /<div id="root">/i, "Built index.html must mount root container");
});

test("6.3 Live Browser Responsive E2E Gate (Mobile & Desktop Viewports)", {
  skip: "NOT RUN: Live headless browser execution blocked by environment constraints (no display daemon / loopback browser socket in sandbox). Requires manual or staging browser verification before production release."
}, () => {
  // Gateplaceholder tracciato esplicitamente come non eseguito / bloccato
});
