# ADR-0006 — Sessione live operativa in SwiftData

- **Stato:** ACCETTATO — 25 ottobre 2026
- **Ambito:** persistenza locale della sessione live e finalizzazione nello storico
- **Autorità:** il proprietario ha confermato SwiftData come archivio locale operativo principale; il disegno dello schema e del repository è una scelta tecnica di questo checkpoint.

## Contesto

La decisione di prodotto stabilisce che rosa, calendario, storico e sessione live siano persistiti localmente in SwiftData. Il checkpoint C3 aveva invece introdotto JSON come archivio operativo separato in Application Support. Il formato Codable e il recovery temporale sono utili, ma mantenere due sistemi operativi separati non è autorizzato e crea confini divergenti per finalizzazione e recupero.

## Decisione

1. Conservare `MatchManagerSchemaV1` 1.0.0 senza modifiche retroattive. Aggiungere `MatchManagerSchemaV2` 2.0.0 con migrazione leggera additiva V1→V2 e test persistenti di upgrade/riapertura.
2. Rappresentare la sessione come un unico aggregate `StoredLiveMatchSession` in SwiftData: UUID stabile, stato/versione, snapshot completo Codable, generazione precedente e campi di quarantine/recovery. La serializzazione JSON/checksum è un dettaglio interno del payload, non un file operativo.
3. Implementare `LiveMatchSessionRepository` tramite `MatchDataStore`, mantenendo dominio e motore temporale indipendenti da SwiftData e SwiftUI.
4. Usare `StoredLiveSessionImportReceipt` per importare una sola volta i file JSON primary/backup del C3. L'import legge, valida, controlla l'identità, salva, rilegge e registra il completamento. Il reader legacy è in sola lettura: non sposta, riscrive o elimina gli originali. Un backup legacy valido richiede revisione esplicita; sorgenti non leggibili falliscono chiusi e non vengono registrate come import riuscito.
5. Prima della transazione terminale, se la riga salvata è ancora `.active`, scrivere e rileggere come `.finalizing` lo snapshot che contiene il record storico esatto da finalizzare. Il checkpoint è un salvataggio separato e durevole: se fallisce, la sessione attiva resta invariata e non parte alcun effetto sullo storico.
6. La transazione terminale in un solo `ModelContext` confronta o inserisce il record storico con ID sessione stabile e rimuove la sessione. Un errore annulla le modifiche della transazione e lascia recuperabile il checkpoint `.finalizing`; un retry usa lo stesso snapshot. Una ripetizione dopo commit non duplica uno storico equivalente.
7. Conservare recovery e validazione di C3, ricostruendo il motore temporale con un nuovo anchor al caricamento. Nessuna migrazione temporale diversa è introdotta da questa correzione.

## Alternative considerate

- **JSON esterno operativo:** rifiutato come architettura corrente; è mantenuto soltanto come input di migrazione/recupero.
- **Normalizzare ogni campo della sessione in molte entità SwiftData:** non necessario per una singola sessione aggregate senza query/relazioni che lo giustifichino; aumenta il mapping e la superficie di migrazione.
- **Payload Codable interno in una riga SwiftData:** scelto per mantenere atomicità concettuale dello snapshot, preservare il modello di dominio e riutilizzare validazione/recovery esistenti. Le colonne di metadati permettono controlli essenziali senza duplicare tutto il payload.
- **CloudKit/backend/sync o un servizio indipendente:** fuori scope; il backend futuro sarà autorevole per i dati condivisi, mentre l'app deve restare utilizzabile offline.

## Conseguenze, affidabilità e limiti

- SwiftData V2 è la sola fonte operativa locale di live e delle collezioni gestionali. Non mantenere due archivi aggiornati in parallelo.
- La generazione precedente e la quarantine sono salvate nello stesso database: consentono di recuperare una generazione quando il payload corrente è corrotto, ma **non costituiscono un backup indipendente** dalla perdita/corruzione dell'intero store. SHA-256 rileva alterazioni del payload, non garantisce transazioni o backup.
- I file JSON C3 possono rimanere sul dispositivo dopo l'import; ciò è deliberato finché non verrà autorizzata una futura rimozione. Un file legacy non importabile interrompe il bootstrap con un errore esplicito invece di inizializzare una partita vuota.
- I payload futuri non supportati devono fallire chiusi e restare preservati. Evoluzioni SwiftData richiedono nuove versioni di schema; evoluzioni del payload richiedono una strategia versionata esplicita.
- I test C3.2-R1 hanno superato 86 XCTest su iPhone 18 Pro Simulator iOS 27.0, includendo migrazione V1→V2, import sintetico, recovery, errori e finalizzazione. La prova UI manuale di terminazione/rilancio non è stata eseguita perché il Mac era bloccato; nessun dato reale del dispositivo è stato testato.
- Nessun backend, autenticazione, sincronizzazione, CloudKit, PWA o branding dinamico è introdotto.

## Relazione storica

ADR-0005 resta nel repository come resoconto della decisione applicata nel checkpoint C3, ma è SUPERSEDED e non deve guidare implementazioni successive.
