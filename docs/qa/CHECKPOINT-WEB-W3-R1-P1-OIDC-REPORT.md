# Web W3-R1 — P1 OIDC / Service Worker Checkpoint

**Data:** 2 novembre 2026
**Ambito:** esclusivamente W3-PWA-01 (persistenza del callback OIDC in Cache Storage).
**Verdetto:** **P1 CLOSED — W3-R1 complessivo NON promosso a GO**.
**Branch/worktree:** `web/w3-r1-security-ux` — `/Users/gatti/.codex/worktrees/web-w3-r1-security-ux`
**Commit WIP di partenza:** `af7feaeaf04eaab5e5be60b52815f8121c644cb2` (includeva già la remediation Web non verificata); questo checkpoint aggiunge evidenza e test riproducibile, senza cambiare `sw.js`.

## Evidenza statica

Il service worker W3-R1:

- passa direttamente richieste cross-origin, `/api/`, percorsi di autenticazione/callback e URL con parametri OAuth/token sensibili;
- applica cache solo a shell pubblica e asset statici ammessi; le navigazioni pubbliche usano rete e fallback shell offline;
- durante l’attivazione elimina solo cache con prefisso `myteam-pwa-` diverse dalla propria e rimuove chiavi auth/API dalla cache corrente;
- evita `skipWaiting()` automatico quando esiste un worker attivo; supporta il messaggio `SKIP_WAITING` esplicito e poi usa `clients.claim()`.

La registrazione client avviene solo nella build production. Il report QA3 menzionato nel mandato non è presente a questo SHA; la baseline indipendente `docs/qa/CHECKPOINT-WEB-W3-FUNCTIONAL-REPORT.md` è stata letta dalla revisione `aadb67e0bb44f3eb81036c503e78f234e6950cf7`.

## Evidenza browser dinamica

Eseguito il test riproducibile `apps/web/test/w3-r1-service-worker-browser.py` contro la build production, in Chromium reale **156.0.8078.79**, Playwright Python, contesto browser isolato e server locale su porta effimera. Nessun account o segreto reale; solo valori sintetici.

Il test usa il service worker originale della base W3 (`2154d166c6600db49dadb945eb746541218a0417`) come controllo positivo e poi serve il worker W3-R1 allo stesso origin:

1. **Riproduzione baseline:** con v1 attivo e una navigazione callback sintetica `code/state`, la chiave sensibile viene effettivamente trovata nella cache `myteam-pwa-v1` (**PASS: finding riprodotto**).
2. **Stato waiting:** con due schede ancora aperte/controllate dal worker precedente, l’aggiornamento installa il nuovo worker in `waiting`; il worker precedente è ancora `activated` prima dell’azione esplicita (**PASS**).
3. **Attivazione e migrazione:** inviando il messaggio `SKIP_WAITING` previsto dal client, entrambe le schede ricevono `controllerchange`; `myteam-pwa-v1` scompare, `myteam-pwa-v2` resta, e una cache sintetica `unrelated-application-cache` contenente dati fittizi di altra applicazione non viene cancellata (**PASS**).
4. **Callback online W3-R1:** la richiesta callback sintetica raggiunge il server locale (risposta HTTP 200 dalla rete); dopo la navigazione nessuna chiave con `/callback`, `SYNTHETIC_CODE` o `SYNTHETIC_STATE` è presente in alcuna cache (**PASS**).
5. **Callback offline:** la navigazione callback fallisce con `ERR_INTERNET_DISCONNECTED`; non viene restituita la shell applicativa come falsa risposta HTTP 200 (**PASS**).

Il test dimostra il comportamento del worker e del protocollo di attivazione su due client, non un’autenticazione Logto reale. L’azione `SKIP_WAITING` è stata inviata direttamente come messaggio previsto dal pulsante, non tramite click UI; non è quindi verificata la tempistica del reload dell’interfaccia.

## Verifiche

| Verifica | Esito | Evidenza |
|---|---|---|
| `pnpm check` con Node `v26.5.0`, pnpm `10.32.1` gestiti da mise | **PASS** | Build, typecheck e suite canonica root completati. Un primo tentativo nel sandbox non poteva scrivere gli artefatti generati; il run autorizzato successivo è terminato correttamente. |
| `pnpm --filter @myteam/web test` | **PASS** | 11 file, 138 test. |
| `apps/web/test/w3-r1-service-worker-browser.py` | **PASS** | Chromium 156.0.8078.79; risultati dinamici elencati sopra. |
| `git diff --check` pre-commit | **PASS** | Nessun whitespace error. |
| Logto/login/logout reali | **NOT RUN** | Non richiesti; nessuna credenziale reale utilizzata. |
| P2 WCAG/mobile e aggiornamento tramite click UI/reload | **NOT RUN** | Fuori da questa chiusura P1. |
| QA3 report presente nel worktree corrente | **NOT PRESENT** | La sua assenza non è stata colmata con contenuti inventati; usata la baseline QA disponibile. |

## Esito e rischi residui

**W3-PWA-01: CLOSED** per i criteri verificati: callback non persiste in Cache Storage, callback offline fallisce chiuso, cache v1 sensibile viene rimossa all’attivazione del worker aggiornato senza cancellare cache estranee, e due schede passano al worker attivo dopo il consenso esplicito `SKIP_WAITING`.

**W3-PWA-02: PARZIALMENTE VERIFICATO / APERTO.** È verificato il passaggio dalla cache v1 al worker W3-R1 e il ciclo `waiting → SKIP_WAITING → activate/claim`; resta `CACHE_VERSION = 'v2'` fisso, non legato alla build. Non è dimostrata l’invalidazione delle cache/asset fingerprinted attraverso build successive, né il comportamento del click UI/reload immediato con schede esistenti.

I finding P2 WCAG e mobile della QA baseline non sono stati riesaminati in questo incarico. Nessuna dichiarazione di GO generale, merge, push o deployment.

## Riproduzione

Dalla root del repository, con Python Playwright e Chromium disponibili nell’ambiente:

```sh
pnpm --filter @myteam/web build
python3 apps/web/test/w3-r1-service-worker-browser.py
```

Il test sceglie il Chrome installato nel percorso macOS noto oppure Playwright Chromium; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` può indicare un binario alternativo. Serve accesso locale loopback e l’oggetto Git della base W3 indicata.
