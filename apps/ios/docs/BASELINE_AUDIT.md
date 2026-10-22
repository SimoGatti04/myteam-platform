# Audit baseline A0 — MAPI GROUP Match Manager

**Data:** 22 ottobre 2026 — **Ambito:** ispezione statica del repository locale e del target Xcode; nessuna modifica intenzionale alla logica produttiva, UI o asset.
**Limite:** la build è stata preparata per simulatore, ma CoreSimulatorService non è disponibile; non è stata eseguita una prova runtime o visiva. I payload UserDefaults reali del dispositivo non sono accessibili da questa workspace.

> Documento storico: descrive esclusivamente lo stato A0 e non sostituisce lo stato corrente in [`STATUS.md`](STATUS.md). In C2 sono stati affrontati A0-01 (timer basato sui tick) e A0-09 (avvio prima della formazione); la sessione live non persistita rimane invece un limite, assegnato a C3.

## Evidenza e metodo

- Root repository: `AURINFORMATC/`, branch `main`, HEAD baseline `4dd2b3b87cad9239df43662abccc08544f970e4f`; nessun remote né upstream. Le directory `/Users/gatti/Workspace` e `/Users/gatti` non sono root Git.
- Nessun submodule o worktree aggiuntivo. `.gitignore` esclude stato Xcode personale, build/DerivedData, `.xcresult`, dSYM, backup, log/runtime e credenziali. Il CSV calendario è materiale sorgente tracciato; `backups/` rimane locale e ignorata.
- `app/APP/ContentView.swift`: 10.737 righe. SHA-256 baseline e working tree: `589f9e399d93a96aaafb47cc95ca2825380d02ad798e4a5675bbcd00a526d158`.
- Il backup `backups/ContentView.swift.bak_20261009_185500` è leggibile e non vuoto (10.602 righe; SHA-256 `b530bae8b23178899b91157f83c809a95c9bcf72d6c0143ec0cc74ac93493b3f`), ma **non coincide** con il sorgente attuale. È preservato, non è una baseline sostitutiva e non è stato cancellato.
- Progetto Xcode: un'app iOS SwiftUI (`APP`), un target XCTest introdotto in A0 (`APPTests`) e scheme `APP` condiviso. Xcode 27.0 (27A266a), Swift 6.4.0.34.1, `SWIFT_VERSION = 5.0`, deployment target iOS 27.0. Nessuna dipendenza SPM/CocoaPods/Carthage rilevata; nessun backend o servizio locale.
- Le risorse grafiche sono negli asset catalog e in `app/grafica/`; `app/Icon` e `.DS_Store` locali sono ignorati. Nessuna modifica asset rispetto al commit baseline.

## Funzionalità riscontrabili nel codice

### Presenti

- Welcome con logo/sfondo e CTA `ENTRA`; Home con stato partita/formazione e accessi a rosa, calendario, storico e preparazione.
- Rosa: crea/modifica/disattiva/elimina; `RosterPlayer` ha `active` e `isGoalkeeper`, e i vecchi payload senza questi campi usano i default `true` e `false`.
- Calendario: aggiunta/modifica/eliminazione, associazione manuale e import CSV in append/sostituzione. L'import riconosce virgola o punto e virgola (decisione basata sui conteggi nella prima riga), BOM, alias, campi quotati e quote doppie escaped; scarta `RIPOSA`, valida date/casa-trasferta e conserva l'ID della partita corrispondente durante replace.
- Preparazione: presenze da rosa attiva; almeno cinque presenti e selezione obbligatoria di cinque titolari.
- Partita live: periodi progressivi da 20 minuti; intervallo da 5 minuti azionabile; avvio del secondo tempo in pausa; pausa/ripresa; un timeout di 60 secondi per squadra per tempo con ripresa condizionata allo stato precedente; fine automatica al termine del secondo tempo.
- Formazione: flag campo/panchina, minuti giocati, Handicap con pesi 1, 0.75, 0.5, 0.25 e Superpower.
- Cambio manuale: entrata diretta se meno di cinque in campo; cambio uno-per-uno quando cinque; azione “skip” può lasciare meno di cinque giocatori temporaneamente.
- Suggerimento se esattamente cinque in campo: sceglie massimo fairness score da uscita (salvo Superpower) e minimo score in panchina; soglia 120 secondi; `fairnessScore = timePlayed / max(playWeight, 0.25)`.
- Gol della squadra con un marcatore e assist facoltativo, gol avversario, score live derivato dal numero di eventi, rimozione dell'ultimo evento live.
- Fine partita: snapshot di data/durata, partecipanti, minuti, gol/assist, score, goal events, ID/opponente/casa del calendario se associato. Storico consultabile, modificabile ed eliminabile; editor può derivare score/statistiche dagli eventi o gestirli separatamente.

### Fragile, incompleto o a rischio

- **Timer per callback:** il clock di partita, timeout, intervallo e minuti giocati sono aggiornati in `handleTimerTick()` con incrementi unitari per callback; non si calcola la differenza temporale effettiva. Ritardi o sospensione possono sottocontare e desincronizzare clock e partecipazione. Rischio dimostrato dalla struttura del codice; non riprodotto su simulatore.
- **Avvio manuale prima della distinta:** il controllo del timer è disponibile anche in Home, presenza e titolari. Se viene avviato prima della conferma formazione, `confirmInitialLineup()` accredita ai cinque titolari selezionati il tempo già trascorso, mentre le riserve partono da zero. È un edge case verificato staticamente: va confermato come comportamento voluto, non corretto implicitamente in A0.
- **Sessione live non recuperabile:** clock, fase, formazione, eventi, timeout e associazione calendario sono `@State`; `onAppear` carica solo rosa, calendario e storico. Un processo terminato perde lo stato della gara in corso. Non è stata fatta una prova di kill/background.
- **Persistenza opaca ai guasti:** encode/decode JSON usa `try?`. Un payload non decodificabile non genera errore mostrato o quarantena; il caricamento lascia lo stato iniziale in memoria. Una successiva modifica e salvataggio potrebbe sovrascrivere il valore non letto. Questa è una condizione di rischio da codice, non una perdita dati osservata.
- **Vincolo portiere assente:** `isGoalkeeper` è copiato nella distinta ma i flussi di cambio e il candidato suggerito non filtrano per ruolo. Il portiere può quindi essere sostituito da un giocatore di movimento o essere selezionato dal suggerimento. Requisito presente nelle note progettuali precedenti, non implementato.
- **Regole e UI accoppiate:** modelli, parser, stato, timer, cambi, eventi, persistence e viste condividono un file e numerose funzioni/private state della root view. La maggior parte delle invarianti non è esercitabile isolatamente senza estrazione.
- **Storico non ricostruibile integralmente:** `MatchRecord` salva snapshot e goal events, ma non la timeline delle sostituzioni, dei cambi campo/panchina o dei timeout. Può supportare riepilogo e correzione, non la ricostruzione completa dello stato minuto per minuto.
- **CSV multilinea:** il testo viene diviso per newline prima del parsing delle celle; un newline legale dentro un campo quotato diventa una riga separata. Il parser ha anche un algoritmo semplice per rilevare il delimitatore; il campione stagione corrente usa virgole e non esercita tutte le varianti.
- **Associazione calendario non persistita come sessione:** associazione automatica alla gara non giocata più vicina entro sei ore, se nessuna associazione manuale esiste; dati di associazione vengono riportati nello snapshot solo al termine.

### Requisiti conservati, non presenti

- Welcome con tre azioni dirette `PARTITA`, `ROSA`, `STORICO` mantenendo grafica.
- Avversario libero/rapido nella preparazione. La proposta storica di titolari facoltativi è superata: C2 richiede cinque titolari confermati al primo Play; conferma e apertura live non avviano il timer.
- Interfaccia campo verticale 2–2–1 con panchina compatta e controlli contestuali.
- Sostituzione portiere solo con portiere ed esclusione del portiere dai suggerimenti di movimento.
- Indicatori cromatici minutaggio rispetto alla media con confronto separato per ruolo.

Questi sono requisiti progettati nei documenti storici; A0 li conserva ma non li implementa.

## Inventario dati persistenti

| Chiave UserDefaults | Tipo JSON | Lettura/scrittura | Note |
|---|---|---|---|
| `FutsalRosterV1` | `[RosterPlayer]` | `loadRoster` / `saveRoster` | `id`, `name`, `active`, `isGoalkeeper`; alcuni vecchi campi hanno default custom. |
| `FutsalScheduleV1` | `[ScheduledMatch]` | `loadSchedule` / `saveSchedule` | Calendar sorting in memoria; chiave errata nella documentazione precedente era `mapi_schedule_v1`. |
| `FutsalMatchHistoryV1` | `[MatchRecord]` | `loadHistory` / `saveHistory` | Record con `PlayerMatchSummary`, score/eventi opzionali, match calendar snapshot. |
| Sessione live | — | Non implementata | Nessun salvataggio periodico di clock, roster di partita, stato e timeout. |

I dati reali presenti nel sandbox dispositivo non sono stati letti, esportati o modificati. La verifica di retrocompatibilità è limitata ai payload JSON sintetici nei characterization test compilati.

## Registro problemi prioritari

| ID | Problema | Componente/evidenza | Impatto | Priorità | Prossima risposta raccomandata |
|---|---|---|---|---|---|
| A0-01 | Conteggio basato sui tick ricevuti (risolto in C2) | `ContentView.swift` pre-C2; ora `APP/MatchTiming.swift` | Nel baseline A0 durata/minutaggio dipendevano dai callback. Il motore C2 misura segmenti trascorsi e ha test deterministici; background/lock OS reale non provato manualmente. | P1 storico | Nessuna ulteriore modifica qui; vedi `STATUS.md`, `TESTING.md` e ADR-0003. |
| A0-02 | Nessun ripristino partita live | Root `@State`, `onAppear` carica solo 3 collezioni (`1790-1800`) | Gara e stato in corso possono perdersi con terminazione processo. | P1 | Decidere semantica pausa/background/riapertura; poi persistenza sessione e test crash/relaunch. |
| A0-03 | Errori JSON ignorati | `5224-5389` | Corruzione/schema incompatibile non diagnosticati; stato vuoto può successivamente sovrascrivere il payload. | P1 | Errori espliciti, preservazione payload originale e backup/recupero prima di ogni migrazione. |
| A0-04 | Regola ruolo portiere non applicata | `MatchPlayer.isGoalkeeper`; `4282-4342, 4588-4681` | Cambio manuale o suggerito può violare la regola prevista. | P2 | Aggiungere test di invarianti e implementare solo in checkpoint funzionale dedicato con requisiti confermati. |
| A0-05 | Logica deterministica incapsulata in SwiftUI | `ContentView.swift` 10.737 righe; funzioni private | Test di timer/rotazione/eventi richiedono runtime UI; manutenzione e regressione più rischiose. | P2 | Estrarre una responsabilità per volta dopo characterization e conferma build. |
| A0-06 | Limite del formato CSV per record multilinea | `924-933, 1357-1439` | Import di un CSV legale con newline in quoted field può corrompere/ignorare righe. | P2 | Prima fissare fixture di calendari reali e casi edge; sostituire il parser solo con test di equivalenza. |
| A0-07 | Storico non conserva timeline cambi | `MatchRecord`/`PlayerMatchSummary`, `738-791, 4988-5044` | Non possibile ricostruire la partecipazione nel tempo o auditare i cambi. | P3 | Valutare un event log append-only di sostituzioni solo se serve correzione/ricostruzione; non adottare event sourcing integrale. |
| A0-08 | Test non ancora eseguibili nel runtime corrente | Nessun simulatore rilevato; Xcode test target aggiunto | Le cinque characterization non hanno esito di esecuzione, solo compilazione. | P1 (verifica) | Ripetere test con runtime iOS disponibile; non interpretare build test come test PASS. |
| A0-09 | Possibile credito minuti prima della distinta (risolto in C2) | `ContentView.swift` pre-C2; ora `MatchTiming.canStartFirstPeriod` | Il baseline consentiva l’avvio prima della conferma. C2 blocca il primo Play senza distinta e cinque titolari effettivi e non accredita tempo retroattivo. | P2 storico | Nessuna ulteriore modifica qui; vedi `FEATURES.md` e ADR-0003. |

Non sono stati identificati bug di comportamento riprodotti su simulatore/dispositivo in A0. I punti sopra sono limiti dimostrati staticamente o rischi dedotti e sono etichettati come tali.

## Riuso e opzioni valutate

- **Modularità:** per l'applicazione single-user con un solo lifecycle è proporzionato iniziare con componenti interni allo stesso target; package e servizi aggiungerebbero distribuzione/operazioni senza consumer o deploy indipendenti.
- **Persistenza:** mantenere chiavi/payload correnti nel breve periodo. Per la prima correzione, considerare JSON in file con scritture atomiche, error reporting e snapshot di recupero; UserDefaults resta adatto a preferenze e piccolo stato, ma la scelta operativa si farà dopo misure sulla dimensione/uso reale. SQLite o SwiftData non sono selezionati in A0: introdurrebbero migrazione e nuova superficie senza prova di necessità.
- **Eventi:** goal log corrente è utile per score/statistiche/undo; non è un event log completo. Includere eventi di cambio solo se una richiesta di correzione o audit richiede davvero la timeline. Non adottare event sourcing come stile generale.
- **Web:** preservare concetti e contratti stabili; nessun codice SwiftUI o backend condiviso viene introdotto anticipatamente.

## Limiti di conclusione

Audit principalmente statico e build-only. La completezza reale del comportamento UI, il comportamento di background/sospensione, i tempi su dispositivo, la scrittura effettiva in UserDefaults, la compatibilità con dati utente reali e la prova della gestione di errori non sono stati validati in A0.
