# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 30 ottobre 2026 — stato R1-D; verifica C3.3 sul candidato monorepo R1-A3.

## Stato corrente — C3.3

**Esito: COMPLETE per lo scope del checkpoint.** Cronologia attendibile delle presenze, correzioni live/storico persistenti e UI contestuale sono integrate; la suite finale è **122 PASS, 0 FAIL, 0 SKIPPED** su iOS Simulator. Due warning SwiftUI di frame non valido restano da diagnosticare; non sono state eseguite prove su device fisico o lock/unlock reale. Dettagli, commit e limiti sono riportati nella sezione C3.3 più avanti.

## Integrazione locale myteam-platform — R1-A3

La cronologia iOS è stata riscritta per il percorso `apps/ios/` e integrata in un branch isolato sulla base GitHub pubblicata. Build e suite C3.3 sono state eseguite sul commit `4568542756051abbadf0c175559f08735cd9eb26`: **build PASS; 122 test PASS, 0 FAIL, 0 SKIPPED** su iPhone 18 Pro Simulator. Il commit documentale successivo non è stato testato separatamente e non cambia il codice o il progetto Xcode. In R1-A3 non sono stati eseguiti push o merge; `AURINFORMATC` resta immutato. Dettagli e SHA sono nel rapporto `docs/platform/IOS-MONOREPO-MIGRATION.md`.

**Stato di pubblicazione successivo (R1-D, 30/10/2026):** R1-B ha pubblicato il branch `codex/ios-r1-a3-publication` su GitHub all'SHA `42912195b63b401d5c6200f314338ca9a2754d06`; R1-C ha aperto la Draft PR #1 sulla base `docs/ios-c4-platform-decisions-20261029` (`7fd81044…`). La revisione QA indipendente è ancora pendente e non è stato eseguito alcun merge su `main`. Build e suite C3.3 restano **122 PASS** sul commit testato `4568542756051abbadf0c175559f08735cd9eb26`; il tip documentale non è stato testato separatamente. CI remota: **NOT RUN**. Nessun deploy o distribuzione iOS.

## Esito del checkpoint

**C3.2-R1: COMPLETE per lo scope architetturale, migrazione e test.** La sessione live usa ora SwiftData V2 come archivio operativo locale insieme a rosa, calendario e storico. Il JSON scritto dal precedente C3 è soltanto una sorgente d'importazione in sola lettura; i file originali non vengono cancellati o riscritti. Prima della transazione terminale, la sessione viene salvata come `.finalizing` con lo snapshot esatto del record; inserimento/verifica dello storico e rimozione della sessione restano atomici nello stesso `ModelContext`.

Lo schema V1 C3.1 resta immutato. È stata verificata con fixture sintetiche la migrazione di uno store V1 popolato a V2, la chiusura/riapertura e la preservazione di rosa, calendario, record, partecipanti ed eventi. È stata eseguita l'intera suite aggiornata: **90 XCTest PASS, 0 FAIL, 0 SKIPPED** su iPhone 18 Pro Simulator, iOS 27.0 (build runtime 24A434). Il build-for-testing app+test è riuscito. La verifica supplementare ha aggiunto un test di scrittura dopo il restore e ha reso effettiva la chiusura dei riferimenti SwiftData prima della riapertura nei test di finalizzazione; il checkpoint `.finalizing` riaperto è verificato come retry pendente. Non sono stati usati dati personali o store reali del dispositivo.

**Limite runtime registrato prima della verifica C3.2-V:** la prova UI di terminazione e riapertura non era stata eseguita in C3.2-R1; il successivo test end-to-end C3.2-V è ora riportato in fondo a questo documento. Restano distinti il comportamento dopo terminazione del processo, verificato da XCUITest, e il recupero dopo reboot o su dispositivo reale, non verificato.

## Stato iniziale e Git

- Baseline richiesta: `bbabf8a` su branch `main`; il working tree iniziale conteneva modifiche non committate relative al tentativo precedente, preservate e verificate prima di proseguire.
- Alla baseline iniziale: nessun remote configurato; nessun push effettuato.
- Non sono stati aperti né modificati i file reali in Application Support o dati UserDefaults dell'utente. I test hanno usato ModelContainer e directory temporanei isolati.
- Il precedente ADR-0005 e i report C3 sono conservati come evidenza storica, con la decisione JSON operativa ora contrassegnata SUPERSEDED da ADR-0006. Il bundle della riesecuzione XCTest è `/private/tmp/AURINFORMATC-C3R1-Retest.xcresult` (90 passati, 0 falliti, 0 saltati).
- I commit di implementazione, test e documentazione di questo checkpoint sono locali. Fare riferimento a `git log` per gli identificativi correnti; non è stato creato alcun remote.

## Modifiche principali

- `MatchManagerSchemaV2` 2.0.0 e migrazione leggera V1→V2; V1 immutato.
- Aggiunti `StoredLiveMatchSession` e `StoredLiveSessionImportReceipt`.
- `MatchDataStore` implementa il repository live: generazione precedente/quarantena, import legacy verificato, readback e finalizzazione atomica con storico.
- Sostituito l'adapter JSON operativo con un reader legacy in sola lettura; bootstrap importa prima di caricare la sessione.
- Aggiornati i test di persistenza live e documentazione/ADR. Nessuna modifica intenzionale alla UI ordinaria, palette, asset o comportamento temporale C2.

## Prossime verifiche residue

Il recovery temporale incerto e la creazione di una nuova partita dopo finalizzazione sono stati verificati in C3.2-V-SUPP su simulatori isolati con dati sintetici. Il solo lock/unlock reale resta `NOT RUN`: l’interfaccia pubblica `simctl io` di Xcode 27.0 espone il power on/off dello schermo ma non un’operazione lock/unlock; spegnere il display non è stato trattato come equivalente al blocco del dispositivo. Non sono stati usati workaround o interazioni con un host bloccato. Mantenere questa verifica nel collaudo pre-release su un dispositivo o tramite un’interfaccia supportata. Non iniziare C3.3 né modificare il motore temporale nell’ambito di questo residuo.

## C3.2-V — Esito: COMPLETE per i flussi essenziali

Il test XCUITest `LiveMatchLifecycleUITests/testActivePausedAndFinalizedMatchSurvivesProcessTermination` ha interagito con l’app reale installata nel simulatore isolato `AURINFORMATC-C3.2-V` (iPhone 18 Pro, iOS 27.0, runtime build 24A434; UDID `2CF865DB-369B-47B1-9608-FA1212AD3FD4`) usando esclusivamente sei giocatori sintetici. Sono passati il flusso attivo, il kill/relaunch, il ripristino di timer/eventi/partecipanti, la pausa/ripresa esplicita, il background/foreground e la finalizzazione con record storico unico e nessuna sessione live riproposta dopo il nuovo avvio.

La suite di regressione C1–C3.2-R1 aggiornata è passata: **91 XCTest PASS, 0 FAIL, 0 SKIPPED**. La build app per iOS Simulator è passata. Il test UI ha un esito `Passed` nel result bundle (1 PASS, 0 FAIL, 0 SKIPPED); il processo `xcodebuild` è però terminato con codice 75 dopo il timeout di 600 secondi nella raccolta delle diagnostiche del simulatore, successiva all’esecuzione del test. Il warning runtime `Invalid frame dimension (negative or non-finite)` è rimasto non classificato; la build segnala inoltre un warning di isolamento `@MainActor` preesistente in `MatchDataPersistence.swift`.

Una prima esecuzione UI ha riprodotto un conflitto di finalizzazione tra la data del record in memoria e quella serializzata nel checkpoint live (JSON a millisecondi). È stata introdotta una tolleranza di 1 microsecondo nella verifica di equivalenza dei record e un test di regressione deterministico; il test prima falliva e ora è incluso nella suite da 91 test. Nessuna chiave o formato persistito è stato cambiato.

**Limiti supplementari:** il controllo Computer Use ha segnalato il Mac bloccato e non è stato aggirato; la modalità XCUITest ha comunque verificato l’app reale e i flussi essenziali richiesti. Il background/foreground è verificato via `.home`/`activate`, ma non il blocco schermo. Non sono stati eseguiti lo scenario di recovery temporale incerto, la verifica UI dell’avvio di una nuova partita dopo la finalizzazione, né l’ispezione diretta dell’UUID della sessione. Queste lacune non sono presentate come test superati. Non sono stati usati store di produzione, dati personali o backup reali. In quella fase non sono stati eseguiti push né configurati remote.

Result bundle mantenuti come evidenza:

- UI end-to-end: `/private/tmp/AURINFORMATC-C3.2-V-UIFinal.xcresult` (test case Passed; raccolta diagnostica Xcode timeout successiva).
- Suite XCTest: `/private/tmp/AURINFORMATC-C3.2-V-Regression-Retry.xcresult` (91 Passed).
- Regressione data post-fix: `/private/tmp/AURINFORMATC-C3.2-V-DateRegression-Fixed.xcresult` (1 Passed).

Per dettagli, comandi, matrice e file interessati consultare `TESTING.md`.


## C3.2-V-SUPP — Esito: PARTIAL, casi supplementari verificati

Il test UI di recovery con fixture sintetica ha superato 1 test; il flusso esercita la revisione temporale, il limite massimo di 30 secondi, la correzione a zero e la persistenza della decisione dopo kill/relaunch. Il test UI del ciclo partita ha superato 1 test; dopo la finalizzazione ha avviato una seconda partita senza duplicare o sostituire il record storico. Una query SQLite in sola lettura sullo store V2 isolato ha confermato un record storico (1 gol, 1 evento collegato, 6 partecipanti) e una sola sessione live attiva con UUID diverso dall’UUID del record finalizzato.

La suite `APPTests` è passata: **91 PASS, 0 FAIL, 0 SKIPPED**. I due test UI supplementari sono passati separatamente (1 PASS ciascuno). Build app+test e controlli del diff sono passati. Non è stato modificato codice produttivo, schema SwiftData, UI ordinaria o asset. Un’asserzione di test iniziale richiedeva erroneamente che il cronometro restasse esattamente a `00:30` dopo aver ripreso il gioco; la misura reale `00:27` rifletteva il normale avanzamento durante l’interazione UI. È stata corretta solo l’asserzione, che ora verifica il limite `0...30` e il successivo stato in pausa dopo il riavvio.

C3.2-V-SUPP resta `PARTIAL` perché il lock/unlock reale non è stato eseguibile con gli strumenti pubblici disponibili. Nessun dato reale è stato letto, nessun backup è stato modificato e C3.3 non è iniziato. Le evidenze e la matrice completa sono in `docs/TESTING.md`.

## C3.3 — cronologia delle presenze e correzioni manuali

**Esito: COMPLETE per lo scope C3.3; nessun checkpoint successivo avviato.** Il lavoro C3.3 è stato ripreso dal working tree già modificato sopra la baseline `891920e` su `main`; tali modifiche e gli snapshot di recupero esistenti sono stati preservati. A fine verifica i cambiamenti C3.3 sono stati committati localmente; nessun remote o push è stato configurato.

- C3.3-A: timeline di partecipazione Codable versionata, ordinamento stabile degli ingressi/uscite e baseline dichiarata per copertura parziale. Payload live aggiornato a schema 3 con migrazione dai precedenti formati; compatibilità C2 verificata con fixture sintetiche.
- C3.3-B: anteprima/validazione per correzione del tempo, minuti individuali, sostituzioni, eventi e record storico; la proiezione UI delle sostituzioni simultanee è stata corretta per rispettare la sequence degli eventi (non l’ordine casuale degli UUID), con test deterministico; ricalcolo limitato ai dati coperti; rettifiche manuali separate; undo limitato e salvataggio SwiftData con readback/test di riapertura.
- C3.3-C: controlli contestuali live e storico e XCUITest di correzione live con conferma, terminazione del processo e recupero.
- SwiftData `MatchManagerSchemaV3` aggiunge la metadata di correzione storica, con migrazione leggera V2→V3; le versioni precedenti restano disponibili.
- Verifica conclusiva: `xcodebuild test` su Xcode 27.0 (`27A266a`), iPhone 18 Pro Simulator, iOS 27.0 (`24A434`): **122 PASS, 0 FAIL, 0 SKIPPED** (119 test APPTests e 3 XCUITest). Result bundle e log finali sono conservati in `/private/tmp/AURINFORMATC-C3.3-final-regression-20261027.xcresult` e `.log`.
- Il result bundle segnala due warning runtime `Invalid frame dimension (negative or non-finite).` durante due XCUITest; le asserzioni passano, ma la causa resta da isolare. Nessuna prova su dispositivo fisico o lock/unlock reale è stata svolta. Non sono stati usati dati personali o store reali.

**Confini non coperti:** il recovery dopo terminazione è verificato dal simulatore XCUITest e da fixture sintetiche, non da un dispositivo fisico; lock/unlock reale resta requisito pre-release. La compatibilità con specifici payload reali legacy non è attestata da fixture sintetiche. Backend, sincronizzazione, CloudKit, modifiche grafiche e migrazioni ulteriori non fanno parte di C3.3.

## myteam-platform — Decisioni architetturali approvate (27 ottobre 2026)

**Stato delle decisioni: APPROVATO dall'utente.**
Riferimenti: ADR-0008, Registro decisioni myteam-platform e Addendum architetturale 27 ottobre 2026.

### Quadro di classificazione (Regole di handoff)
- **IMPLEMENTATO e VERIFICATO (C3.3)**:
  - App iOS nativa offline-capable con SwiftData V3 (rosa, calendario, storico, aggregate live in V2, metadati di correzione storica in V3).
  - Motore temporale deterministico e timeline delle presenze con coordinate di tempo effettivo di gioco, frazioni e sequenza stabile.
  - Flussi di correzione contestuale live e storico con ricalcolo derivato e undo limitato.
  - Suite di test su iOS Simulator: 122 PASS (119 APPTests + 3 XCUITest), 0 FAIL, 0 SKIPPED. Commit HEAD `2bb9459` su branch `main`.
- **APERTO (Residui pre-release C3.3)**:
  - Verifica su dispositivo fisico e comportamento reale di lock/unlock schermo.
  - Diagnosi e isolamento dei due warning SwiftUI runtime `Invalid frame dimension (negative or non-finite)`.
- **APPROVATO (in attesa di progettazione ed esecuzione)**:
  - **Sincronizzazione offline-first**: app iOS autonoma con salvataggio locale indipendente; coda persistente locale delle modifiche; trasmissione HTTPS con identificativi univoci, conferme (ACK) e ritrasmissione senza duplicazioni; backend responsabile della riconciliazione e della pubblicazione pubblica via Server-Sent Events (SSE); recupero dello stato completo coerente dopo disconnessioni.
  - **Gerarchia delle fonti a 4 livelli con priorità prevalente sulla recenza**:
    1. Correzioni manuali dell'amministratore (massima priorità, revocabili solo esplicitamente).
    2. CSI o fonte esterna ufficiale (omologazione referti/risultati).
    3. CSI o fonte esterna ufficiosa (risultati provvisori/non omologati).
    4. App iOS privata (dati operativi dal campo).
    Riconciliazione per singolo campo/dato; i campi non coperti dalla fonte superiore conservano il valore della fonte inferiore. Tracciabilità storica di tutti i dati originali. Correzioni iOS operative non equivalenti ad override amministrativo.
  - **Integrazione CSI opzionale e condizionata**: sviluppo subordinato a verifica positiva di semplicità e affidabilità; polling mirato post-partita con stop immediato all'ufficializzazione; fallback su app iOS + admin.
  - **Regole statistiche e riservatezza**: statistiche aggregate (squadra, singoli, classifiche interne) limitate rigorosamente a partite concluse; LIVE isolato dalle statistiche aggregate; ricalcolo reattivo a fine gara e post-correzioni; dettagli singoli gol (con assistman) pubblici; minutaggi complessivi individuali e statistiche aggregate assist (totali, medie, classifiche) rigorosamente privati.
  - **Riconoscimenti**: POTM e Player of the Month dal sistema unificato di votazioni; pari merito pienamente ammessi con attribuzione completa (+1) per ciascun vincitore nelle statistiche.
- **PROPOSTO (non ancora deliberato come piano esecutivo)**:
  - Specifiche dettagliate dei contratti OpenAPI/JSON Schema di sincronizzazione e autenticazione client-server.
  - Modello e migrazione SwiftData Schema V4 per `SyncQueue` e attributi estesi (cartellini, stagione, competizione).
  - Piano operativo di riorganizzazione monorepo (`myteam-platform` con `apps/ios`, `apps/web`, `services/backend`).
  - Scelta stack tecnologico backend/frontend.

### Vincoli operativi attivi
- Nessuna modifica a SwiftData, modelli o codice applicativo senza preventivo piano verificato e suite di test aggiornata.
- Preservazione assoluta dell'autonomia operativa offline dell'app iOS.
- Tutte le future comunicazioni adotteranno la nomenclatura di stato: APPROVATO, PROPOSTO, IMPLEMENTATO, VERIFICATO e APERTO.
