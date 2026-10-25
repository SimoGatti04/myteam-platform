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

Il 25 ottobre 2026 la suite è stata ricompilata ed eseguita di nuovo dopo aver rafforzato i test di riapertura reale del `ModelContainer`. Il bundle `/private/tmp/AURINFORMATC-C3R1-Retest.xcresult` è mantenuto come evidenza; il DerivedData e i due log creati per la riesecuzione sono stati rimossi dopo la verifica. Il bundle precedente `/private/tmp/AURINFORMATC-C3R1-verified.xcresult` è stato conservato come evidenza del run iniziale. La prova UI di kill/relaunch resta `NOT RUN` e non è sostituita dalla chiusura/riapertura del container nei test.

## C3.2-V — Validazione end-to-end reale della partita live (25 ottobre 2026)

Questa sezione aggiorna e supera il primo tentativo del checkpoint, che era rimasto `UNAVAILABLE` per l’accesso alla UI. L’accesso Computer Use ha successivamente segnalato il Mac bloccato; non è stato aggirato. È stata usata la modalità XCUITest prevista dal task: `XCUIApplication` ha installato/avviato e controllato l’app reale nel simulatore isolato.

### Ambiente e isolamento

- Xcode 27.0 (`27A266a`), Swift 6.4; scheme `APP`.
- Simulatore creato per questo task: `AURINFORMATC-C3.2-V`, iPhone 18 Pro, iOS 27.0 (build `24A434`), UDID `2CF865DB-369B-47B1-9608-FA1212AD3FD4`.
- Sono stati usati sei giocatori sintetici e anonimi. Non sono stati letti o modificati store SwiftData/UserDefaults di produzione, backup o dati personali.
- La prova non simula la terminazione: `XCUIApplication.terminate()` ha terminato il processo dell’app mantenendone il container, quindi il test l’ha rilanciata e ha verificato il comportamento UI dopo il cold start.
- Computer Use non ha potuto controllare manualmente il Mac perché risultava bloccato. Non è stato eseguito né dichiarato un lock/unlock reale del simulatore.

### Matrice A–E

| Scenario | Stato | Evidenza e limite |
|---|---|---|
| A — Partita attiva, formazione, Play esplicito, gol/assist, sostituzione, kill/relaunch e recovery | **PASS (flusso UI verificato)** | La suite ha creato sei giocatori sintetici, selezionato cinque titolari, verificato che la conferma non avviasse il cronometro, premuto Play, registrato gol/assist e sostituito un giocatore. Dopo `terminate()`/`launch()` il timer è rimasto attivo, il conteggio è avanzato rispetto al tempo di terminazione, marcatori/assist e sostituto erano ripristinati. L’UUID non è stato ispezionato direttamente dalla UI. |
| B — Pausa, kill/relaunch, tempo fermo e ripresa esplicita | **PASS** | Dopo la pausa, timer e tempo individuale non sono avanzati né durante l’attesa né dopo la terminazione/rilancio; `RIPRENDI` era presente e la ripresa esplicita ha riavviato il conteggio. |
| C — Background/foreground e lock screen | **PARTIAL** | Il test ha usato `XCUIDevice.shared.press(.home)` e `app.activate()` sul simulatore; timer e minuti del giocatore rimasto in campo sono aumentati durante il background. Lock/unlock non eseguito. |
| D — Finalizzazione e storico | **PASS (finalizzazione), PARTIAL (nuova partita)** | La UI ha finalizzato, terminato e rilanciato nuovamente l’app. Non è ricomparsa una sessione live; nello storico è presente un solo record, con marcatore e assist. L’avvio di una nuova partita immediatamente dopo la finalizzazione non è stato verificato. |
| E — Recovery temporale incerto | **NOT RUN** | Non è stata predisposta una fixture V2 sintetica con timestamp incerto e non è stata verificata la schermata di revisione/correzione. L’orologio globale dell’host non è stato modificato. |

Il test non ha associato un avversario e quindi non verifica un valore avversario specifico. La tolleranza di incremento del background è verificata dall’asserzione di progresso; non è una misura di accuratezza certificata dell’orologio OS.

### Esiti di build e test

Build app per iOS Simulator (eseguita con accesso locale Xcode autorizzato, exit 0):

```sh
xcodebuild -quiet build -project app/APP.xcodeproj \
  -scheme APP -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-C3.2-V-DerivedData
```

È stato emesso un warning Swift preesistente di isolamento: `MatchDataStore.legacyLiveSessionReceiptID` è `@MainActor` e viene referenziato da un contesto non isolato in `MatchDataPersistence.swift:377` (il warning segnala che diventerebbe errore in modalità Swift 6). Non è stato modificato nello scope C3.2-V.

Suite completa XCTest del target `APPTests`, inclusi i characterization test C1, il motore C2, la persistenza C3/C3.1/C3.2-R1 e il nuovo test di regressione: **91 PASS, 0 FAIL, 0 SKIPPED** (`xcresulttool` summary `Passed`, comando exit 0):

```sh
xcodebuild test -project app/APP.xcodeproj -scheme APP \
  -destination 'platform=iOS Simulator,id=2CF865DB-369B-47B1-9608-FA1212AD3FD4' \
  -only-testing:APPTests \
  -derivedDataPath /private/tmp/AURINFORMATC-C3.2-V-DerivedData \
  -resultBundlePath /private/tmp/AURINFORMATC-C3.2-V-Regression-Retry.xcresult \
  -parallel-testing-enabled NO
```

Il test UI `LiveMatchLifecycleUITests/testActivePausedAndFinalizedMatchSurvivesProcessTermination` è **1 PASS, 0 FAIL, 0 SKIPPED** nel bundle `/private/tmp/AURINFORMATC-C3.2-V-UIFinal.xcresult` (`xcresulttool get test-results summary` e `tests` riportano `Passed`). Il nodo di test è durato 116 secondi. Dopo il completamento, Xcode è rimasto bloccato per 600 secondi nella raccolta diagnostica del simulatore e `xcodebuild` ha terminato con codice 75 e `TEST INTERRUPTED`; la diagnostica non ha cambiato il risultato del test nel bundle, ma il comando end-to-end non ha avuto una chiusura pulita. Il bundle include un warning runtime `Invalid frame dimension (negative or non-finite)` non classificato.

Anche il test mirato di regressione post-fix è passato: **1 PASS, 0 FAIL, 0 SKIPPED**, bundle `/private/tmp/AURINFORMATC-C3.2-V-DateRegression-Fixed.xcresult`.

### Difetto riprodotto e correzione circoscritta

Il primo flusso UI completo ha aperto `CONCLUSIONE DA COMPLETARE` e riportato `liveSessionHistoryConflict(...)`. La verifica di equivalenza confrontava timestamp `Date` con uguaglianza esatta, ma il checkpoint live serializza la data come `millisecondsSince1970`: il round-trip introduce rumore sub-millisecondo. In `MatchDataPersistence.swift`, il confronto ora accetta una differenza massima di 1 microsecondo; gli altri campi del record sono ancora verificati esattamente. Il test `testFinalizationAcceptsDatePrecisionAfterSessionSnapshotRoundTrip` riproduce il caso e fa parte dei 91 test verdi. La regressione UI è stata poi ripetuta e il test lifecycle è passato.

Un tentativo precedente aveva inoltre un’aspettativa test-only errata sul testo dell’assist (`A 1` invece dell’etichetta visibile `Assist 1`); è stata corretta nell’asserzione, senza cambiare il testo o il comportamento dell’app.

### File e configurazione

- `app/APP.xcodeproj/project.pbxproj` e `app/APP.xcodeproj/xcshareddata/xcschemes/APP.xcscheme`: aggiunto e abilitato il target `APPUITests`.
- `app/APPUITests/LiveMatchLifecycleUITests.swift`: nuovo flusso UI sintetico di ciclo partita.
- `app/APP/ContentView.swift`: soli identificatori di accessibilità per controlli/testo osservati; nessun cambiamento visuale intenzionale.
- `app/APP/MatchDataPersistence.swift` e `app/APPTests/SwiftDataLiveSessionPersistenceTests.swift`: correzione circoscritta e regressione deterministica sulla precisione della data.
- Nessuna modifica intenzionale a palette, layout, navigazione, asset o altri comportamenti funzionali.

### Evidenza, repository e cleanup

Bundle finali conservati: `/private/tmp/AURINFORMATC-C3.2-V-UIFinal.xcresult`, `/private/tmp/AURINFORMATC-C3.2-V-Regression-Retry.xcresult` e `/private/tmp/AURINFORMATC-C3.2-V-DateRegression-Fixed.xcresult`. Il simulatore isolato contiene soltanto i dati sintetici di prova ed è stato mantenuto per un eventuale retest; nessun simulatore preesistente è stato resettato o eliminato. Non è stato configurato remote né eseguito push.

**Conclusione:** l’acceptance gate dei flussi essenziali di C3.2-V è passato; il checkpoint resta `PARTIAL` perché recovery temporale incerto, lock screen, identità UUID diretta e avvio di una nuova partita dopo finalizzazione non sono stati verificati. Non si avvia C3.3 in questa attività.
