# AURINFORMATC — Istruzioni per gli agenti

Le convenzioni generali e dell'ambiente sono mantenute nel repository fratello `../../development-environment/`. Per un'attività non banale leggere gli indici e le norme pertinenti prima di modificare file; non modificare quel repository per un incarico limitato ad AURINFORMATC.

## Contesto e lettura iniziale

- Architettura e decisioni: `docs/ARCHITECTURE.md`, `docs/decisions/`.
- Stato e prossima attività: `docs/STATUS.md`, `docs/MIGRATION_PLAN.md`.
- Funzionalità e verifiche: `docs/FEATURES.md`, `docs/TESTING.md`.
- Progetto Xcode: `APP.xcodeproj`, scheme `APP`; target app `APP`, XCTest `APPTests`.

## Confini operativi

- L'app privata rimane nativa iOS, offline-capable. SwiftData è la fonte locale operativa di rosa, calendario e storico.
- Le chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1` sono solo sorgenti legacy pre-migrazione: non cancellarle, non aggiornarle come archivio parallelo, non azzerare la ricevuta per reimportarle dopo modifiche operative.
- Evoluzioni SwiftData: introdurre un nuovo `VersionedSchema` e migrazioni esplicite e testate; non modificare uno schema rilasciato in-place.
- La sessione live non è persistita fino a C3.2. Non dichiarare il cold-start recovery e non cambiare la semantica di `MatchTiming` fuori scope.
- Preservare UI, asset e palette quando non esplicitamente richiesto. Evitare backend, CloudKit, sync, autenticazione e PWA fuori da un incarico approvato.
- Git è locale alla root `AURINFORMATC/`; non è configurato alcun remote. Non fare push né aggiungere remote senza richiesta esplicita.
- Errori di apertura/lettura/salvataggio non devono essere convertiti in stato apparentemente vuoto o successo. Aggiornare lo stato e le verifiche solo dopo averle effettivamente eseguite.
