# Web W3-R1 — P2 responsive/contrasto checkpoint

**Data:** 2 novembre 2026
**Branch/worktree:** `web/w3-r1-security-ux` — `<agent-home>/.codex/worktrees/web-w3-r1-security-ux`
**Base del delta:** `f1bb53e97dbb19c609edda83bcb5fe61f04cb658` (checkpoint WIP con P1 OIDC già salvato)
**Ambito:** solo Web; P1 `sw.js` lasciato invariato. Nessun Core/Infra/iOS/contratto condiviso, push, merge o deploy.

## Esito

**P2 overflow mobile: corretto e PASS su Chromium.** L’ispezione iniziale ha riprodotto overflow orizzontale nel solo admin: a viewport 320 px `document/body.scrollWidth` era 323 px in Partite e 476 px in Rosa; a 360 px Rosa era 476 px. Il delta limita la larghezza minima dei pannelli admin, consente ai badge di gara di andare a capo e restringe i filtri/tabelle alla larghezza del contenitore.

Dopo il delta sono state verificate Partite e Rosa, sito pubblico e admin DEMO, a 320, 360, 375, 390 e 414 px: in tutte le 20 combinazioni `documentElement.scrollWidth === innerWidth` e `body.scrollWidth === innerWidth`. A 320 px il wrapper della tabella Rosa ha 286 px visibili e 602 px di contenuto scrollabile; lo scroll rimane interno e il documento resta largo 320 px.

**P2 contrasto: già implementato nel commit di partenza e verificato.** Il servizio usa luminanza relativa WCAG; i test includono `#808000`, rapporto bianco/oliva <4.5:1, nero/oliva ≥4.5:1 e selezione testo nero. L’override manuale di `textOnPrimary` non viene bloccato per preservare la palette scelta dall’utente; `handleApplyColorOverrides` mostra un avviso sotto 4.5:1. Nessun redesign o restrizione della palette introdotti qui.

## Verifiche

- `git diff --check`: PASS.
- `mise exec -- pnpm check`: PASS (build, typecheck e test monorepo).
- `mise exec -- pnpm --filter @myteam/web test`: PASS, 138 test in 11 file (eseguiti prima della sola modifica inline responsive; la build/typecheck successivi hanno ricompilato le modifiche).
- `mise exec -- pnpm --filter @myteam/web build`: PASS; build ripetuta anche da `pnpm check` dopo il delta.
- `python3 apps/web/test/w3-r1-service-worker-browser.py`: PASS dopo build finale; Chromium reale, callback solo sintetici, cache legacy v1, cache estranea, due schede, callback online/offline. Evidenza riportata separatamente nel checkpoint P1.
- Matrice viewport Chromium descritta sopra: PASS; esecuzione diagnostica, non suite browser CI automatizzata. Modalità DEMO solo locale; nessun account/token reale.
- Login/logout Logto remoto: NOT RUN.

## Rischi e gate residui

- PWA build/cache rimane parziale: `CACHE_VERSION` è ancora fisso (`v2`); invalidazione correlata alla build, aggiornamento di asset fingerprinted attraverso più build e completamento end-to-end dell’azione UI di aggiornamento/reload non sono provati.
- Nessuna prova di autenticazione con Logto reale (intenzionalmente esclusa).
- La QA indipendente QA3 resta il gate necessario per accettare la chiusura; questo checkpoint non dichiara GO generale W3-R1.
