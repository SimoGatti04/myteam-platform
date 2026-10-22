# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 22 ottobre 2026
**Checkpoint:** C1 — characterization test e affidabilità della baseline
**Esito C1:** COMPLETE per la baseline di test prevista; l'app non è dichiarata stabilizzata né completamente validata.
**Esito A0:** COMPLETE come audit e impostazione di base; i limiti di verifica A0 sono riportati nella sezione storica e in `TESTING.md`.

## Baseline tecnica

- Root Git locale: `AURINFORMATC/`; branch `main`; commit iniziale di recupero `4dd2b3b` (`chore: establish local AURINFORMATC baseline`); nessun remote.
- App SwiftUI: `app/APP.xcodeproj`, scheme condiviso `APP`, target `APP`; test target `APPTests` creato in A0.
- Xcode 27.0 (27A266a), toolchain Swift 6.4.0.34.1; `SWIFT_VERSION = 5.0`; deployment target iOS 27.0.
- Un singolo file `ContentView.swift` di 10.737 righe contiene attualmente UI, modelli, logica di partita, importer e persistenza.
- Nessuna dipendenza esterna SPM/CocoaPods/Carthage rilevata.
- Persistenza locale UserDefaults + JSON: `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`; la partita live completa non è salvata.
- CSV calendario stagione 2026/2027 tracciato in `app/`; un backup locale datato 9 ottobre 2026 è conservato in `backups/`, escluso da Git e diverso dal sorgente della baseline.

## A0 completato

- Ispezionati struttura, repository e configurazione Xcode; inizializzata Git locale senza remote.
- Commit baseline esatto del sorgente e degli asset attuali; introdotto `.gitignore` per stato utente Xcode, artefatti, backup, runtime e credenziali.
- Aggiornati gli entry point agenti, README, workflow, stato e registro feature; aggiunti audit, architettura, piano, testing e due ADR.
- Creato target XCTest e scheme condiviso, senza modifiche al file sorgente funzionale o agli asset.
- Registrate le chiavi UserDefaults effettive, i limiti del timer e dello stato live, i confini della logica di sostituzione/eventi e le funzionalità solo pianificate.

## C1 completato — 22 ottobre 2026

- La suite XCTest è stata ampliata da 5 a 16 casi e **eseguita realmente** su iPhone 18 Pro Simulator, iOS 27.0 (24A434), Xcode 27.0 (27A266a): **16 PASS, 0 FAIL, 0 SKIPPED**.
- Il run `xcodebuild test` ha compilato target `APP` e `APPTests`, poi eseguito i test. Il result bundle ha confermato `result=Passed`, 16 test e nessun runtime warning riportato dal test runner.
- Fixture sintetiche e anonime in `APPTests/Fixtures/DomainCharacterizationFixtures.swift`: forme legacy documentate e valori correnti inventati, non esportati dal dispositivo. I payload UserDefaults reali restano non disponibili.
- Coperti round-trip/default/identità per `RosterPlayer`, `ScheduledMatch`, `MatchPlayer`, `MatchRecord`, `PlayerMatchSummary` tramite il record e `GoalEvent`; CSV comma/semicolon, BOM, alias, quote escaped, campi con delimitatore, CRLF/CR, RIPOSA, date e righe anomale.
- Nessun sorgente produttivo, chiave `Futsal*V1`, asset, palette, UI o comportamento applicativo è stato modificato. Le chiavi e la persistenza reale non sono esercitate come integrazione.
- Per avviare XCTest è stato necessario eseguire Xcode/CoreSimulator fuori dal sandbox: nel sandbox la connessione XPC/CoreSimulator e il log utente risultavano negati; in sessione autorizzata Xcode ha elencato runtime iOS 26.5/27.0 e il simulatore iOS 27.0 ha eseguito la suite. Nessun runtime/toolchain o setting globale è stato installato/rimosso/modificato.
- I primi run hanno evidenziato due errori nelle aspettative dei test, non nel codice app: confronto case-sensitive con `Riga` e interpretazione di input whitespace-only come file vuoto. Le asserzioni sono state corrette per riflettere il messaggio e il comportamento reali; run finale verde.

## Verifiche A0

| Verifica | Stato | Evidenza / limite |
|---|---|---|
| Enumerazione target e scheme | PASS | `xcodebuild -project app/APP.xcodeproj -scheme APP -list`; target `APP`, `APPTests`; scheme condiviso `APP`. |
| Build app e compilazione target test | PASS | `xcodebuild ... -destination 'generic/platform=iOS Simulator' ... CODE_SIGNING_ALLOWED=NO build-for-testing`; risultato `TEST BUILD SUCCEEDED`. |
| Esecuzione dei cinque XCTest | NOT RUN / UNAVAILABLE | CoreSimulatorService non disponibile e nessun runtime simulatore rilevato dal contesto; test compilati, non eseguiti. |
| Avvio e verifica visiva/funzionale | NOT RUN | L'app non è stata lanciata in simulatore o dispositivo. |
| Payload reali UserDefaults del dispositivo | UNAVAILABLE | Dati runtime non accessibili da questa workspace; la retrocompatibilità è testata solo con payload sintetici per i modelli. |
| Integrità del sorgente e asset | PASS | Hash del file `ContentView.swift` e controllo del diff; nessuna modifica funzionale/grafica intenzionale. |
| Dati sensibili/runtime nel baseline tracciato | PASS con nota | Nessun `.env`, database o provisioning profile tracciato. `DEVELOPMENT_TEAM` è un identificativo di signing nel progetto, non un segreto. Le credenziali e i profili locali sono ignorati. |

La prima build non elevata non è riuscita perché il plugin della macro SwiftUI `State` ha restituito una risposta malformata; il retry autorizzato in ambiente elevato ha compilato app e test senza modifiche al sorgente. Questa prima prova è un **FAIL del tentativo nel contesto sandbox**, non un errore Swift confermato. La build riuscita ha comunque emesso il warning AppIntents non bloccante riportato in `TESTING.md`.

Per l'elenco completo di comandi e stati: `TESTING.md`.

## Problemi e rischi principali

1. Il cronometro conta callback di `Timer.publish` invece di tempo trascorso: ritardi e sospensione/background possono causare deriva e sottoconteggio; rischio architetturale, non riprodotto a runtime.
2. La partita live, i suoi timer, la formazione e gli eventi non sono persistiti come sessione recuperabile.
3. Gli errori di encoding/decoding JSON sono ignorati con `try?`; un payload illeggibile appare come stato vuoto e un successivo salvataggio può sostituire i dati precedenti.
4. I vincoli di ruolo portiere non sono applicati a titolari, cambi o suggerimenti.
5. I suggerimenti e la sostituzione manuale sono incorporati in `ContentView`; il suggerimento può includere portieri.
6. Lo storico salva snapshot e gol ma non la sequenza di cambi/partecipazione; non è ricostruibile lo stato temporale completo.
7. La documentazione precedente riportava chiavi UserDefaults inesatte e workflow/no-Git non più applicabili; ora è stata corretta.
8. Il timer può essere avviato prima della formazione; alla conferma successiva i titolari ricevono il tempo globale già trascorso mentre le riserve partono da zero. Il caso è verificato staticamente, ma non è stato provato a runtime né confermato come regola voluta; vedi `FEATURES.md` e `BASELINE_AUDIT.md`.

Dettagli, evidenze e priorità in `BASELINE_AUDIT.md`.

## Decisioni attive

- App iOS singola a monolite modulare; nessun package o servizio prematuro: `decisions/ADR-0001-modular-monolith.md`.
- Mantenere chiavi e payload JSON esistenti finché compatibilità, migrazione e recupero non sono provati: `decisions/ADR-0002-preserve-json-contract.md`.

## Prossimo checkpoint

**C2 — Affidabilità dei cronometri.** Prima di cambiare comportamento, definire con il prodotto se il tempo di gara continua o si ferma in background/lock/terminazione e quando iniziano i minuti individuali. Estrarre il minimo modello di clock deterministico con sorgente temporale controllabile, mantenere UI e durata visibile invariate, quindi coprire start/pause/resume, timeout, intervallo, passaggio tra tempi, fine gara e coerenza con il minutaggio. La suite iOS è ora eseguibile; restano indispensabili prove manuali su simulatore/dispositivo per lock/background e una decisione esplicita sulla ripresa dopo terminazione. Nessun test C1 valida questi comportamenti del timer.

Sequenza, dipendenze e criteri in `MIGRATION_PLAN.md`.
