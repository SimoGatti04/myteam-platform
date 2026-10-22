# Registro funzionale — MAPI GROUP Match Manager

Questo registro separa ciò che il codice attuale implementa da ciò che è soltanto richiesto o progettato. “Implementato nel codice” non significa che ogni percorso sia stato collaudato su simulatore o dispositivo: consultare `STATUS.md` e `TESTING.md`.

## 1. Implementato nel codice attuale

### Welcome e Home
- Welcome con sfondo e logo esistenti e singolo pulsante **ENTRA** che porta alla Home.
- Home con stato/cronometro partita, partita associata o prossima, anteprima formazione e accessi a Rosa, Calendario, Storico e preparazione.

### Rosa
- Elenco tesserate attive e non attive; aggiunta, modifica, attivazione/disattivazione ed eliminazione.
- Validazione di nome vuoto e duplicati case-insensitive.
- Ruolo booleano Portiere nel modello, toggle nell'editor e indicatore nella lista.
- `RosterPlayer` decodifica i vecchi payload privi di `active` o `isGoalkeeper` usando i default `true` e `false`.

### Calendario e CSV
- Visualizzazione, inserimento, modifica ed eliminazione delle gare; associazione manuale alla partita corrente.
- Import CSV con delimitatore virgola o punto e virgola, BOM, alias di intestazione, virgolette e virgolette doppie escape; supporto a “RIPOSA”, parsing di date/giorni e righe con errori.
- Import in append o sostituzione; l'identificativo di una gara sostituita è mantenuto quando il confronto la riconosce come stessa partita.
- Associazione automatica della gara non ancora giocata più vicina entro una finestra di sei ore, quando si avvia il timer e non è già stata associata una gara.

### Preparazione e partita live
- Selezione delle presenti tra tesserate attive e selezione obbligatoria di esattamente cinque titolari, purché siano presenti almeno cinque tesserate attive.
- Cronometro progressivo con due periodi da 20 minuti, intervallo da 5 minuti, pausa/ripresa e fine automatica dopo il secondo periodo. L'intervallo e il secondo tempo richiedono un'azione esplicita; il secondo tempo parte in pausa.
- Un time-out da 60 secondi per squadra per tempo; se il timer era attivo prima del timeout, alla scadenza riprende automaticamente.
- Carte con stato in campo/panchina, secondi giocati, peso Handicap 100/75/50/25% e Superpower.
- Cambio manuale campo-panchina; inserimento diretto se in campo ci sono meno di cinque giocatrici; possibilità di lasciare temporaneamente il campo con una giocatrice in meno.
- Suggerimento di cambio quando ci sono esattamente cinque giocatrici in campo e il divario supera 120 secondi, usando `timePlayed / max(playWeight, 0.25)`; una Superpower protegge solo dall'uscita suggerita.
- Gol propri con marcatrice e assist facoltativo, gol avversari, punteggio live derivato dagli eventi e annullamento dell'ultimo evento.

### Storico
- A fine partita viene creato uno snapshot con data, durata, partecipanti, secondi giocati, gol, assist, punteggio, eventi gol e associazione al calendario quando presente.
- Elenco, dettaglio, modifica ed eliminazione dei record.
- Modifica storica di dati, eventi gol, punteggi e statistiche; possibilità di ricalcolare score e statistiche dagli eventi oppure mantenerli indipendenti.
- I record conservano nome e identificativo opzionale della tesserata; la cancellazione dalla rosa non cancella i relativi snapshot storici.

### Persistenza attuale
- JSON in `UserDefaults.standard` per rosa, calendario e storico, rispettivamente con chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`.
- Nessuna persistenza completa della partita live in corso; la chiusura/terminazione dell'app non dispone di un ripristino verificato di cronometri, formazione, eventi e timeout.

## 2. Requisiti progettati, non ancora implementati

I seguenti requisiti validi sono conservati dalla documentazione precedente; non devono essere presentati come funzionalità disponibili.

### Welcome e accesso
- Tre azioni dirette **PARTITA**, **ROSA**, **STORICO**, mantenendo logo/sfondo e stile concordati.

### Preparazione
- Inserimento rapido dell'avversario o selezione da calendario.
- Titolari facoltativi: se non selezionati, tutte le presenti iniziano in panchina e vengono inserite manualmente.
- Entrare nel campo non deve avviare il timer; il timer parte solo con pressione esplicita di Play.

### Interfaccia campo
- Mezzo campo verticale con asset/visualizzazione 2–2–1 (portiere e quattro giocatrici di movimento), avatar, nome e minutaggio.
- Panchina compatta sotto il campo; controlli H, S e CAMBIA contestuali; punteggio e cronometro compatti, gol registrabili con modali discrete e suggerimenti non ingombranti.

### Regole di ruolo e timer visivo
- Il portiere può essere sostituito soltanto da un altro portiere ed è escluso dai suggerimenti delle giocatrici di movimento.
- Colore del timer in base alla media: verde almeno 2 minuti sotto, giallo entro la fascia ±2 minuti, rosso almeno 2 minuti sopra. Le giocatrici di movimento sono confrontate tra loro e i portieri tra loro; la media include la distinta completa, anche chi è in panchina.
- Il minutaggio totale di ciascuna giocatrice non si azzera durante i cambi.

## 3. Caso limite osservato, da confermare

- Il comando del cronometro è raggiungibile prima della conferma della distinta. Nell'implementazione, se la partita viene avviata da Home/presenze/titolari e la formazione viene confermata dopo, ai cinque titolari selezionati è assegnato il tempo già trascorso; le altre presenti partono da zero. Evidenza statica in `BASELINE_AUDIT.md`; non è stato verificato su simulatore/dispositivo e non è confermato come comportamento voluto. Non correggere implicitamente: chiarire la regola di prodotto e caratterizzarla prima di intervenire.

## 4. Regole di interpretazione

- Il modello possiede già un attributo Portiere, ma il vincolo ruolo-portiere non è applicato né ai cambi manuali né all'algoritmo dei suggerimenti.
- La documentazione precedente riportava chiavi `mapi_roster_v1`, `mapi_schedule_v1` e `mapi_history_v1`: non sono le chiavi lette/scritte dall'implementazione corrente.
- L'eventuale nuova schermata campo e la scelta dei titolari facoltativi cambiano la UI e il flusso prodotto; richiedono un'attività esplicita distinta dall'audit A0.
