# Decisioni architetturali

| ADR | Stato | Decisione |
|---|---|---|
| [ADR-0001](ADR-0001-modular-monolith.md) | Accettato | Monolite modulare interno, senza layer o package cerimoniali. |
| [ADR-0002](ADR-0002-preserve-json-contract.md) | Attivo per compatibilità; scelta storage superata | Conservare i payload/chiavi JSON V1 e gestire gli errori senza sovrascrivere. |
| [ADR-0003](ADR-0003-match-timing.md) | Accettato | Motore temporale deterministico e formazione iniziale obbligatoria. |
| [ADR-0004](ADR-0004-swiftdata-local-persistence.md) | Accettato | SwiftData locale per rosa, calendario e storico; import UserDefaults V1 verificato. |

Gli ADR sono decisioni documentali; lo stato implementato e le verifiche eseguite sono in `../STATUS.md` e `../TESTING.md`.
