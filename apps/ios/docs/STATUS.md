# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 25 ottobre 2026 — verifica C3.2-V.

## Esito del checkpoint

**C3.2-R1: COMPLETE per lo scope architetturale, migrazione e test.** La sessione live usa ora SwiftData V2 come archivio operativo locale insieme a rosa, calendario e storico. Il JSON scritto dal precedente C3 è soltanto una sorgente d'importazione in sola lettura; i file originali non vengono cancellati o riscritti. Prima della transazione terminale, la sessione viene salvata come `.finalizing` con lo snapshot esatto del record; inserimento/verifica dello storico e rimozione della sessione restano atomici nello stesso `ModelContext`.

Lo schema V1 C3.1 resta immutato. È stata verificata con fixture sintetiche la migrazione di uno store V1 popolato a V2, la chiusura/riapertura e la preservazione di rosa, calendario, record, partecipanti ed eventi. È stata eseguita l'intera suite aggiornata: **90 XCTest PASS, 0 FAIL, 0 SKIPPED** su iPhone 18 Pro Simulator, iOS 27.0 (build runtime 24A434). Il build-for-testing app+test è riuscito. La verifica supplementare ha aggiunto un test di scrittura dopo il restore e ha reso effettiva la chiusura dei riferimenti SwiftData prima della riapertura nei test di finalizzazione; il checkpoint `.finalizing` riaperto è verificato come retry pendente. Non sono stati usati dati personali o store reali del dispositivo.

**Limite runtime:** la prova UI end-to-end di avvio, terminazione forzata, riapertura e finalizzazione non è stata eseguita. Il controllo computer ha riportato il Mac bloccato e non è stato aggirato. I test deterministici sul repository e sul recovery non dimostrano il cold start manuale né il comportamento dopo reboot reale. Il sistema conserva il limite del recovery temporale euristico già documentato in C3.

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

## Prossimo gate consigliato

Quando il Mac è sbloccato, eseguire la prova UI con dati sintetici e ambiente isolato: creare una gara, avviare il tempo, registrare un gol e un cambio, terminare forzatamente l'app, riaprirla e verificare ripristino e finalizzazione con un solo record. Non usare dati reali e non cancellare lo store locale di produzione per preparare la prova.

## C3.2-V — Esito: PARTIAL

La verifica end-to-end con UI non è stata eseguita. Computer Use ha segnalato che il Mac è bloccato e che lo sblocco automatico non è riuscito; non è stato tentato alcun aggiramento del blocco o dei controlli di accesso. Una chiamata di sola lettura a `xcrun simctl list runtimes` ha restituito `CoreSimulatorService connection became invalid` e non ha potuto inventariare i runtime. Xcode 27.0 è installato, ma lo stato del simulatore in questa sessione non è stato verificabile.

Il bundle XCTest preesistente `/private/tmp/AURINFORMATC-C3R1-Retest.xcresult` è stato letto senza modificarlo: riporta 90 test passati, 0 falliti e 0 saltati su iPhone 18 Pro Simulator/iOS 27.0. È evidenza del checkpoint C3.2-R1, non una nuova esecuzione C3.2-V e non dimostra terminazione reale del processo, cold start o interazione UI.

Gli scenari A–E sono rimasti non eseguiti tramite UI; la matrice e i limiti sono registrati in `TESTING.md`. In questo checkpoint non sono stati avviati l’app, creati o resettati simulatori, né letti o modificati store, UserDefaults, dati personali, backup o risorse grafiche. Nessun difetto applicativo è stato riprodotto; l’assenza di una prova UI non consente di concludere che non ve ne siano.
