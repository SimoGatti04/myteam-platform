# QA Release Gate Q4 — Revisione indipendente I3

**Data:** 31 ottobre 2026  
**Repository:** `SimoGatti04/myteam-platform`  
**Target:** `codex/integration-i3-candidate` @ `faa82e873ee8e0bbf3af6c1c8297444c6257bcd2`  
**Ancestry:** I2 `162cd2c2e61d0fc58a9ffba1ab8d2e0713f908b1` e Security Q3-R1 `0fb810cfabdce07b0ca3ae8a4ade95c2edfeb278`, entrambi antenati  
**Worktree/branch QA:** `/Users/gatti/.codex/worktrees/q4-release-gate/myteam-platform`, `qa/q4-i3-release-gate`  
**Verdetto codice:** **Q4 CODE GO CON RISERVE**  
**Deployment/staging:** **NOT RUN**

Questa revisione non approva un deployment o una dichiarazione production-ready. Nessun codice Core/Web/iOS, `main`, branch concorrente o infrastruttura è stato modificato; nessun push, merge o deploy è stato eseguito.

## Matrice dei gate

| Gate | Esito | Evidenze e limiti |
|---|---|---|
| **INTEGRATION CODE GATE** | **PASS** | Remote e checkout al commit esatto; ancestry richiesta verificata. Installazione pulita frozen-lockfile, `pnpm check`, suite Web/QA e PostgreSQL reale passati. QA Node 69 PASS e 1 SKIP; browser non compreso nel PASS. |
| **SECURITY / OIDC GATE** | **PASS CON RISERVE** | 34 test OIDC mirati passati con provider/mocks locali e revisione del codice. Fail-closed osservato su issuer/audience/azp/HTTPS/redirect. Nessuna verifica di Logto remoto, configurazione tenant o TLS effettiva; il browser E2E è NOT RUN. |
| **CI REMOTE GATE** | **PASS** | GitHub Actions run [41215411372](https://github.com/SimoGatti04/myteam-platform/actions/runs/41215411372): `head_sha` I3 esatto, conclusione `success`, job `Release Gates` e sei gate completati. CI non comprende browser E2E, Xcode/iOS o Logto staging. |
| **PRODUCT MVP GATE** | **PASS CON RISERVE** | Percorsi coperti da test automatici e PostgreSQL reale passati. Bundle production contiene fixture demo sintetiche, bloccate dal guard nell'ambiente `production`; rischio condizionale se la build imposta esplicitamente variabili da staging. Nessun dato reale esposto dimostrato. |
| **STAGING READINESS GATE** | **NOT RUN** | Browser E2E desktop/mobile non eseguito per assenza del modulo Python Playwright. Logto staging/deployment non eseguiti e non autorizzati in questo incarico. |

## Preflight e ambiente

- Remote configurato: `git@github.com:SimoGatti04/myteam-platform.git`; riferimento remoto del candidato verificato allo SHA richiesto.
- Worktree autonomo, branch `qa/q4-i3-release-gate`; HEAD iniziale esatto e tree pulito. Nessun risultato o `node_modules` di I3/worktree fratelli riutilizzato.
- Ancestry I2 e Security Q3-R1 verificata.
- Node `v26.5.0`, pnpm `10.32.1`; `pnpm install --frozen-lockfile` **PASS** in installazione pulita, 183 pacchetti, lockfile invariato.
- `pnpm check` **PASS**, exit code 0 dopo autorizzazione alla scrittura degli artefatti di compilazione nel worktree. Il primo tentativo è terminato `EPERM` su file `dist/`: limite di permessi del runner, non errore di codice.
- Build: contracts/API/Web riuscite; Vite production build riuscita. Typecheck di contracts/API/Web riuscito.

### Test effettivi

| Suite/prova | Risultato |
|---|---|
| `pnpm check` | **PASS**, exit 0 (build, typecheck, test root) |
| Web Vitest | **111 PASS / 0 FAIL / 0 SKIP**, 8 file |
| QA Vitest | **28 PASS / 0 FAIL / 0 SKIP**, 6 file |
| QA Node, sottoinsieme canonico | **70 totali: 69 PASS / 0 FAIL / 1 SKIP**, circa 1,06 s. Lo skip è il test browser 6.3 e non è un PASS browser. |
| OIDC mirati `w2-r2-oidc-security.test.tsx` | **34 PASS / 0 FAIL / 0 SKIP**, test locale/mock |
| PostgreSQL reale | **6 PASS / 0 FAIL / 0 SKIP**, database locale dedicato `myteam_platform_test`, schema `test_qa_<UUID>` isolato. Include regressione immutabilità, rollback/vincoli/concorrenza e onboarding/lifecycle. API/Fastify, non click browser. Verificato che a fine prova non rimangano schemi `test_qa_*`. |
| Browser Playwright desktop/mobile | **NOT RUN**: `python3 tests/browser/browser-e2e.py` si arresta con `ModuleNotFoundError: No module named 'playwright'`. Nessun workaround o PASS sintetico. |
| Logto staging reale | **NOT RUN**: nessuna istanza/credenziale staging autorizzata utilizzata. |
| Xcode/XCTest su I3 | **NOT RUN** |

I test locali verificano comportamento sintetico; solo la suite dichiarata PostgreSQL usa PostgreSQL reale. Nessuno dei due equivale a una prova UI/IdP reale.

## Security / OIDC — Q3-AUTH-01 e Q3-AUTH-02

Esaminati `apps/web/src/services/oidc.ts`, i test di sicurezza e `docs/platform/ACCESS-DEPLOYMENT.md`.

- Issuer discovery confrontato in modo esatto con la configurazione; `iss` ID token confrontato esattamente, senza normalizzare slash.
- `aud` deve includere il client ID; audience aggiuntive sono accettate solo se elencate in `trustedAudiences`, vuoto/non configurato per default. Audience multiple richiedono `azp` uguale all'app ID; anche `azp` presente con audience singola deve coincidere.
- Issuer ed endpoint OIDC sono soggetti a validazione HTTPS. Discovery e token exchange impostano `redirect: 'error'`, quindi non seguono redirect automatici.
- Deadline a 10 secondi copre fetch e lettura completa del JSON; discovery malformata, endpoint mancanti/non validi, timeout e risposte HTTP negative falliscono senza endpoint hardcoded.
- PKCE S256, `state`, `nonce`, TTL e consumo monouso del tentativo sono mantenuti; i test mirati negativi per issuer mismatch, audience/`azp`, HTTPS, redirect e timeout risultano passati.
- Il client decodifica i claim dell'ID token e non verifica nel browser la firma JWS. Non classifico la sola omissione come difetto: in Authorization Code Flow, quando l'ID token è ricevuto direttamente dal token endpoint tramite TLS, OIDC Core §3.1.3.7 consente di omettere la verifica di firma. Questa valutazione dipende dalla correttezza del flusso/canale: i mock locali non provano TLS né il comportamento del provider reale. Core verifica separatamente in modo crittografico l'access token; questo non certifica l'ID token.
- Nessuna incompatibilità con Logto reale è stata confermata. Endpoint/configurazione/audience/logout e issuer vanno provati in staging autorizzato prima di affermare compatibilità operativa.

**Esito Q3-AUTH-01/02 nel perimetro locale/mock: PASS CON RISERVE**, senza bypass dimostrato; certificazione Logto staging non concessa.

## CI e residui Q3

Run `41215411372` è completato con successo sul branch e SHA esatti. Il workflow controlla installazione frozen, integrità lockfile, `pnpm check`, Web Vitest, QA Vitest, QA Node e test PostgreSQL. I sei gate sono quelli nominati nel file `.github/workflows/ci.yml`.

Copertura non presente nel workflow: browser Playwright E2E, Xcode/iOS e Logto staging. Un run CI verde non attesta tali superfici né un deployment.

## Product MVP e residui documentali

### Q3-PROD-01 — fixture sintetiche nel bundle production

**Tipo:** rischio condizionale/configurazione, non fuga reale riprodotta. **Gravità:** P2. **Owner suggerito:** Web (guard/build), Infra (configurazione deploy).

La build production eseguita genera asset che contengono stringhe/fixture sintetiche come `ASD Aurora Calcio` e `MAPI GROUP`. `apps/web/src/utils/env.ts` disabilita DEMO quando l'ambiente risolto è `production`. Tuttavia `VITE_APP_ENV` è valutato prima di `MODE`/`DEV`; se pipeline/deployment compila con `VITE_APP_ENV=staging` e `VITE_ENABLE_DEMO=true`, il ramo staging abilita la demo anche con il normale comando `vite build`. Non è stato esaminato un deployment reale e non si sostiene che questa combinazione sia attualmente impostata. Non sono state trovate evidenze che il bundle contenga dati privati o dataset reali.

**Impatto:** disponibilità delle fixture sintetiche nel bundle e rischio di modalità demo per configurazione build errata; non un'esposizione di dati reali dimostrata. **Raccomandazione:** guard di build che rifiuti esplicitamente DEMO-enabled quando Vite mode è production e/o tree-shaking delle fixture; test dell'artefatto e verifica delle variabili in deployment.

### Q3-DOC-01 — iOS/checkpoint

**Tipo:** debito documentale/provenienza, P2; owner iOS/QA. `apps/ios/docs/STATUS.md` riporta C3.3 con 122 PASS su commit storico `456854…` e specifici limiti (incluso device fisico); tali risultati non sono una build/test sul tip I3. Lo stato documenta R1-D/CI iOS come non eseguiti. PR iOS #1 risulta draft e non merged: ciò non è di per sé difetto applicativo. In Q4 non è stato eseguito Xcode.

La documentazione consultata presenta CSI-S2 come workstream/prototipo separato, non come integrazione live certificata. Risultati/statistiche, votazioni, LIVE e sincronizzazione iOS non sono certificati da questo gate; elementi di roadmap o proposta non sono trattati come bug solo perché non implementati.

## Findings

| ID | Gravità | Evidenza e riproduzione | Impatto/stato | Owner e correzione |
|---|---|---|---|---|
| **Q4-01 / Q3-PROD-01** | P2 | Stringhe demo presenti dopo build; codice mostra il caso compile-time staging + `VITE_ENABLE_DEMO=true`. | Rischio condizionale dimostrato nel codice; nessun deploy né dato reale esposto riprodotto. | Web/Infra: bloccare build production con DEMO abilitata, valutare esclusione fixture e validare config deploy. |
| **Q4-02 / Q3-DOC-01** | P2 | Report iOS conserva conteggi su revisione precedente e limiti dichiarati; PR #1 ancora draft/non merged. | Rischio di attribuire prove storiche al candidato; nessuna regressione iOS I3 dimostrata. | iOS/QA: mantenere SHA e stato di esecuzione espliciti; eseguire Xcode/CI sul candidato quando disponibile. |
| **Q4-03** | P1 — gate aperto, non bug dimostrato | Browser NOT RUN per Playwright mancante; Logto/deployment non eseguiti. | UI reale, responsive, redirect/callback, provider e configurazione staging non certificati. | QA/Infra: runner Playwright e Logto staging autorizzato, raccogliere log/trace sanitizzati. |

Non sono stati riprodotti accessi admin non autorizzati, esposizione di bozze o pubblicazione automatica nelle prove eseguite; conclusione limitata alla copertura sintetica/API realmente eseguita.

## Verdetto per gate

- **INTEGRATION CODE:** PASS.
- **SECURITY / OIDC:** PASS CON RISERVE (mock/local; nessuna certificazione IdP reale).
- **CI REMOTE:** PASS sullo SHA I3.
- **PRODUCT MVP:** PASS CON RISERVE (browser e iOS non certificati; hardening demo P2 aperto).
- **STAGING READINESS:** NOT RUN.
- **Q4 CODE VERDICT:** **GO CON RISERVE** per review codice/integration review; non equivale a GO deployment, merge automatico o produzione-ready. Prima di release operativa occorre almeno il browser E2E autorizzato, il collaudo Logto staging e la verifica delle variabili di build/deploy; la copertura Xcode/iOS deve seguire il piano release.

## Comandi di riproduzione

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @myteam/web test
pnpm --filter @myteam/web exec vitest run --config ../../tests/vitest.qa.config.ts
pnpm exec tsx --test tests/api/*.test.ts tests/contracts/*.test.ts tests/auth/*.test.ts tests/q1/*.test.ts tests/integration/admin-pipeline-in-memory-integration.test.ts
TEST_DATABASE_URL='<database dedicato ai test>' pnpm test:integration
python3 tests/browser/browser-e2e.py
```

La prova PostgreSQL richiede un database dedicato non production; nel run Q4 è stato usato `myteam_platform_test` e schema temporaneo, con verifica dell'assenza di residui. Il browser command è NOT RUN per modulo mancante. Non inserire credenziali Logto reali nei test.
