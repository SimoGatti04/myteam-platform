# Test e verifiche — MAPI GROUP Match Manager

## Toolchain e target

- Xcode 27.0 (27A266a), Swift 6.4.0.34.1; Swift language mode 5 (`SWIFT_VERSION = 5.0`).
- Deployment target: iOS 27.0.
- Scheme condiviso: `APP`; target app `APP`; target XCTest `APPTests`.
- Dipendenze esterne rilevate: nessuna SPM/CocoaPods/Carthage.

## Comandi

Dalla root `AURINFORMATC/`:

```sh
xcodebuild -project app/APP.xcodeproj -scheme APP -list
plutil -lint app/APP.xcodeproj/project.pbxproj
xmllint --noout app/APP.xcodeproj/xcshareddata/xcschemes/APP.xcscheme
```

Build app e compilazione dei test senza eseguirli:

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-DerivedData \
  CODE_SIGNING_ALLOWED=NO build-for-testing
```

Per eseguire davvero i test occorre un runtime/device simulatore installato e compatibile; il device può essere in stato Shutdown perché Xcode lo avvia durante il test:

```sh
xcrun simctl list devices available
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=<device disponibile>,OS=<runtime disponibile>' \
  -derivedDataPath /private/tmp/AURINFORMATC-DerivedData \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test
```

Sostituire entrambi i placeholder con una destinazione compatibile mostrata da `xcodebuild -showdestinations`; non indovinare nomi o versioni. Disabilitare il parallel testing mantiene il run su un solo device e riduce i cloni del simulatore. I test non devono essere dichiarati PASS se è stato eseguito solo `build-for-testing`.

## Suite corrente — C1

`app/APPTests/DomainCharacterizationTests.swift` contiene 16 XCTest che usano `@testable import APP` e le implementazioni effettive in `ContentView.swift`; i test non riscrivono il parser né il comportamento dei modelli.

Copertura dei contratti Codable:

- `RosterPlayer`: default legacy senza `active`/`isGoalkeeper`; ID e ruolo espliciti; round-trip.
- `ScheduledMatch`: formato corrente con tutti i campi; campi opzionali assenti; round-trip.
- `MatchPlayer`: default legacy; ID, minuti, `inField`, `playWeight`, `superpower`, portiere; round-trip.
- `MatchRecord` e `PlayerMatchSummary`: record legacy con `rosterPlayerID: null` e campi storici opzionali assenti; record corrente con partecipanti, score, goal/assist e snapshot calendario; round-trip.
- `GoalEvent`: enum squadra e campi marcatrice/assist mancanti; round-trip.

Copertura CSV caratterizzata:

- Delimitatori virgola e punto e virgola; BOM; intestazioni/alias.
- Campi quotati con delimitatori interni e virgolette doppie escaped; ordinamento date.
- Normalizzazione LF, CRLF e CR; campi opzionali vuoti.
- Righe vuote senza avversario e `RIPOSA`; date e valori casa/trasferta non validi.
- Input vuoto, whitespace-only e intestazioni obbligatorie mancanti.
- Comportamento corrente per virgolette non bilanciate e newline in campo quotato (limite noto, non corretto in C1).

Le fixture sono in `app/APPTests/Fixtures/DomainCharacterizationFixtures.swift`. Sono **sintetiche e anonime**: i casi marcati “legacy shape” rappresentano solo la forma derivabile dai campi e dai default Codable documentati nel codice. Non sono dump del dispositivo né prova di compatibilità con payload reali. Valori legacy effettivi/UserDefaults del dispositivo: **non disponibili**. I test non scrivono/leggono le chiavi `FutsalRosterV1`, `FutsalScheduleV1` o `FutsalMatchHistoryV1`, e non sostituiscono una prova d'integrazione sulla persistenza.

## Esito baseline A0 — 22 ottobre 2026

| Controllo | Stato | Risultato effettivo |
|---|---|---|
| Versione toolchain | PASS | `xcodebuild -version`: Xcode 27.0 (27A266a); `swift --version`: Swift 6.4.0.34.1. |
| Enumerazione target/scheme | PASS | `xcodebuild -project app/APP.xcodeproj -scheme APP -list` elenca `APP`, `APPTests` e scheme `APP`. |
| Lint progetto Xcode | PASS | `plutil -lint app/APP.xcodeproj/project.pbxproj`: `OK`. |
| Lint scheme | PASS | `xmllint --noout app/APP.xcodeproj/xcshareddata/xcschemes/APP.xcscheme`: codice 0. |
| Build app + compilazione target test | PASS | Build-for-testing in DerivedData temporaneo isolato termina con `TEST BUILD SUCCEEDED`; il log mostra la compilazione di `DomainCharacterizationTests.swift` per arm64 e x86_64. Test compilati, non lanciati. |
| XCTest eseguiti | UNAVAILABLE / NOT RUN | `xcrun simctl list devices available` non riesce a collegarsi a CoreSimulatorService e non trova runtime. Nessun risultato di test è attribuito PASS. |
| Avvio app / ispezione visiva | NOT RUN | Non è stato avviato un simulatore o device. |
| Dati reali UserDefaults | UNAVAILABLE | Non accessibili dalla workspace; non letti o modificati. |
| Validazione di background/lock/relaunch | NOT RUN | Nessun test su runtime/device in questa fase. |
| Payload UserDefaults da dispositivo | NOT RUN | Solo fixture sintetiche compilate nella suite. |

Durante la prima compilazione non elevata il plugin esterno della macro SwiftUI `State` ha restituito una risposta malformata e la build è fallita; senza modifiche al sorgente, la ripetizione autorizzata in ambiente elevato ha completato la build. Anche la build-for-testing in DerivedData temporaneo isolato è stata ripetuta in ambiente elevato e ha compilato entrambi i target, inclusi i cinque test. Questo indica un limite del contesto di esecuzione/sandbox nella prima prova, non un errore Swift riproducibile nel sorgente.

La build riuscita emette il warning non bloccante AppIntents: estrazione metadata saltata perché il target non dipende da `AppIntents.framework`. Xcode ha inoltre segnalato l'indisponibilità di CoreSimulatorService durante i comandi di enumerazione; questo non ha impedito la compilazione generica, ma ha impedito di lanciare i test nel simulatore.

## Esito C1 — 22 ottobre 2026

| Controllo | Stato | Risultato effettivo |
|---|---|---|
| Xcode/Swift e runtime | PASS | Xcode 27.0 (27A266a), Swift 6.4.0.34.1; runtime iOS Simulator 26.5 e 27.0 presenti. `-showdestinations` ha elencato device iOS 27.0 compatibili. |
| Accesso CoreSimulator nel sandbox | UNAVAILABLE nel sandbox / PASS fuori dal sandbox | I comandi sandboxed hanno riportato connessione CoreSimulator/XPC invalida e accesso negato ai log in `~/Library/Logs`. Le interrogazioni autorizzate fuori sandbox hanno raggiunto CoreSimulatorService e confermato runtime/device: era un limite della sessione di esecuzione, non l'assenza del runtime o una toolchain mancante. Nessuna configurazione host è stata modificata. |
| Cinque XCTest originali eseguiti | FAIL iniziale, poi test expectation corretta | Eseguiti sul simulatore: 4 PASS, 1 FAIL perché il test cercava `riga 4` minuscolo mentre il parser restituisce `Riga 4`. Nessun errore produttivo dimostrato; l'asserzione è stata allineata al testo corrente. |
| Prima esecuzione suite ampliata | FAIL di un'asserzione | 15 test PASS, 1 FAIL: il test classificava come vuoto un input whitespace-only; il parser attuale segnala invece intestazioni obbligatorie mancanti. Test aggiornato per caratterizzare separatamente stringa vuota e whitespace-only. |
| Suite finale `APP` + `APPTests` | PASS | `xcodebuild ... test`, iPhone 18 Pro Simulator iOS 27.0 (24A434), `-parallel-testing-enabled NO`: result bundle `Passed`, **16 PASS, 0 FAIL, 0 SKIPPED**, 24.57 s. Il comando ha compilato entrambi i target ed eseguito realmente XCTest. |
| Payload reali e integrazione UserDefaults | UNAVAILABLE / NOT RUN | Nessun dato del dispositivo è stato consultato o modificato. |
| Timer, background, lock, riapertura, UI end-to-end | NOT RUN | C1 non caratterizza il timer né esegue prove manuali del flusso applicativo. |

Il primo run originale impiegò 638.9 s totali perché, dopo il singolo fallimento, Xcode attese la diagnostica CoreSimulator per il timeout di 600 s; i casi XCTest erano comunque stati eseguiti. Nella prima sessione del runner è stato inoltre osservato il log SwiftUI `Invalid frame dimension (negative or non-finite)` durante l'avvio dell'app host dei test: non ha causato fallimenti ulteriori, non è stato riprodotto come anomalia UI manuale e resta **non classificato**, non un bug confermato. La suite finale non ha segnalato runtime warnings nel riepilogo xcresult.

Comando finale eseguito (percorsi temporanei poi rimossi):

```sh
xcodebuild -quiet -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=94F3DA93-9BEA-4674-AAE8-CE127F97EBF7' \
  -derivedDataPath /private/tmp/AURINFORMATC-C1-20261022-DerivedData \
  -resultBundlePath /private/tmp/AURINFORMATC-C1-final2-20261022.xcresult \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test
```

Per ripeterlo, scegliere un device/runtime presente in `xcrun simctl list devices available`; se CoreSimulator è negato dal sandbox agente, serve esecuzione autorizzata in una sessione che possa accedere al servizio. Una build generica o `build-for-testing` da sola non attribuisce PASS a XCTest.

## Strategia successiva — C2

Prima di cambiare il clock definire la semantica desiderata per background, blocco schermo e terminazione; poi isolare un modello minimo con tempo iniettivo e test deterministici di start/pause/resume, timeout, intervallo, transizione dei tempi, fine gara e contabilità individuale. Conservare UI e durate correnti. La suite C1 rende disponibili i test su iOS Simulator, ma non sostituisce prove manuali di lock/background né la decisione sulla ripresa post-terminazione. Le fixture restano sintetiche e prive di dati personali.
