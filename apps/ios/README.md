# MAPI GROUP Match Manager — iOS

App nativa iOS per gestire rosa, calendario, partita live, eventi e storico di calcio a 5. L'interfaccia è SwiftUI; SwiftData V3 è l'archivio operativo locale per dati gestionali e sessione live. Il JSON è usato come formato del payload e come sorgente di sola lettura per importare i file live del precedente C3. Per lo stato di build e test del candidato monorepo consultare [`docs/STATUS.md`](docs/STATUS.md) e [`../../docs/platform/IOS-MONOREPO-MIGRATION.md`](../../docs/platform/IOS-MONOREPO-MIGRATION.md).

## Aprire e compilare

1. Dalla root del monorepo aprire `apps/ios/APP.xcodeproj` con Xcode.
2. Selezionare lo scheme condiviso `APP` e un runtime iOS installato.
3. Avviare con **Product → Run** (⌘R).

Build senza firma per simulatore:

```sh
xcodebuild -project apps/ios/APP.xcodeproj \
  -scheme APP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/myteam-platform-ios-R1-A3-DerivedData \
  CODE_SIGNING_ALLOWED=NO build
```

La suite `APPTests` contiene test sui contratti Codable/CSV, sul motore temporale, sullo snapshot/recovery della sessione live e sulla migrazione/persistenza SwiftData. Per i comandi e i limiti verificati, consultare [`docs/TESTING.md`](docs/TESTING.md).

## Struttura essenziale

```text
myteam-platform/
├── AGENTS.md
└── apps/
    └── ios/
        ├── AGENTS.md
        ├── .gitignore
        ├── APP.xcodeproj/
        ├── APP/
        │   ├── MyApp.swift                 # apertura container e bootstrap/migrazione
        │   ├── ContentView.swift           # UI e flussi esistenti
        │   ├── MatchTiming.swift           # motore temporale deterministico
        │   ├── MatchDataPersistence.swift   # schema SwiftData e adapter dominio
        │   ├── LiveMatchSession.swift      # aggregate snapshot e restore validato
        │   └── Assets.xcassets/            # asset MAPI GROUP invariati
        ├── APPTests/                       # XCTest + fixture sintetiche anonime
        ├── APPUITests/                     # test UI
        ├── scripts/
        └── docs/                           # architettura, stato, decisioni e piano
```

## Dati

Al primo avvio, il bootstrap importa `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1` in SwiftData. Mantiene i payload legacy e una ricevuta durevole; non continua a scrivere in UserDefaults. Se apertura, decode, verifica o salvataggio falliscono, l'app mostra un errore e non simula uno store vuoto. Le chiavi legacy sono una copia pre-migrazione, non un backup degli aggiornamenti successivi.

La sessione live, la rosa, il calendario e lo storico sono persistiti operativamente nello stesso store SwiftData. L'import dei file JSON legacy mantiene gli originali; non è un archivio parallelo. Backend, sincronizzazione e CloudKit non sono presenti. Gli esiti dei test sono legati al commit e al result bundle indicati in `docs/STATUS.md`; le fixture CSV sono sintetiche e il calendario reale è escluso dal candidato pubblicabile. Consultare `docs/STATUS.md`, `docs/TESTING.md` e `docs/ARCHITECTURE.md`.
