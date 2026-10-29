# Architettura — MAPI GROUP Match Manager

**Aggiornato:** 27 ottobre 2026 — C3.3: cronologia presenze e correzioni live/storico.
**Stato:** C3.3 aggiunge timeline delle presenze e correzioni controllate live/storico; SwiftData V3 è lo schema locale corrente. Regressione completa su iOS Simulator: 122 test PASS, con due runtime warning UI da isolare; device fisico e lock/unlock non verificati.

## Contesto e decisioni di prodotto

L'app privata resta nativa iOS, in Swift/SwiftUI, e deve funzionare offline. SwiftData è la fonte operativa locale per rosa, calendario, storico e sessione live. Il backend futuro sarà autorevole per i dati condivisi, ma non sono implementati backend, sincronizzazione, conflitti o cache. Il prodotto è destinato a diventare generico per squadre e competizioni, con MAPI GROUP prima utilizzatrice; non sono introdotti modelli di società, account, ruoli o autenticazione.

Il target resta un monolite modulare interno a Xcode: estrarre confini quando apportano responsabilità o testabilità concrete; nessun package per classe, servizio indipendente o layer cerimoniale. Sito pubblico, branding dinamico, area privata web e scelta PWA non fanno parte del runtime attuale. Riferimenti: ADR-0001, ADR-0003, ADR-0004, ADR-0006 e ADR-0007. ADR-0005 documenta una precedente scelta ora superata, mantenuta per la storia.

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
- `MatchManagerSchemaV3` (3.0.0), corrente da C3.3, aggiunge `StoredMatchCorrectionMetadata` e migration stage leggero V2→V3; V1/V2 e le relative stage restano dichiarate. I test verificano apertura/migrazione dello store e round-trip della metadata storica.
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

## C3.3 — cronologia delle presenze e correzioni (27 ottobre 2026)

**Stato: IMPLEMENTATO.** `MatchTiming` rimane l'unica autorità per tempo di gara, partecipanti in campo e secondi individuali; `Timer.publish` e i refresh SwiftUI non sono fonti di minutaggio. `MatchParticipationTimeline.swift` registra confini di ingresso/uscita per giocatore, periodo, nanosecondo di gara, sequenza e origine. Sostituzioni allo stesso secondo sono ordinate e correlate da un ID stabile.

La timeline distingue copertura completa dall'inizio e copertura parziale. Per snapshot C2 senza eventi di sostituzione, il ripristino mantiene i secondi già osservati come baseline e marca da quando la ricostruzione è attendibile: non genera retroattivamente cambi né presume una storia non registrata. La correzione del clock ricalcola soltanto i partecipanti coperti da una timeline valida; le rettifiche individuali sono conservate separatamente e non vengono sovrascritte dai successivi avanzamenti o restore.

`MatchCorrectionEngine` produce proposte per i record storici, con riepilogo degli elementi coinvolti, ricalcolo derivato quando i dati sono sufficienti e undo limitato alla correzione precedente. `LiveMatchEventCorrectionEngine` valida aggiunta/modifica/cancellazione degli eventi live e conserva gli ID degli eventi modificati. Punteggio e statistiche derivano dagli eventi. Le viste di correzione sono contestuali in `ContentView.swift` e `LiveMatchCorrectionViews.swift`; i dati diventano confermati solo dopo il salvataggio.

La sessione live usa payload Codable schema 3 (migrazione esplicita dai precedenti payload 1 e 2); il sotto-snapshot `MatchTiming` è schema 2, la metadata di correzione temporale è schema 2, la timeline è schema 1 e la metadata di correzione eventi live è schema 1. SwiftData passa a `MatchManagerSchemaV3`, aggiungendo `StoredMatchCorrectionMetadata` con migrazione leggera V2→V3; V1 e V2 restano dichiarati e immutati. La metadata storica è memorizzata separatamente dal record base per non riscrivere o reinterpretare i dati legacy.

**Limiti:** undo è intenzionalmente limitato e non è event sourcing generale. La correzione di conflitti temporali non ricostruisce automaticamente eventi futuri. Non è stata eseguita una prova su dispositivo fisico, né una prova reale di lock/unlock. La suite su simulatore riporta due warning SwiftUI di frame non valido, pur con tutti i test passati: non vanno considerati risolti finché non isolati.

## myteam-platform — Sincronizzazione, gerarchia delle fonti e regole di piattaforma (27 ottobre 2026)

**Stato: APPROVATO (in attesa di progettazione ed esecuzione).**
Riferimenti: ADR-0008, Registro delle decisioni myteam-platform e Addendum 27 ottobre 2026.

### 1. Confine architetturale dell'app iOS e sincronizzazione offline-first
L'app iOS privata mantiene il modello operativo offline-first e il proprio ciclo vitale locale in SwiftData (attualmente V3 da C3.3):
- Nessuna operazione di campo (avvio tempo, cambi, gol, correzioni, pause, finalizzazione) dipende dalla connettività di rete o da risposte del server.
- Le mutazioni operative generano elementi accodati in una coda locale persistente (`SyncQueue`), memorizzata in modo affidabile prima della trasmissione.
- La trasmissione verso il backend avviene via HTTPS con identificativi operativi univoci, conferme esplicite (ACK) e ritrasmissione idempotente senza duplicazioni.
- In caso di riapertura dell'app o ripristino post-disconnessione, la coda garantisce la continuità senza perdita di eventi locali.
- I dettagli dei payload, dell'autenticazione, delle versioni e delle strutture di persistenza della coda rimangono da progettare prima dell'implementazione.

### 2. Backend autoritativo e distribuzione SSE
Il backend è l'autorità per la memorizzazione condivisa, la riconciliazione delle fonti concorrenti e la distribuzione pubblica:
- Riceve ed elabora gli aggiornamenti dalla coda dell'app iOS.
- Notifica in tempo reale i client web/PWA mediante Server-Sent Events (SSE) senza ricaricamento della pagina.
- Applica una maschera di proiezione (Public DTO) prima di esporre i dati ai visitatori pubblici.
- Gestisce la riconnessione dei client web consentendo il recupero dello stato completo coerente.

### 3. Gerarchia delle fonti e riconciliazione per campo
La convergenza dei dati di partita segue una gerarchia rigida a 4 livelli:
1. **Correzioni manuali dell'amministratore** (priorità massima, non sovrascrivibili automaticamente).
2. **CSI o fonte esterna ufficiale** (omologazione risultati/referto ufficiale).
3. **CSI o fonte esterna ufficiosa** (risultati provvisori/non omologati).
4. **App iOS privata** (dati operativi dal campo).

Principi vincolanti:
- **La priorità prevale sempre sulla recenza**: una fonte di livello inferiore non può sovrascrivere un dato già stabilito da una fonte di livello superiore, anche se pervenuta con timestamp successivo.
- **Riconciliazione granulare per singolo dato/campo**: se una fonte superiore fornisce solo alcuni campi (es. CSI fornisce solo il risultato finale 4-2 ma non i marcatori e gli assist), i campi non coperti mantengono il valore fornito dalla fonte inferiore (app iOS).
- **Tracciabilità e revocabilità**: ogni dato originario rimane tracciabile nello storico del backend; le correzioni amministrative non vengono sovrascritte automaticamente e possono essere revocate solo esplicitamente dall'amministratore.
- Le correzioni operative dell'app iOS non equivalgono automaticamente a un override amministrativo: ruolo e autorizzazione saranno definiti nei contratti di sincronizzazione.

### 4. Statistiche aggregate e confini di visibilità
- **Solo partite concluse**: le statistiche aggregate di squadra (partite giocate, vittorie, pareggi, sconfitte, gol fatti/subiti, differenza reti, percentuale vittorie, andamento, posizione) e dei singoli giocatori (presenze, gol, cartellini, premi vinti, relative classifiche) considerano esclusivamente le gare concluse.
- **Isolamento LIVE**: gli eventi della partita in corso aggiornano la Home e la schermata di dettaglio partita (via SSE), ma non modificano alcuna statistica aggregata.
- **Ricalcolo reattivo**: alla conclusione della gara e dopo ogni correzione manuale o importazione prevalente, le statistiche aggregate coinvolte vengono ricalcolate.
- **Riservatezza dei dati**:
  - *Pubblici*: dettaglio dei singoli gol (inclusi marcatore, minuto, tempo e assistman del gol).
  - *Privati*: minutaggi complessivi individuali, statistiche aggregate sugli assist (totale, media) e relative classifiche.

### 5. Riconoscimenti (POTM e Player of the Month)
- Assegnati tramite il modulo unificato di votazioni.
- Ammissione esplicita dei pari merito: più vincitori possono condividere lo stesso riconoscimento.
- Ogni vincitore condiviso riceve l'attribuzione completa (+1) nelle statistiche individuali, preservando lo storico condiviso.

### 6. Integrazione CSI opzionale
- Subordinata alla verifica empirica di semplicità e affidabilità.
- Controlli mirati post-partita con intervalli progressivi e cessazione immediata all'acquisizione del risultato ufficiale.
- In caso di impraticabilità, la piattaforma opera unicamente tramite app iOS e area amministrativa.
