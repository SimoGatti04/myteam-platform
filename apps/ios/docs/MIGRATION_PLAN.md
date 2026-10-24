# Piano incrementale di consolidamento

Questo piano registra checkpoint e dipendenze. L’esito effettivo è in `STATUS.md` e `TESTING.md`.

## Completato — C1: characterization test

Suite XCTest sui contratti Codable/CSV, fixture anonime sintetiche e baseline iniziale.

## Completato — C2: motore temporale

`MatchTiming` deterministico con clock monotono controllabile, formazione iniziale obbligatoria, contabilità dei giocatori in campo, pausa/timeout/intervallo e test dei salti temporali. La semantica del motore non è stata alterata in C3.

## Completato — C3.1: persistenza locale di rosa/calendario/storico

SwiftData V1 è la fonte operativa per le tre collezioni gestionali. Import una tantum e idempotente da `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`; le chiavi originali restano conservate. Build e 53 XCTest C1+C2+C3.1 sono stati verificati su iPhone 18 Pro Simulator iOS 27.0. La migrazione di payload reali non è stata eseguita.

## Implementato — C3: persistenza e recovery live

**Problema:** lo stato live era volatile e la finalizzazione poteva essere duplicata o perdere il token di recovery dopo un’interruzione.

**Scelta:** un documento aggregate JSON Codable versionato in Application Support, primary atomica e generazione precedente; niente nuova entità SwiftData per l’unica sessione live. SwiftData resta la fonte per rosa, calendario e storico. Rationale e condizioni di revisione in `decisions/ADR-0005-live-session-json-recovery.md`.

**Scope effettivo:** `LiveMatchSessionSnapshot`, restore validato del `MatchTiming` con nuovo anchor, policy clock monotono/civile, recovery UI, checkpoint su operazioni live importanti e lifecycle, inserimento storico idempotente con UUID sessione e cleanup solo dopo marker finale. La conferma della formazione persiste prima di entrare nella schermata live. UserDefaults V1, backend, CloudKit e sincronizzazione non sono coinvolti.

**Verifiche:** app-only build PASS e 81 XCTest C1+C2+C3.1+C3 PASS su iPhone 18 Pro Simulator iOS 27.0; zero fail/skipped. Nessuna prova manuale kill/relaunch, dati reali o reboot reale: l’accettazione end-to-end resta da completare.

**Recovery e rollback:** le fixture C3 sono sintetiche; nessuna chiave legacy o backup esistente è stata rimossa. Primary/backup danneggiati restano preservati e il backup richiede recovery esplicito. Il record storico usa una chiave stabile e la finalizzazione è ripetibile. Non cancellare manualmente file di recovery o chiavi V1 senza export/backup verificato.

## Prossimo gate raccomandato — verifica cold start end-to-end

- **Problema:** i test dimostrano il motore e il repository ma non il percorso UI/bootstrap con l’app realmente terminata.
- **Scope:** test con sessione sintetica isolata sul simulatore; salvare, terminare forzatamente, rilanciare e verificare fase, cronometro, formazione, eventi, minuti e finalizzazione; cancellare solo gli artefatti sintetici creati dal test.
- **Dipendenze:** accesso a CoreSimulator e un metodo controllato di seed/cleanup senza dati dell’utente.
- **Rischi:** contaminare il container simulatore o confondere fixture con dati reali; assicurare sempre cleanup e verificare i percorsi prima di rimuovere file.
- **Accettazione:** prova documentata con esito; nessun doppio conteggio/record; se la recovery fallisce, preservare il bundle JSON e aprire un follow-up prima di cambiare il timer.
- **Limite aperto:** il boot ID non è persistito; valutare il rischio della stima monotono+civile separatamente, senza introdurre `ProcessInfo.systemUptime` o API sensibili senza revisione privacy e test.
