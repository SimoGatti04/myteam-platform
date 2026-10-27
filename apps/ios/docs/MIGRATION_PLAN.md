# Piano incrementale di consolidamento

Questo piano registra checkpoint, dipendenze e stato verificato. Gli esiti correnti sono in `STATUS.md` e `TESTING.md`.

## Completato — C1: characterization test

Suite su contratti Codable/CSV con fixture anonime sintetiche e baseline del comportamento esistente.

## Completato — C2: motore temporale

`MatchTiming` deterministico con clock controllabile, formazione iniziale obbligatoria, contabilità individuale e transizioni pause/timeout/intervallo. La semantica C2 è rimasta invariata in C3.2-R1.

## Completato — C3.1: rosa, calendario e storico in SwiftData V1

SwiftData V1 è la fonte operativa per le tre collezioni gestionali. Import idempotente dalle chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`; le chiavi originali restano conservate come sorgente legacy. I test usano fixture sintetiche; nessuna migrazione di payload reali è attestata.

## Implementato — C3: recovery live, storage operativo poi superato

Il precedente C3 ha introdotto snapshot/recovery temporale e salvataggio live JSON in Application Support. La parte di formato e recovery è riutilizzata; la scelta di JSON come archivio operativo non è più valida. ADR-0005 conserva il resoconto storico ed è SUPERSEDED da ADR-0006.

## Completato — C3.2-R1: sessione live operativa in SwiftData V2

**Problema corretto:** il JSON esterno del precedente C3 separava la sessione live da rosa/calendario/storico, in contrasto con la decisione di SwiftData come archivio locale principale.

**Implementazione:** V1 resta immutato; V2 aggiunge un aggregate live, una ricevuta d'import per i file C3 preesistenti e una migrazione additiva. Un repository `MatchDataStore` salva il payload Codable dentro SwiftData, mantiene una generazione precedente e quarantine per recovery, legge JSON legacy in sola lettura. Prima della finalizzazione atomica dello storico e della rimozione della sessione viene salvato e riletto un checkpoint `.finalizing`, che rende ritentabile l'intento esatto.

**Verifiche:** build-for-testing PASS; 90 XCTest PASS, 0 FAIL, 0 SKIPPED. La migrazione V1→V2, la riapertura e la preservazione dei dati C3.1 sono testate su store sintetici. L'import dei file JSON precedenti e i retry sono coperti da fixture sintetiche con verifica dei byte originali. Checkpoint di finalizzazione, errore di scrittura, rollback per conflitto, rifiuto del backup in revisione e retry idempotente sono coperti da test. Non è stata eseguita la prova UI kill/relaunch perché il Mac era bloccato; non sono state usate sessioni o dati reali.

**Recupero e limiti:** l'import non cancella né riscrive i file JSON originari. Dati corrotti/non supportati non producono una sessione vuota o una ricevuta di successo. La generazione precedente è nello stesso database SwiftData e non protegge da perdita/corruzione dell'intero store; il checksum non sostituisce backup. Non cancellare manualmente store, file di recovery o chiavi V1. La sessione post-reboot resta soggetta alla policy temporale già documentata.

## C3.2-V — validazione end-to-end completata

- La prova UI con store isolato e dati sintetici ha verificato avvio, eventi, sostituzione, kill/relaunch, recupero, pausa/ripresa e finalizzazione idempotente; C3.2-V-SUPP ha coperto recovery temporale incerto, nuova partita e correzioni successive.
- Nessun dato personale o store reale è stato usato. La prova su dispositivo fisico e lock/unlock OS reale resta requisito pre-release.
- Backend, CloudKit, autenticazione, sincronizzazione, PWA e branding dinamico restano fuori dal runtime attuale e richiedono un incarico/prodotto separato.

## Completato — C3.3: cronologia presenze e coerenza delle correzioni

**C3.3-A — Modello temporale.** Aggiunta una timeline Codable versionata, con coordinate per periodo, sequence ordinata, origine delle transizioni e distinzione fra copertura completa/parziale. I payload precedenti vengono decodificati tramite migrazione esplicita; il tempo legacy diventa baseline osservata, senza ricostruzioni inventate.

**C3.3-B — Motori e persistenza.** `MatchTiming` ricalcola minuti solo per intervalli attendibili; le rettifiche individuali sono persistite come offset separati. Motori puri di correzione offrono proposta, validazione, aggiornamento degli eventi/statistiche e undo limitato. SwiftData V3 aggiunge la metadata necessaria allo storico con migration stage leggero V2→V3; il payload live è aggiornato a schema 3.

**C3.3-C — Interfaccia e verifica.** Aggiunti flussi contestuali per correzioni live/storico, accessibilità per i nuovi controlli e XCUITest reale su simulatore per conferma di una correzione live e recovery dopo terminazione. La regressione completa ha 122 test PASS, nessun fallimento o skip; i due warning SwiftUI sono documentati in `TESTING.md`.

Nessun backend o sincronizzazione è stato introdotto. Nessun payload reale del dispositivo è stato usato. Restano da fare prima del pre-release la prova su dispositivo fisico e lock/unlock reale; non sono una prova equivalente ai test con clock controllato.
