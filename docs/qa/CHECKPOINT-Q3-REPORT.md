# QA Release Gate Q3 — Report indipendente

**Data verifica:** 31 ottobre 2026
**Repository:** `SimoGatti04/myteam-platform`
**Commit candidato verificato:** `f6382175b2fa9488994d3dfbb460d995ede97e5c`
**Branch d'origine:** `codex/integration-i0-candidate`
**Branch QA locale:** `qa/q3-release-gate`
**Verdetto:** **NO-GO per promozione/merge su `main` e per dichiarare production-ready.** Il gate codice integrato passa i controlli eseguiti, ma restano finding di sicurezza/configurazione OIDC e controlli CI remoti assenti; il gate Logto staging/deployment non è stato eseguito.

Questo rapporto è una verifica QA, non un'approvazione di release. Non sono state modificate applicazioni Core, Web o iOS. Nessun merge, push o deploy è stato eseguito.

## 1. Preflight, provenienza e ambiente

- `git ls-remote origin refs/heads/codex/integration-i0-candidate` ha restituito esattamente `f6382175b2fa9488994d3dfbb460d995ede97e5c` prima dei test.
- Il worktree QA è stato creato isolato e pulito da quel commit: `/private/tmp/myteam-platform-q3` (branch locale `qa/q3-release-gate`). Non sono stati riutilizzati `node_modules` o risultati di test del worktree I1. `node_modules` era assente all'ingresso.
- `git status` prima delle verifiche era pulito. L'installazione locale ha usato Node `v26.5.0` e pnpm `10.32.1` tramite `mise`; la versione `packageManager` dichiarata è `pnpm@10.32.1`.
- `pnpm install --frozen-lockfile` è riuscito nel worktree fresco. La policy versione-controllata consente il solo build script `esbuild@0.28.2`; lockfile invariato. Nessuna configurazione pnpm è stata modificata in Q3.
- Ancestry controllata nel candidato: Core C1.2 `1ab71792929bef1009e3ecab57adf3d333d58ceb`; Web W2-R5 `667b12bc7cccb428a81803a3b3b4d8877d41ce3b`; QA R2 `8a9a261d3f4e0d9b81224eea39b88e11ea6f4b56`; iOS R1-D importato (commit documentale `cb69f605f2d53f73695a5d327dd0c82b726e5e1b`); build B1 `d53a976e3a2f3bb56e327ca22b9db48402ae9a0e`.
- Node package e dipendenze sono state installate dal lockfile del candidato, non da checkout fratelli.

## 2. Matrice dei gate

### INTEGRATION CODE GATE

| Controllo | Esito | Evidenza / limite |
|---|---|---|
| Integrità Git, branch e ancestry | **PASS** | Tip locale/remoto del candidato coincide con lo SHA target; gli antenati indicati sopra sono presenti. Nessuna modifica applicativa in Q3. |
| Installazione pulita e lockfile | **PASS** | Worktree fresco, nessun `node_modules` iniziale; `mise exec -- pnpm install --frozen-lockfile` riuscito con pnpm 10.32.1. Lockfile invariato. |
| Build monorepo + typecheck + test canonici | **PASS** | `mise exec -- pnpm check`, exit 0: build di contracts/API/Web, typecheck contracts/API/Web, test API (3 + 3 registrati dai runner). Bundle Web prodotto. |
| Web Vitest | **PASS** | `mise exec -- pnpm --filter @myteam/web test`: 8 file, 96 test PASS, 0 FAIL, 0 SKIP. |
| Vitest QA frontend | **PASS** | `mise exec -- pnpm --filter @myteam/web exec vitest run --config ../../tests/vitest.qa.config.ts`: 6 file, 28 PASS, 0 FAIL, 0 SKIP. Sono test/componenti e controlli API mock, non browser E2E. |
| Suite QA Node | **PASS con SKIP** | Comando riportato in §3: 76 totali, 75 PASS, 0 FAIL, 1 SKIPPED; lo skip è il gate responsive nel TAP, delegato al browser E2E separato. |
| PostgreSQL reale | **PASS** | PostgreSQL 16 reale nel container locale, schema temporaneo isolato del helper; 6 PASS, 0 FAIL, 0 SKIP, inclusi vincoli, rollback, concorrenza roster, CORE-BUG-01, regressione di rischedulazione e onboarding/lifecycle. Non equivale a Logto o produzione. |
| Browser desktop + mobile | **PASS nel runner locale autorizzato** | Chromium Playwright 1.58.0, Vite + Fastify reali e PostgreSQL reale. 11 screenshot; log integrale e log lifecycle inclusi in `docs/qa/evidence/q3/browser/`. Autorizzazione host fuori sandbox necessaria. Login API è un verificatore sostitutivo. |
| CI remota sul candidato | **NOT RUN / controllo assente** | Albero Git del candidato non contiene `.github/workflows`; GitHub API `check-runs` per lo SHA ha restituito `total_count: 0`; commit status è `pending` con `total_count: 0` e nessun status. Non esistono prove CI remote da attribuire al candidato. |

### SECURITY / AUTH GATE

| Controllo | Esito | Evidenza / limite |
|---|---|---|
| Autorizzazione route amministrative senza configurazione | **PASS** | `apps/api/src/platform/routes.ts`: se il verificatore non è configurato la route rifiuta con 503, non concede accesso. Il browser harness sostituisce il verificatore. |
| Verifica crittografica JWT access token Core | **PASS (test locale)** | Test Core genera/valida token RS256 con JWKS; test QA API copre 401 malformed/missing, expired/wrong iss/aud e 403 scope `platform:admin`. Sono test con chiavi/dati di prova, non un IdP Logto remoto. |
| 401/403 nel browser | **PASS (mock authorization)** | Browser reale visualizza l'avviso 401 e 403. La risposta 401/403 è prodotta dal `verifyAdminToken` sostitutivo del test API, non da Logto né dalla verifica JWT reale del browser. |
| Flusso Authorization Code/PKCE | **PASS sintetico, non end-to-end IdP** | Codice/test Web coprono `code`, PKCE S256, state, nonce, TTL e consumo monouso; token endpoint e discovery sono mockati nei test. Browser Q3 non esegue login/callback Logto. |
| ID Token e issuer/audience | **FAIL — Q3-AUTH-01** | Il callback decodifica claims via `parseJwtPayload()` e li controlla senza validare la firma. Precisazione normativa: OpenID Connect Core §3.1.3.7 consente, per ID Token ricevuto direttamente dal Token Endpoint nel code flow, di usare TLS server validation al posto della verifica JWS; pertanto la sola assenza di verifica JWS **non è da sola un difetto** in questo specifico flusso. Resta però una divergenza verificabile: il codice normalizza slash finali su `iss` invece di richiedere uguaglianza esatta e accetta `aud` contenente il client anche quando sono presenti audience addizionali non fidate; la specifica richiede il rigetto delle audience aggiuntive non fidate. Inoltre non risulta imposto HTTPS sugli endpoint OIDC scoperti/configurati dalla Web. Vedi finding §4. |
| TLS endpoints OIDC Web | **FAIL — Q3-AUTH-02** | `loadOidcConfig()` accetta `VITE_LOGTO_ENDPOINT` senza parsing/controllo HTTPS; i campi discovery `authorization_endpoint`/`token_endpoint` sono verificati come stringhe ma non come URL HTTPS. Il token exchange usa `fetch(tokenEndpoint)` con redirect predefinito. Core invece richiede issuer/JWKS HTTPS nella configurazione. Nessun endpoint Logto reale è stato contattato. |
| Scadenza/rinnovo token | **PASS limitato / refresh NOT IMPLEMENTED** | Access token expiry è rappresentata nella sessione Web e Core valida `exp`; le chiamate admin possono invalidare sessione su 401. Non è stato trovato un flusso refresh token. La documentazione non va interpretata come refresh operativo. Nessuna sessione OIDC remota testata. |
| Bearer token verso API pubbliche | **PASS sintetico** | Il client lega il Bearer alle richieste admin; flussi pubblici non richiedono token nei test e nel browser. Non è un audit dinamico contro proxy/CDN di produzione. |

### PRODUCT MVP GATE

| Scenario | Esito | Evidenza / limite |
|---|---|---|
| API/Core persistente + integrità e rollback | **PASS** | Suite PostgreSQL reale con schema di test; rollback e vincoli DB esercitati. |
| Browser onboarding da database/schema vuoto | **PASS** | Browser crea stagione, seleziona/salva, configura e pubblica squadra, crea avversaria e partita; PostgreSQL temporaneo. |
| Bozza non pubblica e pubblicazione esplicita | **PASS** | Browser e query API: partita DRAFT assente dal feed pubblico; dopo esplicita pubblicazione appare nel sito con l'avversaria attesa. |
| Errori di accesso/offline | **PASS con auth sostitutiva** | Scenario offline UI, 401 e 403 visibili, accesso autorizzato di test; nessun claim di OIDC reale. |
| Responsive | **PASS limitato** | Browser effettivo in viewport desktop 1280×800 e mobile 390×844. Il flusso admin completo è verificato desktop; mobile copre drawer e vista pubblica, non ogni form admin. |
| Produzione e DEMO | **PASS per blocco runtime; FAIL per assenza fisica dei fixture** | La policy `isDemoAllowed()` blocca DEMO quando l'ambiente è production e i test QA coprono la policy. Tuttavia il bundle di produzione effettivamente generato contiene stringhe fixture come `MAPI GROUP`, `Aurora` e `DEMO` (`apps/web/dist/assets/index-C8xMxBV6.js`). Nessuna evidenza mostra tali fixture visibili o selezionabili in runtime production; il codice resta incluso nel bundle e questo non soddisfa una lettura stretta del requisito “nessun fixture DEMO nella build”. Finding a basso rischio, §4. |
| Risultati/statistiche/votazioni/LIVE/CSI/sync iOS | **PASS documentale con limite** | I documenti Web indicano statistiche e POTM in modalità reale come “in arrivo/roadmap” e simulati in DEMO; API/platform docs e integrazioni descrivono risultati/eventi avanzati, LIVE, CSI e sincronizzazione iOS come fuori scope/futuri. Non è stata verificata operatività di tali funzionalità perché non sono dichiarate implementate. Alcuni snapshot di stato iOS sono storici e non aggiornati al candidato integrato (vedi §4). |
| Riavvio servizio e continuità | **NOT RUN** | Le suite provano persistenza PostgreSQL dentro un processo/test, ma il browser E2E non riavvia API e verifica un nuovo processo sul medesimo schema. Lo schema browser viene intenzionalmente eliminato al teardown. |

### STAGING DEPLOYMENT GATE

| Controllo | Esito | Evidenza / limite |
|---|---|---|
| Build di produzione | **PASS** | `pnpm check` produce bundle Vite production. È un build locale, non un artefatto deployato. |
| Configurazione/secret production e contenuti pubblicabili | **NOT RUN** | Nessuna configurazione di staging/produzione, secret store, URL di deployment o contenuto reale è stato fornito/attivato. Non si può attestare configurazione OIDC, CORS, headers, dominio o dati pubblicati in produzione. |
| Deploy e smoke su staging | **NOT RUN** | Nessun deploy eseguito. |
| Logto staging reale | **NOT RUN** | Nessuna istanza/credenziale/consenso di staging autorizzato; non contattata. |
| Prontezza production | **NO-GO** | Non deducibile da test sintetici e locale; finding sicurezza OIDC e assenza di CI remota restano aperti. |

## 3. Comandi e risultati effettivi

Eseguiti nel worktree Q3 esatto; versioni: Node `v26.5.0`, pnpm `10.32.1`, Python `3.14.10`, Playwright `1.58.0`.

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm check
mise exec -- pnpm --filter @myteam/web test
mise exec -- pnpm --filter @myteam/web exec vitest run --config ../../tests/vitest.qa.config.ts
mise exec -- node --import tsx --test \
  tests/api/*.test.ts tests/contracts/*.test.ts tests/auth/*.test.ts \
  tests/q1/*.test.ts tests/browser/schema-cleanup.test.ts
TEST_DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:54329/<test-database>' \
  mise exec -- node --env-file-if-exists=.env --import tsx --test \
  tests/integration/postgres-real-concurrency-and-rollback.test.ts \
  tests/integration/postgres-real-onboarding-and-lifecycle.test.ts
```

Le righe `TEST_DATABASE_URL` qui sopra sono intenzionalmente sanificate: il run locale ha usato il solo database di test su loopback; il valore credenziale non è incluso nei log o nel report. Risultati contatori:

- `pnpm check`: exit 0; build/typecheck completati; API unit 3 PASS e API root 3 PASS, 0 fail/skip nei runner riportati. Il comando radice non esegue la suite Web completa: quella è stata eseguita separatamente.
- Web Vitest: **96 PASS / 0 FAIL / 0 SKIPPED**, 8 file.
- Vitest QA frontend: **28 PASS / 0 FAIL / 0 SKIPPED**, 6 file.
- QA Node TAP: **76 totali = 75 PASS + 1 SKIPPED + 0 FAIL**, exit 0. Il test skipped è soltanto la dichiarazione del gate responsive separato, non è conteggiato PASS.
- PostgreSQL reale: **6 PASS / 0 FAIL / 0 SKIPPED**, exit 0.
- Browser E2E: script `python3 tests/browser/browser-e2e.py http://127.0.0.1:5173 http://127.0.0.1:3000`, **exit 0**. Il test è stato eseguito due volte in processi API nuovi; la seconda esecuzione è quella i cui artefatti completi sono inclusi. Scenari: offline; home database vuoto; 401; 403; token di test admin 200; onboarding; creazione avversaria/bozza; isolamento pubblico della bozza; pubblicazione esplicita e dettaglio pubblico; viewport mobile. Una singola esecuzione non è conteggiata come più test unitari.

## 4. Finding

### Q3-AUTH-01 — Validazione claims ID Token non aderente al requisito di uguaglianza/audience

- **Gravità:** MEDIUM (security/protocol con impatto mitigato da access-token verification Core).
- **Owner:** Web.
- **Stato:** aperto, riproducibile dal codice; non testato contro Logto staging.
- **Evidenza:** `apps/web/src/services/oidc.ts`, `parseJwtPayload()` dichiara che decodifica senza firma; callback usa claims `iss`, `aud`, `exp`, `nonce`; confronto `aud` accetta stringa o array contenente l'app ID, senza rifiutare audience aggiuntive non fidate; issuer viene normalizzato rimuovendo slash finali, benché OIDC richieda match esatto. I test presenti verificano issuer mismatch e audience priva del client ID, ma non audience multipla con audience non fidata.
- **Riproduzione logica:** costruire la risposta token con payload avente `aud: [<client_id configurato>, "other-client"]`, `iss` corretto, `exp` futuro e nonce atteso. Il controllo corrente considera `audMatches` true perché usa `.includes(clientId)`, poi accetta la callback. Analogamente l'issuer con sola differenza di slash finale passa dopo normalizzazione.
- **Impatto:** claims di identità lato UI non rispettano tutti i controlli OIDC dichiarati. Core mantiene la verifica crittografica separata del bearer access token e richiede issuer/audience/scope; ciò riduce l'impatto sull'autorizzazione API ma non corregge il contratto di autenticazione UI.
- **Nota normativa:** OIDC Core §3.1.3.7 permette in Authorization Code flow di sostituire la verifica JWS dell'ID Token con TLS server validation quando il token arriva direttamente dal Token Endpoint; quindi non si classifica qui come finding il solo fatto che la Web non verifica la firma JWS. Il TLS deve però essere richiesto e la validazione issuer/audience rimanente deve rispettare la specifica.

### Q3-AUTH-02 — Configurazione/metadata Web non impone TLS sugli endpoint OIDC

- **Gravità:** HIGH per un deployment non-HTTPS/misconfigurato; rischio condizionale nell'attuale hosting HTTPS.
- **Owner:** Web (config client), coordinamento Infra per valori di deployment.
- **Stato:** gap dimostrato staticamente; exploit remoto non testato, Logto staging NOT RUN.
- **Evidenza:** `loadOidcConfig()` accetta l'issuer dalla env senza verificarne schema; `loadDiscoveryMetadata()` controlla che `authorization_endpoint` e `token_endpoint` siano stringhe e issuer corrisponda, ma non valida protocollo/URL degli endpoint. `fetch(tokenEndpoint)` non specifica `redirect: 'error'`. I browser moderni bloccano mixed content da pagina HTTPS, ma ciò non è un sostituto di una policy applicativa che richieda HTTPS né protegge deployment non-secure o redirect/endpoint mal configurati.
- **Riproduzione:** configurare `VITE_LOGTO_ENDPOINT` con schema `http:` (ammesso dal parser) o un discovery document con issuer corrispondente e token endpoint `http:`/host indesiderato; il codice non rifiuta la configurazione/metadata prima di costruire richiesta/URL. Da staging HTTPS il browser può bloccare la richiesta; in quel caso l'impatto pratico viene mitigato dal browser ma la misconfigurazione termina in errore, non in fallback sicuro progettato.
- **Impatto:** in un deployment HTTP, authorization code/PKCE verifier e token response possono transitare senza TLS; redirect di fetch possono inoltre portare la richiesta token fuori dall'endpoint previsto. Enforce HTTPS su issuer e endpoint e rifiutare redirect non autorizzati.

### Q3-PROD-01 — Fixture demo presenti nel bundle production

- **Gravità:** LOW; non è stata dimostrata esposizione di dati privati, le fixture sono sintetiche.
- **Owner:** Web.
- **Stato:** presenza nel bundle riprodotta; accessibilità runtime non osservata in production hosting.
- **Evidenza:** build effettiva `apps/web/dist/assets/index-C8xMxBV6.js`; ricerca stringhe trova `MAPI GROUP`, `Aurora`, `DEMO`. Policy runtime/test `isDemoAllowed()` restituisce falso in produzione e il browser test in modalità reale non visualizza branding/fixture demo; l'inclusione fisica nel bundle resta.
- **Impatto:** non aderisce al requisito forte di escludere fixture dalla build produzione e rende i contenuti sintetici ispezionabili nel JS. Non c'è evidenza di segreti o dataset reali.

### Q3-CI-01 — Nessun controllo CI remoto sul candidato

- **Gravità:** MEDIUM (rischio di processo/release).
- **Owner:** Infra/QA.
- **Stato:** verificato sul candidato e GitHub API al 31/10/2026.
- **Evidenza:** nessun `.github/workflows` nell'albero del commit; GitHub `check-runs` total_count 0 e commit status `pending`, total_count 0. Build/test locali non equivalgono a required checks, test su PR o protezione branch.
- **Azione:** introdurre e rendere required build/typecheck/test (con PostgreSQL service) per branch/PR; aggiungere controllo browser almeno su job/ambiente autorizzato.

### Q3-DOC-01 — Snapshot di stato iOS non allineato al candidato integrato

- **Gravità:** LOW.
- **Owner:** QA/Core (documentazione condivisa) con iOS.
- **Stato:** osservazione; non blocca funzioni runtime.
- **Evidenza:** `docs/STATUS.md` e `docs/platform/IOS-INTEGRATION.md` riportano revisione QA PR #1 “ancora pendente” e integrazione iOS come stato di branch/PR; nel candidato verificato l'ancestry iOS R1-D è già inclusa. I documenti sono snapshot e non affermano sincronizzazione backend operativa, ma lo stato di revisione è ormai storico.
- **Azione:** aggiornare lo snapshot dopo il presente checkpoint/decisione d'integrazione; mantenere esplicito che sync backend e OIDC iOS non sono implementati.

## 5. Risorse temporanee e cleanup

- PostgreSQL di test utilizzato: container locale `myteam-platform-postgres-1`, PostgreSQL 16, loopback `127.0.0.1:54329`, database `myteam_platform_test`. Prima delle prove, `pg_stat_activity` non mostrava altre sessioni applicative sul database; dopo le prove il conteggio `test_qa_%` era 0.
- Il browser harness ha creato e rimosso gli schemi `test_qa_44b4e97627754a70ac5b748647990d80` e `test_qa_caebe6d81def413690a2c964a34eb99f`; i log confermano `marker_removed=true`. Il marker `/tmp/myteam-qa-test-api-3000.schema` è assente al termine.
- Porte 3000 e 5173 liberate; processi API e Vite arrestati. Nessun volume/DB condiviso eliminato; nessun cleanup di worktree altrui.
- Gli screenshot/log browser (11 PNG) sono sintetici, non contengono credenziali reali e sono conservati sotto `docs/qa/evidence/q3/browser/`.
- Nessun segreto reale è stato passato. Il bearer `test-admin-token` esiste soltanto nel verificatore in-memory del test harness e non è una credenziale Logto.

## 6. Stato Git e verdetto per gate

- **Branch locale QA:** `qa/q3-release-gate`, derivato dal target verificato `f6382175b2fa9488994d3dfbb460d995ede97e5c`.
- Modifiche Q3 consentite: rapporto QA ed evidenze; nessuna modifica Core/Web/iOS/contratti/configurazione condivisa. Commit SHA Q3 da riportare nel messaggio finale dopo il commit locale.
- Nessun push, merge, deploy o modifica al branch d'integrazione.

| Gate | Verdetto |
|---|---|
| INTEGRATION CODE GATE | **GO** per la combinazione sintetica e i gate locali effettivamente eseguiti; CI remota mancante è un rischio aperto. |
| SECURITY / AUTH GATE | **NO-GO** finché non sono chiusi Q3-AUTH-01 e Q3-AUTH-02 e non è verificata una configurazione OIDC di staging. JWT access-token Core ha test crittografici locali PASS; questo non certifica Logto né ID Token browser. |
| PRODUCT MVP GATE | **GO CON RISERVE** per il workflow admin→PostgreSQL→API pubblica→Web verificato nel browser con verificatore sostitutivo; riavvio server NOT RUN e build include fixture demo. Funzionalità future (risultati, statistiche operative, votazioni reali, LIVE, CSI e sync iOS) non sono certificate né presentate in questo rapporto come operative. |
| STAGING DEPLOYMENT GATE | **NOT RUN**; nessun deploy/configurazione/Logto reale autorizzato. |
| Idoneità PR/merge su main | **NO-GO** finché i finding di sicurezza OIDC e il gate CI non hanno una decisione/chiusura esplicita. Nessuna azione Git remota compiuta da QA. |

## 7. Riferimenti alle evidenze browser

- Log E2E completo: [`evidence/q3/browser/browser-e2e.txt`](evidence/q3/browser/browser-e2e.txt)
- Lifecycle API e cleanup schema: [`evidence/q3/browser/api-lifecycle.txt`](evidence/q3/browser/api-lifecycle.txt)
- Log server Web: [`evidence/q3/browser/web-server.txt`](evidence/q3/browser/web-server.txt)
- Log suite: [`evidence/q3/check.txt`](evidence/q3/check.txt), [`evidence/q3/web-vitest.txt`](evidence/q3/web-vitest.txt), [`evidence/q3/web-qa-vitest.txt`](evidence/q3/web-qa-vitest.txt), [`evidence/q3/qa-node.tap`](evidence/q3/qa-node.tap), [`evidence/q3/postgres-real.tap`](evidence/q3/postgres-real.tap).
- Screenshot: directory [`evidence/q3/browser/`](evidence/q3/browser/)

Comando browser riproducibile dal root del repository, dopo aver avviato il DB di test e due processi isolati:

```sh
TEST_DATABASE_URL='postgresql://<test-user>:<test-password>@127.0.0.1:<test-port>/<test-database>' \
  QA_TEST_API_PORT=3000 TMPDIR=/tmp \
  node --env-file-if-exists=.env --import tsx tests/browser/start-test-api.ts
pnpm --dir apps/web exec vite --host 127.0.0.1 --port 5173
QA_BROWSER_SCREENSHOTS_DIR=/tmp/q3-browser-evidence \
  python3 tests/browser/browser-e2e.py http://127.0.0.1:5173 http://127.0.0.1:3000
```

Il browser gate in questa sessione è stato autorizzato fuori dal sandbox. Questi comandi usano un verificatore admin sostitutivo definito nel test server, quindi non possono essere riutilizzati come prova Logto/JWT browser reale.
