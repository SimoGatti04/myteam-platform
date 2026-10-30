# QA Q2-E — Verifica indipendente Web W2-R5

**Agente:** QA (persistente)
**Checkpoint:** Q2-E / verifica dei finding QA-C-01 e QA-C-08
**Data:** 2026-10-30
**Branch QA:** `qa/q2-e-w2r5-verification`
**Ambito modificato da QA:** esclusivamente `tests/` e `docs/qa/`. Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`, nessun merge su `main`, nessun deploy.

---

## 1. Verdetto

**QA PARTIAL.**

La verifica applicativa dei finding QA-C-01 e QA-C-08 è positiva nel perimetro sintetico/locale descritto sotto. La reinstallazione pulita con il package manager previsto non è certificata in questo host; Logto staging resta NOT RUN. Il follow-up del 30 ottobre 2026 prevale dove corregge conteggi o classificazioni della prima stesura.

---

## 2. Revisioni effettivamente testate

| Componente | Riferimento | SHA completo |
|---|---|---|
| Web W2-R5 (oggetto della verifica) | `web/w2-r5-oidc-finalization` | `667b12bc7cccb428a81803a3b3b4d8877d41ce3b` |
| Web W2-R4 (base) | `web/w2-r4-oidc-hardening` | `66f686053eca45f06e65882a9b3010524aa1f263` |
| Base QA (Q2-D) | `qa/q2-d-w2r4-verification` | `4f7732d62f78e84fe89fdc61d03ddd5cad1f0d9b` |
| Merge d'integrazione QA | `qa/q2-e-w2r5-verification` | `8a5cc9cfa31d7720abd4e1f32dc801ed2055eb89` |
| Core C1.2 | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` |

### 2.1 Ancestry verificata

```
git merge-base --is-ancestor 1ab7179… HEAD   -> YES  (Core C1.2 antenato)
git merge-base --is-ancestor 667b12b… HEAD   -> YES  (W2-R5 antenato)
```

Diff W2-R4 → W2-R5: 5 file (`AppContext.tsx`, `auth.ts`, `oidc.ts`, `w2-r1-react-integration.test.tsx`, `w2-r5-oidc-reliability.test.ts`), 292 inserzioni, 52 delezioni.

---

## 3. Matrice dei finding

| Finding | Gravità | Stato Q2-D | Stato Q2-E | Prova |
|---|---|---|---|---|
| **QA-C-01** — logout federato post-F5 | Bassa | PARTIALLY CLOSED | **VERIFIED CLOSED** | §4 |
| **QA-C-08** — timeout non copre parsing corpo JSON | Bassa | NUOVO (Q2-D) | **VERIFIED CLOSED** | §5 |

---

## 4. QA-C-01 — Logout federato (VERIFIED CLOSED)

### 4.1 Cosa è cambiato in W2-R5

`AuthService.logout()` è ora **asincrona** (`Promise<void>`). Il flusso:

1. Cattura `hadOidcSession` e `idTokenHint` **prima** di nullare `oidcSession` (preserva il hint per il redirect federato).
2. Esegue il logout locale sincrono e incondizionato (`oidcClient.logout()`, rimozione sessionStorage).
3. Se `options.redirect && hadOidcSession && isConfigured()`: esegue `fetchDiscovery({ forceRefresh: true })` (recupera la discovery dopo F5), poi costruisce l'URL di end-session con `idTokenHint` e reindirizza. Se la discovery fallisce, il catch silenzioso lascia l'utente localmente disconnesso.
4. `AppContext.logoutAdmin` attende la promise di federation prima di completare (`await federation`).

### 4.2 Prove (test `tests/q1/15-web-w2-r5-logout-federated.vitest.ts`, 6 casi, tutti PASS)

| Caso | Esito |
|---|---|
| Con cache discovery vuota (scenario F5), logout federato esegue la discovery e costruisce URL con `id_token_hint` | PASS |
| Se la discovery fallisce dopo F5, nessun redirect federato, nessun endpoint arbitrario | PASS |
| Se la discovery va in timeout, logout locale resta completato | PASS |
| Utilizza esclusivamente `end_session_endpoint` scoperto (no euristici) | PASS |
| `id_token_hint` acquisito prima della cancellazione della sessione (contratto) | PASS |
| Nessun redirect federato automatico dopo HTTP 401 (automatic invalidation) | PASS |

### 4.3 Verifica del contratto asincrono

- `logout()` restituisce `Promise<void>` → il caller può attendere il completamento del redirect federato.
- `AppContext.logoutAdmin` chiama `authService.logout(options)` (cattura la promise), imposta lo stato locale, poi `await federation`.
- Il redirect federato avviene solo se `options.redirect` è true **e** c'era una sessione OIDC **e** il client è configurato.
- Se la discovery fallisce (offline, timeout, 5xx, JSON invalido), il catch silenzioso lascia l'utente localmente disconnesso — nessun redirect, nessun errore visibile.

### 4.4 Verifica del bundle di produzione

Nel bundle (`index-C8xMxBV6.js`), il flusso di logout è presente e il redirect federato usa `fetchDiscovery({forceRefresh:true})`. Nessun endpoint euristico hardcoded.

**Classificazione finale: VERIFIED CLOSED.**

---

## 5. QA-C-08 — Deadline HTTP completo (VERIFIED CLOSED)

### 5.1 Cosa è cambiato in W2-R5

Introdotto `withOidcRequestDeadline<T>()`: un wrapper che racchiude **sia il fetch che il parsing del corpo JSON** (`response.json()`) in un unico timeout di 10 secondi con `AbortController`. Se il timer scatta, l'abort signal viene propagato e la promise viene rigettata con `OidcRequestTimeoutError`.

Applicato a:
- **Discovery:** `fetch` + `response.json()` dentro il deadline.
- **Token exchange:** `fetch` + `response.json()` dentro il deadline (sia per risposte OK che per errori).

### 5.2 Prove (test `tests/q1/13-web-w2-r4-timeout.vitest.ts`, 4 casi, tutti PASS)

| Caso | Esito |
|---|---|
| Discovery che non risponde mai → timeout dopo 10s, flusso termina con errore | PASS |
| Token exchange che non risponde mai → timeout dopo 10s, flusso termina con errore | PASS |
| Server invia header ma corpo JSON sospeso → **ora termina** (correzione QA-C-08) | PASS |
| Dopo timeout, retry riesce (nuova chiamata completata) | PASS |

Il test "corpo JSON sospeso" è stato aggiornato: ora verifica che `settled` diventi `true` (il flusso termina) invece di `false` (il flusso resta bloccato). Il test passa, confermando che la correzione funziona.

### 5.3 Verifica della pulizia delle risorse

- `withOidcRequestDeadline` usa `try/finally` con `clearTimeout(timeoutId)` → il timer viene sempre pulito.
- L'`AbortController` viene abortito quando il timeout scatta → il fetch in corso viene cancellato.
- Nessuna promise non gestita: il `Promise.race` propaga il rejection del timeout.

### 5.4 Race condition timeout/risposta tardiva/retry

- Se la risposta arriva prima del timeout: il deadline viene pulito, la risposta viene processata normalmente.
- Se il timeout scatta prima della risposta: l'abort signal cancella il fetch, la promise viene rigettata con `OidcRequestTimeoutError`.
- Se il body è sospeso: il `response.json()` è dentro il deadline, quindi il timeout copre anche questa fase.
- Retry: una nuova chiamata crea un nuovo `AbortController` e un nuovo timer. Nessun stato condiviso tra chiamate.

**Classificazione finale: VERIFIED CLOSED.**

---

## 6. Regressioni

| Verifica | Esito | Note |
|---|---|---|
| Installazione pulita (`pnpm install --frozen-lockfile`) | **BLOCKED / exit 1** | pnpm disponibile nell’host è 11.25.0, mentre il repository dichiara 10.32.1; l’installazione ha terminato con `ERR_PNPM_IGNORED_BUILDS` per `esbuild`. Dipendenze sono state materializzate, ma questo non è un PASS di installazione pulita. |
| Web Vitest (8 file / 96 test) | **96/96 ×3 PASS** | ripetuto sul checkout Q2-E; log freschi in `docs/qa/evidence/q2-e/web-vitest-rerun-{1,2,3}-2026-10-30.txt` |
| Build produzione + typecheck | **PASS / exit 0** | TypeScript contracts/API/Web e Vite production build; esecuzione diretta dei binari, non `pnpm build`/`pnpm typecheck`; log `build-typecheck-rerun-2026-10-30.txt` |
| Suite QA Node | **68 PASS / 0 FAIL / 1 SKIPPED (69 totali)** | comando documentato, ripetuto sul checkout Q2-E; output in `qa-suite-node-rerun-2026-10-30.txt` |
| QA Vitest | **28 PASS / 0 FAIL (6 file)** | 10 test focali logout/deadline e 28 suite completa; due assert tautologiche nella stesura originaria sono state sostituite da verifiche runtime; log finale `qa-vitest-rerun-2026-10-30.txt` |
| Browser E2E Playwright desktop/mobile | **PASS, exit 0** su schema nuovo; un tentativo successivo sullo stesso schema è **FAIL harness** perché il DB non era vuoto | log completi distinti sotto; 13 screenshot presenti, 11 aggiornati nella prova riuscita |
| `git diff --check` | **PASS / exit 0** | verificato sul diff QA prima della pubblicazione |

**Non rieseguito / riuso Q2-D:**
- La suite dedicata PostgreSQL transazioni/concorrenza (6 casi) e la regressione HTTP CORE-BUG-01 (15 casi) non sono state rieseguite perché `apps/api`, migrazioni e relativo codice sono invariati in W2-R5. Le evidenze Q2-D sono riferimenti storici, non risultati di questa riesecuzione.
- Il browser gate Q2-E descritto in §8 ha invece usato PostgreSQL 16 reale e schema temporaneo isolato; il verificatore admin era un sostituto sintetico, non verifica JWT crittografica.
- Il gate produzione DEMO/login manuale è riutilizzato da Q2-D, non rieseguito; il cambiamento Web W2-R5 non tocca quei flussi.

---

## 7. Rischi residui

1. **Logto staging reale:** ancora NOT RUN (nessuna istanza/credenziale autorizzata). Tutti i test OIDC usano mock o discovery iniettata.
2. **Firma ID token via JWKS lato SPA:** ancora NOT IMPLEMENTED (limite dichiarato, mitigazione Core-side).
3. **Asset con nomi non standard** (da QA-PR1-01): non coinvolto in questo checkpoint.
4. Il gate browser usa desktop Chromium e viewport mobile emulato (390×844), non un dispositivo fisico.
5. Installazione pulita con la versione pnpm dichiarata: BLOCKED come riportato in §6.

---

## 8. Nuovi finding

- **QA-HARNESS-01 — bassa, test harness:** `tests/browser/browser-e2e.py` presume un database vuoto, ma il server API conserva lo schema e i dati tra esecuzioni. Riproduzione: eseguire il browser gate con API/schema fresco (PASS), poi rilanciarlo senza riavviare `start-test-api.ts`: scenario 1 fallisce con `Expected public team 404 on empty DB, got 200`. Riavviando il server, viene creato un nuovo schema isolato e il gate torna PASS. Non è un difetto applicativo; rende non ripetibile la suite senza il prerequisito di restart. Correzione suggerita a QA: teardown/setup esplicito per ogni esecuzione o fail-fast se lo schema non è vuoto.
- Nessun nuovo difetto applicativo Web dimostrato. QA-C-01 e QA-C-08 sono verificati nel perimetro automatizzato/locale, con i limiti descritti; Logto staging resta separato.

---

## 9. Diff finale e SHA

- Branch QA: `qa/q2-e-w2r5-verification`
- Commit di integrazione: `8a5cc9cfa31d7720abd4e1f32dc801ed2055eb89`
- Commit QA di test/evidenze: `736d063e589f8b51831fa08034f29481208e74fe`.
- Il presente follow-up corregge il report e aggiunge il finding QA-HARNESS-01; lo SHA completo del commit finale è riportato nel messaggio di handoff e corrisponde al branch `qa/q2-e-w2r5-verification`. Nessun commit applicativo Core/Web è incluso.

---

## 10. Stato worktree e remote

| Worktree | Branch | HEAD al controllo finale | Stato |
|---|---|---|---|
| `/Users/gatti/Workspace/myteam-platform` | `main` | `66b49875acbf7d520029730702a03f3abc66bb8c` | invariato; preesistenti file QA/piattaforma non tracciati preservati |
| `/Users/gatti/Workspace/myteam-platform-q2-e` | `qa/q2-e-w2r5-verification` | commit QA corrente | pulito dopo il commit; node_modules e `dist/` sono output locali ignorati |
| Core C1.2, MVP-I1, Q2-A, Q2-B, QA Q1 worktrees | branch di proprietà esistenti | invariati | preservati, non modificati |

Q2-D è stato verificato tramite riferimento Git remoto/local branch; non esisteva un suo worktree attivo. Il branch remoto QA Q2-E era `99966b04549771f618d8763d280919644924cff1` al momento dell'ultimo controllo; l’ultimo commit locale QA deve essere pubblicato con push fast-forward ordinario se si richiede aggiornamento GitHub. Nessun merge su `main`, nessun force push, nessun deploy.

---

## 11. Riferimenti

- Finding precedenti: `docs/qa/CHECKPOINT-Q2-D-REPORT.md`
- Evidenze fresche Q2-E: `docs/qa/evidence/q2-e/` (8 log aggiunti, incluse una prova browser PASS e una ripetizione FAIL del solo harness; 13 screenshot presenti, 11 aggiornati nella run PASS).
- Evidenze Q2-D riutilizzate come storico: `docs/qa/evidence/q2-d/`.
- Test QA aggiornati: `tests/q1/15-web-w2-r5-logout-federated.vitest.ts`; `tests/q1/13-web-w2-r4-timeout.vitest.ts` è stato eseguito senza modifiche.
- Branch QA `qa/q2-e-w2r5-verification`; commit iniziale QA `99966b04549771f618d8763d280919644924cff1`; commit QA test/evidenze `736d063e589f8b51831fa08034f29481208e74fe`; follow-up report pubblicato sullo stesso branch in fast-forward.

Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`. Solo `tests/` e `docs/qa/`.

---

## 12. Limiti delle verifiche

1. **Logto staging reale:** NOT RUN (nessuna istanza/credenziale autorizzata).
2. **Firma ID token via JWKS lato SPA:** NOT IMPLEMENTED (limite dichiarato).
3. **PostgreSQL reale e regressione HTTP:** riutilizzate evidenze Q2-D (componenti non modificati).
4. **Build di produzione DEMO/login manuale:** riutilizzata evidenza Q2-D (nessuna modifica ai flussi coinvolti).

---

**Verdetto: QA PASS.**


## 8. Rerun indipendente Q2-E — 30 ottobre 2026

Questa sezione documenta la ripetizione sul checkout esatto, prima della correzione documentale/test-only, a `99966b04549771f618d8763d280919644924cff1` (Q2-E branch). Il commit Web testato è invariato a `667b12bc7cccb428a81803a3b3b4d8877d41ce3b`; base Q2-D `4f7732d62f78e84fe89fdc61d03ddd5cad1f0d9b`; Core `1ab71792929bef1009e3ecab57adf3d333d58ceb`.

### Evidenze aggiornate

- Web Vitest: tre esecuzioni indipendenti, ciascuna 8 file / 96 PASS / 0 FAIL / 0 SKIP; dettagli nei tre log `web-vitest-rerun-*-2026-10-30.txt`.
- QA Vitest: 6 file / 28 PASS / 0 FAIL, durata finale 0.558 s; eseguiti con include pattern temporaneo perché i file QA terminano in `.vitest.ts` e non rientrano nel pattern Vitest predefinito `*.test.ts`.
- QA Node: 12 file / 69 test, 68 PASS / 0 FAIL / 1 SKIPPED, exit 0; durata 1299 ms. Il conteggio precedente 67/66 è errato per il checkout verificato. Il file TAP preliminare che selezionava soltanto i tre test API non è usato come evidenza; il log completo con reporter predefinito è `qa-suite-node-rerun-2026-10-30.txt`.
- Build e typecheck: exit 0 usando TypeScript dei workspace per contracts, API e Web e Vite dalla cartella `apps/web`; log completo `build-typecheck-rerun-2026-10-30.txt`. Il tentativo iniziale di lanciare Vite dalla root è fallito con `Cannot resolve entry module index.html` perché il comando non era eseguito nella directory Web; non è un fallimento del build canonico.
- PostgreSQL/browser: Docker `myteam-platform-postgres-1` era healthy; l’API QA ha usato `myteam_platform_test`, schema `test_qa_<UUID>` temporaneo e cleanup automatico. Playwright ha verificato Chromium desktop e viewport mobile 390×844: backend offline, database vuoto, 401, 403, accesso admin con verifier sostitutivo, onboarding stagione/squadra, avversaria/bozza, isolamento pubblico della bozza, pubblicazione esplicita e comparsa pubblica. Prova riuscita: `browser-e2e-desktop-mobile-fresh-schema-2026-10-30.txt`, exit 0.
- Un’esecuzione ripetuta senza riavviare il server API ha fallito allo scenario database vuoto (`Expected public team 404 on empty DB, got 200`): il server manteneva i dati del precedente scenario nello stesso schema. Classificazione: **FAIL del setup/idempotenza del test browser**, non difetto applicativo; la prova è salvata in `browser-e2e-desktop-mobile-rerun-2026-10-30.txt`. Riavviato l’API QA, il nuovo schema ha consentito la prova pulita PASS. Per ripetibilità, riavviare `start-test-api.ts` prima di ogni run.
- Il marker `/tmp/myteam-qa-test-api-3000.schema` era assente dopo l’arresto; query allo schema di test non ha rilevato `test_qa_*` residui. Server API e Vite sono stati fermati.
- PostgreSQL dedicated transaction/concurrency suite, browser su device fisico e Logto staging: non rieseguiti / NOT RUN; il browser è reale ma desktop Chromium emulato e viewport mobile, non device mobile reale.

### Correzione della suite QA

In `tests/q1/15-web-w2-r5-logout-federated.vitest.ts` due precedenti `expect(true).toBe(true)` sono stati rimossi. Ora i test chiamano il singleton `authService` e verificano session restore/storage, discovery al logout post-F5, endpoint scoperto, `id_token_hint` presente nel redirect e invalidazione 401 senza fetch/redirect federato. I test sono comunque mockati: non equivalgono a Logto remoto. Il timeout body sospeso e retry sono verificati separatamente in `tests/q1/13-web-w2-r4-timeout.vitest.ts` e nella suite W2-R5 Web.

### Note di classificazione

- Runtime di questa sessione: Node v24.19.0 (ammesso dall’engine `>=22.12 <27`, ma diverso da `.node-version` 26.5.0); Python system 3.14 con Playwright.

- Prova browser: applicazione Web/Core locale + Chromium reale; database PostgreSQL reale; autenticazione admin tramite verifier sostitutivo.
- JWT crittografico/Logto: non dimostrati dal browser Q2-E; i test JWT locali della suite QA non rappresentano una sessione Logto staging.
- Il tentativo di installazione pulita non è PASS. L’ambiente ha fornito pnpm 11.25.0 nonostante `packageManager: pnpm@10.32.1`; l’install si è fermato dopo download/link dipendenze per script `esbuild` non approvato. Build/test eseguiti con i binari disponibili dopo il materializzarsi dei pacchetti.
- Branch QA già pubblicato: il rerun ha introdotto soltanto ownership QA (`tests/`, `docs/qa/`); nessuna modifica a Core/Web/iOS, nessun merge su main e nessun deploy.
