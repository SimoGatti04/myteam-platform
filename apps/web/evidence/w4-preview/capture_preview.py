#!/usr/bin/env python3
"""Reproduce the W4 owner-review screenshots against the local Vite preview.

This is evidence tooling, not an E2E suite. It only drives the development app
with explicit demo fixtures and never calls the backend.

Usage:
  PREVIEW_URL=http://127.0.0.1:4174 \
    /opt/homebrew/opt/python@3.14/bin/python3.14 capture_preview.py
"""
import asyncio
import os
import re
from pathlib import Path

from playwright.async_api import async_playwright

BASE = os.environ.get('PREVIEW_URL', 'http://127.0.0.1:4174').rstrip('/')
OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)


async def shot(page, name: str) -> None:
    await page.wait_for_timeout(450)
    await page.screenshot(path=str(OUT / name), full_page=False)
    print(f'wrote {OUT / name}')


async def main() -> None:
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch()

        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true&preview=match-detail&match=m-last', wait_until='networkidle')
        await page.get_by_role('heading', name='Cronologia del referto').wait_for()
        await shot(page, '01-public-match-detail-desktop.png')

        await page.goto(f'{BASE}/?demo=true&preview=match-detail&match=m-last&previewState=empty', wait_until='networkidle')
        await page.get_by_text('Nessun evento registrato').wait_for()
        await shot(page, '02-public-empty-desktop.png')

        await page.goto(f'{BASE}/?demo=true&preview=match-detail&match=m-last&previewState=loading', wait_until='networkidle')
        await page.get_by_label('Caricamento dettaglio partita').wait_for()
        await shot(page, '03-public-loading-desktop.png')

        await page.goto(f'{BASE}/?demo=true&preview=match-detail&match=m-last&previewState=error', wait_until='networkidle')
        await page.get_by_text('Dettaglio partita non disponibile').wait_for()
        await shot(page, '04-public-error-desktop.png')
        await context.close()

        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true&preview=match-detail&match=m-last', wait_until='networkidle')
        await page.get_by_role('heading', name='Cronologia del referto').wait_for()
        await shot(page, '05-public-match-detail-mobile.png')
        await context.close()

        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true', wait_until='networkidle')
        await page.get_by_role('button', name='Area Admin').click()
        await page.get_by_role('button', name='Partite').first.click()
        await page.get_by_role('button', name='Referto DEMO').first.wait_for()
        await shot(page, '12-admin-match-list-referto-desktop.png')
        await context.close()

        context = await browser.new_context(viewport={'width': 1440, 'height': 900})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true&preview=admin-report&match=m-last', wait_until='networkidle')
        await page.get_by_role('heading', name='Referto partita').wait_for()
        await shot(page, '06-admin-report-desktop.png')

        await page.get_by_label('Punteggio ASD Aurora Calcio').fill('4')
        await page.get_by_label('Punteggio Virtus Brianza').fill('2')
        await page.get_by_label('Minuto').fill('90')
        await page.get_by_label('Marcatore').fill('Luca Sala')
        await page.get_by_label('Assist (opzionale)').fill('Marco Villa')
        await page.get_by_role('button', name=re.compile('Aggiungi al referto')).click()
        await page.get_by_text('Assist: Marco Villa').wait_for()
        await shot(page, '07-admin-report-with-local-goal-desktop.png')

        await page.get_by_role('button', name=re.compile('Applica e vedi anteprima')).click()
        await page.wait_for_url(re.compile(r'.*preview=match-detail.*'))
        await page.get_by_text('Luca Sala').wait_for()
        await shot(page, '08-public-after-local-save-desktop.png')
        await context.close()

        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true&preview=admin-report&match=m-last', wait_until='networkidle')
        await page.get_by_role('heading', name='Referto partita').wait_for()
        await shot(page, '09-admin-report-mobile.png')
        await page.get_by_role('button', name=re.compile('Aggiungi al referto')).click()
        await page.get_by_text('Inserisci un minuto intero tra 1 e 130.').wait_for()
        await shot(page, '10-admin-report-validation-mobile.png')
        await context.close()

        context = await browser.new_context(viewport={'width': 390, 'height': 844})
        page = await context.new_page()
        await page.goto(f'{BASE}/?demo=true&preview=admin-report&match=m-friendly-1', wait_until='networkidle')
        await page.get_by_text('Referto vuoto').wait_for()
        await shot(page, '11-admin-report-empty-mobile.png')
        await context.close()

        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
