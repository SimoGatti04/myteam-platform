# myteam-platform

Piattaforma web/PWA e backend condiviso per MAPI GROUP. Il repository contiene il checkpoint C0 e il primo slice backend Core su PostgreSQL; **non è l'MVP completo**. Il frontend, il deploy di produzione e la sincronizzazione iOS non sono ancora implementati.

## Avvio locale

Prerequisiti: Node.js `26.5.0` (versione in `.node-version`), pnpm `10.32.1` e Docker Compose per il PostgreSQL locale.

```sh
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

L'API ascolta su `127.0.0.1:3000` per impostazione predefinita. `GET /health` è un controllo di liveness; le rotte prodotto leggono/scrivono il PostgreSQL locale. Le scritture admin richiedono un access token Logto valido. Se Logto non è configurato, le rotte admin rispondono `503 admin_auth_not_configured` senza consentire scritture.

In un secondo terminale:

```sh
curl --fail http://127.0.0.1:3000/health
pnpm check
pnpm test:integration
```

`pnpm test:integration` usa esclusivamente `TEST_DATABASE_URL`, che deve puntare a un database locale con suffisso `_test`. Il Compose crea un database di test separato. `pnpm db:down` ferma il container e conserva il volume.

## Architettura e responsabilità

- `apps/api/`: API backend, responsabilità Core.
- `packages/contracts/`: schemi e tipi condivisi, responsabilità Core.
- `apps/web/`: area riservata a Web; in C0 non è stato scelto uno stack frontend.
- `tests/`: suite di test posseduta da QA.
- `packages/integrations/`: confine riservato a Integrations; nessun provider è stato selezionato.
- `docs/platform/`: copia delle specifiche di prodotto approvate; leggere indice e stato di approvazione.

Il primo percorso persistente copre configurazione squadra/stagione, giocatori e appartenenze stagionali, avversarie/competizioni, partite, pubblicazione e letture pubbliche. Le API e i DTO sono preliminari: il modello evolverà seguendo le specifiche approvate, senza persistenza temporanea. Consulta [docs/API.md](docs/API.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [ADR C0](docs/decisions/ADR-0001-c0-stack.md) e [ADR PostgreSQL](docs/decisions/ADR-0002-postgresql-persistence.md).

## Riferimenti

- Regole operative: [AGENTS.md](AGENTS.md)
- Stato e prossimi gate: [docs/STATUS.md](docs/STATUS.md)
- Verifica: [docs/TESTING.md](docs/TESTING.md)
- Operatività: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Specifiche di prodotto: [docs/platform/README.md](docs/platform/README.md)
