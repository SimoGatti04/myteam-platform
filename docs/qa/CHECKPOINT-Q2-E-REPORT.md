# QA Q2-E — Verifica indipendente Web W2-R5

**Agente:** QA (persistente)
**Checkpoint:** Q2-E / verifica dei finding QA-C-01 e QA-C-08
**Data:** 2026-10-30
**Branch QA:** `qa/q2-e-w2r5-verification`
**Ambito modificato da QA:** esclusivamente `tests/` e `docs/qa/`. Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`, nessun merge su `main`, nessun deploy.

---

## 1. Verdetto

**QA PASS.**

Entrambi i finding oggetto del checkpoint (QA-C-01 e QA-C-08) risultano chiusi. Nessuna regressione rilevata. Nessun nuovo finding.

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
| Installazione pulita (`pnpm install --frozen-lockfile`) | exit 0 | |
| Web Vitest (8 file / 96 test) | **96/96 ×3** | baseline dichiarata 96/96 confermata |
| Build (`pnpm build`) | exit 0 | bundle `index-C8xMxBV6.js` 420.80 kB (gzip 109.65 kB) |
| Typecheck (`pnpm typecheck`) | exit 0 | api + web + contracts |
| Suite QA Node (12 file, 67 test) | 66 PASS / 0 FAIL / 1 SKIP | invariato |
| QA Vitest (6 file, 28 test) | 28 PASS / 0 FAIL, 0 unhandled errors | nuovi test Q2-E |
| Browser E2E (Playwright, desktop + mobile) | **exit 0**, 8 scenari + mobile | nessuna regressione |
| `git diff --check` | exit 0 | nessun whitespace error |

**Non rieseguito (riutilizzate evidenze Q2-D, componenti non modificati):**
- PostgreSQL reale (6/6) e regressione HTTP CORE-BUG-01 (15/15): `apps/api`, migrazioni e `start-test-api.ts` non toccati in W2-R5. Solo `apps/web/src/services/oidc.ts`, `auth.ts`, `AppContext.tsx` e test/docs. Evidenze in `docs/qa/evidence/q2-d/postgres-real-6pass.txt` e `http-immutability-core-bug-01.txt`.
- Build di produzione DEMO/login manuale (4/4): nessuna modifica ai flussi DEMO. Evidenza Q2-D riutilizzata.

---

## 7. Rischi residui

1. **Logto staging reale:** ancora NOT RUN (nessuna istanza/credenziale autorizzata). Tutti i test OIDC usano mock o discovery iniettata.
2. **Firma ID token via JWKS lato SPA:** ancora NOT IMPLEMENTED (limite dichiarato, mitigazione Core-side).
3. **Asset con nomi non standard** (da QA-PR1-01): non coinvolto in questo checkpoint.

---

## 8. Nuovi finding

Nessuno. W2-R5 chiude entrambi i finding aperti (QA-C-01 e QA-C-08) senza introdurre nuovi problemi.

---

## 9. Diff finale e SHA

- Branch QA: `qa/q2-e-w2r5-verification`
- Commit di integrazione: `8a5cc9cfa31d7720abd4e1f32dc801ed2055eb89`
- Commit QA (test + evidenze + rapporto): vedi §11
- SHA del branch QA: vedi §11

---

## 10. Stato worktree e remote

| Worktree | Branch | HEAD | Stato |
|---|---|---|---|
| `myteam-platform` | `main` @ `66b4987` | invariato | checkout canonico, non modificato |
| `myteam-platform-q2-e-int` | `qa/q2-e-w2r5-verification` | commit QA | verifica e pubblicazione |
| `myteam-platform-q2-d-int` | `qa/q2-d-w2r4-verification` | `4f7732d` | invariato |
| `myteam-platform-q2-c-int` | `qa/q2-c-w2r3-integration` | `72de509` | invariato |

Nessun merge su `main`, nessun force push, nessun deploy.

---

## 11. Riferimenti

- Finding precedenti: `docs/qa/CHECKPOINT-Q2-D-REPORT.md`
- Evidenze Q2-E: `docs/qa/evidence/q2-e/` (8 artefatti di log + 13 screenshot)
- Evidenze Q2-D riutilizzate: `docs/qa/evidence/q2-d/`
- Test QA aggiunti in questo checkpoint: `tests/q1/13-web-w2-r4-timeout.vitest.ts` (aggiornato), `tests/q1/15-web-w2-r5-logout-federated.vitest.ts`
- Branch pubblicato: `qa/q2-e-w2r5-verification` — commit di verifica `8a5cc9cfa31d7720abd4e1f32dc801ed2055eb89` (questo file è aggiornato da un commit successivo, solo documentale, per registrarne lo SHA)

Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`. Solo `tests/` e `docs/qa/`.

---

## 12. Limiti delle verifiche

1. **Logto staging reale:** NOT RUN (nessuna istanza/credenziale autorizzata).
2. **Firma ID token via JWKS lato SPA:** NOT IMPLEMENTED (limite dichiarato).
3. **PostgreSQL reale e regressione HTTP:** riutilizzate evidenze Q2-D (componenti non modificati).
4. **Build di produzione DEMO/login manuale:** riutilizzata evidenza Q2-D (nessuna modifica ai flussi coinvolti).

---

**Verdetto: QA PASS.**
