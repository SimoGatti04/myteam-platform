# QA Q2-D — Verifica indipendente Web W2-R4

**Agente:** QA (persistente)
**Checkpoint:** Q2-D / verifica dei finding QA-C-01, QA-C-02, QA-C-03, QA-C-05
**Data:** 2026-10-29
**Branch QA:** `qa/q2-d-w2r4-verification`
**Ambito modificato da QA:** esclusivamente `tests/` e `docs/qa/`. Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`, nessun merge su `main`, nessun deploy.

---

## 1. Verdetto

**QA PASS.**

Tutti e quattro i finding oggetto del checkpoint risultano chiusi o classificati in modo esplicito e non ambiguo. Un nuovo limite (QA-C-08) è emerso dalla verifica del timeout e va tracciato, ma è di bassa gravità e non blocca il progresso.

---

## 2. Revisioni effettivamente testate

| Componente | Riferimento | SHA completo |
|---|---|---|
| Web W2-R4 (oggetto della verifica) | `web/w2-r4-oidc-hardening` | `66f686053eca45f06e65882a9b3010524aa1f263` |
| Web W2-R3 (base) | `web/w2-logto-auth` | `860bc5b1f46438247d218db9ca6653f1634f0a42` |
| Base QA (Q2-C) | `qa/q2-c-w2r3-integration` | `72de50961de51609a209a176f45a60cdb7389c3a` |
| Merge d'integrazione QA | `qa/q2-d-w2r4-verification` | `0db5b6b53ce7558ef68a53cec587be8b570f5bc7` |
| Core C1.2 | `codex/core-persistent-flow` | `1ab71792929bef1009e3ecab57adf3d333d58ceb` |
| Commit QA di questo rapporto | `qa/q2-d-w2r4-verification` | vedi §11 |

### 2.1 Ancestry verificata

```
git merge-base --is-ancestor 1ab7179… HEAD   -> YES  (Core C1.2 antenato)
git merge-base --is-ancestor 66f6860… HEAD   -> YES  (W2-R4 antenato)
```

Diff W2-R3 → W2-R4: 5 file (`apps/web/README.md`, `apps/web/src/services/oidc.ts`, 3 test), 31 inserzioni, 13 delezioni. Nessuna modifica Core.

---

## 3. Matrice dei finding

| Finding | Gravità | Stato Q2-D | Prova |
|---|---|---|---|
| **QA-C-01** — fallback a endpoint di logout non scoperto | Bassa | **PARTIALLY CLOSED** | §4 |
| **QA-C-02** — seam pubblico `setDiscoveryMetadata()` | Bassa | **VERIFIED CLOSED** | §5 |
| **QA-C-03** — nessun timeout sulla discovery/token | Bassa | **VERIFIED CLOSED** (rete) + nuovo limite QA-C-08 | §6 |
| **QA-C-05** — scope `offline_access` richiesto senza refresh | Bassa | **VERIFIED CLOSED** | §7 |

---

## 4. QA-C-01 — Logout federato (PARTIALLY CLOSED)

### 4.1 Cosa è cambiato in W2-R4
`buildEndSessionUrl()` non costruisce più endpoint euristici: se `discoveryMetadata.end_session_endpoint` è assente, restituisce `null`. Il logout locale (`authService.logout()`) non dipende dalla discovery e avviene sempre.

### 4.2 Prove (test `tests/q1/11-web-w2-r4-logout-failclosed.vitest.ts`, 5 casi, tutti PASS)

| Caso | Esito |
|---|---|
| Discovery metadata disponibili → URL di end-session con `id_token_hint` e `post_logout_redirect_uri` | PASS |
| Dopo F5 (cache discovery vuota) → `buildEndSessionUrl` restituisce `null`, **nessun endpoint arbitrario** | PASS |
| Nessun URL euristico (`/oidc/session/end`, `/session/end`) costruito senza discovery | PASS |
| `buildEndSessionUrl` non lancia mai e restituisce `null` senza discovery (logout locale sempre possibile) | PASS |
| Metadati presenti ma senza `end_session_endpoint` → `null` (fail-closed) | PASS |

### 4.3 Classificazione

- **Logout locale:** sempre eseguito (sessione distrutta, token rimosso). **PASS.**
- **Logout federato con discovery in cache (stessa sessione SPA):** funziona. **PASS.**
- **Logout federato dopo F5 (cache vuota):** **NON IMPLEMENTATO.** `buildEndSessionUrl` restituisce `null`; nessun redirect al provider. L'utente resta disconnesso solo localmente.

**Classificazione finale: PARTIALLY CLOSED.** Non è un falso PASS: il logout federato post-F5 resta un gap funzionale da chiudere in W2-R5 (es. eseguire la discovery prima del logout, oppure rendere `buildEndSessionUrl` asincrona e fail-closed con retry). Non è un problema di sicurezza (nessun token inviato a host non scoperti).

---

## 5. QA-C-02 — Metadata injection (VERIFIED CLOSED)

### 5.1 Cosa è cambiato in W2-R4
`setDiscoveryMetadata()` è ora guardata da `if (typeof process !== 'undefined' && process.env?.VITEST)`. In produzione (browser, dove `process` è `undefined`) è un no-op; nei test (jsdom con `VITEST` impostato) funziona.

### 5.2 Prove (test `tests/q1/12-web-w2-r4-metadata-injection.vitest.ts`, 4 casi, tutti PASS)

| Caso | Esito |
|---|---|
| In ambiente di test (VITEST presente), `setDiscoveryMetadata` funziona | PASS |
| In produzione (VITEST assente), `setDiscoveryMetadata` è no-op | PASS |
| In produzione, nessun bypass della discovery è raggiungibile via `setDiscoveryMetadata` | PASS |
| La testabilità rimane disponibile nei test | PASS |

### 5.3 Verifica sul bundle di produzione
Nel bundle (`index-BsT51J7B.js`) il guard `typeof process !== 'undefined'` valuta `true` solo in ambienti Node/test; in browser `process` è `undefined`, quindi il ramo di iniezione è dead code a runtime. Nessun bypass raggiungibile dai flussi applicativi.

**Classificazione finale: VERIFIED CLOSED.**

---

## 6. QA-C-03 — Timeout e disponibilità (VERIFIED CLOSED per la rete + nuovo limite QA-C-08)

### 6.1 Cosa è cambiato in W2-R4
`fetchDiscovery()` e lo scambio token usano `AbortController` con timeout di 10 secondi (`setTimeout(() => controller.abort(), 10000)`), con gestione esplicita di `AbortError` e messaggi dedicati.

### 6.2 Prove (test `tests/q1/13-web-w2-r4-timeout.vitest.ts`, 4 casi)

| Caso | Esito |
|---|---|
| Discovery che non risponde mai → timeout dopo 10s, flusso termina con errore | PASS |
| Token exchange che non risponde mai → timeout dopo 10s, flusso termina con errore | PASS |
| Dopo timeout, retry riesce (nuova chiamata completata) | PASS |
| Server invia header ma corpo JSON sospeso → **limite documentato** (timeout non copre `res.json()`) | PASS (documenta il limite) |

### 6.3 Nuovo finding QA-C-08 — Timeout non copre il parsing del corpo JSON

**Gravità:** Bassa (disponibilità).
Il timeout W2-R4 copre solo il `fetch` di rete. Se il server invia gli header HTTP ma mantiene il corpo indefinitamente sospeso, `res.json()` non è protetto da timeout e il flusso non termina. Il test `13-…` dimostra il limite empiricamente (la promise resta pendente dopo 10s di tempo fittizio).

**Riproduzione:** mock di `fetch` che risolve con `{ ok: true, json: () => new Promise(() => {}) }` → `fetchDiscovery()` non termina.

**Correzione suggerita (circoscritta):** wrappare anche `res.json()` in un timeout (`Promise.race([res.json(), timeoutPromise])`) oppure usare `response.clone()` con lettura controllata. Responsabilità: Web. Non bloccante.

### 6.4 Stato UI dopo errore e ripristino

Il flusso `loginWithOidc()` imposta `oidcLoading=true` all'inizio e propaga l'errore (timeout/offline) al chiamante; dopo il timeout il loading viene resettato dal caller (React). Il test dimostra che la promise termina (non resta pendente) nei casi di rete, quindi il pulsante di login torna cliccabile. Il browser E2E (§8) conferma che il flusso di login manuale e OIDC non si blocca.

**Classificazione finale: VERIFIED CLOSED** per i casi di rete (discovery/token non rispondenti). Il caso "corpo sospeso" è tracciato come QA-C-08 (limite, non bloccante).

---

## 7. QA-C-05 — Scope (VERIFIED CLOSED)

### 7.1 Cosa è cambiato in W2-R4
Default scope cambiato da `openid profile offline_access platform:admin` a `openid profile platform:admin` in `loadOidcConfig` e nel README (due occorrenze aggiornate).

### 7.2 Prove (test `tests/q1/14-web-w2-r4-scope.vitest.ts`, 3 casi, tutti PASS)

| Caso | Esito |
|---|---|
| Default scopes non contengono `offline_access` | PASS |
| Configurazione esplicita `VITE_LOGTO_SCOPES` resta supportata (incluso `offline_access` se richiesto) | PASS |
| Configurazione esplicita senza `offline_access` accettata | PASS |

### 7.3 Coerenza README e test

- `apps/web/README.md`: due occorrenze aggiornate (`scope:` e tabella `VITE_LOGTO_SCOPES`).
- `apps/web/test/w2-oidc-auth.test.ts`, `w2-r1-react-integration.test.tsx`, `w2-r2-oidc-security.test.tsx`: scope aggiornato a `openid profile platform:admin`.
- Bundle di produzione: `offline_access` compare solo come costante enum del SDK `@logto/browser` (`e.OfflineAccess='offline_access'`), **non** è richiesto dal nostro codice.

**Classificazione finale: VERIFIED CLOSED.**

---

## 8. Regressioni

| Verifica | Esito | Note |
|---|---|---|
| Installazione pulita (`pnpm install --frozen-lockfile`) | exit 0 | |
| Web Vitest (7 file / 87 test) | **87/87 ×3** | nessuna regressione |
| Build (`pnpm build`) | exit 0 | bundle `index-BsT51J7B.js` 420.28 kB (gzip 109.45 kB) |
| Typecheck (`pnpm typecheck`) | exit 0 | api + web + contracts |
| Suite QA Node (12 file, 67 test) | 66 PASS / 0 FAIL / 1 SKIP | invariato |
| QA Vitest (5 file, 22 test) | 22 PASS / 0 FAIL, 0 unhandled errors | nuovi test Q2-D |
| Browser E2E (Playwright, desktop + mobile) | **exit 0**, 8 scenari + mobile | nessuna regressione |

**Non rieseguito (riutilizzate evidenze Q2-C, componenti non modificati):**
- PostgreSQL reale (6/6) e regressione HTTP CORE-BUG-01 (15/15): i componenti coinvolti (`apps/api`, migrazioni, `start-test-api.ts`) **non** sono stati toccati in W2-R4; solo `apps/web/src/services/oidc.ts` e test/docs. Evidenze in `docs/qa/evidence/q2-c/postgres-real-6pass.txt` e `http-immutability-core-bug-01.txt`.
- Build di produzione DEMO/login manuale (4/4): solo `oidc.ts` è cambiato, ma il guard `process.env.VITEST` non altera il comportamento in produzione (process è undefined in browser); nessuna modifica ai flussi DEMO. Evidenza Q2-C riutilizzata.

---

## 9. Rischi residui

1. **QA-C-01 PARTIALLY CLOSED**: il logout federato post-F5 resta non implementato. Rischio funzionale (UX), non di sicurezza. Da chiudere in W2-R5.
2. **QA-C-08 (nuovo, bassa)**: timeout non copre il parsing del corpo JSON. Rischio di disponibilità solo in caso di server malevolo/degradato. Suggerimento: wrappare `res.json()` in un timeout.
3. **Logto staging reale:** ancora NOT RUN (nessuna istanza/credenziale autorizzata). Tutti i test OIDC usano mock o discovery iniettata.
4. **Firma ID token via JWKS lato SPA:** ancora NOT IMPLEMENTED (limite dichiarato, mitigazione Core-side).

---

## 10. Giudizio

**QA PASS.**

Tutti i finding oggetto del checkpoint sono chiusi o classificati in modo esplicito e non ambiguo. Nessun falso PASS. Nessuna regressione rilevata. Il nuovo limite QA-C-08 è tracciato e non bloccante.

---

## 11. Riferimenti

- Finding precedenti: `docs/qa/CHECKPOINT-Q2-C-REPORT.md`
- Evidenze Q2-D: `docs/qa/evidence/q2-d/` (8 artefatti di log + 13 screenshot)
- Evidenze Q2-C riutilizzate: `docs/qa/evidence/q2-c/`
- Test QA aggiunti in questo checkpoint: `tests/q1/11-web-w2-r4-logout-failclosed.vitest.ts`, `tests/q1/12-web-w2-r4-metadata-injection.vitest.ts`, `tests/q1/13-web-w2-r4-timeout.vitest.ts`, `tests/q1/14-web-w2-r4-scope.vitest.ts`
- Branch pubblicato: `qa/q2-d-w2r4-verification` — commit di verifica `0db5b6b53ce7558ef68a53cec587be8b570f5bc7` (questo file è aggiornato da un commit successivo, solo documentale, per registrarne lo SHA)

Nessun merge su `main`, nessun force push, nessun deploy. Nessuna modifica a `apps/web`, `apps/api`, `packages/contracts`.
