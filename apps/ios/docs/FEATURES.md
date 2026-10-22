# Registro funzionale — MAPI GROUP Match Manager

Questo registro distingue requisiti confermati, comportamento implementato e idee non ancora sviluppate. L'implementazione non equivale a validazione su dispositivo: consultare `STATUS.md` e `TESTING.md`.

## 1. Implementato nel codice attuale

### Welcome, Home e rosa
- Welcome con sfondo/logo esistenti e pulsante **ENTRA**; Home con stato partita, calendario, anteprima formazione e accessi a Rosa, Calendario e Storico.
- Gestione dei tesserati attivi e non attivi: aggiunta, modifica, attivazione/disattivazione ed eliminazione.
- Modello `RosterPlayer` con ruolo Portiere; i payload legacy senza `active` o `isGoalkeeper` usano i default correnti.

### Calendario e CSV
- Visualizzazione, inserimento, modifica, eliminazione e associazione manuale delle partite programmate.
- Import CSV con virgola o punto e virgola, BOM, alias di intestazione, campi quotati/escaped, “RIPOSA”, date e segnalazione righe anomale.
- Import in append o sostituzione; l'ID viene conservato quando la gara è riconosciuta come la stessa.
- Associazione automatica della partita non giocata più vicina entro sei ore, se non è già stata associata una partita.

### Preparazione e partita live
- Selezione dei presenti tra i tesserati attivi e conferma della distinta.
- Formazione iniziale obbligatoria di esattamente cinque titolari effettivamente in campo; il primo Play è bloccato finché distinta e formazione non sono confermate.
- La conferma della distinta/formazione e l'ingresso nella schermata live non avviano il tempo. Il primo avvio richiede Play esplicito.
- Primo e secondo tempo da 20 minuti, intervallo da 5 minuti avviabile manualmente e secondo tempo che inizia in pausa. Il termine di un periodo non trasferisce automaticamente il tempo residuo al periodo successivo.
- Pausa/ripresa basate sul tempo trascorso da un clock monotono, non sul conteggio dei tick UI. Il refresh periodico può essere ritardato; alla successiva sincronizzazione la durata viene ricalcolata rispetto all'anchor.
- Timeout separato di 60 secondi, misurato dal clock monotono. Se richiesto mentre il gioco era attivo, la ripresa automatica avviene all’esatta scadenza; una sincronizzazione ritardata accredita il residuo successivo come tempo di gioco, senza superare il limite del periodo. Se richiesto mentre il gioco era in pausa, non riprende automaticamente. Il countdown di intervallo e il periodo successivo non vengono avviati implicitamente da un salto temporale.
- Ogni titolare parte da zero al primo Play; le riserve partono da zero. Il tempo individuale aumenta solo mentre il giocatore è in campo e scorre il tempo di gioco. Ingressi, uscite, pause, timeout, intervallo e assenza di attribuzione retroattiva sono gestiti dal motore temporale.
- Stato campo/panchina, Handicap con pesi 1, 0.75, 0.5, 0.25 e Superpower; cambio manuale, ingresso diretto quando vi sono meno di cinque giocatori in campo e possibilità di rimanere temporaneamente in inferiorità numerica.
- Suggerimento di cambio a cinque giocatori in campo quando il divario supera 120 secondi; usa `timePlayed / max(playWeight, 0.25)` e non propone in uscita un giocatore con Superpower.
- Gol della squadra con marcatore e assist facoltativo, gol avversario, score live derivato dagli eventi e annullamento dell'ultimo evento.

### Storico e persistenza
- Fine partita: snapshot con data, durata, partecipanti, tempi, gol/assist, score, eventi gol e associazione al calendario se presente.
- Elenco, dettaglio, modifica ed eliminazione delle partite storiche; correzione/ricalcolo di score e statistiche secondo i controlli esistenti.
- I record storici conservano nome e ID opzionale del tesserato anche se poi viene rimosso dalla rosa.
- JSON in `UserDefaults.standard` per rosa, calendario e storico con chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`.
- `MatchTimingSnapshot` è un contratto Codable in memoria preparato per una futura persistenza della sessione; non è ancora collegato a un adapter o salvato.

## 2. Requisiti confermati e non ancora implementati

- La sessione live deve poter essere serializzata e recuperata dopo terminazione/cold start in C3, con una politica esplicita per i segmenti attivi, checkpoint wall-clock, timeout, formazione ed eventi. C2 non dimostra recupero dopo riapertura.
- La futura piattaforma potrà supportare più squadre, società/account, ruoli, branding personalizzato, dati condivisi e provider esterni. Sono intenzioni di prodotto: backend, sincronizzazione, fonte di verità cloud e PWA restano non decisi e fuori dallo scope C2.

## 3. Requisiti pianificati non implementati

- Tre azioni dirette **PARTITA**, **ROSA**, **STORICO**, mantenendo i materiali grafici esistenti.
- Inserimento rapido dell'avversario o selezione da calendario.
- Schermata con campo 2–2–1, portiere e quattro giocatori di movimento, avatar, nome e minutaggio, con panchina compatta e controlli contestuali.
- Cambio del portiere solo con un altro portiere ed esclusione del portiere dai suggerimenti dei giocatori di movimento.
- Colore del timer in base alla media: verde almeno due minuti sotto, giallo entro ±2 minuti, rosso almeno due minuti sopra; confronti separati per portieri e giocatori di movimento, includendo la panchina.

Il requisito storico dei titolari facoltativi è **superato**: il requisito corrente impone cinque titolari confermati prima del primo avvio.

## 4. Limiti e interpretazione

- Il modello possiede un attributo Portiere, ma le regole attuali di cambio e suggerimento non applicano il vincolo ruolo-portiere.
- I minuti di `MatchTiming` sono autorevoli in nanosecondi durante il processo; le viste ricevono una proiezione in secondi. Non è ancora implementata la sincronizzazione persistita.
- Il record storico conserva snapshot e goal events, non l'intera timeline di cambi, timeout e partecipazione.
- Background e blocco schermo sono coperti da test deterministici con clock controllabile, ma la sospensione/riattivazione reale iOS deve essere collaudata separatamente. La terminazione del processo resta non recuperabile prima di C3.
