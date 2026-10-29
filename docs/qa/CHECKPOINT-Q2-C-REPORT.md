# QA Q2-C — Verifica indipendente Web W2-R3

**Agente:** QA (persistente)
**Checkpoint:** Q2-C / regression gate dei finding Q2-B
**Data:** 2026-10-29
**Branch QA:** `qa/q2-c-w2r3-integration`
**Ambito modificato da QA:** esclusivamente `tests/` e `docs/qa/`. Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`, nessun merge su `main`, nessun deploy.

---

## 1. Verdetto

| Dimensione | Esito |
|---|---|
| 1. Correttezza tecnica della remediation | **PASS** |
| 2. Sicurezza OIDC | **CONDITIONAL PASS** — fallback eliminato e verificato con mutation test; restano firma ID token non verificata lato SPA (limite documentato), assenza di timeout sulla discovery, fallback *non-discovery* sull'endpoint di logout |
| 3. Riproducibilità dei test | **PASS** — install pulito `--frozen-lockfile`, 87/87 Web ×3, 23/23 OIDC ×3, nessun percorso assoluto, nessuna dipendenza dalla CWD |
| 4. Integrazione Core/PostgreSQL | **PASS** — C1.2 antenato di W2-R3, merge verificato, 6/6 test PostgreSQL reali, regressione CORE-BUG-01 riprodotta via HTTP con DB invariato |
| 5. Idoneità al successivo gate di integrazione | **PASS con condizioni** — vedi §11 |

**Verdetto complessivo: QA CONDITIONAL PASS.**
Non è autorizzazione al merge su `main`. Le condizioni sono in §10 e richiedono, prima di un gate di release: (a) decisione del supervisore sui finding aperti QA-C-01/03, (b) gate Logto staging reale, (c) CI remota che riproduca i comandi di §8.

---

## 2. Revisioni effettivamente testate

| Componente | Riferimento | SHA completo |
|---|---|---|
| Web W2-R3 (oggetto della verifica) | `web/w2-logto-auth` | `860bc5b1f46438247d218db9ca6653f1634f0a42` |
| Web W2-R2 (base del diff) | `web/w2-logto-auth` | `478b7426ce645fd14c627c7c027148173f255435` |
| Merge Core C1.2 dentro W2-R3 | — | `ce7f110c9cc8abf25e770bf24ff14ca8d7640c44` |
| Core C1.2 | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` |
| Base QA (Q2-B) | `qa/q2-b-w2r2-verification` | `87e664893b92b5df9da28b4e2d2be9b5a0ca4172` |
| Merge d'integrazione QA | `qa/q2-c-w2r3-integration` | `fada57a784773bdc627e8113e60719cac1e1d23c` |
| Commit QA di questo rapporto | `qa/q2-c-w2r3-integration` | vedi §12 (commit successivo) |

### 2.1 Ancestry verificata (comandi eseguiti)

```
git merge-base --is-ancestor 1ab7179… 860bc5b…   -> YES  (Core C1.2 antenato di W2-R3)
git log -1 --format="%P" ce7f110…                -> 478b742… 1ab7179…   (esattamente 2 parent)
git merge-base --is-ancestor 478b742… ce7f110…    -> YES  (W2-R2 è primo parent)
git log -1 --format="%P" fada57a…                -> 87e6648… 860bc5b…   (merge QA --no-ff)
```

### 2.2 Diff reale W2-R2 → W2-R3 (`478b742..860bc5b`, 12 file)

```
apps/api/src/platform/service.ts                |   3 +      <- Core C1.2 (via merge ce7f110)
apps/api/test/integration/platform-flow.test.ts |  45 +      <- Core C1.2
apps/web/README.md                              |   1 +      <- nota W2-R3 su refresh/offline_access
apps/web/package.json                           |   4 +-     <- @testing-library/react + /dom dichiarate (F3)
apps/web/src/services/oidc.ts                   |  35 +--    <- discovery fail-closed (F1)
apps/web/test/w2-oidc-auth.test.ts              |   9 +      <- discovery iniettata, test ermetico (F2)
apps/web/test/w2-r1-react-integration.test.tsx  |   9 +
apps/web/test/w2-r2-oidc-security.test.tsx      |   9 +
docs/API.md                                     |   6 +-
docs/STATUS.md                                  |  19 +++
docs/TESTING.md                                 |  36 ++++--
pnpm-lock.yaml                                  | 123 +++++++
```

**Modifiche fuori scope dichiarato:** nessuna attribuibile al lavoro Web. Le modifiche a `apps/api/**` provengono dal merge dichiarato di Core C1.2 (`ce7f110`), non da edit Web; il fix applicativo Web è circoscritto a `apps/web/src/services/oidc.ts`. I file `docs/*.md` sono documentazione condivisa, coerente con il fix.

---

## 3. Metodo e indipendenza

- Tutte le verifiche sono state eseguite sul worktree QA isolato `myteam-platform-q2-c-int` (branch `qa/q2-c-w2r3-integration`), più un clone pulito senza `node_modules` (`myteam-platform-q2-c`, branch `qa/q2-c-w2r3-verification`) per il test F3.
- Nessun risultato dichiarato da Web è stato usato come prova: ogni numero in questo rapporto proviene da un comando eseguito e da un log conservato in `docs/qa/evidence/q2-c/`.
- L'unica modifica temporanea a codice applicativo è stata il **mutation test** su `apps/web/src/services/oidc.ts` (§7.3): file ripristinato con `git checkout`, MD5 identico prima/dopo (`5f6ff7676b2992074d88fc2da0013c54`) e `git status` pulito sul file.
- Verificatore admin nei test API/browser: **sostitutivo** (`test-admin-token`), non JWT Logto reale. Nessun esito qui è attribuito a Logto.

---

## 4. Matrice conclusiva Q2-B → Q2-C

| Finding Q2-B | Gravità | Stato Q2-C | Prova |
|---|---|---|---|
| **QA-B-CORE-01** — W2-R2 non contiene il fix C1.2, partita completata modificabile | Alta | **VERIFIED CLOSED** | `1ab7179` antenato di `860bc5b`; PG reale 6/6; HTTP reale: 400 `completed_match_schedule_is_immutable`, stato/data invariati, storico 1→1, audit 1→1 (§7.5, §7.6) |
| **QA-B-F3** — `@testing-library/react`/`dom` non dichiarate → 30 test non raccolti su clone pulito | Alta | **VERIFIED CLOSED** | Clone senza `node_modules`: `pnpm install --frozen-lockfile` exit 0; `@myteam/web test` → 7 file / **87 test PASS** ×3 (§7.2) |
| **QA-B-F2** — `w2-oidc-auth.test.ts` §3 dipendeva da una `fetch` reale (flake 5 s) | Media | **VERIFIED CLOSED** | Test ora inietta la discovery via `setDiscoveryMetadata`, nessuna rete; 23/23 ×3 esecuzioni (§7.4) |
| **QA-B-F1** — fallback hardcoded su discovery 5xx/offline | Media | **VERIFIED CLOSED** | `buildAuthorizationUrl`/`handleAuthorizationCallback` usano solo `fetchDiscovery()`; QA test dedicato 6/6; mutation su `oidc.ts` W2-R2 → **3 FAIL** (§7.3) |
| **QA-B-F4** — 6 schemi `test_qa_*` residui | Bassa | **VERIFIED CLOSED** | Conteggio `pg_namespace LIKE 'test_qa_%'` = **0** a fine sessione (§9) |
| **QA-B-OBS-03** — shutdown test-API non idempotente | Bassa | **VERIFIED CLOSED** | Handler idempotente + marker/sweep su `SIGKILL`; ripristino verificato, 0 residui |
| **QA-B-OBS-01** — `offline_access` richiesto ma refresh token scartato | Bassa | **PARTIALLY CLOSED** | Documentato in `apps/web/README.md` ("rinnovo silenzioso non supportato", nota W2-R3). Scope `offline_access` **ancora nel default** → resta QA-C-05 |
| **QA-B-OBS-02** — nessun timeout sulla discovery | Bassa | **OPEN** | `fetchDiscovery()` senza `AbortSignal`. Ora amplificato: nessun fallback ⇒ rete appesa = UI in loading indefinito → **QA-C-03** |
| **QA-B-LIM-01** — firma ID token non verificata (JWKS lato SPA) | Limite | **NOT VERIFIED (invariato, per progetto)** | `parseJwtPayload` decodifica soltanto; nessuna verifica JWKS. Affidamento dichiarato: TLS del token endpoint + verifica JWT/JWKS lato Core su ogni chiamata admin (docs/API.md). Resta gate separato |
| **QA-B-LIM-02** — nessun Logto reale | Limite | **NOT RUN (invariato)** | Nessuna credenziale/istanza autorizzata; nessun esito attribuito a Logto |

---

## 5. Nuovi finding QA-C

### QA-C-01 — Fallback a endpoint di logout non scoperto — *Bassa / funzionale*
`apps/web/src/services/oidc.ts` `buildEndSessionUrl()` usa `discoveryMetadata.end_session_endpoint` **se presente**, altrimenti costruisce euristicamente
`<endpoint>/oidc/session/end` (o `<endpoint>/session/end`). Dopo un F5, `discoveryMetadata` è `null` (cache solo in memoria), quindi il logout federato di un utente che ricarica la pagina usa un endpoint **non ottenuto dalla discovery**: se Logto espone un `end_session_endpoint` diverso, il redirect di logout fallisce silenziosamente (sessione locale comunque distrutta).
Non è una fuga di credenziali: nessun token viene inviato a host diversi da quello configurato.
Riproduzione: istanziare `new OidcClient(mockConfig)` senza `setDiscoveryMetadata`, chiamare `buildEndSessionUrl()` → URL costruito per euristica.
Correzione suggerita (circoscritta): rendere `buildEndSessionUrl` asincrona e fail-closed come il resto del flusso (`await this.fetchDiscovery()`, errore esplicito se `end_session_endpoint` manca).
Responsabilità: Web. **Non bloccante**.

### QA-C-02 — Seam pubblico `setDiscoveryMetadata()` sul singleton esportato — *Bassa / hardening*
`oidcClient` è esportato e `setDiscoveryMetadata()` è `public` e usato solo dai test (F2). Da codice di pagina consente di iniettare metadati arbitrari senza discovery. Non è un bypass sfruttabile da remoto (richiede già esecuzione di script nell'origine), ma introduce un percorso che scavalca la garanzia fail-closed se mai richiamato in produzione.
Riproduzione: `oidcClient.setDiscoveryMetadata({issuer:'x', authorization_endpoint:'https://evil', token_endpoint:'https://evil'})` → `buildAuthorizationUrl()` restituisce l'endpoint iniettato senza discovery.
Correzione suggerita: esporre il seam solo ai test (factory `createOidcClientForTest` / `Object.defineProperty` in setup) oppure rifiutare l'iniezione quando `import.meta.env.PROD`.
Responsabilità: Web. **Non bloccante**.

### QA-C-03 — Nessun timeout su discovery/token + stato di loading senza uscita — *Bassa / disponibilità*
`fetchDiscovery()` e lo scambio token non hanno `AbortSignal`. Con rete che non risponde: `loginWithOidc()` lascia `oidcLoading=true` per sempre (spinner senza errore). Rischio di disponibilità, **non** di sicurezza: nessun fallback, nessuna sessione creata.
Riproduzione: `fetch` che non si risolve (promise pendente) → `buildAuthorizationUrl` non termina, UI resta in loading.
Correzione suggerita: `signal: AbortSignal.timeout(10_000)` + messaggio d'errore e pulsante di retry.
Responsabilità: Web. **Non bloccante** (erede di QA-B-OBS-02).

### QA-C-04 — Fixture DEMO incluse nel bundle di produzione — *Informativa*
Il bundle di produzione contiene la stringa `MAPI GROUP` (1 occorrenza) e i fixture demo, perché `apps/web/src/services/api.ts` importa staticamente `fixtures/demoData`. A runtime la demo è **irraggiungibile** (verificato in browser, §7.7). Costo: peso bundle e superficie di codice non necessaria in produzione.
Correzione suggerita: import dinamico dei fixture dietro `isDemoAllowed()`.
Responsabilità: Web. **Informativa**.

### QA-C-05 — Scope `offline_access` richiesto senza refresh — *Bassa / least privilege*
Default scope `openid profile offline_access platform:admin`. Documentato come inutilizzato, ma resta una richiesta di consenso non necessaria. Suggerito rimuoverlo dal default. **Non bloccante**.

### QA-C-06 (corretto da QA) — Motivazione dello SKIP 6.3 non veritiera — *Bassa*
`tests/q1/06-web-responsive-audit.test.ts` dichiarava il blocco ambientale del browser; in questa sessione il browser reale è stato eseguito con successo. Messaggio corretto: lo SKIP 6.3 ora dichiara che il gate browser è delegato a `tests/browser/browser-e2e.py` ed **è conteggiato come NOT RUN**, non come PASS.

---

## 6. Verifica di sicurezza OIDC (revisione del codice + test)

| Controllo | Esito | Evidenza |
|---|---|---|
| PKCE S256 (verifier 43–128 char, challenge SHA-256) | **PASS** | `w2-oidc-auth.test.ts` §1; `generateCodeVerifier/Challenge` con WebCrypto, nessun fallback `Math.random` (test dedicati) |
| `state` CSRF (confronto esatto) | **PASS** | test "state non corrispondente"; callback reale in browser |
| `nonce` obbligatorio e coincidente | **PASS** | 6 test dedicati in `w2-r2-oidc-security.test.tsx` |
| TTL PKCE 5 min + consumo monouso | **PASS** | test TTL e "secondo tentativo fallisce" |
| Discovery fail-closed (5xx, offline, issuer difforme, JSON invalido, metadati incompleti) | **PASS** | `tests/q1/10-…vitest.ts` 6/6 + mutation su W2-R2 (3 FAIL) |
| Endpoint usati = endpoint scoperti | **PASS** | QA test X5: `authorization_endpoint`/`token_endpoint` presi dai metadati |
| Nessun POST al token endpoint su discovery fallita | **PASS** | QA test X4 (spy su `fetch`) |
| Refresh token: nessuna dichiarazione, nessuna persistenza | **PASS** | `OidcSession` senza refresh; README W2-R3; nessun `refreshToken` in `src/` |
| Scadenza = nuova autenticazione | **PASS** | `loadSession` (margine 15 s) + `getAuthToken` invalidano; test dedicati |
| F5 subordinato alla risposta Core (nessun accesso ottimistico) | **PASS** | 3 test F5 (200/401/403) + `isAuthenticated` inizializzato `false`, elevato solo dopo `GET /admin/team` |
| Logout locale + protezione rotte admin | **PASS (locale)** — federato: QA-C-01 | test logout; `buildEndSessionUrl` verificato solo sul ramo con discovery presente |
| Resource indicator | **PASS** | `getAccessToken(resource)` nega risorse ≠ `apiResource`; `resource` inviato in authorize e token |
| Isolamento Bearer (mai su API pubbliche, mai ID token come Bearer) | **PASS** | `api.ts` inietta `Authorization` solo se URL contiene `/api/v1/admin`; test 11 + test "ID token mai restituito al posto dell'access token" |
| Validazione ID token: iss / aud / exp / nonce | **PASS** | 7 test dedicati |
| Validazione firma ID token (JWKS) | **NOT IMPLEMENTED (limite dichiarato)** | Decodifica senza verifica; mitigazione: TLS token endpoint + verifica Core. Non è una regressione W2-R3 |
| 401 → sessione invalidata, messaggio visibile | **PASS** | browser scenario 2A (alert "Errore di Autenticazione" + "HTTP 401") |
| 403 → messaggio permessi, nessun accesso admin | **PASS** | browser scenario 2B ("Permessi Insufficienti (HTTP 403)" + "platform:admin") |
| Login manuale solo in ambienti autorizzati | **PASS (build di produzione reale)** | §7.7: nessun input token, token piantato in `sessionStorage` rimosso, `?demo=true/1` ignorati |

---

## 7. Prove eseguite (tutte con log in `docs/qa/evidence/q2-c/`)

### 7.1 Build, type-check, controllo completo
| Comando | Esito |
|---|---|
| `pnpm check` (build + typecheck + test contratti/api) | **exit 0** (`pnpm-check.txt`) |
| `pnpm build` | PASS — `index-v_OuApIB.js` 420.02 kB (gzip 109.35 kB) (`build-integrated.txt`) |
| `pnpm typecheck` | PASS api + web + contracts (`typecheck-integrated.txt`) |
| `pnpm --filter @myteam/api test` | 3/3 PASS (`core-unit-3pass.txt`) |
| `pnpm --filter @myteam/api test:integration` | 1/1 PASS (`core-integration-1pass.txt`) |
| Grep bundle: `oidc/auth`, `oidc/token` | **0 occorrenze** (nessun endpoint hardcoded residuo nel bundle) |

### 7.2 QA-B-F3 — installazione pulita (clone senza `node_modules`)
`pnpm install --frozen-lockfile` → exit 0; `@myteam/web test` → **Test Files 7 passed (7) / Tests 87 passed (87)**, ripetuto **3 volte** sull'integrazione (`web-vitest-run1|2|3.txt`) e una sul clone pulito (`clean-install-frozen-lockfile.txt`).

### 7.3 QA-B-F1 — discovery fail-closed + mutation test
Test QA indipendente `tests/q1/10-web-w2-r3-oidc-failclosed.vitest.ts` (6 casi: X1 HTTP 500, X2 offline, X3 issuer difforme, X4 nessun POST token, X5 endpoint da discovery, X6 controllo positivo):
- su W2-R3 → **6/6 PASS**, eseguito sia dalla root del repo sia da `/tmp` (config con `root` assoluta, nessuna dipendenza dalla CWD);
- **mutation check**: con `apps/web/src/services/oidc.ts` di W2-R2 → **3 failed | 3 passed** (`qa-oidc-failclosed-mutation-w2r2-3fail.txt`). Il test intercetta realmente il difetto e non è tautologico. File ripristinato (MD5 identico).

### 7.4 QA-B-F2 — ermeticità
`vitest run test/w2-oidc-auth.test.ts` ×3 → **23/23 PASS** ogni volta (`web-oidc-single-run1|2|3.txt`); la discovery è iniettata, nessuna `fetch` reale; `afterEach` esegue `vi.restoreAllMocks()` in entrambe le suite OIDC.

### 7.5 Suite QA Node (12 file, escluso il test Vitest)
`node --import tsx --test tests/contracts/… tests/auth/… tests/integration/admin-pipeline… tests/q1/01…09` → **67 test: 66 PASS / 0 FAIL / 1 SKIP** (exit 0). Lo SKIP è 6.3, delegato al gate browser e conteggiato come **NOT RUN** (`qa-suite-node-66pass-1skip.txt`).

### 7.6 PostgreSQL reale + regressione CORE-BUG-01 via HTTP
- Schema isolato per esecuzione, cleanup verificato. `node --import tsx --test tests/integration/postgres-real-*.test.ts` → **6/6 PASS**, inclusi *"Completed match schedule immutability regression (CORE-BUG-01)"* e il nuovo *"non-completed match remains reschedulable after C1.2 guard (no regression)"* (`postgres-real-6pass.txt`).
- **HTTP reale** (non `Fastify.inject`), script QA riutilizzabile `tests/browser/schedule-immutability-http.sh` contro API su `127.0.0.1:3000` + PostgreSQL: **15/15 controlli PASS** (`http-immutability-core-bug-01.txt`)
  - `PATCH /api/v1/admin/matches/:id/schedule` su partita `completed` → **HTTP 400** `{"error":"completed_match_schedule_is_immutable"}`
  - stato `completed` e data `2026-11-01 15:00:00+00` **invariati**
  - `match_schedule_history` **1 → 1**, `audit_events` **1 → 1**
  - secondo tentativo identico → 400, contatori **1|1** invariati
  - partita non completata → 200 `postponed` (nessuna regressione)
- Nota di classificazione: il test a 12 passi `postgres-real-onboarding-and-lifecycle` usa **PostgreSQL reale** ma `Fastify.inject()` e un **verificatore admin sostitutivo**: NON è un E2E browser.

### 7.7 Browser E2E reale (Playwright/Chromium) — desktop + mobile
`/tmp/q2-b-venv/bin/python tests/browser/browser-e2e.py http://127.0.0.1:5173 http://127.0.0.1:3000` → **exit 0** (`browser-e2e-desktop-mobile.txt`), 13 screenshot in `docs/qa/evidence/q2-c/screenshots/`:

| Scenario | Esito |
|---|---|
| 0. Backend offline → UI d'errore pulita | PASS |
| 1. DB vuoto: 404 squadra, **nessun** badge DEMO, **nessun** "MAPI GROUP" | PASS |
| 2A. 401: alert "Errore di Autenticazione" + "HTTP 401" **visibile** | PASS |
| 2B. 403: "Permessi Insufficienti (HTTP 403)" + `platform:admin` visibile, nessun accesso admin | PASS |
| 2C. 200: token autorizzato, dashboard sbloccata | PASS |
| 3. Onboarding (stagione → squadra → pubblicazione) su PostgreSQL | PASS |
| 4. Avversaria + partita salvata come **BOZZA (NON PUBBLICATA)** | PASS |
| 5. Bozza isolata: `GET /public/matches` vuoto | PASS |
| 6. Pubblicazione esplicita → partita visibile sul sito pubblico | PASS |
| 7. Mobile 390×844: drawer + lista partite | PASS |

Limite: lo scenario 3-6 gira sulla build di **sviluppo** (auth manuale di collaudo attiva). La build di **produzione** è stata verificata separatamente (§7.8).

### 7.8 Build di produzione reale: DEMO e login manuale
Build effettuata **con `VITE_ENABLE_DEMO=true`** e `VITE_APP_ENV=production`, servita con `vite preview`, ispezionata con Playwright dopo aver piantato `myteam_data_mode=demo` e `myteam_admin_auth_token` in `sessionStorage` **prima** del boot (`production-build-demo-blocked.txt`, 4/4 PASS):
- `/?demo=true` → nessun banner "MODALITÀ DIMOSTRATIVA", nessun "MAPI GROUP", chiamata reale a `/api/v1/public/team` ⇒ modalità **real**;
- token manuale piantato → **rimosso** da `sessionStorage` al boot;
- vista login admin → **nessun** input token, nessuna sezione "Inserimento manuale", policy di produzione mostrata (`screenshots/prod-login-no-manual-auth.png`);
- `?demo=1` ignorato; nessun toggle demo presente.
Conclusione: **WEB finding "VITE_ENABLE_DEMO può abilitare la demo in produzione" = VERIFIED CLOSED** (verificata sul bundle reale, non solo sull'utility `env.ts`).

---

## 8. Comandi per riprodurre

```bash
# 0) prerequisiti
cd myteam-platform-q2-c-int && pnpm install --frozen-lockfile
set -a && . /Users/gatti/Workspace/myteam-platform/.env && set +a   # TEST_DATABASE_URL

# 1) build / typecheck / suite Core
pnpm check

# 2) suite Web (87) + file OIDC isolato (23)
pnpm --filter @myteam/web test
cd apps/web && ./node_modules/.bin/vitest run test/w2-oidc-auth.test.ts

# 3) QA suite Node (67: 66 PASS / 1 SKIP)
cd ../.. && node --import tsx --test \
  tests/contracts/contracts.test.ts tests/auth/jwt-verification.test.ts \
  tests/integration/admin-pipeline-in-memory-integration.test.ts \
  tests/q1/0{1,2,3,4,5,6,7,8,9}-*.test.ts

# 4) QA OIDC fail-closed (6) — funziona da qualsiasi CWD
apps/web/node_modules/.bin/vitest run --config tests/vitest.qa.config.ts

# 5) PostgreSQL reale (6)
node --import tsx --test tests/integration/postgres-real-*.test.ts

# 6) regressione HTTP CORE-BUG-01 (API + PG, schema isolato)
TMPDIR=/tmp node --import tsx tests/browser/start-test-api.ts &     # stampa FASTIFY_API_READY
QA_SCHEMA=$(cat /tmp/myteam-qa-test-api-3000.schema) \
  bash tests/browser/schedule-immutability-http.sh
kill -TERM %1

# 7) browser E2E (desktop + mobile) — richiede venv con Playwright
python tests/browser/browser-e2e.py http://127.0.0.1:5173 http://127.0.0.1:3000

# 8) build di produzione con DEMO forzata e verifica browser
cd apps/web && VITE_ENABLE_DEMO=true VITE_APP_ENV=production ./node_modules/.bin/vite build --outDir /tmp/q2c-dist-demo
./node_modules/.bin/vite preview --outDir /tmp/q2c-dist-demo --port 4180
```

---

## 9. Stato Git, worktree e cleanup

| Worktree | Branch | HEAD | Uso |
|---|---|---|---|
| `myteam-platform` (originale) | `web/w2-logto-auth` @ `860bc5b` | invariato | checkout Web, **non modificato** |
| `myteam-platform-q2-c` | `qa/q2-c-w2r3-verification` @ `860bc5b` | invariato | clone pulito per F3 |
| `myteam-platform-q2-c-int` | `qa/q2-c-w2r3-integration` | `fada57a` + commit QA | verifica e pubblicazione |
| `myteam-platform-q2-b*`, `-q2-a`, `-mvp-i1`, core/qa | invariati | — | non toccati |

- Nessun merge su `main`, nessun force push, nessun deploy.
- Verso GitHub viene pubblicato **solo** il branch `qa/q2-c-w2r3-integration`, con i soli file `tests/**` e `docs/qa/**`.
- **Cleanup verificato a fine sessione:** porte `3000/5173/4180` libere (`lsof` vuoto); `SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'test_qa_%'` = **0**; nessun marker `/tmp/myteam-qa-test-api-*` residuo; processi `start-test-api`/`vite preview` terminati; file temporanei usati solo in `/tmp`.

---

## 10. Limiti espliciti (non convertiti in PASS)

| Limite | Stato |
|---|---|
| **Logto staging reale** (discovery, authorize, token, end-session) | **NOT RUN** — nessuna istanza/credenziale autorizzata. Tutti i test OIDC usano `fetch` mockata o discovery iniettata |
| **Firma ID token via JWKS lato SPA** | **NOT IMPLEMENTED** (limite dichiarato, non regressione). Mitigazione: TLS token endpoint + verifica JWT/JWKS lato Core |
| **CI remota** | **NOT RUN** — tutte le prove sono locali su macOS; la riproducibilità in CI resta da confermare |
| **Deploy / hosting / PWA su dispositivo** | **NOT RUN** |
| **Browser gate su build di produzione end-to-end** | **NOT RUN** come flusso admin completo: l'auth manuale di collaudo è (correttamente) disabilitata in produzione, quindi serve Logto reale. La build di produzione è stata verificata per DEMO/login manuale/assenza fughe (§7.8) |
| **Verificatore admin sostitutivo** nei test API/browser | Limite strutturale: `test-admin-token` non è un JWT firmato. La verifica JWT crittografica è coperta separatamente da `tests/auth/jwt-verification.test.ts` (RS256 + JWKS effimero) |

---

## 11. Condizioni del CONDITIONAL PASS

1. QA-C-03 (timeout discovery) e QA-C-01 (logout endpoint) vanno decisi dal supervisore: accettati come debito tracciato oppure corretti in W2-R4 **prima** del gate di release.
2. QA-C-02 va chiuso rendendo `setDiscoveryMetadata` non raggiungibile dal codice di produzione (hardening a costo quasi nullo).
3. Il gate successivo deve eseguire il flusso admin completo su **build di produzione + Logto staging reale**, perché è l'unica combinazione che oggi non è coperta.
4. La CI deve riprodurre i comandi di §8 (in particolare PostgreSQL di servizio e Playwright) per trasformare i PASS locali in PASS continui.

---

## 12. Riferimenti

- Finding precedenti: `docs/qa/CHECKPOINT-Q2-B-REPORT.md`
- Evidenze: `docs/qa/evidence/q2-c/` (21 artefatti di log + 14 screenshot)
- Script QA aggiunti in questo checkpoint: `tests/browser/schedule-immutability-http.sh`, `tests/q1/10-web-w2-r3-oidc-failclosed.vitest.ts`, `tests/vitest.qa.config.ts`
- Test QA modificati: `tests/browser/start-test-api.ts` (marker/sweep anti-schema orfano, porta configurabile), `tests/integration/postgres-real-concurrency-and-rollback.test.ts` (non-regressione C1.2), `tests/q1/06-web-responsive-audit.test.ts` (motivazione SKIP 6.3)
