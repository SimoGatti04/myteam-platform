# Piano incrementale di consolidamento

Questo piano descrive checkpoint futuri; non autorizza a cambiare ora UI, regole di gioco o dati persistiti. A ogni checkpoint mantenere build eseguibile quando realisticamente possibile, controllare `git diff` e aggiornare `STATUS.md` con prove effettivamente eseguite.

## C1 — Rendere eseguibile la characterization suite

- **Problema:** la logica è concentrata in `ContentView.swift`; il target `APPTests` e cinque test sono stati predisposti, ma non eseguiti perché CoreSimulatorService/runtime non è disponibile nel contesto A0.
- **Componenti/file:** `APPTests/DomainCharacterizationTests.swift`, scheme `APP`, `APP.xcodeproj`; modelli `Codable` e `ScheduleCSVImporter` reali.
- **Modifiche:** eseguire i test su runtime iOS installato; aggiungere fixture JSON sintetiche e anonime che rappresentino i payload legacy osservati/documentati, test round-trip per ogni tipo effettivamente persistito e casi CSV validi/invalidi. Non estrarre logica di produzione solo per alzare il numero di test.
- **Dipendenze:** simulatore iOS disponibile; eventualmente accesso autorizzato a payload anonimi, senza esportare dati personali in Git.
- **Rischi:** fixture inventate possono dare falsa sicurezza; distinguere schema real legacy e schema sintetico.
- **Verifiche:** `xcodebuild test` su simulatore; compilazione app/test; verifica diff e fixture.
- **Accettazione:** test effettivamente eseguiti e risultati registrati; formati di test identificati; nessun payload reale o sensibile versionato; app compilabile.
- **Recupero:** i test e il target possono essere rimossi/revertiti senza toccare dati; preservare commit A0 e non usare `clean` distruttivo.
- **Stato finale:** characterization riproducibile per i contratti attuali; non implica copertura dei flussi UI.

## C2 — Correttezza del tempo partita

- **Problema:** i tick della UI sono la fonte del tempo e possono essere ritardati/omessi quando il processo non riceve callback.
- **Componenti/file:** futuro componente `MatchTiming`/stato partita; inizialmente estrazione minima dalle funzioni timer di `ContentView.swift`.
- **Modifiche:** definire prima il significato di tempo conteggiato durante background, blocco schermo e app chiusa; usare tempo effettivo trascorso rispetto a un anchor, con pause esplicite per pausa, timeout e intervallo. Separare durata di gara, timeout e tempo individuale; controllare a fine intervallo i limiti di ciascun periodo. Nessuna modifica a durata, controlli o grafica.
- **Dipendenze:** C1; decisione prodotto sul comportamento al background/terminazione; clock iniettivo per test.
- **Rischi:** doppi conteggi o salti a cavallo di pause/transizioni; tempo di parete alterato dall'utente/OS; bisogno di coerenza tra giocatrici e clock globale.
- **Verifiche:** test deterministici di start/pause/resume, tick mancanti, timeout da running/paused, fine primo tempo, intervallo, secondo tempo, fine gara, sostituzione e minute accounting; successivo collaudo su dispositivo con lock/background.
- **Accettazione:** risultati identici ai percorsi normali già supportati e tempo calcolato senza dipendenza dal numero di callback; UI e regole confermate invariate.
- **Recupero:** mantenere commit separato e reversibile; non attivare logica nuova su dati persistiti senza schema nuovo testato.
- **Stato finale:** clock deterministico testato in-process; la ripresa dopo riavvio resta al checkpoint C3.

## C3 — Persistenza e ripristino sessione live

- **Problema:** la partita live è solo `@State` e le scritture/letture JSON non espongono errori.
- **Componenti/file:** adapter di persistenza locale, snapshot/sessione live versionata, coordinamento app lifecycle; chiavi `Futsal*V1` lasciate inalterate.
- **Modifiche:** esplicitare esiti di load/save, non sostituire un payload non decodificabile con una lista vuota; conservare copia recuperabile prima della migrazione. Aggiungere un formato separato per la sessione attiva con clock/anchor, fase, formazione, goal events, timeout e associazione calendario. Nessun database predefinito: confrontare file JSON atomico, JSON attuale migliorato e SQLite/SwiftData rispetto a dati/operazioni reali.
- **Dipendenze:** C1 e C2; semantica di C2; verifica dei payload legacy disponibili.
- **Rischi:** overwrite di dati utente, schema incompatibile, snapshot incoerente tra più valori, scelta sbagliata del comportamento al riavvio.
- **Verifiche:** round-trip, fixture vecchie, dati parziali/corrotti, fallimento scrittura, interruzione tra commit, crash/relaunch simulato; backup e restore provati. Test su copia, mai sui dati personali originali.
- **Accettazione:** le tre chiavi legacy leggono e restano preservate; sessione live recupera in modo deterministico; errori sono espliciti; rollback provato; nessun dato utente cancellato.
- **Recupero:** backup/snapshot pre-migrazione; lettura compatibile delle chiavi V1 durante rollout; opzione per tornare alla versione codice precedente senza perdita dei V1.
- **Stato finale:** persistenza locale esplicita e sessione recuperabile, senza backend.

## C4 — Estrazione progressiva dei confini interni

- **Problema:** modelli e logica riutilizzabile sono legati a un file/view da 10.737 righe.
- **Componenti/file:** primi candidati `Import/ScheduleCSVImporter`, `Domain` modelli e funzioni pure; poi `MatchTiming`, `Rotation`, `Persistence`. Cartelle sotto `app/APP/`, stesso target.
- **Modifiche:** una responsabilità per commit; mantenere l'API interna minima e non introdurre protocolli forwarding. Separare regole calcio a 5 (roster, 5 in campo, portieri, handicap) dalle funzioni davvero generiche (misura/accumulo temporale) solo se il comportamento lo dimostra.
- **Dipendenze:** C1-C3; test caratterizzazione che coprano il comportamento estratto.
- **Rischi:** modifica accidentale dell'ordine SwiftUI o dei binding; differenze di visibilità/modello Codable; regressioni da spostamento più cambiamento.
- **Verifiche:** build dopo ogni estrazione, test mirati e suite completa; confronto dei contratti JSON e hash/asset; review del diff funzionale.
- **Accettazione:** ogni estrazione ha test sul codice reale e non cambia comportamento/serializzazione; l'app resta compilabile.
- **Recupero:** commit per singola responsabilità; revert del solo estratto senza rollback di altre feature.
- **Stato finale:** monolite modulare con componenti testabili nel medesimo target, non package distribuiti.

## C5 — Integrità di eventi e storico

- **Problema:** score e statistiche possono essere indipendenti dagli eventi per scelta dell'editor; lo storico non registra sostituzioni e non ricostruisce tutta la gara.
- **Componenti/file:** `GoalEvent`, `MatchRecord`, editor storico, eventuale evento sostituzione e report/derivazioni.
- **Modifiche:** definire invarianti esplicite per score↔eventi e ID/nome storici; testare undo, correzione e ricalcolo. Valutare un event log della partita (goal e sostituzioni) solo se serve ricostruzione/correzione auditabile. Conservare gli snapshot e consentire modifiche senza cancellare riferimenti storici alla rosa corrente.
- **Dipendenze:** C1, C3 e confini di C4; specifica funzionale per il comportamento in caso di score manuale discordante.
- **Rischi:** reinterpretare dati storici già indipendenti; perdita o riassegnazione di goal/assist se cambiano nome/ID; migrazione ampia.
- **Verifiche:** fixture legacy, aggiungi/modifica/elimina evento, undo, score indipendente e ricalcolato, marcatrice/assist rimossa dalla rosa, calendario eliminato o cambiato.
- **Accettazione:** coerenza e scelta di autorità sono visibili; storico precedente si apre e si modifica conservando gli snapshot; nessuna adozione automatica di event sourcing integrale.
- **Recupero:** aggiungere campi opzionali e leggere vecchi record; mantenere snapshot originale e procedura per tornare indietro.
- **Stato finale:** correzioni storiche prevedibili; timeline completa soltanto se il bisogno è dimostrato.

## C6 — Regole di partecipazione e rotazione

- **Problema:** i ruoli esistono nei modelli, ma non vincolano cambi o suggerimenti; edge case e parità non sono isolati.
- **Componenti/file:** logica `Rotation`/`FutsalRules`, `MatchPlayer`, controlli UI esistenti.
- **Modifiche:** codificare invarianti di almeno/at-most cinque come richiesto dal flusso, ruolo del portiere, nessun candidato non disponibile, peso minimo, Superpower, soglie e tie-break deterministico. Non introdurre ottimizzatore complesso. Permettere revisione/annullamento cambio solo come requisito separato e esplicito; non alterare UI in un intervento tecnico.
- **Dipendenze:** C1, C4 e conferma dei requisiti sul ruolo portiere e sulla temporanea inferiorità numerica.
- **Rischi:** comportamento di gioco visibile; formazione dati legacy priva di ruolo affidabile; confondere una regola del futsal con una policy specifica MAPI.
- **Verifiche:** test per 0/1/5/oltre 5 in campo nei limiti raggiungibili, nessuna riserva, tutte le superpower, parità, peso 0.25, portiere e giocatrice di movimento, cambio manuale e suggerito.
- **Accettazione:** invarianti deliberate documentate e testate; suggerimenti deterministici e non invalidi; UI invariata salvo richiesta prodotto.
- **Recupero:** feature behavior isolata in commit e rollback possibile; nessuna conversione persistita di ruolo senza backup.
- **Stato finale:** regole leggibili e testabili, senza algoritmo di ottimizzazione anticipato.

## C7 — Integrazione, regressione e handoff

- **Problema:** verifiche A0 sono build-only; nessun collaudo UI o dispositivo.
- **Componenti/file:** tutti i target, `APPTests`, documenti di architettura/status/testing.
- **Modifiche:** consolidare test unit/integration dei contratti; aggiungere UI test solo per flussi essenziali che giustificano manutenzione. Aggiornare matrice funzionalità e rischi.
- **Dipendenze:** C1-C6 secondo ciò che viene implementato; simulatori/dispositivi e fixture disponibili.
- **Rischi:** UI tests fragili o dipendenti da configurazioni locali; dichiarazioni troppo ampie rispetto alle prove.
- **Verifiche:** build app, test target effettivamente eseguito, flusso manuale Welcome→Rosa/Calendario→Preparazione→Live→Gol/Cambi→Fine→Storico, background/riapertura, almeno un dispositivo reale se disponibile.
- **Accettazione:** matrice PASS/FAIL/SKIPPED/NOT RUN/UNAVAILABLE aggiornata; limitazioni e dati test documentati; nessuna dichiarazione di stabilità senza test end-to-end.
- **Recupero:** usare commit locali per regressioni; preservare i dati di test e tenere dati reali fuori dal test.
- **Stato finale:** baseline di manutenzione riproducibile e handoff aggiornato; nessun deploy remoto previsto.
