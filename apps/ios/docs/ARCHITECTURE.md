# Architettura — MAPI GROUP Match Manager

**Stato:** CURRENT descrive il codice verificato in A0; PROPOSED descrive confini per l'evoluzione incrementale. Non è avvenuta una modularizzazione del codice in A0.

## Contesto e decisione

L'app è oggi una singola applicazione iOS SwiftUI, locale e a un solo processo, mantenuta in un unico progetto Xcode. L'uso attuale è la gestione della rosa, calendario, partita live e storico di una squadra di calcio a 5. Non sono presenti backend, sincronizzazione, autenticazione o dipendenze esterne rilevate. La futura piattaforma MAPI GROUP e l'eventuale PWA sono possibilità, non requisiti implementativi attuali.

La direzione scelta è un **monolite modulare interno al target Xcode**. I confini sono introdotti quando una porzione viene effettivamente testata o modificata; nessun package per classe, nessun servizio indipendente e nessuna astrazione cross-platform anticipata. Rationale: [ADR-0001](decisions/ADR-0001-modular-monolith.md).

## CURRENT — componenti effettivi

| Responsabilità | Implementazione attuale | Osservazione |
|---|---|---|
| Entry point e composizione | `app/APP/MyApp.swift`, `ContentView` | Una root SwiftUI e uno stato centrale. |
| UI e navigazione | `app/APP/ContentView.swift` | Welcome, Home, rosa, calendario, setup formazione, live e storico; `AppScreen` controlla le schermate. |
| Modelli | `ContentView.swift`: `RosterPlayer`, `ScheduledMatch`, `MatchPlayer`, `GoalEvent`, `PlayerMatchSummary`, `MatchRecord` | Modelli Codable condivisi direttamente tra UI, logica e storage. |
| Stato della partita | `@State` dentro la view root | Clock, timeout, formazione, giocatrici, eventi e associazione al calendario sono memoria di processo. |
| Cronometri | `Timer.publish(every: 1)` + `handleTimerTick()` | I secondi vengono aggiunti per callback; non è un modello basato sul tempo effettivamente trascorso. |
| Partecipazione e cambi | Funzioni private in `ContentView` | Limite di cinque in campo nei percorsi ordinari; cambio e suggerimento non applicano il ruolo di portiere. |
| Suggerimento rotazione | `swapSuggestion`, `fairnessScore` | Regola corrente `timePlayed / max(playWeight, 0.25)`, soglia 120 secondi; esclude dall'uscita suggerita chi ha Superpower. |
| Gol e statistiche | `GoalEvent` e funzioni su `matchEvents` | Il punteggio live è derivato dagli eventi; l'undo live rimuove l'ultimo gol. |
| Storico | `MatchRecord` e viste di dettaglio/modifica | Snapshot di partecipanti e gol; non contiene la sequenza delle sostituzioni. |
| Persistenza | JSON in `UserDefaults.standard` | Rosa, calendario e storico; chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`. Nessuna sessione live persistita. |
| Import calendario | `ScheduleCSVImporter` in `ContentView.swift` | Parser statico; accetta delimitatore rilevato da intestazione, quote e campi escaped; non gestisce newline dentro campi quotati. |
| Design system | `MapiTheme` e asset in `Assets.xcassets` | UI/tema/asset sono fuori dallo scope A0 e invariati. |

## PROPOSED — confini interni candidati

Nomi e cartelle sono indicativi; si introducono solo quando estrarre il codice offre testabilità o proprietà più chiare. Tutto rimane inizialmente nello stesso target `APP`.

```text
app/APP/
├── App/                         # entry point e composizione SwiftUI
├── Domain/
│   ├── Players/                 # identità e modelli della rosa
│   ├── Schedule/                # partita programmata e associazione
│   └── Matches/                 # sessione, snapshot, gol e statistiche
├── Features/
│   ├── Roster/                  # flusso UI e casi d'uso rosa
│   ├── Calendar/                # flusso UI del calendario
│   ├── LiveMatch/               # schermata e coordinamento partita
│   └── History/                 # storico e correzione dei record
├── MatchTiming/                 # modello deterministico del tempo e transizioni
├── Rotation/                    # regole MAPI/calcio a 5 per partecipazione e suggerimenti
├── Import/                      # parser CSV e traduzione in Schedule
├── Persistence/                 # adapter locale e gestione errori/recupero
└── DesignSystem/                # MapiTheme, componenti visivi e asset
```

La struttura non prescrive un file per entità: modelli e comportamento che cambiano insieme possono restare co-locati. `APPTests` esercita contratti pubblici/interni selezionati; il codice privato della view non è direttamente unit-testabile finché non viene separato.

### Responsabilità e dipendenze desiderate

- **Domain**: tipi e invarianti che non richiedono SwiftUI, UserDefaults o filesystem. L'identità storica conserva nome e ID anche se una tesserata viene poi rimossa dalla rosa.
- **MatchTiming**: accumula tempo giocato e modella pausa/ripresa/timeout/intervallo/fine con input temporale controllabile. Il clock non deve inferire il tempo da quanti callback UI sono arrivati. La scelta della semantica in background e dopo riapertura precede la migrazione.
- **Futsal/Rotation**: i cinque posti, i due periodi, timeout e ruolo portiere sono regole applicative del calcio a 5; i pesi Handicap e Superpower restano regole MAPI finché non emerga un secondo consumatore con semantica realmente comune.
- **Import**: parser deterministico indipendente dalla selezione del file; il confine del formato CSV va coperto con fixture.
- **Persistence**: possiede letture/scritture e segnala errori in modo esplicito; il formato JSON e le chiavi legacy restano compatibili durante la migrazione.
- **Features/UI**: orchestra azioni e presenta lo stato; non è proprietaria di algoritmi deterministici o codifica persistente.
- **DesignSystem**: solo presentazione SwiftUI e asset. Nessun cambio visivo è parte del piano di consolidamento tecnico.

Direzione preferita: `SwiftUI/Features → funzioni/casi d'uso → Domain`; `Persistence` e sorgente file entrano da confini espliciti solo quando servono testabilità, sostituibilità o semantica di errore. Evitare catene di servizi/protocolli che inoltrano soltanto parametri.

### Livelli di riuso

1. **Componente interno** (scelta attuale): importer, clock e funzioni di dominio pure restano nel repository e nel target app.
2. **Package/libreria**: rivalutare solo quando un componente è indipendente da MAPI/SwiftUI, ha API stabile e un secondo consumer reale o un ciclo di rilascio autonomo.
3. **Servizio indipendente**: non giustificato oggi; rivalutare solo per deployment, scaling, ownership, sicurezza o isolamento dei guasti indipendenti.

### Dati e persistenza

Fonte di verità attuale: i tre payload Codable in `UserDefaults.standard`. Le mutazioni della rosa/calendario/storico invocano salvataggi espliciti; il timer e lo stato live non sono salvati. Errori `encode`/`decode` sono soppressi con `try?` e non diventano diagnosi visibili.

A0 mantiene il contratto locale. Il prossimo passo di persistenza deve prima rendere visibili decode/write failure e definire recupero, quindi aggiungere un modello di sessione live versionato e testato. Per una singola app locale, JSON Codable in file con scrittura atomica/backup è l'alternativa iniziale meno onerosa da valutare; UserDefaults può restare per preferenze piccole, non è necessario trasformare ora i dati in database. SQLite/SwiftData diventano candidati solo se query, volume, relazioni, transazioni o migrazioni dimostrano un bisogno concreto. Non migrare né cancellare le chiavi V1 senza fixture legacy, verifica di round-trip e strategia di rollback. Vedi [ADR-0002](decisions/ADR-0002-preserve-json-contract.md).

### Evoluzione verso una possibile PWA

- **Trasferibile come concetto/contratto**: modelli di dominio, regole pure, formati JSON, invarianti, casi di test e comportamento dell'importer. Il codice Swift non è direttamente eseguibile in una PWA e non si assume una traduzione automatica.
- **Specifico iOS/SwiftUI**: viste, navigazione, binding, lifecycle, input file, accessibilità e adapter `UserDefaults`/filesystem.
- **Sostituibile tramite confini leggeri**: storage locale, sorgente del tempo, importazione file e UI. Gli adapter verranno introdotti quando un consumer alternativo è reale; nessun backend/API è pianificato in A0.

## Trigger di riesame

Rivedere questi confini se: (a) la PWA diventa un prodotto approvato con requisiti condivisi; (b) un secondo consumer riutilizza davvero una regola; (c) l'app deve supportare più utenti o sincronizzazione; (d) volume/query o perdita dati rendono inadeguata la persistenza locale; (e) l'estrazione di un componente migliora test significativi senza generare pass-through layers.
