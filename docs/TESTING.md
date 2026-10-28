# Verifica

## Comandi

- `pnpm check`: build, typecheck (incluse le prove API) e test unitari.
- `pnpm db:up`: avvia PostgreSQL 16 locale, loopback-only.
- `pnpm db:migrate`: applica le migrazioni versionate.
- `pnpm dev`: avvia l'API locale; default `127.0.0.1:3000`.
- `pnpm test:integration`: test reale su PostgreSQL tramite `TEST_DATABASE_URL`.

## Test PostgreSQL

1. `cp .env.example .env`
2. `pnpm db:up`
3. `pnpm test:integration`

Il runner accetta solo host loopback e un database con suffisso `_test`; crea uno schema casuale isolato, applica e riapplica le migrazioni, poi rimuove solo quello schema. Non usa `DATABASE_URL` come fallback. Il Compose crea `myteam_platform_test` alla prima inizializzazione del volume. I test devono usare la stessa major version del deployment previsto (`postgres:16`).

Nessuna prova richiede Logto reale: il test JWT usa una chiave e un JWKS locale; il test di flusso inietta un verificatore deterministico. Prima del deploy resta da verificare la configurazione effettiva di Logto e del database.
