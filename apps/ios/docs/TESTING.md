# Build, test e verifiche

## Ambiente C3.2-R1 — verifica conclusiva

- Xcode 27.0 (`27A266a`).
- Scheme condiviso: `APP`; target applicazione `APP`; target test XCTest `APPTests`.
- Build: iOS Simulator generico, SDK iOS Simulator 27.0.
- Esecuzione XCTest: iPhone 18 Pro Simulator, iOS 27.0, runtime build `24A434`.
- Tutti i test usano dati sintetici, UserDefaults namespaced, store persistenti temporanei o container in-memory. Nessun dato personale del dispositivo è stato acquisito o usato.

## Comandi eseguiti

Build app e target test senza esecuzione (exit 0):

```sh
xcodebuild build-for-testing -project app/APP.xcodeproj \
  -scheme APP \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-C3R1-Retest-DerivedData \
  -quiet
```

Suite integrata eseguita dopo la ricompilazione (exit 0; 90 test superati, riepilogo `xcresulttool`: `Passed`):

```sh
xcodebuild test-without-building -project app/APP.xcodeproj \
  -scheme APP \
  -destination 'platform=iOS Simulator,id=94F3DA93-9BEA-4674-AAE8-CE127F97EBF7' \
  -derivedDataPath /private/tmp/AURINFORMATC-C3R1-Retest-DerivedData \
  -resultBundlePath /private/tmp/AURINFORMATC-C3R1-Retest.xcresult \
  -quiet
```

Nel contesto isolato il primo build-for-testing non ha potuto caricare correttamente la macro SwiftUI (`SwiftUIMacros.StateMacro`, risposta malformata del plugin server) e CoreSimulatorService non era raggiungibile. Con l'accesso locale autorizzato Xcode/CoreSimulator ha completato il build e l'esecuzione completa (`** TEST BUILD SUCCEEDED **`, `** TEST EXECUTE SUCCEEDED **`). Non sono stati installati runtime né cambiati settaggi globali.

## Esiti

| Verifica | Stato | Evidenza / limite |
|---|---|---|
| Compilazione app + target test (`build-for-testing`) | PASS | Exit 0; le modifiche e i test SwiftData sono stati compilati. |
| Suite XCTest integrata C1+C2+C3.1+C3+C3.2-R1 | PASS | 90 passati, 0 falliti, 0 saltati; riepilogo `xcresulttool` con `result=Passed`, bundle `/private/tmp/AURINFORMATC-C3R1-Retest.xcresult`. |
| Migrazione store persistente SwiftData V1→V2 | PASS | Test sintetico: V1 popolato, container chiuso, apertura V2, verifica dei dati e seconda riapertura. |
| Import legacy JSON primary/backup | PASS | Import, readback, retry/idempotenza, conferma esplicita del backup e byte originali invariati; fixture sintetiche. |
| Recovery backup SwiftData | PASS | Corruzione sintetica, quarantena e promozione della generazione precedente; un test dedicato verifica che una nuova scrittura dopo il restore crei una generazione valida, conservando la precedente e i byte in quarantena. |
| Finalizzazione storico/sessione | PASS | Sessione attiva checkpointata come `.finalizing` prima della transazione terminale; failure del checkpoint preserva `.active`, conflitto terminale preserva snapshot e storico precedente. I test rilasciano i riferimenti a repository e container, poi chiudono e riaprono lo store persistente: il checkpoint `.finalizing` è riconosciuto da `LiveMatchSessionStartupFactory` come retry pendente; la riapertura dopo il commit e il retry verificano idempotenza. Backup in revisione rifiutato senza mutazioni. Non è un kill reale del processo app. |
| Prova UI manuale kill/relaunch, background/lock | NOT RUN | Computer Use ha rilevato il Mac bloccato; nessun tentativo di aggiramento o reset. Non equivale a recovery end-to-end. |
| Migrazione dei dati reali del dispositivo | NOT RUN | Non richiesto per i test e non sono stati letti dati utente. |
| Reboot reale / garanzia di backup dell'intero database | NOT RUN | La generazione precedente è interna allo stesso store; non è un backup indipendente. |

La build di riesecuzione è riuscita (exit 0). Sono rimasti warning non bloccanti già presenti fuori dallo scope: accesso da contesto non isolato a `MatchDataStore.legacyLiveSessionReceiptID` (`MatchDataPersistence.swift:377`, diagnosticato come errore in Swift 6 language mode) e due variabili `restored` mutabili inutilmente in `MatchTimingTests.swift`. Il precedente run riportava inoltre `Metadata extraction skipped, no AppIntents.framework dependency found`; non è stata aggiunta una dipendenza App Intents. Nessun errore compiler/test nel run finale.

## Copertura rilevante

- `DomainCharacterizationTests.swift`: 16 test legacy/attuali Codable e CSV.
- `MatchTimingTests.swift`: 27 test deterministici C2 sul clock, lineup, partecipazione, pause, timeout, intervallo e limiti temporali.
- `MatchDataPersistenceTests.swift`: 16 test C3.1 su UserDefaults legacy, CRUD, storici, errori e store persistente.
- `LiveMatchSessionTests.swift`: 10 test di validazione, policy e recovery temporale mantenuti da C3.
- `SwiftDataLiveSessionPersistenceTests.swift`: 21 test su schema, migrazione, round-trip, riapertura, import legacy, recovery, errori e finalizzazione. La copertura include scrittura dopo restore con conservazione della quarantena, checkpoint `.active`→`.finalizing`, recovery factory del checkpoint riaperto, conservazione dopo errore della transazione terminale, errore di scrittura del checkpoint, retry senza duplicazione e rifiuto del backup non revisionato.

Il payload di JSON legacy è creato sinteticamente: questi test provano il contratto del formato precedente, non attestano che un dispositivo reale contenga proprio quei byte. I test di repository non sostituiscono la prova UI di cold start.


## Verifica supplementare dopo audit C3.2-R1

Il 25 ottobre 2026 la suite è stata ricompilata ed eseguita di nuovo dopo aver rafforzato i test di riapertura reale del `ModelContainer`. Il bundle e il log conservati in `/private/tmp` sono artefatti temporanei di questa sessione; il bundle XCTest è mantenuto come evidenza del risultato. La prova UI di kill/relaunch resta `NOT RUN` e non è sostituita dalla chiusura/riapertura del container nei test.
