# Architettura — MAPI GROUP Match Manager

**Stato:** CURRENT descrive il codice dopo C2; PROPOSED descrive confini per evoluzione incrementale. C2 ha estratto solo il motore temporale: il resto dell'applicazione rimane prevalentemente in `ContentView.swift`.

## Contesto e decisione

L'app è un'applicazione iOS SwiftUI locale, a singolo processo, per la gestione di rosa, calendario, partita live ed eventi/storico di una squadra di calcio a 5. Non sono implementati backend, autenticazione, sincronizzazione o branding dinamico. La possibile piattaforma multi-squadra e l'eventuale PWA restano direzioni di prodotto, non decisioni architetturali da implementare ora.

La direzione corrente resta un **monolite modulare interno allo stesso target Xcode**: si estraggono confini coesivi quando danno testabilità o ownership concreta; nessun package per classe, servizio indipendente o layer di passaggio. Vedi [ADR-0001](decisions/ADR-0001-modular-monolith.md).

## CURRENT — componenti effettivi

| Responsabilità | Implementazione | Autorità e limiti |
|---|---|---|
| Entry point e composizione | `MyApp.swift`, `ContentView` | La root view orchestra stato UI e flussi applicativi. |
| UI e navigazione | `ContentView.swift` | Schermate e componenti SwiftUI esistenti; nessun cambio intenzionale di layout, palette o asset in C2. |
| Modelli rosa/calendario/storico | `ContentView.swift`: `RosterPlayer`, `ScheduledMatch`, `MatchPlayer`, `GoalEvent`, `MatchRecord` e collegati | Codable e compatibilità con i payload correnti restano invariati. |
| Motore temporale | `MatchTiming.swift` | Logica deterministica in-process, senza SwiftUI o persistenza; `ContinuousClock` in produzione, clock iniettivo nei test. Possiede fase, attività, tempi di gara, contabilità dei partecipanti e transizioni timeout/intervallo. |
| Coordinamento partita | `ContentView.swift` | `@State` conserva il motore e gli eventi; il timer periodico è solo un trigger di sincronizzazione/refresh UI. Il ritorno a `.active` sincronizza il motore. |
| Contabilità individuale | Registro partecipanti di `MatchTiming` | Il motore è autorevole per i nanosecondi; `MatchPlayer.timePlayed` e `inField` sono proiezioni mantenute per le viste e le logiche esistenti. Cambi e ingressi sincronizzano il motore al confine dell'azione. |
| Partecipazione/rotazione | Funzioni private in `ContentView` | Regole attuali di cambio e suggerimento non sono state riprogettate in C2; ruolo portiere resta un tema separato. |
| Import calendario | `ScheduleCSVImporter` in `ContentView.swift` | Parser statico caratterizzato in C1; non gestisce newline nei campi quotati. |
| Gol e statistiche | `GoalEvent` e funzioni su `matchEvents` | Punteggio live derivato dagli eventi; undo dell'ultimo gol. Lo storico non registra la timeline completa dei cambi. |
| Persistenza | JSON in `UserDefaults.standard` | Rosa, calendario e storico sulle chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`; sessione live non persistita. |
| Design system e asset | `MapiTheme`, componenti SwiftUI e `Assets.xcassets` | Nessun asset o stile visivo è stato modificato intenzionalmente in C2. |

## Contratto temporale CURRENT

### Clock e segmenti

`MatchTiming` misura ciascun segmento attivo come differenza tra un riferimento monotono e la lettura corrente. Non aggiunge un secondo per callback. `Timer.publish(every: 1)` rimane un meccanismo di refresh; se i tick mancano, la successiva sincronizzazione calcola il tempo realmente trascorso. La sorgente di produzione è `ContinuousClock`; i test forniscono un clock controllabile.

Gli stati sono `stopped`, `playing`, `halftimeCountdown` e `timeout`, associati alle fasi `firstHalf`, `halftime`, `secondHalf` e `finished`. La sincronizzazione attribuisce il tempo al solo segmento corrente, poi chiude la fase al suo limite senza trasferire automaticamente il residuo a un nuovo periodo.

- Primo e secondo tempo: 20 minuti ciascuno.
- Intervallo: countdown di 5 minuti avviato esplicitamente; al termine il secondo tempo resta in pausa.
- Time-out: countdown separato di 60 secondi; non incrementa tempo di gara né tempo individuale.
- Pausa: azzera il riferimento attivo; la ripresa crea un nuovo riferimento e non include il tempo di pausa.
- Termine primo tempo: limita il minutaggio a 20 minuti, entra nell'intervallo e si ferma.
- Termine secondo tempo: limita il minutaggio a 20 minuti, marca la partita finita e si ferma.

Un timeout richiesto durante il gioco conserva l'autorizzazione a riprendere. La sua durata è misurata dal clock monotono; alla scadenza esatta il gioco riprende e il motore consuma anche l'eventuale tempo successivo fino all'istante di sincronizzazione, limitandolo al termine del periodo. Perciò una callback ritardata o un ritorno dal background non perde il residuo post-timeout. Se il timeout era iniziato mentre il gioco era in pausa, la scadenza non avvia il gioco. Intervallo e secondo tempo non partono implicitamente attraversando un confine temporale.

### Formazione e partecipanti

La regola applicativa `FutsalMatchRules.timing.requiredStartingPlayers` è la singola fonte del numero richiesto, attualmente cinque. Per il primo avvio il motore richiede distinta/presenze confermate, formazione confermata e cinque partecipanti effettivamente in campo. Un Play prematuro riporta al flusso di preparazione esistente. Confermare la distinta o la formazione non avvia il cronometro: il primo Play deve essere esplicito. La ripresa dopo una pausa non rivaluta il numero iniziale e può avvenire con meno di cinque giocatori in campo.

All'avvio i titolari hanno contabilità pari a zero, così come le riserve. I titolari accumulano dal primo Play; ogni ingresso in campo inizia ad accumulare dal confine dell'azione, ogni uscita conserva il totale, e pause/intervallo/timeout non producono accrediti. La conferma tardiva della formazione non assegna tempo retroattivo.

### Snapshot per C3

`MatchTimingSnapshot` è il contratto Codable minimo preparatorio alla persistenza: versione schema, configurazione, fase/attività, flag di avvio/conferma, tempi accumulati per periodo/intervallo/timeout, owner e intenzione timeout, contatori timeout e partecipanti con ID, nanosecondi accumulati e stato in campo. `capturedAt` è un checkpoint wall-clock fornito dal chiamante, utilizzabile in seguito da un adapter per interpretare l'intervallo successivo alla cattura.

L'anchor monotono di `ContinuousClock` non viene serializzato né ricostruito. C2 **non** salva lo snapshot e **non** ripristina una partita dopo cold start o terminazione del processo. C3 dovrà decidere e testare la politica di recupero, validare versioni/dati parziali e mantenere separati adapter e motore. Le chiavi V1 per rosa/calendario/storico restano intatte.

## PROPOSED — confini interni candidati

Nomi indicativi; estrarre solo quando test o ownership lo giustificano. Tutto resta inizialmente nel target `APP`.

```text
app/APP/
├── App/                         # entry point e composizione SwiftUI
├── Domain/                      # modelli, invarianti e funzioni indipendenti da UI
├── Features/
│   ├── Roster/
│   ├── Calendar/
│   ├── LiveMatch/                # coordinamento SwiftUI della sessione
│   └── History/
├── MatchTiming.swift             # estratto e testato in C2
├── Rotation/                     # regole futsal/MAPI, se estratte con test
├── Import/                       # importer CSV, quando estratto
├── Persistence/                  # adapter locale soltanto in C3
└── DesignSystem/                 # MapiTheme, componenti e asset
```

Dipendenza desiderata: `SwiftUI/features → logica applicativa e dominio`. `MatchTiming` riceve configurazione e sorgente temporale dall'esterno e non dipende dalla UI o dalla persistenza. Le regole specifiche futsal (cinque giocatori, periodi, timeout) sono configurazione applicativa; non si crea ancora un motore cross-platform o un algoritmo di rotazione generico.

## Riuso ed evoluzione

1. **Componente interno (corrente):** `MatchTiming`, parser e regole restano nel repository e nello stesso target.
2. **Package/libreria:** rivalutare solo con un secondo consumer reale, API stabile e lifecycle di rilascio indipendente.
3. **Servizio indipendente:** non giustificato senza deployment, scaling, ownership o trust boundary autonomi.

Modelli/contratti e regole deterministiche sono concettualmente trasferibili a una PWA; il codice Swift non è direttamente riusabile come codice web. Viste, navigazione, lifecycle e adapter locali sono specifici iOS/SwiftUI e sostituibili tramite confini leggeri. Backend, fonte autorevole condivisa, cache locale e branding dinamico restano futuri e non sono formalizzati in C2.

## Dati e persistenza

Fonte di verità corrente: tre payload Codable in `UserDefaults.standard`. I payload live sono memoria del processo; gli errori JSON esistenti usano `try?` e non sono stati modificati in C2. Nessuna chiave V1, migrazione o tecnologia di persistenza è stata cambiata. ADR-0002 resta attivo. C3 dovrà prima definire errori, backup/recupero e semantica cold-start; JSON atomico è il primo candidato da valutare, senza escludere alternative motivate da requisiti reali.

## Trigger di riesame

Rivedere i confini se: la PWA/backend diventano un prodotto approvato; emerge un secondo consumer; servono più account/squadre; la sessione live deve recuperarsi dopo cold start; o i dati/operazioni dimostrano che la persistenza corrente non è adeguata.
