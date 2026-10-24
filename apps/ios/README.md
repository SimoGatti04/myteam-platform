# MAPI GROUP Match Manager — iOS

App nativa iOS per gestire rosa, calendario, partita live, eventi e storico di calcio a 5. L'interfaccia è SwiftUI; i dati gestionali locali usano SwiftData. La sessione live usa un aggregate JSON locale versionato con recovery deterministico; una prova manuale kill/relaunch resta da eseguire.

## Aprire e compilare

1. Aprire `app/APP.xcodeproj` con Xcode.
2. Selezionare lo scheme condiviso `APP` e un runtime iOS installato.
3. Avviare con **Product → Run** (⌘R).

Build senza firma per simulatore:

```sh
xcodebuild -project app/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/AURINFORMATC-DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

La suite `APPTests` contiene test sui contratti Codable/CSV, sul motore temporale, sullo snapshot/recovery della sessione live e sulla migrazione/persistenza SwiftData. Per i comandi e i limiti verificati, consultare [`docs/TESTING.md`](docs/TESTING.md).

## Struttura essenziale

```text
AURINFORMATC/
├── AGENTS.md
├── .gitignore
└── app/
    ├── APP.xcodeproj/                  # scheme APP, target APP e APPTests
    ├── APP/
    │   ├── MyApp.swift                 # apertura container e bootstrap/migrazione
    │   ├── ContentView.swift           # UI e flussi esistenti
    │   ├── MatchTiming.swift           # motore temporale deterministico
    │   ├── MatchDataPersistence.swift   # schema SwiftData V1 e adapter di persistenza
    │   ├── LiveMatchSession.swift       # aggregate snapshot e restore validato
    │   ├── LiveMatchSessionPersistence.swift # archivio JSON, backup e finalizzazione
    │   ├── LiveMatchSessionViews.swift  # recovery/error UI riusata
    │   └── Assets.xcassets/            # asset MAPI GROUP invariati
    ├── APPTests/                       # XCTest + fixture sintetiche anonime
    ├── calendario_mapi_2026_2027.csv
    └── docs/                           # architettura, stato, decisioni e piano
```

## Dati

Al primo avvio, il bootstrap importa `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1` in SwiftData. Mantiene i payload legacy e una ricevuta durevole; non continua a scrivere in UserDefaults. Se apertura, decode, verifica o salvataggio falliscono, l'app mostra un errore e non simula uno store vuoto. Le chiavi legacy sono una copia pre-migrazione, non un backup degli aggiornamenti successivi.

La partita live è persistita localmente in JSON; rosa, calendario e storico restano in SwiftData. Backend, sincronizzazione e CloudKit non sono presenti. Il recovery è verificato con XCTest sintetici, non con una prova manuale di terminazione/rilancio: consultare `docs/STATUS.md`.
