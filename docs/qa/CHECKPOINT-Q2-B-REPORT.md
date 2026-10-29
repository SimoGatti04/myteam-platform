# Checkpoint Q2-B — Integrazione e Verifica Indipendente Web W2-R2

**Data:** 29 Ottobre 2026
**Agente:** QA persistente
**Repository:** `SimoGatti04/myteam-platform`

## 1. Componenti e SHA

| Componente | Branch | SHA | Nota |
| :--- | :--- | :--- | :--- |
| Core C1.2 | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` | Fix `completed_match_schedule_is_immutable` |
| Web W2-R2 | `web/w2-logto-auth` | `478b7426ce645fd14c627c7c027148173f255435` | OIDC security gate, 19 nuovi test |
| QA base | `qa/q2-a-w2-integration` | `390faa578a3a04fef8d6cc8e83527fefa0ab6a33` | Rettifica Q2-A-R1 |

**Checkout effettivamente esercitato per le prove automatiche in questo rapporto:**
`web/w2-logto-auth` @ `478b742` (worktree `/Users/gatti/Workspace/myteam-platform`) per
build/typecheck/Vitest/suite QA; worktree Core C1.2
(`/Users/gatti/Workspace/myteam-platform-core-c1-1` @ `1ab7179`) per la controprova
della regressione CORE-BUG-01. Suite QA presa dal worktree Q2-A
(`/Users/gatti/Workspace/myteam-platform-q2-a` @ `8c02c9f` + rettifica `390faa5` su remoto).

> Nota di tracciabilità: il commit remoto `390faa5` (rettifica Q2-A-R1) non è
> scaricabile nel checkout locale (rete/DNS sandbox bloccati, `.git` read-only);
> i file QA usati corrispondono al contenuto Q2-A verificato localmente (`8c02c9f`
> + rettifica documentale). Il presente report è pubblicato sul branch
> `qa/q2-b-w2r2-verification` **come figlio diretto di `390faa5`**, verificato
> tramite API GitHub: la catena Q2-A-R1 → Q2-B è quindi ricostruibile sul remoto.

## 2. Sintesi esiti

| Suite | Comando | Risultato |
| :--- | :--- | :--- |
| Build monorepo | `pnpm build` | **PASS** (contracts+api+web; bundle 420.44 kB, gzip 109.43 kB) |
| Typecheck | `pnpm typecheck` | **PASS** (0 errori) |
| Web Vitest (esecuzione 1) | `pnpm --filter @myteam/web test` | **87 PASS / 0 FAIL** (7 file) |
| Web Vitest (esecuzione 2, stessa revisione) | idem | **86 PASS / 1 FAIL** — `w2-oidc-auth.test.ts` §3 in timeout a 5 s: test non ermetico, cfr. **QA-B-F2** |
| QA suite su `web/w2-logto-auth` | `node --import tsx --test tests/...` | **65 PASS / 1 FAIL / 6 SKIPPED** |
| QA 03 su Core C1.2 | stesso comando su worktree `1ab7179` con test Q2-A | **8 PASS / 0 FAIL** |
| PostgreSQL reale | suite `postgres-real-*` | **NOT RUN** (5 SKIPPED: no TEST_DATABASE_URL / no binari server) |
| Playwright browser | `tests/browser/browser-e2e.py` | **NOT RUN** (playwright python non installato in sandbox) |
| Logto staging reale | — | **NOT RUN** (nessuna autorizzazione/credenziale) |

## 3. Regressione CORE-BUG-01 — FAIL su web/w2-logto-auth, PASS su Core C1.2

**Test:** `3.5 Completed match schedule is immutable... (CORE-BUG-01)` in
`tests/q1/03-match-lifecycle.test.ts:257` — `assert.equal(statusCode, 400)` riceve `200`.

**Causa dimostrata:**
- `git merge-base --is-ancestor 1ab7179 web/w2-logto-auth` → **NO**.
- `git diff 1ab7179 HEAD -- apps/api/src/platform/service.ts` mostra la rimozione
  delle 3 righe del fix C1.2:
  ```ts
  if (current.status === "completed") {
    throw new DomainError(400, "completed_match_schedule_is_immutable");
  }
  ```
- Il branch Web contiene Core a `3c99e4e` (C1.1), non C1.2.
- Controprova: stessi test QA eseguiti con `cwd` sul worktree Core C1.2
  (`1ab7179`) → **8/8 PASS**, incluso 3.5.

**Classificazione: FAIL di integrazione (mancato cherry-pick/merge di C1.2 nel branch Web),
NON difetto del fix Core.** Azione richiesta: integrare `1ab7179` in `web/w2-logto-auth`
o ricreare il branch Web da una base contenente C1.2. Nessuna modifica QA/Core/Web
applicata da questo agente.

**Dettaglio tecnico:** la guardia `nextStatus === "completed"` (presente anche in C1.1)
blocca solo la transizione *verso* completed; senza il blocco `current.status === "completed"`,
una partita già completata accetta `PATCH {status:"postponed", scheduledAt:...}` con 200,
violando l'immutabilità e scrivendo history/audit spuri.

## 4. I 19 nuovi test W2-R2 (`w2-r2-oidc-security.test.tsx`) — 19/19 PASS

| Sezione | Test | Copertura reale |
| :--- | :--- | :--- |
| 1. ID Token Validation (7) | id_token mancante, malformato, issuer difforme, aud errata, exp passato, nonce mancante, nonce difforme | **PASS** — logica `parseJwtPayload` + controlli `iss/aud/exp/nonce` in `oidc.ts` |
| 2. PKCE lifecycle (2) | TTL 5 min superato, consumo monouso (secondo callback fallisce) | **PASS** — `StoredPkceState.createdAt` + cancellazione dopo uso |
| 3. Crypto (2) | `getRandomValues` assente → throw; `subtle.digest` assente → throw | **PASS** — `assertWebCryptoAvailable`, nessun fallback `Math.random` |
| 4. Discovery (3) | issuer difforme → throw; metadati incompleti → throw; HTTP 500 → errore esplicito | **PASS** per i 3 casi mockati |
| 5. Resource/audience (2) | token negato per risorsa non autorizzata; id_token mai restituito come access token | **PASS** — `getAccessToken(resource)` + separazione token |
| 6. F5 restore (3) | reload: `isAuthenticated=false` fino a Core 200; Core 401 → logout; nessun accesso ottimistico | **PASS** |

**Tutti con mock fetch/sessionStorage (jsdom).** Nessuno esercita rete reale, JWKS reale o Logto reale.

## 5. Discovery OIDC — comportamento nei 4 casi richiesti

Codice: `OidcClient.fetchDiscovery()` + fallback in `buildAuthorizationUrl()` e `exchangeCodeForTokens()`.

| Caso | Comportamento verificato (codice + test) |
| :--- | :--- |
| (a) Issuer difforme | `fetchDiscovery` **rifiuta**: `issuer restituito... non corrisponde all'endpoint configurato`. Chiamanti rilanciano (nessun fallback). **Test 4.1 PASS.** |
| (b) Endpoint mancanti | `fetchDiscovery` **rifiuta**: `metadati incompleti (issuer, authorization_endpoint o token_endpoint mancanti)`. **Test 4.2 PASS.** |
| (c) HTTP 5xx | `fetchDiscovery` **rifiuta**: `OIDC discovery fallita con HTTP 500`. MA i chiamanti (`buildAuthorizationUrl`, `exchangeCodeForTokens`) **catturano l'errore e usano fallback hardcoded** (`/oidc/auth`, `/oidc/token`) a meno che il messaggio contenga `issuer restituito dal provider`. **Test 4.3 PASS** (verifica solo il throw di `fetchDiscovery`, non il fallback dei chiamanti). **FINDING QA-B-F1 (media): fallback non autorizzato su 5xx.** |
| (d) Irraggiungibile (offline) | `fetchDiscovery` **rifiuta**: `Logto OIDC discovery non raggiungibile`. Stesso fallback hardcoded dei chiamanti. Nessun test dedicato. **FINDING QA-B-F1 si applica.** |

**QA-B-F1 (media):** su discovery 5xx/offline/JSON corrotta (non-issuer-mismatch) il client procede
con endpoint costruiti per concatenazione invece di abortire il login. Solo il mismatch
issuer abortisce. Raccomandazione: abortire il flusso su qualsiasi fallimento discovery,
oppure documentare il fallback come comportamento approvato con limiti espliciti.

## 6. Validazione ID token: firma/JWKS

**Accertato dal codice (`oidc.ts:166-180, 523-566`):**
- `parseJwtPayload()` decodifica base64url **senza verificare la firma** (`alg`/`kid`/`jwks_uri`
  mai usati; campo `jwks_uri?` dichiarato nel tipo ma mai letto per verifiche).
- Validati: presenza `id_token`, formato JWT (3 segmenti), `iss` == endpoint configurato,
  `aud` contiene `appId`, `exp` non scaduto (+10s tolleranza), `nonce` presente e coincidente.
- **Nessuna verifica crittografica della firma.**

**Base normativa dichiarata dal Web (README §W2-R2, `oidc.ts` header):** il client SPA si affida
alla **connessione TLS diretta al token endpoint** (scambio `code`+`code_verifier` server-to-server
su HTTPS) come garanzia di autenticità della risposta, evitando di esporre JWKS/chiavi nel browser.
Modello coerente con SPA pubbliche senza backend confidenziale, **a condizione che**:
1. il token endpoint sia raggiunto via discovery validata (cfr. F1 sul fallback), e
2. il backend Core rivalidi indipendentemente il token (verifier RS256/JWKS lato Core —
   coperto da `apps/api/test/unit/auth.test.ts`, non eseguibile qui per EPERM loopback, vedi §9).

**Limite:** un `id_token` contraffatto ma ben formato (iss/aud/exp/nonce corretti) iniettato
in una risposta compromessa non sarebbe rilevato dal client. Rischio mitigato solo se (1)+(2)
tengono. **Nessun test con JWKS reale; gate JWKS/Logto reale = NOT RUN.**

## 7. Refresh token, scadenza, rinnovo — confronto report/README/codice

| Dichiarazione | Fonte | Verifica codice |
| :--- | :--- | :--- |
| Scope include `offline_access` | README, `DEFAULT_SCOPES`, 3 file di test | **Presente** (`oidc.ts:207`) — lo scope viene *richiesto*, ma... |
| Nessun refresh token memorizzato nel browser | README §124, `oidc.ts:38` | **Confermato**: `OidcSession` = `{accessToken, idToken?, expiresAt}` — nessun campo refresh; `tokenResponse.refresh_token` mai letto/salvato |
| Alla scadenza: sessione distrutta, richiesto nuovo login | README §124, `oidc.ts:39` | **Confermato**: `getSession()` ritorna `null` se `Date.now() >= expiresAt - 15s` (`oidc.ts:633-634`); `expiresAt = now + expires_in` |
| Nessun rinnovo silenzioso / rotazione refresh | — (assenza dichiarata) | **Confermato**: nessun `grant_type=refresh_token` nel codice; `grep refresh_token` → solo commenti/README |

**Nessuna funzionalità assente attribuita:** il Web dichiara esplicitamente il non-supporto
al refresh e il codice è coerente. Lo scope `offline_access` richiesto ma inutilizzato
è documentato come scelta (il provider può emettere refresh token che il client scarta).
**Osservazione non bloccante:** valutare se rimuovere `offline_access` dallo scope di default
per non richiedere consensi non necessari.

## 8. PKCE / state / nonce / TTL / monouso / F5 / logout / resource indicator / Bearer

| Proprietà | Verifica |
| :--- | :--- |
| PKCE S256 | `generateCodeVerifier`/`generateCodeChallenge` riusano `@logto/browser`; `code_challenge_method=S256` nell'URL. **PASS (mock)** |
| state CSRF | `generateState()` (WebCrypto), round-trip verificato al callback, mismatch → throw. **PASS (mock)** |
| nonce replay | Generato per login (`generateRandomString(32)`), validazione obbligatoria su `id_token`. **PASS (mock)** |
| TTL 5 min | `createdAt` + controllo `Date.now() - createdAt > 5*60*1000`. **PASS (mock)** |
| Consumo monouso | PKCE cancellato dopo `exchangeCodeForTokens`; riuso → `Sessione PKCE non trovata`. **PASS (mock)** |
| F5 restore subordinato a Core | `isAuthenticated=false` fino a `GET /admin/team` 200; 401 → logout. **PASS (mock, 3 test sez. 6)** |
| Logout | Costruisce URL da `end_session_endpoint` scoperto (fallback conforme); pulisce sessione+PKCE. Codice ispezionato, nessun test browser reale |
| Resource indicator (RFC 8707) | `resource=apiResource` inviato al token endpoint se configurato; `getAccessToken(resource)` nega risorse diverse. **PASS (mock)** |
| Isolamento Bearer | `api.ts`: `Authorization` iniettato **solo** se URL contiene `/api/v1/admin`. **PASS (statico+mock)** |
| Login manuale in produzione | `isManualAuthAllowed()`: disabilitato con `VITE_APP_ENV=production`. **PASS (mock)** |

## 9. Matrice di separazione mock / reale

| Livello | Stato | Dettaglio |
| :--- | :--- | :--- |
| Mock (Vitest jsdom) | **87 PASS** (run 1) / **86 PASS + 1 FAIL** (run 2) | 7 file inclusi i 19 W2-R2; la maggior parte mocka fetch/sessionStorage/WebCrypto, **ma `w2-oidc-auth.test.ts` §3 no** (cfr. QA-B-F2) |
| SQLite in-memory (Node runner) | **65 PASS / 1 FAIL / 1 SKIP(+5 pg)** | Suite QA su checkout Web (senza C1.2): 1 FAIL = 3.5 |
| PostgreSQL reale | **NOT RUN** | 5 SKIPPED: `TEST_DATABASE_URL` non impostato + binari server assenti (`pg_ctl`/`postgres` non trovati; esiste solo data-dir `/opt/homebrew/var/postgresql@16`) |
| Browser reale | **NOT RUN** | `playwright` python non installato in sandbox (`ModuleNotFoundError`); EPERM loopback impedisce anche server di test (`listen EPERM 127.0.0.1`) |
| Logto staging reale | **NOT RUN** | Nessuna autorizzazione/credenziale; nessun test eseguito contro IdP reale |
| Core unit auth (RS256/JWKS mock) | **NOT RUN qui** | `auth.test.ts` fallisce in sandbox per EPERM loopback (il test avvia Fastify su 127.0.0.1); non è un FAIL funzionale |

## 10. TAP effettivi ed exit code

- `pnpm build`: exit **0**
- `pnpm typecheck`: exit **0**
- `pnpm --filter @myteam/web test` (run 1): exit **0** — `Test Files 7 passed, Tests 87 passed`
- `pnpm --filter @myteam/web test` (run 2, stessa revisione `478b742`): exit **1** — `Test Files 1 failed | 6 passed (7)`, `Tests 1 failed | 86 passed (87)`, durata 5.81 s
- `npx vitest run test/w2-oidc-auth.test.ts` ×3: exit **1** in tutti e 3 i tentativi — `Tests 1 failed | 22 passed (23)`, sempre timeout 5 s sul test §3
- QA (no-03 + contracts/auth/pipeline) su web branch: exit **0** — `tests 59, pass 58, skipped 1 (6.3)`
- QA `03-match-lifecycle` su web branch: exit **1** — `tests 8, pass 7, fail 1 (3.5)`
- QA `03-match-lifecycle` (test Q2-A) con cwd Core C1.2: exit **0** — `pass 8, fail 0`
- QA pg suites: exit **0** — `tests 5, skipped 5`
- **Totale QA su `web/w2-logto-auth`: 65 PASS / 1 FAIL / 6 SKIPPED (72 test)**
- **Totale Web Vitest: non stabile** — 87/87 in un'esecuzione, 86/87 (1 timeout) in un'altra sulla **stessa** revisione

## 11. Finding classificati

| ID | Gravità | Titolo | Evidenza |
| :--- | :--- | :--- | :--- |
| **QA-B-CORE-01** | **Alta (bloccante integrazione)** | Branch Web W2-R2 non contiene il fix Core C1.2 (`1ab7179`); regressione CORE-BUG-01 riproducibile | Test 3.5 FAIL (200 vs 400); `merge-base --is-ancestor` = NO; controprova 8/8 PASS su worktree C1.2 |
| **QA-B-F1** | **Media** | Fallback a endpoint OIDC hardcoded su discovery 5xx/offline invece di abortire | `oidc.ts` buildAuthorizationUrl/exchangeCodeForTokens: catch-all tranne issuer-mismatch |
| **QA-B-F2** | **Media** | Test Web non ermetico: `w2-oidc-auth.test.ts` §3 dipende da una `fetch` reale al discovery (`https://auth.myteam.local/...`) senza mock | Con DNS che fallisce subito il test passa (87/87); con DNS che resta in attesa va **timeout a 5 s** e diventa FAIL (86/87, 4/4 esecuzioni in questa sessione). Il fallback catch-all di `buildAuthorizationUrl` rende verde il test solo se l'errore arriva in tempo |
| QA-B-OBS-02 | Osservazione | `fetchDiscovery()` non ha `AbortController`/timeout: in un browser reale con rete che non risponde il login può restare in attesa | `oidc.ts` `fetchDiscovery` (nessun limite di tempo); suggerito `AbortSignal.timeout(ms)` e fallback esplicito |
| QA-B-OBS-01 | Osservazione | Scope `offline_access` richiesto ma refresh token scartato | Coerente con README; valutare rimozione dallo scope default |
| QA-B-LIM-01 | Limite verifica | Firma ID token non verificata via JWKS (affidamento a TLS + validazione Core) | Codice ispezionato; gate JWKS/Logto reale NOT RUN |
| QA-B-LIM-02 | Limite verifica | PostgreSQL/browser/Logto reale NOT RUN in sandbox | EPERM loopback, no binari pg, no playwright, no credenziali |

## 12. Verdetto

**STOP all'integrazione Web W2-R2 così come committata (`478b742`).** Due condizioni,
entrambe a carico di Web, prima di poter dichiarare PASS:

1. **QA-B-CORE-01 (alta)** — integrare `1ab7179` (Core C1.2) nel branch Web: oggi la
   regressione CORE-BUG-01 fallisce (test 3.5, `200 !== 400`).
2. **QA-B-F2 (media)** — rendere ermetico `w2-oidc-auth.test.ts` §3 (mockare la discovery
   o iniettare `fetch`): oggi l'esito dipende dal comportamento DNS dell'ambiente, quindi
   la suite Web non è riproducibile (87/87 vs 86/87 sulla stessa revisione).

A integrazione avvenuta, il gate si ripete con attesi: QA **66+ PASS / 0 FAIL** e
Vitest Web **87/87 stabile su ≥2 esecuzioni consecutive** (fermi i NOT RUN ambientali
PostgreSQL/browser/Logto).

**Lavoro Web W2-R2 in sé (OIDC client): verificato positivamente nei limiti mock:**
19/19 nuovi test PASS, discovery/issuer/incompletezza/5xx gestiti a livello `fetchDiscovery`,
PKCE/state/nonce/TTL/monouso/F5/logout/resource/Bearer conformi alle dichiarazioni,
refresh dichiaratamente assente e assente nel codice. Restano i finding medi F1 (fallback
hardcoded) e F2 (test non ermetico); nessuno dei due è un difetto funzionale dimostrato
del flusso OIDC, ma entrambi impediscono una certificazione pulita.

**Consegna:** nessun file applicativo modificato; nessun merge su main; nessun deploy;
nessun test su Logto reale. Report presente in `docs/qa/CHECKPOINT-Q2-B-REPORT.md`
sul branch `qa/q2-b-w2r2-verification`; TAP originali conservati localmente
(`/tmp/q2-b-report/`: `web-vit-verbose.txt`, `qa-nocore3-tap.txt`, `qa-core3-tap.txt`,
`qa-pg-tap.txt`, `core11-03qa-tap.txt`, `c12-*.txt`, `repro*.mjs`).

## 13. Pubblicazione e stato Git/worktree

| Voce | Valore |
| :--- | :--- |
| Branch QA pubblicato | `qa/q2-b-w2r2-verification` |
| Commit base (parent) | `390faa578a3a04fef8d6cc8e83527fefa0ab6a33` (Q2-A-R1) |
| Contenuto dei commit | solo `docs/qa/CHECKPOINT-Q2-B-REPORT.md` (nessun file applicativo) |
| Commit | `e09f75b` (prima pubblicazione) + commit di rettifica (finding F2, OBS-02, conteggi Vitest) |
| Force push | nessuno (fast-forward sullo stesso branch) |
| Merge su main | nessuno |
| Deploy | nessuno |

**Worktree locali (preflight, nessuna modifica distruttiva):**

| Path | HEAD | Branch |
| :--- | :--- | :--- |
| `/Users/gatti/Workspace/myteam-platform` | `478b742` | `web/w2-logto-auth` |
| `/Users/gatti/Workspace/myteam-platform-core-c1-1` | `1ab7179` | `codex/core-persistent-flow` |
| `/Users/gatti/Workspace/myteam-platform-mvp-i1` | `e8b90b4` | `qa/mvp-i1-integration` |
| `/Users/gatti/Workspace/myteam-platform-q2-a` | `8c02c9f` | `qa/q2-a-w2-integration` |
| `/Users/gatti/Workspace/myteam-platform-qa` | `0437b93` | `qa/q1-suite-consolidation` |
| `/Users/gatti/Workspace/myteam-platform-q2-b` | `e09f75b` | `qa/q2-b-w2r2-verification` |

**Pubblicazione:** il branch è nato da `390faa5` tramite API GitHub (la shell in sandbox
non può scrivere su `.git` né risolvere `github.com`), poi è stato completato via `git`
in un worktree dedicato con accesso di rete autorizzato: `fetch` del branch, commit dei
soli file QA e `push` fast-forward. Nessuna riscrittura di storia, nessun force push.

**Evidenze pubblicate (sanitizzate, percorsi assoluti sostituiti):** `docs/qa/evidence/q2-b/`

| File | Contenuto |
| :--- | :--- |
| `qa-nocore3-tap.txt` | suite QA su `478b742` senza 03 — 59 test: 58 pass / 1 skip |
| `qa03-tap.txt` | `03-match-lifecycle` su `478b742` — 8 test: 7 pass / 1 fail (3.5) |
| `qa-pg-tap.txt` | suite PostgreSQL — 5 test: 0 pass / 5 skipped (NOT RUN) |
| `core-c12-03-tap-pass8of8.txt` | controprova `03` con cwd Core C1.2 `1ab7179` — 8/8 pass |
| `web-vitest-run1-pass87.txt` | Vitest Web run 1 — 7 file, 87/87 pass |
| `web-vitest-run2-fail86.txt` | Vitest Web run 2 (stessa revisione) — 86 pass / 1 fail |
| `w2-oidc-single-run1..3-fail22of23.txt` | 3 riesecuzioni del singolo file — sempre 22/23, timeout 5 s |

**Risorse temporanee:** `/tmp/q2-b-report/` e `/tmp/q2-b-session/` (TAP grezzi + script di
riproduzione), conservate per riproducibilità; nessun processo, container o schema
PostgreSQL residuo (PG/browser non eseguiti in sandbox).
