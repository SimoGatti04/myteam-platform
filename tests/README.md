# myteam-platform — QA Verification & Test Suites

Questa cartella contiene le suite di test indipendenti progettate ed eseguite dall'agente `QA` per la verifica della piattaforma `myteam-platform`.

## Struttura della Suite

- `api/`: test dei contratti baseline API (es. `health.test.ts`, loopback host binding, validazione porte).
- `contracts/`: validazione degli schemi TypeBox definiti in `@myteam/contracts`, verifica enum e isolamento contratti pubblici.
- `auth/`:
  - `jwt-verification.test.ts`: verifica crittografica reale di token JWT RS256 con libreria `jose`, JWKS fetch interceptor, validazione claims (`exp`, `aud`, `iss`) e scope autorizzativo `platform:admin`.
- `fixtures/`: dataset sintetici e realistici (senza dati privati o PII) conformi al dominio calcistico dilettantistico (ASD Real Aurora).
- `helpers/`:
  - `test-db.ts`: test double database SQLite in-memory (Node 26 native `node:sqlite`) conforme allo schema `0001-platform-core.sql` per verifiche logiche veloci.
  - `pg-test-helper.ts`: helper per creare schemi PostgreSQL temporanei e isolati (`test_qa_<uuid>`) con cleanup automatico (`DROP SCHEMA CASCADE`).
  - `app-helper.ts`: factory Fastify inject per simulazione integrata con token e header.
- `integration/`:
  - `postgres-real-concurrency-and-rollback.test.ts`: test di integrazione su PostgreSQL 16 reale per verificare:
    1. Concorrenza e serializzazione lock advisory (`pg_advisory_xact_lock`) su inserimento sovrapposto di membership.
    2. Rollback atomico di transazioni multilivello su violazione vincoli univoci, senza righe orfane in `audit_events`.
    3. Check constraints nativi del motore relazionale (`primary_color`, `jersey_number`).
- `q1/`: suite di verifica per il **Checkpoint Q1** articolate sulle 8 aree chiave:
  - `01-team-setup.test.ts`: configurazione squadra, stagioni, brand, colori, pubblicazione, immutabilità e audit log.
  - `02-roster-management.test.ts`: identità giocatori (UUID), numeri di maglia, storicizzazione membership, proiezione pubblica della rosa attiva.
  - `03-match-lifecycle.test.ts`: bozze, pubblicazione, riprogrammazione, invarianti temporali e conservazione identità UUID.
  - `04-access-and-isolation.test.ts`: matrice autorizzativa su tutti gli 11 endpoint admin, isolamento contenuti non pubblicati, minimizzazione dati anti-leak.
  - `05-coherence-and-restart.test.ts`: validazione errori TypeBox/Fastify, coerenza categorie competizioni, osservazione boundary date/stagione, continuità post-riavvio DB.
  - `06-web-responsive-audit.test.ts`: audit architetturale responsive mobile/desktop, manifest PWA, token CSS, con gate live browser esplicitamente tracciato.

## Distinzione tra SQLite In-Memory e PostgreSQL 16

- **SQLite In-Memory (`test-db.ts`):** Utilizzato per feedback immediato e test logici ad alta velocità. Non supporta lock distribuiti, concorrenza reale o regex POSIX.
- **PostgreSQL 16 Reale (`tests/integration/`):** Utilizza il database di test ufficiale (`myteam_platform_test` su `127.0.0.1:54329`) con schemi isolati e cleanup garantito.

## Comandi di Esecuzione

```bash
# Esecuzione veloce (test in-memory, contratti, auth JWT e scenari Q1)
node --import tsx --test tests/api/*.test.ts tests/contracts/*.test.ts tests/auth/*.test.ts tests/q1/*.test.ts

# Esecuzione completa con integrazione PostgreSQL 16 reale
export TEST_DATABASE_URL="postgresql://myteam:local-dev-only@127.0.0.1:54329/myteam_platform_test"
node --import tsx --test tests/api/*.test.ts tests/contracts/*.test.ts tests/auth/*.test.ts tests/integration/*.test.ts tests/q1/*.test.ts
```

Il report completo dei risultati e delle osservazioni di collaudo è documentato in `docs/qa/CHECKPOINT-Q1-REPORT.md`.
