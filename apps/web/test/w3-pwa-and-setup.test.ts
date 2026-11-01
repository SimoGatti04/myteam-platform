import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('W3 MVP Functional Advancement: PWA Standards & Web App Manifest', () => {
  it('validates manifest.json meets PWA installation requirements', () => {
    const manifestPath = path.resolve(__dirname, '../public/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toBe('MyTeam Platform');
    expect(manifest.short_name).toBe('MyTeam');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);

    const icon = manifest.icons[0];
    expect(icon.src).toBe('/icon.svg');
    expect(icon.sizes).toContain('192x192');
    expect(icon.sizes).toContain('512x512');
    expect(icon.purpose).toContain('maskable');
  });

  it('validates index.html contains necessary mobile & PWA meta tags', () => {
    const indexPath = path.resolve(__dirname, '../index.html');
    const indexHtml = fs.readFileSync(indexPath, 'utf8');

    expect(indexHtml).toContain('<link rel="manifest" href="/manifest.json"');
    expect(indexHtml).toContain('<link rel="apple-touch-icon" href="/icon.svg"');
    expect(indexHtml).toContain('<meta name="apple-mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('<meta name="theme-color"');
  });

  it('validates service worker sw.js excludes /api/ calls and handles offline navigation', () => {
    const swPath = path.resolve(__dirname, '../public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swCode = fs.readFileSync(swPath, 'utf8');
    expect(swCode).toContain('/api/');
    expect(swCode).toContain('caches.open');
    expect(swCode).toContain('skipWaiting');
    expect(swCode).toContain('clients.claim');
  });
});
