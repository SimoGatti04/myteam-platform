# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 25 ottobre 2026 — verifica C3.2-V.

## Esito del checkpoint

**C3.2-R1: COMPLETE per lo scope architetturale, migrazione e test.** La sessione live usa ora SwiftData V2 come archivio operativo locale insieme a rosa, calendario e storico. Il JSON scritto dal precedente C3 è soltanto una sorgente d'importazione in sola lettura; i file originali non vengono cancellati o riscritti. Prima della transazione terminale, la sessione viene salvata come `.finalizing` con lo snapshot esatto del record; inserimento/verifica dello storico e rimozione della sessione restano atomici nello stesso `ModelContext`.

Lo schema V1 C3.1 resta immutato. È stata verificata con fixture sintetiche la migrazione di uno store V1 popolato a V2, la chiusura/riapertura e la preservazione di rosa, calendario, record, partecipanti ed eventi. È stata eseguita l'intera suite aggiornata: **90 XCTest PASS, 0 FAIL, 0 SKIPPED** su iPhone 18 Pro Simulator, iOS 27.0 (build runtime 24A434). Il build-for-testing app+test è riuscito. La verifica supplementare ha aggiunto un test di scrittura dopo il restore e ha reso effettiva la chiusura dei riferimenti SwiftData prima della riapertura nei test di finalizzazione; il checkpoint `.finalizing` riaperto è verificato come retry pendente. Non sono stati usati dati personali o store reali del dispositivo.

**Limite runtime registrato prima della verifica C3.2-V:** la prova UI di terminazione e riapertura non era stata eseguita in C3.2-R1; il successivo test end-to-end C3.2-V è ora riportato in fondo a questo documento. Restano distinti il comportamento dopo terminazione del processo, verificato da XCUITest, e il recupero dopo reboot o su dispositivo reale, non verificato.

## Stato iniziale e Git

- Baseline richiesta: `bbabf8a` su branch `main`; il working tree iniziale conteneva modifiche non committate relative al tentativo precedente, preservate e verificate prima di proseguire.
- Nessun remote configurato; nessun push effettuato.
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

Il percorso essenziale di partita live è stato esercitato in C3.2-V. Restano da verificare separatamente il blocco/sblocco dello schermo del simulatore, il recupero con riferimenti temporali incerti, l’avvio di una nuova partita subito dopo la finalizzazione e l’identità UUID osservata direttamente. Non iniziare C3.3 o modifiche al motore temporale come parte di queste verifiche.

## C3.2-V — Esito: PARTIAL, flussi essenziali PASS

Il test XCUITest `LiveMatchLifecycleUITests/testActivePausedAndFinalizedMatchSurvivesProcessTermination` ha interagito con l’app reale installata nel simulatore isolato `AURINFORMATC-C3.2-V` (iPhone 18 Pro, iOS 27.0, runtime build 24A434; UDID `2CF865DB-369B-47B1-9608-FA1212AD3FD4`) usando esclusivamente sei giocatori sintetici. Sono passati il flusso attivo, il kill/relaunch, il ripristino di timer/eventi/partecipanti, la pausa/ripresa esplicita, il background/foreground e la finalizzazione con record storico unico e nessuna sessione live riproposta dopo il nuovo avvio.

La suite di regressione C1–C3.2-R1 aggiornata è passata: **91 XCTest PASS, 0 FAIL, 0 SKIPPED**. La build app per iOS Simulator è passata. Il test UI ha un esito `Passed` nel result bundle (1 PASS, 0 FAIL, 0 SKIPPED); il processo `xcodebuild` è però terminato con codice 75 dopo il timeout di 600 secondi nella raccolta delle diagnostiche del simulatore, successiva all’esecuzione del test. Il warning runtime `Invalid frame dimension (negative or non-finite)` è rimasto non classificato; la build segnala inoltre un warning di isolamento `@MainActor` preesistente in `MatchDataPersistence.swift`.

Una prima esecuzione UI ha riprodotto un conflitto di finalizzazione tra la data del record in memoria e quella serializzata nel checkpoint live (JSON a millisecondi). È stata introdotta una tolleranza di 1 microsecondo nella verifica di equivalenza dei record e un test di regressione deterministico; il test prima falliva e ora è incluso nella suite da 91 test. Nessuna chiave o formato persistito è stato cambiato.

**Limiti residui:** il controllo Computer Use ha segnalato il Mac bloccato e non è stato aggirato; è stata comunque eseguita la modalità XCUITest reale. Il background/foreground è verificato via `.home`/`activate`, ma non il blocco schermo. Non sono stati eseguiti lo scenario di recovery temporale incerto, la verifica UI dell’avvio di una nuova partita dopo la finalizzazione, né l’ispezione diretta dell’UUID della sessione. Non sono stati usati store di produzione, dati personali o backup reali. Nessun push o remote.

Result bundle mantenuti come evidenza:

- UI end-to-end: `/private/tmp/AURINFORMATC-C3.2-V-UIFinal.xcresult` (test case Passed; raccolta diagnostica Xcode timeout successiva).
- Suite XCTest: `/private/tmp/AURINFORMATC-C3.2-V-Regression-Retry.xcresult` (91 Passed).
- Regressione data post-fix: `/private/tmp/AURINFORMATC-C3.2-V-DateRegression-Fixed.xcresult` (1 Passed).

Per dettagli, comandi, matrice e file interessati consultare `TESTING.md`.
