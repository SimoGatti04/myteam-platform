# myteam-platform

Piattaforma web/PWA e backend condiviso per MAPI GROUP. **Checkpoint C0:** repository e contratti minimi avviati; questo non è l'MVP completo e non include autenticazione, gestione admin, database o sincronizzazione iOS.

## Avvio locale

Prerequisiti: Node.js `26.5.0` (versione in `.node-version`) e pnpm `10.32.1`.

```sh
pnpm install
pnpm dev
```

L'API ascolta su `127.0.0.1:3000` per impostazione predefinita. In un secondo terminale:

```sh
curl --fail http://127.0.0.1:3000/health
pnpm check
```

`HOST` e `PORT` sono configurabili via variabili d'ambiente. Non servono database o credenziali per C0.

## Architettura e responsabilità

- `apps/api/`: API backend, responsabilità Core.
- `packages/contracts/`: schemi e tipi condivisi, responsabilità Core.
- `apps/web/`: area riservata a Web; in C0 non è stato scelto uno stack frontend.
- `tests/`: suite di test posseduta da QA.
- `packages/integrations/`: confine riservato a Integrations; nessun provider è stato selezionato.
- `docs/platform/`: copia delle specifiche di prodotto approvate; leggere indice e stato di approvazione.

La prima persistenza condivisa dovrà essere quella duratura della piattaforma, non un database da sostituire per l'integrazione iOS. Lo stack e le decisioni sono in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e [ADR C0](docs/decisions/ADR-0001-c0-stack.md).

## Riferimenti

- Regole operative: [AGENTS.md](AGENTS.md)
- Stato e prossimi gate: [docs/STATUS.md](docs/STATUS.md)
- Verifica: [docs/TESTING.md](docs/TESTING.md)
- Operatività: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Specifiche di prodotto: [docs/platform/README.md](docs/platform/README.md)
