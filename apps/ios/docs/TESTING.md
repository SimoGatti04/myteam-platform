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
  -derivedDataPath /private/tmp/AURINFORMATC-A0-DerivedData \
  CODE_SIGNING_ALLOWED=NO build-for-testing
```

Per eseguire davvero i test occorre prima avere un runtime/device simulatore installato e attivo:

```sh
xcrun simctl list devices available
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=<simulatore disponibile>' \
  -derivedDataPath /private/tmp/AURINFORMATC-A0-DerivedData \
  CODE_SIGNING_ALLOWED=NO test
```

Non sostituire `<simulatore disponibile>` con un nome non presente nell'inventario. I test non devono essere dichiarati PASS se è stato eseguito solo `build-for-testing`.

## Suite corrente

`app/APPTests/DomainCharacterizationTests.swift` contiene cinque test XCTest che invocano i tipi reali dell'app tramite `@testable import APP`:

1. `RosterPlayer` decodifica un payload senza `active` e `isGoalkeeper` con i default correnti.
2. `MatchPlayer` decodifica un payload che omette i campi aggiunti della distinta con i default correnti.
3. `MatchRecord` decodifica un record privo dei campi storici opzionali.
4. `ScheduleCSVImporter` gestisce BOM, delimitatore `;`, campo quotato con delimitatore, `RIPOSA` e data non valida con numero di riga.
5. `ScheduleCSVImporter` rifiuta intestazioni obbligatorie mancanti.

I payload attuali sono sintetici, non estratti dai dati personali del dispositivo. Coprono una parte della retrocompatibilità; non equivalgono a una migrazione verificata di tutti i payload o a test d'integrazione di `UserDefaults`.

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

## Strategia successiva

Ordine minimo: (1) eseguire e ampliare i characterization test; (2) test deterministici del timer con clock controllabile; (3) round-trip e fallimenti della persistenza usando fixture anonime; (4) casi di rotazione/ruolo; (5) test del flusso storico/eventi; (6) collaudo UI/device. Per comportamento di OS lifecycle e file import, i test sintetici non sostituiscono prove reali su simulatore/dispositivo.

Usare i livelli unit/integration/UI solo se proteggono un rischio reale; non fissare target arbitrari di coverage. Le fixture non devono contenere dati personali delle atlete.
