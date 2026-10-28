# ADR-0001 — Baseline C0 e direzione tecnica iniziale

- **Stato:** accettato per C0; direzione di persistenza proposta per il prossimo gate.
- **Data:** 28 ottobre 2026.
- **Ambito:** bootstrap e scelta del percorso tecnico, non requisiti di prodotto.

## Contesto

Le specifiche approvate definiscono un backend condiviso, admin-first, destinato anche a future sorgenti iOS/provider; non fissano endpoint, DTO finali o schema SQL. C0 deve sbloccare Web e QA senza presentare un health check come MVP.

## Decisioni

1. Usare Node.js/TypeScript con pnpm workspace e un monolite modulare. Il toolchain locale verificato è Node.js 26.5.0 e pnpm 10.32.1; Node è indicato in `.node-version` e pnpm nel campo `packageManager`.
2. Usare Fastify per l'API e TypeBox per descrivere schemi JSON tipizzati riutilizzabili da validazione/serializzazione; i contratti condivisi risiedono in `packages/contracts`.
3. C0 implementa solo `GET /health`; non introduce DB, cache, broker, autenticazione fittizia o provider.
4. Per il primo flusso persistente si propone PostgreSQL come archivio durevole fin dall'inizio. Non usare SQLite o DB transitorio da rimpiazzare durante l'integrazione iOS. Prima di un deploy vanno verificati immagine/versione, storage/backup e procedura nel repository `infra/`; nessuna risorsa K3s è stata creata o modificata.
5. Il contratto API di prodotto resta preliminare finché le specifiche non fissano DTO, versioni, autenticazione e casi di errore. Non derivarlo dal JSON legacy iOS.

## Alternative considerate

- **NestJS:** non scelto per C0; più struttura/framework rispetto al singolo servizio e ai moduli attuali.
- **Express:** valido, ma non scelto perché Fastify fornisce schema JSON e pipeline HTTP integrata con meno assemblaggio per questo backend.
- **SQLite:** escluso per il percorso persistente perché il backend è condiviso e deve riconciliare fonti, audit e pubblicazione; introdurrebbe un archivio da sostituire.
- **Redis, message broker, microservizi, provider SDK:** rinviati perché non necessari al flusso C0/iniziale.

## Conseguenze e punti da confermare

Le scelte runtime e monorepo sono a basso costo e facili da rivedere ora. PostgreSQL è una scelta di implementazione da validare contro i runbook e l'operatività reale prima del rilascio. L'assenza di un contesto `kubectl` attivo sulla macchina impedisce di dichiarare verificata la disponibilità di K3s, ma non blocca il bootstrap locale.
