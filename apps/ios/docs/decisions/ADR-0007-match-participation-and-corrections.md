# ADR-0007 — Cronologia delle presenze e correzioni controllate

- **Stato:** ACCETTATO — 27 ottobre 2026
- **Ambito:** C3.3 — cronologia partecipanti, correzioni live/storico e persistenza locale
- **Dipendenze:** ADR-0003, ADR-0006; `MatchTiming` resta l'autorità temporale

## Contesto

I minuti correnti del giocatore non bastavano a ricostruire chi fosse in campo durante ogni intervallo. Correggere il cronometro senza una cronologia attendibile rischia di riscrivere minuti o stati di formazione in modo arbitrario. Le partite precedenti a C3.3 possono avere solo minuti aggregati, senza eventi storici d'ingresso/uscita.

## Decisione

1. Introdurre una timeline di dominio Codable con identità giocatore, periodo, coordinata di tempo effettivo di gioco, sequence ordinata, transizione e origine. La timeline è consumata da `MatchTiming`; non introduce un secondo clock.
2. Dichiarare per ogni timeline se la copertura è completa dall'avvio o parziale. Per dati legacy conservare i secondi osservati come baseline e impostare l'inizio della copertura attendibile; non inventare sostituzioni o minuti precedenti.
3. Quando la timeline copre gli intervalli, una correzione del clock ricalcola i minuti per giocatore interessati. Quando non li copre, preservare i minuti non verificabili e permettere la rettifica individuale esplicita. Le rettifiche manuali restano distinte dal tempo osservato.
4. Applicare le correzioni come proposte validate e persistite prima della conferma. Conservare gli identificativi degli eventi modificati; punteggi e statistiche evento-derivati vengono ricalcolati. Fornire undo limitato allo stato precedente, senza adottare event sourcing generale.
5. Evolvere i payload Codable della sessione live con versione esplicita. Aggiungere `StoredMatchCorrectionMetadata` in SwiftData V3, preservando gli schemi V1/V2 e migrando V2→V3 in modo leggero. Non spostare la sessione live fuori dall'aggregate SwiftData stabilito da ADR-0006.

## Conseguenze

- Una correzione può essere automatica solo dove sequenza, copertura e limiti sono validi; conflitti e dati non ricostruibili non vengono risolti silenziosamente.
- I dati legacy restano consultabili e i loro minuti aggregati non vengono sovrascritti da supposizioni.
- I test deterministici coprono timeline, correzioni, persistenza e compatibilità dei payload. La validazione del processo reale in simulatore non sostituisce device testing, lock/unlock fisico o dati di produzione.
- L'undo è deliberatamente limitato; se in futuro il prodotto richiederà più livelli o audit esteso, rivalutare storage e UX separatamente.

## Alternative considerate

- Ricostruire tutta la storia dai minuti attuali e dalla formazione: scartato perché non attendibile.
- Mantenere un secondo motore separato per i minutaggi: scartato perché divergerebbe da `MatchTiming`.
- Event sourcing completo: scartato come sproporzionato; la timeline e il bounded undo rispondono allo scope corrente.
- Salvare sempre in un solo blob: non adottato per la metadata storica; il record base mantiene la forma corrente e la metadata è aggiunta nello schema versionato.

## Verifica

Implementazione e risultato di test sono registrati in `../ARCHITECTURE.md`, `../STATUS.md` e `../TESTING.md`. Al 27 ottobre 2026 la suite completa C3.3 ha 122 PASS e due warning runtime SwiftUI non ancora isolati.
