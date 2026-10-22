# MAPI GROUP — iOS App

**MAPI GROUP** è un'applicazione iOS sviluppata in **SwiftUI** per la gestione delle partite e della squadra di calcio a 5 (futsal) amatoriale, caratterizzata dalla simpatica mascotte delle ochette calciatrici.

L'app nasce per aiutare la squadra e l'allenatore a:
- Gestire la rosa delle giocatrici.
- Consultare il calendario stagionale delle partite.
- Monitorare la partita in tempo reale (tempo giocato, punteggio, gol e assist).
- Gestire i cambi in modo equo e visivo sul campo da gioco.

---

## Come aprire ed eseguire l'app con Xcode

Per avviare l'app in locale sul tuo Mac non serve alcun terminale o strumento complesso. Segui questi semplici passi:

1. **Apri il progetto in Xcode**:
   - Vai nella cartella `app/`.
   - Fai doppio clic sul file **`APP.xcodeproj`** (oppure aprilo da Xcode tramite *File → Open*).

2. **Scegli il dispositivo o simulatore**:
   - Nella barra in alto di Xcode, accanto al nome del target `APP`, clicca sul selettore del dispositivo.
   - Scegli un simulatore iPhone recente (ad esempio *iPhone 15*, *iPhone 16* o il tuo iPhone collegato via cavo).

3. **Avvia l'app**:
   - Premi il pulsante **Play** (▶) in alto a sinistra, oppure premi la scorciatoia da tastiera:
     ```
     Cmd + R
     ```
   - Xcode compilerà il progetto e aprirà automaticamente il simulatore con la schermata iniziale di MAPI GROUP.

---

## Tecnologie e Struttura

- **Piattaforma**: iOS (iPhone)
- **Linguaggio**: Swift
- **Interfaccia grafica**: SwiftUI
- **Persistenza**: Locale e semplice tramite `UserDefaults` (senza database esterni o SwiftData)
- **Stile e Grafica**: Palette colori personalizzata (`MapiTheme`), angoli morbidi e asset grafici a tema (oche calciatrici).

### Struttura delle cartelle principali

```
app/
├── APP/                                # Codice sorgente e asset
│   ├── MyApp.swift                     # Entry point dell'applicazione
│   ├── ContentView.swift               # Viste e logica dell'app
│   └── Assets.xcassets/                # Icone, loghi, sfondi e colori
├── APP.xcodeproj/                      # File di progetto Xcode
├── calendario_mapi_2026_2027.csv       # File CSV con le partite di campionato
├── grafica/                            # Immagini originali, bozzetti e sfondi
├── AGENTS.md                           # Istruzioni essenziali per gli agenti AI
├── README.md                           # Questo documento di presentazione
└── docs/                               # Documentazione operativa
    ├── WORKFLOW.md                     # Guida al metodo di lavoro (ChatGPT → Codex → Xcode)
    ├── FEATURES.md                     # Funzionalità attuali e modifiche progettate
    └── STATUS.md                       # Stato di avanzamento e prossimi passi
```

---

## Metodo di Sviluppo

Il progetto segue un flusso di lavoro locale e accessibile per sviluppatrici alle prime armi, dettagliato in [`docs/WORKFLOW.md`](docs/WORKFLOW.md).  
ChatGPT si occupa della progettazione e della scrittura dei prompt, Codex applica le modifiche ai file su richiesta, e Xcode permette di testare immediatamente il risultato.
