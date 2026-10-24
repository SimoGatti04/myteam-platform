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
- Recovery della sessione live dopo terminazione/cold start: **NOT RUN / scope C3.2**; la sessione non è persistita in C3.1.

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
| Recovery live dopo cold start | NOT RUN | Da implementare e verificare in C3.2. |

## Limiti interpretativi

- Un XCTest PASS con fixture sintetiche verifica il contratto campionato, non la compatibilità di ogni payload già installato.
- Un build PASS non prova il comportamento visivo o l'apertura dello store di produzione su un dispositivo esistente.
- Le chiavi UserDefaults conservate sono snapshot pre-migrazione e diventano stale dopo modifiche a SwiftData; non costituiscono rollback da sole.
- Ogni evoluzione SwiftData deve aggiungere test della migrazione da schema persistente precedente e mantenere una strategia di backup/recupero.
