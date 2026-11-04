# myteam-platform — Agent entry point

Router per supervisori e sviluppatori indipendenti. Prima di modificare il progetto leggere, in quest'ordine: questo file, [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/STATUS.md`](docs/STATUS.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/OPERATIONS.md`](docs/OPERATIONS.md), le [specifiche di prodotto](docs/platform/README.md) e gli ADR attivi in [`docs/decisions/`](docs/decisions/README.md).

Le convenzioni di ingegneria generali sono del workspace dell'owner e **non fanno parte di questo repository pubblico**: ogni supervisore applica il proprio standard vigente. Questo repository è autosufficiente per sviluppo, test ed esecuzione locale.

## Repository pubblico

Questo repository è pubblico e deve restare portabile:

- niente riferimenti a repository, runbook o documenti privati dell'owner;
- niente path del filesystem di host interni, nomi di macchine o topologia interna di deployment;
- niente credenziali, token o istruzioni per ottenerne di reali; solo valori d'esempio non sensibili in `.env.example`;
- solo concetti standard e documentabili: OIDC (Logto), K3s, GHCR, schema di configurazione sicuro;
- nessun documento privato nascosto in file ignorati dentro l'albero pubblico.

Se un'informazione operativa non è pubblicabile, documentare il **requisito** e rimandare l'esecuzione al runbook privato dell'owner, senza citarne contenuti o percorsi.

## Ownership dei moduli

- **Core:** `apps/api/`, `packages/contracts/`, configurazione condivisa, radice del repository e documentazione di progetto.
- **Web:** `apps/web/`.
- **QA:** `tests/`.
- **Integrations:** `packages/integrations/`.
- **Infra/Release:** `deploy/`, `.github/workflows/`, `scripts/` di packaging e documenti di release.

Non modificare file di un altro modulo senza coordinamento. Le modifiche ai contratti condivisi richiedono aggiornamento coordinato di API, consumer e test. Un `AGENTS.md` locale precisa i confini del modulo.

## Modalità di lavoro

- Usare Git con worktree/branch isolati e dedicati al task; non lavorare sul checkout condiviso e non usare copie manuali del repository.
- Non usare operazioni Git distruttive (`reset --hard`, `clean`, `prune`, force-push) su lavori propri o altrui; preservare modifiche concorrenti.
- Un push, merge o deploy richiede autorizzazione esplicita e il gate QA previsto.

## Regole di progetto

- I documenti in `docs/platform/` distinguono decisioni APPROVATE da ipotesi PROPOSTE, punti DA VERIFICARE e stato IMPLEMENTATO/TESTATO. Non trasformare requisiti approvati in affermazioni di implementazione.
- Gli ADR in `docs/decisions/ios/` sono snapshot di riferimento di requisiti condivisi: l'implementazione e lo stato iOS restano nel repository iOS separato, non in questo repository.
- Il backend è la base condivisa e durevole per ingressi admin, futura app iOS e provider; non introdurre persistenza temporanea da sostituire.
- Nessuna mutazione di cluster K3s, registry o ambienti reali fa parte del lavoro ordinario su questo repository.
- Non aggiungere segreti; `.env.example` contiene solo valori locali non sensibili.

## Comandi canonici

- `pnpm install` — dipendenze workspace (Node.js `26.5.0`, pnpm `10.32.1`).
- `pnpm db:up` / `pnpm db:migrate` — PostgreSQL 16 locale e migrazioni (mai applicate automaticamente dall'API).
- `pnpm dev` — API su `127.0.0.1:3000`; `pnpm --filter @myteam/web dev` — Web/PWA su `127.0.0.1:5173`.
- `GET /health` — liveness del processo, indipendente dal database; `GET /ready` — readiness, verifica la dipendenza PostgreSQL.
- `pnpm check` — build, typecheck e test; `pnpm test:integration` — suite PostgreSQL reale su database locale `*_test`.

Aggiornare [`docs/STATUS.md`](docs/STATUS.md) con stato verificato e prossimo gate.
