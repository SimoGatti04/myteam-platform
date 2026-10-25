# AURINFORMATC — Istruzioni per gli agenti

Le convenzioni generali e dell'ambiente sono mantenute nel repository fratello `../../development-environment/`. Per attività non banali leggere gli indici e le norme specialistiche pertinenti; non modificare quel repository per incarichi limitati ad AURINFORMATC.

## Contesto e lettura iniziale

- Architettura e decisioni: `docs/ARCHITECTURE.md`, `docs/decisions/`.
- Stato, verifiche e prossimo gate: `docs/STATUS.md`, `docs/TESTING.md`, `docs/MIGRATION_PLAN.md`.
- Funzionalità: `docs/FEATURES.md`.
- Progetto Xcode: `APP.xcodeproj`, scheme `APP`; target app `APP`, XCTest `APPTests`.

## Confini operativi

- L'app di gestione resta nativa iOS, offline-capable. SwiftData è l'unico archivio operativo locale per rosa, calendario, storico e sessione live.
- Lo schema SwiftData V1 è storico e immutato. Evoluzioni successive richiedono nuovi `VersionedSchema`, una migrazione esplicita e test di apertura/riapertura dello store.
- La sessione live è un aggregate Codable salvato **dentro** SwiftData. La generazione precedente e i dati messi in quarantena sono anch'essi nello store. JSON è solo il formato del payload e, per i file C3 già esistenti in Application Support, una sorgente d'importazione in sola lettura. Non reintrodurre un file JSON operativo parallelo.
- Le chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1` restano sorgenti legacy di sola lettura: non cancellarle, non usarle come archivio parallelo e non azzerare le ricevute per reimportarle dopo modifiche operative.
- `MatchTiming` mantiene il contratto temporale validato in C2. Per modificare semantica, snapshot o recovery servono uno scope esplicito e test deterministici sul motore reale.
- Preservare UI, navigazione, asset e palette quando non esplicitamente richiesto. Evitare backend, sincronizzazione, CloudKit, autenticazione, PWA o modelli multi-tenant fuori da uno scope approvato.
- Gli errori di apertura, migrazione, decodifica, verifica e salvataggio devono restare distinguibili da dati assenti; non inizializzare silenziosamente uno store vuoto né presentare scritture fallite come riuscite.
- Git è locale alla root `AURINFORMATC/`; non è configurato alcun remote. Non aggiungere remote né fare push senza richiesta esplicita.
- Usare fixture sintetiche e anonime. Non leggere, copiare o versionare dati personali del dispositivo nei test.
