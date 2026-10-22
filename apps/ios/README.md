# MAPI GROUP Match Manager — iOS

App iOS locale per la gestione della squadra di calcio a 5 MAPI GROUP: rosa, calendario, partita live, eventi e storico. La UI è realizzata in SwiftUI. La presa in carico A0 ha consolidato la baseline e la documentazione senza modificare il comportamento o la grafica dell'app.

## Aprire e compilare

1. Aprire `app/APP.xcodeproj` con Xcode.
2. Selezionare lo scheme condiviso `APP` e un simulatore iOS installato.
3. Avviare con **Product → Run** (⌘R).

Build da terminale (firma disabilitata, destinazione generica simulatore):

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

Il target `APPTests` contiene characterization test per i modelli Codable e il parser CSV, oltre ai test deterministici del motore temporale. Per compilare app e test senza eseguirli:

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-DerivedData \
  CODE_SIGNING_ALLOWED=NO build-for-testing
```

Per eseguire i test serve un runtime/dispositivo simulatore iOS disponibile. Procedura e stato verificato: [`docs/TESTING.md`](docs/TESTING.md).

## Struttura attuale

```text
AURINFORMATC/
├── AGENTS.md
├── .gitignore
├── backups/                         # locale, esclusa da Git; preservata
└── app/
    ├── APP.xcodeproj/               # scheme APP condiviso, target APP e APPTests
    ├── APP/
    │   ├── MyApp.swift              # entry point SwiftUI
    │   ├── ContentView.swift        # UI, modelli, logica, import e persistenza attuali
    │   └── Assets.xcassets/
    ├── APPTests/                    # test XCTest
    ├── calendario_mapi_2026_2027.csv
    ├── grafica/                     # sorgenti e varianti grafiche
    └── docs/                        # architettura, audit, stato, piano e test
```

`ContentView.swift` resta il monolite principale (la UI e molte logiche non temporali vi risiedono); C2 ha estratto soltanto `MatchTiming.swift`. Ulteriori separazioni saranno incrementali e basate su test. Vedi [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tecnologia e dati

- Xcode 27.0; toolchain Swift 6.4.0; modalità linguaggio Swift 5; deployment target iOS 27.0 (baseline 22 ottobre 2026).
- Un target app iOS, un target XCTest introdotto in A0; nessuna dipendenza SPM/CocoaPods/Carthage rilevata.
- Rosa, calendario e storico sono codificati JSON nei tre valori `UserDefaults.standard` con chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`.
- La sessione live non è ancora persistita né recuperabile dopo cold start; `MatchTimingSnapshot` è solo un contratto preparatorio per C3.
- Nessun backend o sincronizzazione cloud.

La descrizione completa di comportamenti implementati e requisiti pianificati è in [`docs/FEATURES.md`](docs/FEATURES.md); lo stato delle verifiche è in [`docs/STATUS.md`](docs/STATUS.md).
