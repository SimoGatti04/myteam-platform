# ADR-0002 — Preservare i contratti JSON locali durante il consolidamento

- **Stato:** decisione di compatibilità ancora attiva; scelta tecnologica superata da ADR-0004 — 24 ottobre 2026
- **Decisione originaria:** 22 ottobre 2026
- **Ambito:** chiavi e payload UserDefaults V1; futura sessione live esclusa

## Contesto originario

L'app salvava tre array Codable nelle preferenze standard con le chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`. I payload reali del dispositivo non erano disponibili nel repository; i test coprivano solo forme sintetiche. Gli errori di encoding/decoding venivano ignorati e la partita live non era persistita integralmente.

## Decisioni ancora attive

- Non rinominare le tre chiavi né alterare retroattivamente la forma JSON usata per importarle.
- Conservare le chiavi originali finché la loro rimozione non sarà esplicitamente autorizzata.
- Errori di lettura, decode o migrazione non devono diventare una rosa/storico vuoti né autorizzare sovrascritture.
- La sessione live deve avere un contratto separato e versionabile; non modificare i record storici per rappresentarla.

## Decisione tecnologica superata

La proposta originaria di valutare prima un adapter JSON e di rinviare la scelta tra JSON, SQLite e SwiftData è stata sostituita dalla decisione di prodotto di C3.1. **ADR-0004** sceglie SwiftData come fonte locale operativa per rosa, calendario e storico e definisce l'import una tantum dalle chiavi V1. Dopo il bootstrap, UserDefaults non è un archivio parallelo aggiornato; le chiavi rimangono solo una sorgente pre-migrazione di recupero.

## Conseguenze e limite di rollback

- I valori Codable di dominio restano l'adapter di confine del formato legacy e i test caratterizzano la compatibilità rappresentativa.
- Le chiavi UserDefaults preservano lo snapshot pre-migrazione, non le modifiche successive in SwiftData.
- Non cancellare la ricevuta d'import e non reimportare le chiavi stale dopo modifiche operative. Un rollback post-migrazione deve restaurare uno stato coerente dello store o usare un flusso di export/import verificato.
- Non sono stati acquisiti payload personali reali; la compatibilità su un dispositivo specifico resta non verificata.
