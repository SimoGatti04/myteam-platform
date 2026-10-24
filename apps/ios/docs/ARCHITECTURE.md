# Architettura — MAPI GROUP Match Manager

**Stato:** architettura corrente dopo C3.1; C3.2 (sessione live durevole) non ancora implementato.

## Contesto e decisioni di prodotto

L'app di gestione resta nativa iOS, in Swift/SwiftUI, e deve funzionare offline. SwiftData è la persistenza locale principale per rosa, calendario e storico. In futuro il backend sarà autorevole per i dati condivisi, mentre la partita deve restare utilizzabile offline; sincronizzazione, conflitti e cache non sono definiti né implementati in C3.1. L'app è destinata a diventare generica per squadre e competizioni, con MAPI GROUP prima utilizzatrice, ma questo checkpoint non aggiunge entità multi-squadra, società, account o ruoli.

Il target rimane un monolite modulare interno a Xcode: estrarre un confine quando porta responsabilità/testabilità reali; nessun package per classe, servizio indipendente o layer cerimoniale. Le opzioni pubblica/privata e la futura PWA non fanno parte del runtime attuale. Riferimenti: ADR-0001, ADR-0003, ADR-0004.

## Componenti effettivi

| Responsabilità | Implementazione | Confine |
|---|---|---|
| Composizione e bootstrap | `MyApp.swift` | Apre il `ModelContainer`, completa la migrazione legacy e carica lo snapshot prima di mostrare l'app. In caso di errore mostra uno stato esplicito, non una schermata vuota. |
| UI, navigazione e stato di presentazione | `ContentView.swift` | Le schermate e i modelli Codable di dominio restano qui. La view usa `MatchDataStore` per le scritture; nessun cambiamento intenzionale a layout, palette o asset. |
| Persistenza locale e adattamento dominio | `MatchDataPersistence.swift` | Possiede schema SwiftData V1, migrazione UserDefaults, letture e salvataggi espliciti di rosa/calendario/storico. Non contiene SwiftUI. |
| Motore temporale in-process | `MatchTiming.swift` | Clock monotono, transizioni e contabilità live deterministiche. Non è ancora salvato: la persistenza della sessione appartiene a C3.2. |
| Contratti di dominio | `RosterPlayer`, `ScheduledMatch`, `MatchRecord` e modelli collegati in `ContentView.swift` | Codable e identificativi restano i contratti di input/output dell'adapter; le entità SwiftData sono distinte dai valori di dominio. |
| Test | `APPTests/` | XCTest reali su modelli di dominio, motore temporale e store SwiftData isolati. Le fixture sono sintetiche e anonime. |

## Schema locale SwiftData V1

Lo schema è dichiarato da `MatchManagerSchemaV1` e `MatchManagerMigrationPlan` in `MatchDataPersistence.swift` (`Schema.Version(1, 0, 0)`). Il piano contiene V1 e nessuno stage perché non esiste uno schema SwiftData precedente da migrare. Le prossime modifiche incompatibili devono introdurre un nuovo `VersionedSchema` e stage espliciti; non modificare retroattivamente V1 dopo una release.

- `StoredRosterPlayer`: UUID applicativo univoco, nome, attivo, portiere e posizione per mantenere l'ordine della rosa.
- `StoredScheduledMatch`: UUID, campi correnti della partita programmata e posizione; la UI conserva la semantica di ordinamento per data.
- `StoredMatchRecord`: UUID, data, durata, punteggi opzionali, metadati di calendario, posizione e distinzione tra `events == nil` e lista vuota.
- `StoredMatchParticipant`: figlio con relazione cascade al record, UUID del riepilogo, UUID opzionale del tesserato, nome snapshot, secondi, gol, assist e posizione.
- `StoredGoalEvent`: figlio con relazione cascade al record, UUID, team raw value validato, secondo di gara, marcatore/assist (ID e nome) e posizione.
- `StoredLegacyImportReceipt`: ricevuta durevole della migrazione delle tre chiavi V1.

Le entità figlie sono normalizzate come righe correlate, non aggregate in un blob JSON. Le relazioni dichiarate sono record storico → partecipanti/eventi; eliminare un record elimina i suoi figli. `rosterPlayerID` nello storico è un'identità/snapshot logico, non una foreign key alla rosa: rimuovere un tesserato non deve cancellarne il passato. `scheduledMatchID` è analogamente un riferimento logico senza cascade: cancellare una voce di calendario non elimina il record storico né il suo ID di origine.

## Autorità e migrazione dati

Dopo un bootstrap riuscito, SwiftData è l'unica fonte operativa di rosa, calendario e storico. `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1` sono lette solo quando manca la ricevuta di importazione; restano conservate come copia legacy di recupero e non vengono più aggiornate. Non esistono due archivi operativi sincronizzati.

Ordine della migrazione:

1. Rilevare la ricevuta durevole nello store.
2. Se assente, leggere ciascun valore UserDefaults senza modificarlo; distinguere chiave assente da valore presente nel tipo errato o JSON invalido.
3. Decodificare e validare tutte le raccolte e gli ID prima di scrivere. ID duplicati, dati malformati o conflitti con ID già presenti interrompono il bootstrap senza sovrascrivere l'origine.
4. Inserire/riconciliare solo righe identiche, usando un `ModelContext` esplicito; commit dei record.
5. Rileggere da un nuovo contesto e confrontare ID e contenuto importato.
6. Solo dopo la verifica, scrivere la ricevuta in un commit separato.

Se il processo termina prima del commit dei record, la migrazione può ripartire dai byte legacy. Se termina dopo i record ma prima della ricevuta, il retry confronta gli ID e il contenuto, evita duplicazioni e completa la verifica. Se non è possibile aprire lo store, decodificare o salvare, l'app non presenta una rosa/storico vuoti come validi. Le chiavi originali non vengono eliminate. La ricevuta evita una reimportazione successiva che sovrascriverebbe modifiche SwiftData.

Le chiavi legacy sono una copia di recupero pre-migrazione, non un backup aggiornato delle modifiche fatte dopo C3.1. Un rollback dopo l'uso operativo di SwiftData richiede il ripristino coerente dello store e/o una strategia di esportazione/backup separata; non cancellare la ricevuta per tentare una reimportazione cieca.

## Scritture e ciclo vita

`MatchDataStore` crea contesti espliciti con autosave disattivato; le operazioni `replaceRoster`, `replaceSchedule`, `replaceHistory` salvano con `save()` e fanno rollback del contesto in caso di errore. La UI applica il nuovo snapshot in memoria solo dopo il successo del salvataggio e mostra un messaggio d'errore altrimenti. Il bootstrap è sincrono prima della schermata funzionale. Nessun fallback a un nuovo store vuoto è configurato.

## Confine C3.2

C3.1 non salva né ripristina `MatchTiming`, lo stato live o i dati temporanei di formazione. C3.2 dovrà aggiungere un modello sessione distinto, con UUID stabile, snapshot temporale serializzabile, riferimento/versone di salvataggio e stato di finalizzazione, senza incorporare SwiftUI o UserDefaults nel motore. Restore dopo cold start, riconciliazione temporale e finalizzazione non sono verificati né dichiarati implementati.
