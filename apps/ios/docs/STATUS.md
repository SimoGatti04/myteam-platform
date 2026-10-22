# Stato del Progetto — MAPI GROUP

Questo documento tiene traccia dello stato di avanzamento del progetto MAPI GROUP, delle attività completate e della roadmap dei prossimi interventi.

---

## 1. Situazione Attuale

- **Codice dell'App**:
  - Il codice Swift risiede in `APP/ContentView.swift` ed è pienamente funzionante e compilabile con Xcode (`APP.xcodeproj`).
  - **Supporto Portiere aggiunto con successo**:
    - `RosterPlayer` e `MatchPlayer` includono la proprietà `isGoalkeeper`.
    - Gestita la retrocompatibilità totale con i vecchi dati JSON: le giocatrici già salvate in `UserDefaults` rimangono e partono come giocatrici di movimento.
    - Nella schermata di modifica della giocatrice è presente il toggle "Portiere".
    - Nella lista della Rosa compare il badge pillola `"Portiere"` accanto a chi ha l'opzione attiva.
    - Modificare nome o stato attivo preserva sempre il ruolo.
  - **Persistenza**:
    - `UserDefaults` (in formato JSON) salva: **Rosa** (`mapi_roster_v1`), **Calendario** (`mapi_schedule_v1`) e **Storico** (`mapi_history_v1`).
    - Lo stato della partita live in corso risiede solo nella memoria volatile di runtime (non vi è un salvataggio persistente completo della partita in corso).
- **Ambiente Operativo**:
  - Flusso di lavoro locale a tre componenti: Xcode + ChatGPT + Codex.
  - Nessun controllo Git attivo sul progetto, per mantenere il processo lineare e privo di complessità per la sviluppatrice.
- **Sicurezza del Codice**:
  - Copia di sicurezza di `ContentView.swift` salvata in `AURINFORMATC/backups/`.

---

## 2. Attività Completate

| Attività | Descrizione | Data |
| :--- | :--- | :--- |
| **Progettazione Architetturale** | Definizione delle nuove funzionalità con ChatGPT: Welcome a 3 tasti, Mezzo campo 2-2-1, Gestione portieri, Timer a colori con soglie di media, Distinta e titolari facoltativi. | Ottobre 2026 |
| **Creazione Documentazione Iniziale** | Creazione di `AGENTS.md`, `README.md`, `docs/WORKFLOW.md`, `docs/FEATURES.md`, `docs/STATUS.md` in `app/`. | Ottobre 2026 |
| **Puntatore AGENTS.md principale** | Creazione di `AGENTS.md` nella radice di `AURINFORMATC` come rimando sintetico a `app/AGENTS.md`. | Ottobre 2026 |
| **Backup Preventivo del Codice** | Salvataggio di una copia di sicurezza di `ContentView.swift` nella cartella `AURINFORMATC/backups/`. | Ottobre 2026 |
| **Ruolo Portiere nella Rosa e Modello** | Aggiunta proprietà `isGoalkeeper` in `RosterPlayer` e `MatchPlayer`, decodifica retrocompatibile in `UserDefaults`, toggle nell'editor giocatrice, indicatore `"Portiere"` nella lista della rosa, conservazione del ruolo durante le modifiche di nome/stato. | Ottobre 2026 |

---

## 3. Prossimi Interventi (Roadmap a Piccoli Passi)

Per mantenere il lavoro sicuro e facilmente testabile su Xcode, le modifiche concordate verranno realizzate una alla volta attraverso prompt mirati:

### Passo 1 — Nuova Schermata Iniziale
- Sostituire il pulsante singolo `ENTRA` con i tre pulsanti: `PARTITA`, `ROSA` e `STORICO`.
- Preservare inalterati lo sfondo con le oche (`WelcomeBackground`), il logo (`WelcomeLogo`) e lo stile grafico.
- Collegare i tre pulsanti alle relative schermate di destinazione.

### Passo 2 — Revisione Preparazione Partita
- Permettere l'inserimento/selezione dell'avversario in modo rapido.
- Selezionare le giocatrici presenti nella distinta di gara.
- Rendere **facoltativa** la selezione dei 5 titolari: se non vengono scelti, tutte le giocatrici partono in panchina.
- Assicurarsi che l'ingresso nella partita non avvii automaticamente il cronometro.

### Passo 3 — Nuovo Campo da Gioco Verticale (2–2–1)
- Creare la vista del mezzo campo verticale con disposizione 2–2–1:
  - 2 coppie di giocatrici di movimento e 1 portiere (5 persone complessivamente in campo).
  - Nessun altro ruolo oltre a Portiere e Giocatrice di movimento.
- Mostrare per ciascuna giocatrice: sagoma grafica, nome e tempo totale giocato.
- Gestire il tap sulla giocatrice per mostrare i comandi rapidi `H` (Handicap), `S` (Superpotere) e `CAMBIA`.
- Aggiungere la panchina orizzontale compatta posizionata sotto il campo.
- Riposizionare punteggio e cronometro compatti in alto; rendere discreto il nome dell'avversario.
- Integrare i due pulsanti per la registrazione dei gol (Noi / Avversario).

### Passo 4 — Logica del Timer con Soglie di Colore
- Garantire che il tempo giocato si accumuli continuativamente per tutta la partita senza mai azzerarsi nelle sostituzioni.
- Visualizzare il tempo nel rettangolo con angoli molto arrotondati (a pillola).
- Calcolare la media dei minuti giocati da tutte le giocatrici di movimento in distinta (in campo e in panchina).
- Applicare i colori:
  - 🟢 **Verde**: almeno 2 minuti sotto la media.
  - 🟡 **Giallo**: vicino alla media (entro +/- 2 minuti).
  - 🔴 **Rosso**: almeno 2 minuti sopra la media.
- Gestire il confronto e la media separati per i portieri.

### Passo 5 — Vincoli di Sostituzione per i Portieri
- Regola di sostituzione sul campo: il portiere può essere sostituito **soltanto da un altro portiere**.
- Escludere i portieri dai cambi consigliati delle giocatrici di movimento.
- Mostrare i cambi consigliati in modo discreto e non invasivo sopra il campo.

### Passo 6 — Collaudo e Rifiniture
- Test completo del flusso di gara nel simulatore Xcode: avvio, gestione titolari manuali, sostituzioni sul campo, registrazione gol, fine partita e salvataggio nello storico.
