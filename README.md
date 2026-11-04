# myteam-platform

Piattaforma Web/PWA e backend condiviso per MAPI GROUP. Il repository contiene oggi il frontend Web/PWA (`apps/web`), l'API backend e il primo flusso persistente su PostgreSQL (`apps/api`, `packages/contracts`); **non è l'MVP completo**. L'app iOS e la sua sincronizzazione vivono in un repository separato e non sono incluse qui.

Stato verificato, gate aperti e candidati non ancora integrati: [docs/STATUS.md](docs/STATUS.md).

## Avvio locale

Prerequisiti: Node.js `26.5.0` (versione in `.node-version`), pnpm `10.32.1` e Docker Compose per il PostgreSQL 16 locale.

```sh
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

L'API ascolta su `127.0.0.1:3000`. `GET /health` è un controllo di liveness del processo e non tocca il database; `GET /ready` è la readiness e risponde `200` solo con una connessione PostgreSQL funzionante, altrimenti `503`. Le migrazioni non vengono mai applicate automaticamente dall'API: si eseguono con `pnpm db:migrate`.

Le scritture admin richiedono un access token OIDC (Logto) valido. Se Logto non è configurato, le rotte admin rispondono `503 admin_auth_not_configured` senza consentire scritture; le letture pubbliche restano disponibili.

In un secondo terminale:

```sh
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
pnpm check
pnpm test:integration
```

`pnpm test:integration` usa esclusivamente `TEST_DATABASE_URL`, che deve puntare a un database locale il cui nome termina con `_test` (il Compose crea `myteam_platform_test`). Lo script imposta `REQUIRE_POSTGRES_INTEGRATION=1`, quindi **senza `TEST_DATABASE_URL` la suite fallisce** invece di saltare; i test eseguiti direttamente con `node --test` vengono invece saltati. `pnpm db:down` ferma il container e conserva il volume.

## Web e PWA

Il frontend è un'app TypeScript/Vite che parla con l'API tramite le rotte `/api/v1/*`.

```sh
pnpm --filter @myteam/web dev        # http://127.0.0.1:5173, con proxy /api -> 127.0.0.1:3000
pnpm --filter @myteam/web test       # unit test (Vitest)
pnpm --filter @myteam/web build
pnpm --filter @myteam/web preview    # http://127.0.0.1:4173 sulla build
```

Senza configurazione OIDC (`VITE_LOGTO_ENDPOINT`, `VITE_LOGTO_APP_ID`, `VITE_LOGTO_API_RESOURCE`) l'area amministrativa non effettua login reale; le proiezioni pubbliche restano consultabili. Dettagli del modulo in [apps/web/README.md](apps/web/README.md).

## Architettura e responsabilità

- `apps/api/`: API backend, responsabilità Core.
- `packages/contracts/`: schemi e tipi condivisi, responsabilità Core.
- `apps/web/`: frontend Web/PWA, con stack TypeScript/Vite.
- `tests/`: suite trasversale posseduta da QA.
- `packages/integrations/`: confine riservato a Integrations; nessun provider è stato selezionato.
- `deploy/`: manifest e script di packaging per gli ambienti dell'owner.
- `docs/platform/`: specifiche di prodotto approvate; leggere indice e stato di approvazione.

Il primo percorso persistente copre configurazione squadra/stagione, giocatori e appartenenze stagionali, avversarie/competizioni, partite, pubblicazione e letture pubbliche. Le API e i DTO sono preliminari: il modello evolverà seguendo le specifiche approvate, senza persistenza temporanea. Consulta [docs/API.md](docs/API.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [ADR C0](docs/decisions/ADR-0001-c0-stack.md) e [ADR PostgreSQL](docs/decisions/ADR-0002-postgresql-persistence.md).

## Riferimenti

- Regole operative: [AGENTS.md](AGENTS.md)
- Stato e prossimi gate: [docs/STATUS.md](docs/STATUS.md)
- Verifica: [docs/TESTING.md](docs/TESTING.md)
- Operatività: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Specifiche di prodotto: [docs/platform/README.md](docs/platform/README.md)
