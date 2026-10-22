# Registro delle Funzionalità — MAPI GROUP

Questo documento fornisce la mappa completa delle funzionalità dell'app MAPI GROUP, distinguendo chiaramente tra:
1. **Funzionalità Attuali**: già presenti nel codice sorgente e funzionanti.
2. **Funzionalità Progettate**: concordate tra la sviluppatrice e ChatGPT, da implementare nei prossimi passaggi.

---

## 1. Funzionalità Attuali (Già presenti nel codice)

Il codice sorgente dell'app risiede principalmente in `ContentView.swift` ed è strutturato come segue:

### Schermata di Benvenuto (WelcomeView)
- Sfondo grafico con le ochette (`WelcomeBackground`).
- Logo dell'app (`WelcomeLogo`).
- Pulsante singolo `"ENTRA"` con animazione di transizione verso la schermata Home.

### Schermata Home
- Header con brand MAPI GROUP e icone decorative.
- Sezione stato partita (se una partita è stata avviata in memoria).
- Sezione abbinamento calendario (prossima partita in programma).
- Sezione anteprima formazione.
- Pulsanti di navigazione: *Rosa*, *Calendario*, *Storico*, *Nuova Partita*.

### Gestione della Rosa (Roster)
- Elenco delle giocatrici registrate.
- Possibilità di aggiungere una nuova giocatrice, modificarne il nome, attivarla/disattivarla ed eliminarla.
- **Supporto Ruolo Portiere (Novità implementata)**:
  - Il modello `RosterPlayer` include l'indicatore `isGoalkeeper`.
  - Nella schermata di modifica della giocatrice è presente l'interruttore "Portiere".
  - Nella lista della Rosa compare un piccolo indicatore `"Portiere"` accanto a chi ha il ruolo attivo.
  - La modifica del nome o dello stato attivo preserva sempre il ruolo.
  - Retrocompatibilità totale con i dati preesistenti salvati in `UserDefaults` (tutte le giocatrici già salvate rimangono e partono come giocatrici di movimento).

### Gestione Calendario e Import CSV
- Visualizzazione del calendario gare della stagione.
- Importazione automatica da file CSV (come `calendario_mapi_2026_2027.csv`).
- Possibilità di aggiungere e modificare partite in calendario (data, orario, avversario, casa/trasferta, luogo).
- Selezione di una partita dal calendario per associarla alla partita live.

### Preparazione Partita Attuale
- Schermata di selezione presenze (chi c'è stasera tra le giocatrici attive della rosa).
- Schermata di selezione titolari (attualmente richiede la selezione obbligatoria dei 5 giocatori iniziali).
- Il modello in partita `MatchPlayer` eredita già il ruolo di portiere (`isGoalkeeper`) dalla rosa.

### Schermata Partita Live Attuale
- **Avversario**: sezione in alto con dicitura "MAPI GROUP vs [Avversario]".
- **Punteggio**: visualizzazione dei gol segnati da noi e dagli avversari con pulsanti dedicati.
- **Cronometro**: cronometro a tempo progressivo con divisione in tempi/periodi, controlli di avvio, pausa e time-out.
- **Lista Giocatori**: visualizzazione verticale a schede/card per ciascun giocatore, con indicazione di stato (*IN CAMPO* / *PANCHINA*), tempo giocato e controlli:
  - `H` (Handicap / Peso partita: 100%, 75%, 50%, 25%).
  - `S` (Superpotere: protegge la giocatrice dai cambi suggeriti).
  - Tasto sostituzione.
- **Cambi consigliati**: scheda che calcola e propone la coppia giocatrice in uscita / giocatrice in entrata tramite punteggio di equità (`fairnessScore = timePlayed / playWeight`).
- **Registrazione Gol ed Eventi**: salvataggio del marcatore e dell'eventuale assistman.

### Storico Partite
- Elenco delle partite disputate con data, avversario e punteggio finale.
- Dettaglio partita: minutaggio giocato da ciascuna giocatrice, marcatori, assist e sequenza gol.
- Possibilità di modificare o eliminare eventi a posteriori.

### Persistenza Dati
- Salvataggio locale in `UserDefaults` tramite codifica e decodifica JSON di:
  - Rosa giocatrici (`mapi_roster_v1`).
  - Calendario partite (`mapi_schedule_v1`).
  - Storico partite (`mapi_history_v1`).
- *Nota importante*: attualmente `UserDefaults` salva esclusivamente Rosa, Calendario e Storico. Lo stato della partita in corso risiede solo nella memoria di runtime dell'app (non esiste un salvataggio persistente completo della partita live).

---

## 2. Funzionalità Progettate (Da realizzare nei prossimi passi)

Le modifiche seguenti sono state concordate con ChatGPT e rappresentano il piano di evoluzione dell'app.

### A. Schermata Iniziale
- **Grafica invariata**: Mantenimento integrale del logo, dello sfondo con le ochette calciatrici e dello stile estetico `MapiTheme`.
- **Nuova pulsantiera**: Sostituzione del singolo pulsante `ENTRA` con tre pulsanti diretti:
  1. **`PARTITA`**: per accedere rapidamente alla preparazione o continuazione della gara.
  2. **`ROSA`**: per accedere direttamente alla gestione delle giocatrici.
  3. **`STORICO`**: per consultare l'archivio delle partite giocate.

### B. Preparazione della Partita
- **Selezione Avversario**: Possibilità di digitare liberamente l'avversario o selezionarlo rapidamente dalle partite in calendario.
- **Distinta di Gara**: Selezione delle giocatrici effettivamente presenti per la partita.
- **Titolari Facoltativi**:
  - La selezione dei 5 titolari diventa **facoltativa** (non più obbligatoria).
  - Se i titolari non vengono selezionati, tutte le giocatrici iniziano in panchina e vengono inserite manualmente sul campo all'inizio o durante la partita.
- **Nessun avvio automatico del tempo**: L'ingresso nella schermata del campo non avvia automaticamente il cronometro; il tempo parte solo con una pressione esplicita del tasto Play.

### C. Nuovo Campo (Interfaccia Live)
- **Mezzo Campo Verticale**:
  - Rappresentazione grafica di mezzo campo da calcetto in orientamento verticale.
  - Disposizione **2–2–1**:
    - **2 coppie di giocatrici di movimento e 1 portiere** (5 persone complessivamente in campo).
    - **Non esistono altri ruoli** oltre a Portiere e Giocatrice di movimento.
- **Sagome Giocatrici**:
  - Ogni giocatrice sul campo è rappresentata da una sagoma grafica (avatar stilizzato), accompagnata da nome e timer del minutaggio totale.
- **Interazione al Tap**:
  - Toccando una giocatrice in campo compaiono i controlli contestuali:
    - **`H`** (Handicap / Peso rotazione).
    - **`S`** (Superpotere).
    - **`CAMBIA`** (Avvia la sostituzione con una giocatrice in panchina).
- **Panchina Compatta**:
  - Le giocatrici di riserva sono raggruppate in una fascia orizzontale compatta posizionata subito sotto il campo, senza schede ingombranti.
- **Header e Controlli Compatti in Alto**:
  - Punteggio (Noi vs Avversario) e cronometro di gioco compatti nella parte superiore dello schermo, per dare massimo spazio visivo al campo.
  - Nome dell'avversario piccolo e discreto, senza una sezione dedicata ingombrante.
- **Registrazione Gol**:
  - Due pulsanti compatti per registrare i gol (Noi / Avversario), con scelta del marcatore e dell'eventuale assist.
- **Cambi Consigliati Discreti**:
  - Suggerimenti di cambio mostrati senza schede ingombranti.

### D. Regole di Gioco per i Portieri (Da implementare sul campo)
- *Nota*: La selezione del portiere nella Rosa è già stata realizzata. Restano da implementare le seguenti regole in partita:
  - Il portiere può essere sostituito **soltanto da un altro portiere**.
  - I portieri non partecipano ai cambi consigliati delle giocatrici di movimento.
  - Nessuna introduzione di altri ruoli.

### E. Timer dei Giocatori con Soglie di Colore
- **Tempo Continuo e Progressivo**:
  - Il tempo totale giocato si accumula durante tutta la partita.
  - Non si azzera mai durante le sostituzioni.
- **Visualizzazione Grafica**:
  - Il tempo compare all'interno di un rettangolo con angoli molto arrotondati.
- **Colori Basati sulla Media della Distinta**:
  - 🟢 **Verde**: Almeno **2 minuti sotto la media** (giocatrice che ha giocato meno).
  - 🟡 **Giallo**: **Vicino alla media** (minutaggio equilibrato).
  - 🔴 **Rosso**: Almeno **2 minuti sopra la media** (giocatrice che ha giocato di più).
  - La media comprende **tutte le giocatrici di movimento presenti nella distinta**, incluse quelle sedute in panchina.
  - I portieri vengono confrontati **separatamente** tra loro.
  - Il colore del timer fornisce un supporto visivo immediato e **non sostituisce** il sistema di cambi consigliati.
