# ADR-0005 — Persistenza JSON e recovery dell’unica sessione live

- **Stato:** ACCETTATO — 24 ottobre 2026
- **Ambito:** una sessione live locale; rosa, calendario e storico restano in SwiftData

## Contesto

C3 richiede che la partita corrente sia ricostruibile dopo terminazione del processo e interruzioni durante salvataggio/finalizzazione. La sessione è un aggregate coerente con eventi discreti, snapshot del motore temporale e stato di recovery; non richiede query relazionali o gestione concorrente di molte sessioni. Le collezioni gestionali sono già normalizzate in SwiftData (ADR-0004).

## Decisione

Persistire la singola sessione come documento JSON Codable versionato in Application Support tramite `LiveMatchSessionStore`. Conservare un file primario e una generazione precedente; scrivere atomicamente, verificare checksum/decodifica/validazione e non sovrascrivere automaticamente dati non leggibili o versioni incompatibili. Le fixture e i test usano directory temporanee isolate. L’aggregate contiene lo stato di `MatchTiming`, UUID sessione, partecipanti snapshot, titolari, eventi/assist, riferimenti alla partita programmata, istanti recovery e stato/record di finalizzazione. Non serializzare una View né duplicare il minutaggio individuale quale fonte autorevole separata dal motore.

Nel processo corrente `MatchTiming` continua a usare il clock monotono. La sessione conserva un checkpoint di clock continuo e un timestamp civile per stimare il tempo tra processi; i clock incoerenti, il clock civile futuro/arretrato o un possibile riavvio richiedono revisione esplicita. Il tempo applicabile è sempre limitato alla durata residua dell’attività e non avvia automaticamente il periodo successivo. Il nuovo processo crea nuovi anchor monotoni.

La finalizzazione usa `sessionID` come ID del `MatchRecord`: prima scrive due generazioni dello stato `finalizing` con lo stesso record, poi inserisce/confronta il record nello storico SwiftData, poi salva `finalized` e soltanto infine rimuove il documento. Le due generazioni garantiscono un token idempotente anche se la primary si corrompe dopo il commit dello storico. Retry equivalenti non duplicano lo storico; contenuto in conflitto è rifiutato. Le tre chiavi UserDefaults V1 non vengono toccate.

## Alternative considerate

- **SwiftData per la sessione:** scartata per questo singolo aggregate; introduce mapping/relazioni e transazioni più articolate senza query o vantaggio concreto. Rivalutare se servono molte sessioni simultanee, query, relazioni o sincronizzazione.
- **JSON atomico senza generazione precedente:** insufficiente in caso di corruzione o interruzione; per questo si conserva una generazione verificata.
- **Database esterno, CloudKit o backend:** fuori scope e prematuro. Il backend futuro sarà autorevole per i dati condivisi ma non rientra in C3.

## Conseguenze e rischi

- La fonte locale della sessione live è il documento JSON; la fonte locale di rosa/calendario/storico è SwiftData. Non si tengono due archivi operativi sincronizzati per gli stessi dati.
- Il recovery è dipendente dal contratto Codable; una versione futura deve introdurre migrazione esplicita e conservare gli snapshot non supportati.
- Non è persistito un boot identifier affidabile. Il confronto monotono/civile segnala molti casi di riavvio o alterazione dell’orologio, ma è euristico e non prova tutte le combinazioni possibili. Mantenere questo limite documentato e rivederlo prima di affidare il conteggio post-reboot senza revisione utente.
- I test deterministici simulano restore e interruzioni, ma non sostituiscono una prova manuale completa di kill/relaunch sul simulatore o dispositivo.
- Nessun backend, sincronizzazione, CloudKit, autenticazione o modifica delle chiavi legacy è introdotto.
