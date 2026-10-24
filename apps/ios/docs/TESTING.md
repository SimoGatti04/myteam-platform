# Build, test e verifiche

## Ambiente verificato in C3.1

- Xcode 27.0 (`27A266a`).
- Scheme: `APP`; target app `APP`; XCTest `APPTests`.
- Destinazione test: iPhone 18 Pro Simulator, iOS 27.0, runtime build `24A434`.
- I comandi Xcode/Simulator sono stati eseguiti fuori dalla sandbox del runner perché il sandbox impediva l'avvio dei plugin macro SwiftData e l'accesso a CoreSimulatorService. Non sono stati installati o modificati runtime/toolchain.

## Comandi

Build app e target test senza esecuzione:

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/aurinformatc-c3-derived \
  build-for-testing
```

Suite completa C1+C2+C3.1:

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro,OS=27.0' \
  -derivedDataPath /private/tmp/aurinformatc-c3-derived \
  -resultBundlePath /private/tmp/aurinformatc-c3-verified.xcresult \
  test
```

## Copertura XCTest

- `DomainCharacterizationTests.swift` (C1, 16 test): forme Codable correnti/legacy e parser CSV. Fixture sintetiche in `Fixtures/DomainCharacterizationFixtures.swift`.
- `MatchTimingTests.swift` (C2, 21 test): clock controllabile, lineup, tempi individuali, pause, timeout, intervallo, callback ritardati e limiti dei periodi.
- `MatchDataPersistenceTests.swift` (C3.1, 16 test): store vuoto e receipt, import delle tre raccolte, preservazione di ID/ordine/campi opzionali, round-trip di partecipanti/eventi/assist, chiavi originali intatte, migrazione ripetuta, retry prima/dopo il receipt, conflitti/ID duplicati, JSON corrotto e valore di tipo errato, scrittura non consentita, store non apribile, CRUD, relazioni storiche, riapertura dello store persistente e assenza di perdita/duplicazioni.

La suite usa store SwiftData in-memory e store persistenti temporanei isolati. Nessun payload personale è copiato o usato. Le fixture sono rappresentative della struttura legacy documentata, non dati reali estratti da un dispositivo.

## Risultati C3.1 — 24 ottobre 2026

- Build app + test via `xcodebuild build-for-testing`: **PASS**.
- Suite C1+C2+C3.1 via `xcodebuild test`: **PASS — 53 test, 0 falliti, 0 skipped**.
- Xcode result bundle: `Passed`; iPhone 18 Pro / iOS 27.0.
- `git diff --check`: **PASS**.
- Analisi visiva/manuale UI e prova di migrazione dati reali: **NOT RUN**.
- Al termine di C3.1 il recovery live dopo terminazione/cold start era **NOT RUN**; C3 ha aggiunto test deterministici, ma il kill/relaunch manuale resta NOT RUN (vedere risultati C3 in coda).

## Verifiche distinte

| Tipo | Stato | Evidenza/limite |
|---|---|---|
| Build app e target XCTest | PASS | `xcodebuild build-for-testing` su destinazione generica iOS Simulator. |
| XCTest C1+C2+C3.1 | PASS | 53 pass, 0 fail, 0 skipped su iPhone 18 Pro Simulator iOS 27.0. |
| Migrazione legacy con fixture | PASS | Fixture anonime sintetiche; store isolati. |
| Retry dopo commit dati e prima del receipt | PASS | Simulazione deterministica: righe preesistenti identiche senza receipt, poi bootstrap. |
| Retry dopo fallimento di scrittura | PASS | Store persistente aperto read-only, poi riaperto writable. |
| Store SwiftData non apribile | PASS | File store sintetico non valido; apertura fallisce e il file resta invariato. |
| Dati reali esistenti su dispositivo | NOT RUN | Non acquisiti, non presenti nel repository e non simulati. |
| Avvio UI/manuale su dispositivo reale | NOT RUN | Test automatici non equivalgono a validazione visuale o operativa. |
| Recovery live dopo cold start | NOT RUN al termine di C3.1 | C3 copre restore deterministico; prova manuale kill/relaunch ancora non eseguita. |

## Limiti interpretativi

- Un XCTest PASS con fixture sintetiche verifica il contratto campionato, non la compatibilità di ogni payload già installato.
- Un build PASS non prova il comportamento visivo o l'apertura dello store di produzione su un dispositivo esistente.
- Le chiavi UserDefaults conservate sono snapshot pre-migrazione e diventano stale dopo modifiche a SwiftData; non costituiscono rollback da sole.
- Ogni evoluzione SwiftData deve aggiungere test della migrazione da schema persistente precedente e mantenere una strategia di backup/recupero.


## Risultati C3 — sessione live locale e finalizzazione

Data: 24 ottobre 2026.

- App-only `xcodebuild build -quiet -project app/APP.xcodeproj -scheme APP -destination 'generic/platform=iOS Simulator' -derivedDataPath /private/tmp/aurinformatc-c3-verified-final-derived-20261024 CODE_SIGNING_ALLOWED=NO`: **PASS** (exit code 0; nessun warning di compilazione emesso in output quiet).
- `xcodebuild test -project app/APP.xcodeproj -scheme APP -destination 'platform=iOS Simulator,id=94F3DA93-9BEA-4674-AAE8-CE127F97EBF7' -derivedDataPath /private/tmp/aurinformatc-c3-verified-final-derived-20261024 -resultBundlePath /private/tmp/aurinformatc-c3-verified-final-20261024.xcresult -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO`: **PASS — 81 test, 0 fail, 0 skipped** su iPhone 18 Pro, iOS 27.0 (`24A434`). Riepilogo `.xcresult`: `Passed`, 81 pass, 0 failure, 0 skipped, `runtimeWarnings: []`.
- Copertura live: round-trip e riapertura repository, backup/promozione, errore write, envelope/checksum/versione, recovery clock same-boot/discordante/riavvio possibile, restore running/paused/timeout/intervallo, clamp oltre periodo, validazione snapshot, retry/idempotenza finalizzazione, fallimenti marker/cleanup. Due test aggiunti in questa verifica coprono in modo specifico il restore del backup in presenza di checksum mismatch con conservazione byte-per-byte della primary corrotta, e il retry della finalizzazione da backup quando la primary viene corrotta dopo il commit dello storico. La finalizzazione scrive ora due generazioni `finalizing` prima dello side effect sullo storico.
- Tale test ha rilevato e corretto un difetto: il restore trattava alcuni errori tipizzati di decodifica (in particolare mismatch SHA-256) come motivo per bloccare la promozione del backup, pur avendo già classificato la primary come non valida. Ora la primary viene prima conservata in quarantena; i byte originali non sono sovrascritti.
- La suite include C1, C2 e C3.1. Gli 80 PASS sono XCTest reali sul codice dell’app; non equivalgono a una prova di lifecycle UI su un’app terminata.
- Kill/relaunch manuale con partita live, background/lock reale con verifica UI, reboot reale e dati reali dello store/chiavi: **NOT RUN**. Nessun dato personale è stato acquisito.
- `xcrun simctl list devices available` è riuscito con accesso autorizzato. Il boot di un iPhone 17e elencato come disponibile è fallito perché i file del device simulator non esistono; non è stato eseguito alcun reset. L’iPhone 18 Pro impiegato da XCTest è stato avviato e il processo app lanciato, ma non era disponibile controllo UI: CUA ha restituito che il Mac è bloccato e richiede sblocco manuale. Pertanto non è stata verificata la schermata né il ripristino end-to-end.
- Il log console del simulatore ha stampato avvisi SwiftUI/PointerUI durante l’avvio del runner; il riepilogo `.xcresult` riporta `runtimeWarnings: []`, 0 skipped e nessun failure. Non è stata attribuita una causa applicativa a quei messaggi.

### Interpretazione e limiti

- Gli XCTest dimostrano il funzionamento deterministico delle funzioni di serializzazione, ripristino e finalizzazione sui dati sintetici e su store isolati. Non dimostrano da soli l’intero flusso `MyApp` → disco reale del simulatore → kill → cold launch.
- Il delta fra processi usa clock continuo monotono più controllo civile; non c’è un identificatore di boot persistito. La decisione per possibili riavvii resta euristica e il recovery reale dopo reboot va verificato.
- Prima di dichiarare validato il cold start, eseguire un test end-to-end controllato con sessione sintetica e cleanup esplicito dell’application support del simulatore.
