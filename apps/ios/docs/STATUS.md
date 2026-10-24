# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 24 ottobre 2026 — checkpoint C3.1

## Stato corrente

C3.1 è completato: SwiftData è la fonte locale operativa per rosa, calendario e storico, con migrazione una tantum, idempotente e recuperabile dalle tre chiavi UserDefaults V1. Lo schema è V1 (`1.0.0`); la sessione live non è ancora persistita. Build e suite XCTest integrata C1+C2+C3.1 sono state verificate su simulatore iOS.

Questa verifica non prova la migrazione dei dati effettivi di un dispositivo, la validità dello store preesistente dell'utente o il recupero live dopo terminazione. Vedi `TESTING.md`.

## Baseline e repository

- Repository locale: root `AURINFORMATC/`, branch `main`, baseline di C2 `8b834a1`.
- Nessun remote configurato; nessun push previsto.
- Prima delle modifiche C3.1 il working tree del repository era pulito e HEAD coincideva con la baseline indicata.
- C3.1 è stato registrato con commit locali separati per implementazione, test e documentazione; nessun remote o push. Il working tree finale è pulito.
- Il repository fratello `development-environment/` presentava modifiche preesistenti non correlate; non è stato modificato.
- Progetto Xcode: `app/APP.xcodeproj`, scheme `APP`, target app `APP`, XCTest `APPTests`.
- Ambiente verificato: Xcode 27.0; runtime simulatore iOS 27.0; destinazione iPhone 18 Pro Simulator.

## Persistenza e compatibilità

- SwiftData V1: `StoredRosterPlayer`, `StoredScheduledMatch`, `StoredMatchRecord`, `StoredMatchParticipant`, `StoredGoalEvent`, `StoredLegacyImportReceipt`.
- Migrazione iniziale da `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`; le chiavi originali rimangono intatte.
- Ricevuta salvata solo dopo rilettura e verifica del contenuto. In caso di dati corrotti, conflitto o errore di store/salvataggio, il bootstrap non mostra l'app come vuota.
- Le fixture sono anonime e sintetiche; non sono stati letti o copiati dati personali reali.
- La sessione live resta solo in memoria; recovery e persistenza della partita corrente sono scope C3.2.

## Funzionalità e rischi aperti

- Le funzionalità rosa/calendario/storico e il motore MatchTiming restano quelli dei checkpoint precedenti, con SwiftData integrato per i dati conclusi e anagrafici.
- Non è stata effettuata una prova visuale end-to-end o una migrazione da un backup reale di dispositivo.
- Le chiavi UserDefaults sono copie precedenti alla migrazione: non rappresentano gli aggiornamenti successivi nello store.
- Un aggiornamento incompatibile dello schema SwiftData deve introdurre un nuovo `VersionedSchema` e una migrazione testata prima della distribuzione.
- Backend, sincronizzazione, autenticazione, CloudKit, PWA, multi-squadra e branding dinamico non sono stati introdotti.

## Verifiche C3.1 effettivamente eseguite

- Build app + target test via `xcodebuild build-for-testing` su destinazione generica iOS Simulator: PASS.
- Suite C1+C2+C3.1 via `xcodebuild test`, iPhone 18 Pro, iOS 27.0: **53 PASS, 0 FAIL, 0 SKIPPED**.
- Copertura SwiftData con store in-memory e store persistenti temporanei: migrazione delle tre raccolte, identità/ordine/campi, campi opzionali legacy, ricevuta, retry, conflitti, dati corrotti, write failure, store non apribile, CRUD, relazioni storico, chiusura/riapertura.
- Gli XCTest hanno usato solo fixture sintetiche; nessun device reale è stato migrato.
- Revisione finale di codice e diff completata: `git diff --check` PASS; nessuna modifica a `MatchTiming.swift`, asset o configurazione del progetto; modifiche produttive limitate al confine dati/bootstrap e ai punti CRUD/storico interessati. Verifica visuale/manuale dell'interfaccia: NOT RUN.

## Prossimo checkpoint

C3.2: persistenza locale della sessione live con UUID stabile, snapshot serializzabile di stato/fase/timing/partecipanti, riferimenti temporali e stato di finalizzazione; test di cold-start recovery, interruzioni, idempotenza e coerenza con `MatchTiming`. Mantenere offline il funzionamento e non introdurre backend o sincronizzazione in questo scope.
