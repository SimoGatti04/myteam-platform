# Decisioni architetturali

| ADR | Stato | Decisione |
|---|---|---|
| [ADR-0001](ADR-0001-modular-monolith.md) | Accettato | Monolite modulare interno, senza layer o package cerimoniali. |
| [ADR-0002](ADR-0002-preserve-json-contract.md) | Attivo per compatibilità; scelta storage superata | Conservare i payload/chiavi JSON V1 e gestire gli errori senza sovrascrivere. |
| [ADR-0003](ADR-0003-match-timing.md) | Accettato | Motore temporale deterministico e formazione iniziale obbligatoria. |
| [ADR-0004](ADR-0004-swiftdata-local-persistence.md) | Accettato | SwiftData locale per rosa, calendario e storico; import UserDefaults V1 verificato. |
| [ADR-0005](ADR-0005-live-session-json-recovery.md) | SUPERSEDED da ADR-0006; conservato come storico | Prima decisione C3 sul JSON operativo e relativo recovery. |
| [ADR-0006](ADR-0006-swiftdata-live-session.md) | Accettato | Sessione live operativa in SwiftData V2; JSON precedente solo sorgente d'importazione. |
| [ADR-0007](ADR-0007-match-participation-and-corrections.md) | Accettato | Timeline presenze verificabile e correzioni live/storico validate, senza inventare minuti legacy. |
| [ADR-0008](../../../../docs/decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md) | Accettato | Sincronizzazione offline-first con coda persistente, gerarchia a 4 livelli, statistiche su partite concluse e pari merito; snapshot canonico condiviso in `docs/decisions/ios/`. |

Gli ADR documentano decisioni e alternative; stato implementato e verifiche effettive sono in `../STATUS.md` e `../TESTING.md`.
