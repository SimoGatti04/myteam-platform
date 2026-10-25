# Architettura — MAPI GROUP Match Manager

**Aggiornato:** 25 ottobre 2026 — correzione C3.2-R1 e verifica del checkpoint di finalizzazione.
**Stato:** persistenza locale operativa della sessione live in SwiftData V2; suite integrata di 89 XCTest superata. La prova manuale UI di terminazione/rilancio non è stata eseguibile perché il Mac era bloccato.

## Contesto e decisioni di prodotto

L'app privata resta nativa iOS, in Swift/SwiftUI, e deve funzionare offline. SwiftData è la fonte operativa locale per rosa, calendario, storico e sessione live. Il backend futuro sarà autorevole per i dati condivisi, ma non sono implementati backend, sincronizzazione, conflitti o cache. Il prodotto è destinato a diventare generico per squadre e competizioni, con MAPI GROUP prima utilizzatrice; non sono introdotti modelli di società, account, ruoli o autenticazione.

Il target resta un monolite modulare interno a Xcode: estrarre confini quando apportano responsabilità o testabilità concrete; nessun package per classe, servizio indipendente o layer cerimoniale. Sito pubblico, branding dinamico, area privata web e scelta PWA non fanno parte del runtime attuale. Riferimenti: ADR-0001, ADR-0003, ADR-0004 e ADR-0006. ADR-0005 documenta una precedente scelta ora superata, mantenuta per la storia.

## Componenti effettivi

| Responsabilità | Implementazione | Confine |
|---|---|---|
| Composizione e bootstrap | `MyApp.swift` | Apre il `ModelContainer`, importa prima le sorgenti legacy quando necessario e carica dati/sessione. Gli errori d'apertura o migrazione sono espliciti, non schermate vuote. |
| UI, navigazione e presentazione | `ContentView.swift`, `LiveMatchSessionViews.swift` | SwiftUI e stato di presentazione. I modelli di dominio restano indipendenti da SwiftData; l'aspetto ordinario non è cambiato in C3.2-R1. |
| Persistenza locale e adattamento dominio | `MatchDataPersistence.swift` | Schema versionato, import una tantum delle chiavi UserDefaults V1, CRUD e salvataggi espliciti per rosa/calendario/storico. |
| Persistenza sessione live | `SwiftDataLiveMatchSessionPersistence.swift` | Adapter `MatchDataStore` per load/save, generazione precedente, quarantena, import JSON pregresso e finalizzazione nello stesso store SwiftData. |
| Contratto e formato legacy | `LiveMatchSessionPersistence.swift` | Protocollo di repository, envelope Codable con checksum e reader in sola lettura dei file JSON prodotti dal precedente C3. I file legacy non sono più scritti. |
| Dominio e recovery temporale | `LiveMatchSession.swift`, `MatchTiming.swift` | Snapshot di dominio, validazione e policy di recovery; `MatchTiming` usa clock monotono durante il processo e viene ricostruito con un anchor nuovo dopo cold start. |

## Schema e fonte autorevole locale

- `MatchManagerSchemaV1` (1.0.0) rimane invariato e contiene rosa, calendario, storico, partecipanti, eventi e ricevuta d'import UserDefaults.
- `MatchManagerSchemaV2` (2.0.0) aggiunge `StoredLiveMatchSession` e `StoredLiveSessionImportReceipt`. Il `MigrationStage` leggero V1→V2 è stato esercitato con uno store V1 popolato, chiuso, riaperto con V2 e riaperto una seconda volta.
- `StoredLiveMatchSession` è una singola riga per l'unica sessione live: UUID stabile, versione e stato, documento Codable completo, generazione corrente/precedente, dati di quarantena e metadati di revisione. Il JSON con checksum è un formato interno del payload, non un archivio esterno.
- La generazione precedente e la quarantena proteggono da payload corrotti o da scritture/recuperi di sessione. Non sono un backup indipendente del file database e il checksum non costituisce una garanzia transazionale o un backup dell'intero store.
- `StoredLiveSessionImportReceipt` registra l'import controllato della sorgente JSON C3, inclusa la decisione di non trovare file. L'import legge primary e backup, valida, controlla gli UUID, verifica il readback e conserva i file originali. Un primary illeggibile con backup valido richiede conferma di recovery; sorgenti non leggibili non creano sessioni vuote né ricevute di successo.
- Le chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1` restano sorgenti di importazione di sola lettura. Dopo la ricevuta, SwiftData è la fonte usata dall'app; i due sistemi non vengono mantenuti sincronizzati.
- Finalizzazione: prima della transazione terminale, una sessione attiva viene salvata e riletta come snapshot durevole `.finalizing`, inclusivo del record storico esatto da inserire. Poi un singolo `ModelContext` verifica l'identità, inserisce o confronta il record e rimuove la sessione nella stessa transazione. Se il checkpoint non si salva resta la sessione attiva; se fallisce la transazione terminale, questa viene annullata e resta recuperabile il checkpoint `.finalizing`. Il retry usa quell'intento e una finalizzazione già committata non duplica uno storico equivalente.

## Contratti e recovery

`LiveMatchSessionSnapshot` conserva fase e stato temporale, UUID, formazione, partecipanti snapshot, eventi/assist e collegamento alla partita programmata. I nomi/statistiche storici sono snapshot, quindi una rimozione dalla rosa corrente non cancella lo storico. Le durate del gioco continuano a derivare da `MatchTiming`; non si duplicano come fonte autorevole parallela.

Il reader legacy JSON non scrive, sposta o elimina i file in Application Support. I payload non validi, le versioni future e i conflitti fanno fallire l'operazione in modo esplicito. Il recovery usa le policy esistenti di C3 per timestamp monotoni/civili, timeout, intervallo e limiti di periodo; la prova XCTest non equivale a una verifica su dati reali, reboot reale o cold start UI manuale.

## Evoluzione

Per nuove entità o cambi incompatibili: conservare gli schemi rilasciati, creare una nuova `VersionedSchema`, definire la migrazione e testare store sintetici persistenti prima di distribuire. C3.2-R1 non introduce CloudKit, backend, API, sync, autenticazione, branding dinamico o PWA. La sessione resta indipendente da SwiftUI e serializzabile per la successiva evoluzione, senza anticipare un contratto backend non ancora definito.
