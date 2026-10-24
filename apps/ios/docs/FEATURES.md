# Registro funzionale — MAPI GROUP Match Manager

Questo documento distingue funzionalità effettive, decisioni confermate e lavoro pianificato. Implementazione e test sintetici non equivalgono a validazione con dati reali del dispositivo: consultare `STATUS.md` e `TESTING.md`.

## Implementato nel codice attuale

### Welcome, Home e rosa
- Welcome con sfondo/logo esistenti e pulsante **ENTRA**; Home con stato partita, calendario, anteprima formazione e accessi a Rosa, Calendario e Storico.
- Gestione dei tesserati attivi e non attivi: aggiunta, modifica, attivazione/disattivazione ed eliminazione.
- Modello `RosterPlayer` con ruolo portiere; i payload precedenti privi di `active` o `isGoalkeeper` usano i default già previsti.

### Calendario e CSV
- Visualizzazione, inserimento, modifica, eliminazione e associazione manuale delle partite programmate.
- Import CSV con virgola o punto e virgola, BOM, alias di intestazione, campi quotati/escaped, “RIPOSA”, date e segnalazione righe anomale.
- Import in append o sostituzione; l'ID viene conservato quando la gara è riconosciuta come la stessa.
- Associazione automatica della partita non giocata più vicina entro sei ore, se non è già stata associata una partita.

### Preparazione e partita live
- Selezione dei presenti e conferma della distinta; formazione iniziale obbligatoria di esattamente cinque titolari in campo prima del primo Play.
- La conferma della distinta/formazione e l'ingresso nella schermata live non avviano il tempo. Il primo avvio richiede Play esplicito; la pausa e la successiva ripresa non richiedono nuovamente cinque giocatori.
- Primo e secondo tempo da 20 minuti, intervallo da 5 minuti avviabile manualmente e secondo tempo che inizia in pausa. Il termine di un periodo non trasferisce automaticamente il tempo residuo al periodo successivo.
- Pause, periodi, timeout di 60 secondi, cambi e tempi dei giocatori gestiti dal motore monotono `MatchTiming`; i tick periodici aggiornano la UI ma non sono fonte autorevole della durata.
- Titolari da zero al primo Play; riserve da zero. Il tempo individuale aumenta solo mentre un giocatore è in campo e scorre il tempo di gara; nessuna attribuzione retroattiva.
- Presenze in campo/panchina, cambi manuali, suggerimenti di rotazione, pesi Handicap e Superpower.
- Gol, assist e altri eventi; punteggi, cronologia, modifica e cancellazione dei record storici.

### Persistenza locale (C3.1)
- SwiftData V1 è l'archivio operativo locale per rosa, calendario e storico.
- Primo avvio: import idempotente dalle chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`; preserva UUID, campi opzionali, ordine ove applicabile e snapshot storico di nomi/statistiche/eventi.
- Le chiavi UserDefaults legacy non vengono cancellate o aggiornate dopo la migrazione; sono sorgente di recupero pre-migrazione, non un archivio operativo parallelo.
- Lo storico rimane consultabile anche dopo la rimozione di un giocatore dalla rosa; cancellare una partita programmata non elimina lo storico.
- Errori di apertura, decodifica, conflitto, verifica o salvataggio non sono presentati come uno store vuoto o come scritture riuscite.

## Decisioni di prodotto confermate, non tutte implementate

- L'app privata di gestione rimane nativa iOS; deve funzionare offline.
- Il backend futuro sarà autoritativo per i dati condivisi. La sincronizzazione e la gestione dei conflitti non sono state implementate.
- Il prodotto evolverà verso uso generico per squadre/competizioni, con MAPI GROUP prima utilizzatrice. In C3.1 non sono stati aggiunti tenant, società, utenti o ruoli.
- Branding dinamico, sito pubblico, area privata e PWA non sono parte di questo checkpoint.

## Ancora da implementare / verificare

- **Recovery live end-to-end:** il codice C3 e i test deterministici sono presenti; manca ancora la prova manuale di terminazione/rilancio su simulatore. La sessione usa JSON, non SwiftData.
- Backup/esportazione e rollback applicativo dopo che SwiftData abbia ricevuto modifiche successive alla migrazione.
- Validazione dell'importazione su payload reali già presenti su un dispositivo; in C3.1 sono state usate solo fixture sintetiche.
- Backend, autenticazione, sincronizzazione, CloudKit, multi-squadra e PWA.


## Persistenza e recovery della partita live (C3)

- La sessione live viene salvata come aggregate JSON locale versionato, con copia primaria e generazione precedente verificabile. La conferma formazione viene salvata prima di mostrare il live; avvio, pause/riprese, sostituzioni, eventi, assist, timeout e transizioni rilevanti vengono persistiti senza usare i tick grafici come fonte temporale.
- Al cold start il motore ricostruisce un nuovo anchor monotono e considera il tempo trascorso solo secondo la politica di recovery; quando i clock discordano o è possibile un riavvio, richiede revisione e limita il tempo accreditabile. Non avvia automaticamente periodi successivi.
- La finalizzazione usa l’UUID della sessione come identità stabile del record storico e può essere ritentata senza duplicare un record equivalente. Una sessione viene rimossa solo dopo verifica dell’inserimento storico e del marcatore finale.
- I test verificano deterministici restore e interruzioni simulate; non è stata svolta una prova manuale di kill/relaunch dell’app, né una verifica su dati reali del dispositivo. Lo stato di validazione resta PARTIAL fino alla prova end-to-end raccomandata in `STATUS.md`.
