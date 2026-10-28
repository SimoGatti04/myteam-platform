# Stato — myteam-platform

**Aggiornato:** 28 ottobre 2026. **Checkpoint:** C0 è pubblicato su `main`; il primo slice persistente Core è implementato e verificato sul branch dedicato `codex/core-persistent-flow`. Non è l'MVP completo e non è stato integrato automaticamente in `main`.

## Baseline C0

- Repository locale distinta: `/Users/gatti/Workspace/myteam-platform`.
- Remote: `git@github.com:SimoGatti04/myteam-platform.git`.
- Commit C0 su `main`: `66b49875acbf7d520029730702a03f3abc66bb8c`.
- Il preflight del 28 ottobre 2026 ha verificato il repository GitHub vuoto prima del primo push; il repository ora contiene la baseline C0.
- Workspace pnpm/TypeScript, Node.js `26.5.0`, pnpm `10.32.1`, API Fastify e contratti TypeBox. `GET /health` è liveness, non readiness PostgreSQL.
- Le specifiche approvate sono copiate in `docs/platform/`; gli snapshot ADR iOS pertinenti sono in `docs/decisions/ios/`. Le fonti iOS originali restano nella repository AURINFORMATC.

## Slice persistente Core

La persistenza applicativa è PostgreSQL 16, scelta durevole per il flusso condiviso (ADR-0002), non un database provvisorio da sostituire per l'integrazione iOS. Il branch dedicato aggiunge:

- schema SQL iniziale e runner di migrazione con checksum, applicazione esplicita e rifiuto di migrazioni già applicate ma modificate;
- servizi di dominio transazionali e audit per configurazione squadra/stagioni, giocatori, appartenenze stagionali, avversarie, competizioni e partite;
- controllo delle sovrapposizioni dei periodi di rosa, chiusura delle appartenenze e storico delle modifiche di calendario;
- pubblicazione esplicita di squadra e partite, con letture pubbliche limitate a proiezioni versionate e DTO condivisi;
- protezione delle rotte admin con verifica JWT/JWKS, issuer, audience, scadenza e scope. `platform:admin` è solo lo scope proposto: va associato alla permission reale nell'istanza Logto prima dell'uso operativo.

Le rotte, i payload e la semantica preliminare sono elencati in [docs/API.md](API.md). I contratti sono utilizzabili da Web/QA come base d'integrazione, ma non sono definitivi: coordinare eventuali modifiche ai DTO prima del loro congelamento.

## Verifiche — 28 ottobre 2026

- **PASS** `pnpm check`: build dei package, type-check API/contratti/test e 6 test unitari (3 API + 3 C0), tutti superati.
- **PASS** `pnpm test:integration`: 1 test PostgreSQL superato su `TEST_DATABASE_URL` locale con suffisso `_test`; il test crea uno schema casuale isolato, applica e riapplica la migrazione e rimuove lo schema in `finally`.
- **PASS** smoke HTTP tramite il comando documentato `pnpm dev`: `GET /health` → 200 con contratto v1; `PUT /api/v1/admin/team` senza token → 503 `admin_auth_not_configured`, senza scrittura.
- **PASS** test Logto: issuer/JWKS HTTP non accettati; configurazione HTTPS pulita accettata. Il test era disallineato dal messaggio aggiornato del validatore; l'asserzione ora verifica la regola HTTPS prevista, confermata anche in `docs/OPERATIONS.md`.
- **PASS** controllo `git diff --check` e link Markdown locali (33 file, nessun target locale mancante).
- **NOT RUN** CI GitHub Actions, verifica con una configurazione Logto reale, readiness/backup/restore di produzione e deploy/K3s.

Il test JWT locale usa un JWKS effimero su loopback; è passato quando eseguito con i permessi runtime necessari. Il fallimento precedente del listener era un `EPERM` del sandbox, non un difetto del server.

## Ownership e risorse locali

- Core: `apps/api/`, `packages/contracts/` e configurazione/architettura condivise.
- Web: `apps/web/`; QA: `tests/`; Integrations: `packages/integrations/`. Nessun file di proprietà di questi altri moduli è stato modificato.
- `pnpm dev` e lo smoke HTTP sono terminati. Il container Compose `myteam-platform-postgres-1` (`postgres:16-alpine`) era già presente e healthy; non è stato avviato, arrestato o riconfigurato. Il volume persistente è stato lasciato intatto.
- `.env` locale resta ignorato da Git. Non committare credenziali o segreti.

## Non incluso / prossimo coordinamento

Frontend/PWA, flussi OIDC browser, sincronizzazione iOS, SSE/LIVE completo, provider o scraping CSI, risultati/statistiche, votazioni, contenuti, CI, deployment e mutazioni K3s restano fuori da questo checkpoint. Il passo d'integrazione è condividere i contratti preliminari con Web e QA e poi definire gli adapter/provider senza cambiare la gerarchia delle fonti di ADR-0008.
