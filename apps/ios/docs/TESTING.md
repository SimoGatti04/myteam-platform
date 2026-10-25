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

**Conclusione:** C3.2-V è `COMPLETE` rispetto al criterio di accettazione dei flussi essenziali: partita attiva, pausa, terminazione/rilancio, recovery della sessione e finalizzazione sono stati esercitati sull’app reale via XCUITest. Restano esplicitamente non verificati il lock screen, il recovery temporale incerto, l’identità UUID osservata direttamente e l’avvio di una nuova partita subito dopo la finalizzazione; non sono inclusi tra gli esiti PASS. Non si avvia C3.3 in questa attività.


## C3.2-V-SUPP — recovery temporale, nuova partita e diagnostica Xcode (25 ottobre 2026)

Questa verifica supplementare non ripete la progettazione o il refactoring C3.2-V. Sono stati usati i simulatori isolati creati per il test `AURINFORMATC-C3.2-V-SUPP-Recovery` (`1D3A6979-DF28-40D6-A46C-1A8EC3D5690E`) e `AURINFORMATC-C3.2-V-SUPP-Lifecycle` (`046D790F-E0A2-467D-91B2-E770B3E175DC`), entrambi iPhone 18 Pro con iOS 27.0 / runtime build `24A434`. La fixture non contiene dati di persone reali; il container Recovery è stato reinstallato e alimentato attraverso l’importer esistente con `app/scripts/create_synthetic_recovery_fixture.py`. Il payload mantiene un tempo salvato di 19:30 su un periodo di 20:00, un checkpoint monotono incongruente e un timestamp civile recente; nessun orologio è stato alterato. L’hash SHA-256 dei byte copiati nel container e del file fixture era identico (`2ea717832cec6afa22e48a8adc4d8388611f8dc328b4a3e97743385da6b9c705`).

### Matrice supplementare

| Scenario | Stato | Evidenza |
|---|---|---|
| Recovery temporalmente incerto: schermata di revisione e suggerimento | PASS | XCUITest `testTemporallyUncertainRecoveryCanBeCorrectedAndSurvivesRelaunch`; mostra `PARTITA DA RIPRISTINARE`, avversario sintetico e suggerimento `00:30`. Il controllo di incremento è disabilitato al massimo residuo del periodo; sono presenti entrambe le azioni di conferma e correzione. |
| Decisione di recovery e conservazione dati | PASS | È stata scelta la correzione `RIPRENDI SENZA AGGIUNGERE TEMPO`; il test verifica avversario, marcatore, assist, tempo dei titolari e tempo zero del sostituto, poi mette in pausa, termina davvero il processo con `XCUIApplication.terminate()` e rilancia. Dopo il secondo avvio non compare una seconda revisione, lo stato resta in pausa e il clock/tempo individuale restano invariati. Il pulsante di conferma del suggerimento è stato verificato come disponibile ma non azionato in un run distinto. |
| Confine massimo dopo la correzione | PASS | Il clock rientrato è analizzato come `MM:SS`, non negativo e con residuo non superiore a 30 secondi. La prima esecuzione aveva un’asserzione test-only che si aspettava esattamente `00:30` dopo l’azione; il risultato `00:27` era coerente con il cronometro già in marcia durante l’interazione UI. Non è stato riprodotto un difetto produttivo; l’asserzione è stata resa temporaneamente corretta e il test è poi passato. |
| Finalizzazione, assenza della vecchia sessione e nuova partita | PASS | XCUITest `testActivePausedAndFinalizedMatchSurvivesProcessTermination` passa dopo aver finalizzato, terminato e riaperto l’app, controllato lo storico, avviato e messo in pausa una seconda partita, quindi riaperto lo storico. La UI continua a mostrare un solo record con marcatore/assist originali. |
| UUID e integrità dello store dopo la nuova partita | PASS | Query `sqlite3 -readonly` sullo store SwiftData V2 del solo simulatore Lifecycle, a processo terminato: 1 record; 1 sessione live `active`; 1 evento e 6 partecipanti collegati al record, punteggio 1–0. UUID del record finalizzato `4024F7A5-EAE2-471D-9B6D-A6AFECCA6ABC`; UUID della nuova sessione `310ED8D4-46EB-44E0-ABF0-0D352EF9C886`, distinti. Nessuna sessione finalizzata separata è rimasta nello store. |
| Background → foreground | PASS | Il test lifecycle esercita Home/riattivazione e il percorso di background/foreground; questa prova non è un lock screen. |
| Lock → unlock reale | NOT RUN | `xcrun simctl help io` espone anche `screenConfig power on|off`, ma non un’operazione lock/unlock. Lo spegnimento del display non è stato considerato una simulazione equivalente del blocco; non è stata usata automazione privata né aggirato lo stato di blocco del Mac. Rimane un controllo pre-release. |

### Build, test e processo Xcode

- Xcode `27.0` (`27A266a`), Swift `6.4`, scheme `APP`, destinazione iOS Simulator 27.0.
- `xcodebuild build-for-testing ... -derivedDataPath /private/tmp/AURINFORMATC-C3.2-V-SUPP-DerivedData CODE_SIGNING_ALLOWED=NO`: exit 0 dopo la modifica test-only; app e target `APPTests`/`APPUITests` compilati.
- XCUITest Recovery con `-collect-test-diagnostics never`: **1 PASS, 0 FAIL, 0 SKIPPED**, test 36,4 s nell’ultima esecuzione, `xcodebuild` exit 0, bundle finale `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Recovery-Verified2.xcresult`. Il test identifica separatamente i controlli accessibili `Increment` e `Decrement`; l’incremento è disabilitato e la correzione verso il basso resta abilitata. Il precedente bundle `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Recovery-Verified.xcresult` è anch’esso passato.
- XCUITest Lifecycle con `-collect-test-diagnostics never`: **1 PASS, 0 FAIL, 0 SKIPPED**, test 144,1 s, `xcodebuild` exit 0, bundle `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Lifecycle-Verified.xcresult`. Il bundle registra il warning runtime `Invalid frame dimension (negative or non-finite)`, già presente nel run C3.2-V; non è stato attribuito a questo scope.
- Regressione completa `-only-testing:APPTests`, ripetuta dopo l’ultima modifica ai test: **91 PASS, 0 FAIL, 0 SKIPPED**, `xcodebuild` exit 0, bundle finale `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Regression-Final.xcresult`. Il run precedente `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Regression.xcresult` aveva lo stesso esito.
- `xcodebuild -help` della versione installata documenta `-collect-test-diagnostics on-failure|never`; i run supplementari hanno usato l’opzione supportata `never` e sono terminati normalmente. Il bundle precedente `/private/tmp/AURINFORMATC-C3.2-V-UIFinal.xcresult` continua a riportare 1 test passato, 0 falliti, mentre il run originario aveva terminato il processo `xcodebuild` con exit 75 dopo circa 600 secondi nella diagnostica post-test. L’anomalia è quindi distinta dall’esito delle asserzioni; con i dati disponibili non si può attribuire la causa interna del timeout oltre al sottosistema di diagnostica/post-test Xcode. Non è stata cambiata alcuna impostazione globale dell’host.
- `git diff --check`: PASS. Il diff non contiene sorgenti produttive né asset, palette o modifiche visuali.

### Riproduzione del fixture Recovery

Ripetere soltanto sul simulatore isolato dedicato, mai su un dispositivo, uno store o un simulatore con dati non sintetici. `simctl uninstall` rimuove l’intero container dell’app del simulatore indicato; la sequenza seguente è quindi distruttiva per quel container, non per il repository:

```sh
SIM=1D3A6979-DF28-40D6-A46C-1A8EC3D5690E
APP_ID=com.aurorabellinipersonalteam.APP
FIXTURE=/private/tmp/AURINFORMATC-C3.2-V-SUPP-RecoveryFixture-repeat.json
DERIVED=/private/tmp/AURINFORMATC-C3.2-V-SUPP-DerivedData
APP="$DERIVED/Build/Products/Debug-iphonesimulator/APP.app"
RESULT="/private/tmp/AURINFORMATC-C3.2-V-SUPP-Recovery-Rerun-$(date +%Y%m%d-%H%M%S).xcresult"

xcodebuild build-for-testing -project app/APP.xcodeproj -scheme APP \
  -destination "platform=iOS Simulator,id=$SIM" -derivedDataPath "$DERIVED" CODE_SIGNING_ALLOWED=NO
xcrun simctl uninstall "$SIM" "$APP_ID"
xcrun simctl install "$SIM" "$APP"
python3 app/scripts/create_synthetic_recovery_fixture.py "$FIXTURE"
APP_DATA=$(xcrun simctl get_app_container "$SIM" "$APP_ID" data)
mkdir -p "$APP_DATA/Library/Application Support/AURINFORMATC/LiveMatchSession"
cp "$FIXTURE" "$APP_DATA/Library/Application Support/AURINFORMATC/LiveMatchSession/live-match-session.json"
xcodebuild test-without-building -project app/APP.xcodeproj -scheme APP \
  -destination "platform=iOS Simulator,id=$SIM" \
  -derivedDataPath "$DERIVED" \
  -resultBundlePath "$RESULT" \
  -only-testing:APPUITests/LiveMatchLifecycleUITests/testTemporallyUncertainRecoveryCanBeCorrectedAndSurvivesRelaunch \
  -parallel-testing-enabled NO -collect-test-diagnostics never CODE_SIGNING_ALLOWED=NO
```

Il file è importato dal bootstrap tramite il reader legacy già esistente e poi la UI legge lo store SwiftData V2; non si scrive direttamente nel database. Per l’esito verificabile usare il result bundle, non il solo codice di compilazione.

### File ed evidenze

Modifiche C3.2-V-SUPP: `app/APPUITests/LiveMatchLifecycleUITests.swift` (copertura UI aggiunta/estesa), `app/scripts/create_synthetic_recovery_fixture.py` (fixture riproducibile), `app/docs/TESTING.md` e `app/docs/STATUS.md`. Nessun file di produzione o progetto Xcode è stato cambiato. I bundle finali conservati sono `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Recovery-Verified2.xcresult`, `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Lifecycle-Verified.xcresult` e `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Regression-Final.xcresult`; i bundle intermedi, inclusi i fallimenti dovuti alle prime asserzioni test-only, restano sotto `/private/tmp/AURINFORMATC-C3.2-V-SUPP-*.xcresult`. Sono conservati anche gli screenshot intermedi Recovery e `/private/tmp/AURINFORMATC-C3.2-V-SUPP-Recovery-Attachments/`, che registra le label `Increment`/`Decrement` e lo stato disabilitato dell’incremento. Il fixture sintetico usato è `/private/tmp/AURINFORMATC-C3.2-V-SUPP-RecoveryFixture.json`. Il DerivedData temporaneo è stato eliminato dopo il completamento dei test. I due simulatori supplementari contengono solo dati sintetici, sono stati spenti con `simctl shutdown` senza cancellarli e sono mantenuti per un retest riproducibile. Il simulatore C3.2-V preesistente non è stato modificato; nessun remote o push.

**Conclusione:** C3.2-V-SUPP è `PARTIAL`: tutti i percorsi supplementari eseguibili sono passati; lock/unlock reale resta `NOT RUN` per indisponibilità di un’interfaccia pubblica adatta. Non dichiarare la persistenza live completamente validata prima del controllo pre-release del lock screen.
