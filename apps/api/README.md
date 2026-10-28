# API Core

Servizio HTTP Fastify posseduto da Core. Il checkpoint C0 espone `GET /health` come liveness (non readiness del database); il branch `codex/core-persistent-flow` aggiunge le prime rotte persistenti per configurazione squadra/stagione, rosa, avversarie/competizioni, partite e proiezioni pubbliche.

- Avvio locale: dalla root, `pnpm dev` dopo `cp .env.example .env`, `pnpm db:up` e `pnpm db:migrate`.
- Contratti e rotte: [`../../docs/API.md`](../../docs/API.md).
- Configurazione e operatività: [`../../docs/OPERATIONS.md`](../../docs/OPERATIONS.md).
- Verifiche: [`../../docs/TESTING.md`](../../docs/TESTING.md).

Le rotte `/api/v1/admin/*` falliscono chiuse con HTTP 503 se Logto non è configurato. Le letture `/api/v1/public/*` usano DTO espliciti e non espongono stato amministrativo o audit. API e contratti sono preliminari e non dichiarano il completamento dell'MVP.
