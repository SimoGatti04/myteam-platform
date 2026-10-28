# Architettura — C0 e primo slice Core

**Aggiornato:** 28 ottobre 2026. **Stato:** C0 pubblicato su `main`; il flusso backend C1 è implementato e verificato nel branch dedicato `codex/core-persistent-flow`, senza integrazione automatica in `main` né coordinamento consumer completato. Questo checkpoint non è l'MVP completo.

## Forma del sistema

Repository separata organizzata come monorepo pnpm. Backend TypeScript su Node.js come monolite modulare Fastify (`apps/api`); schemi e tipi condivisi in `packages/contracts`. Non introdurre microservizi finché non esiste un requisito operativo per deploy, scalabilità, sicurezza o failure isolation indipendenti.

Ownership: Core (`apps/api`, `packages/contracts`, configurazione condivisa e architettura), Web (`apps/web`), QA (`tests`), Integrations (`packages/integrations`). Core non modifica i file degli altri moduli senza coordinamento. Il frontend consuma l'API e non accede direttamente al database.

## Persistenza e dominio

PostgreSQL 16 è la persistenza durevole del flusso iniziale; non è un archivio temporaneo per l'integrazione iOS. Lo schema SQL è versionato e applicato dal runner con checksum. Le operazioni di dominio sono transazionali e scrivono audit; variazioni di data/stato partita hanno uno storico separato. `compose.yaml` serve solo lo sviluppo locale, esposto su loopback. Configurazione e deployment K3s non sono stati modificati.

Il primo slice copre squadra/stagione, giocatori/appartenenze stagionali, avversarie/competizioni, partite, pubblicazione esplicita e proiezioni pubbliche. Le proiezioni vengono lette dalle tabelle autorevoli e non espongono dati amministrativi. Gli schemi TypeBox sono contratti preliminari, non il modello definitivo: dettagli ulteriori si introducono seguendo le specifiche approvate e il primo MVP.

## Sicurezza

- Le API pubbliche di lettura non richiedono Logto.
- Ogni rotta `/api/v1/admin/*` è protetta; senza configurazione Logto risponde `503`, con token non valido `401`, senza scope `403`.
- Verifica admin: firma tramite JWKS configurato esplicitamente oppure scoperto dal documento OIDC, più `iss`, `aud`, `exp` e scope configurato. La configurazione dell'istanza e del resource indicator va verificata sull'istanza Logto esistente.
- `platform:admin` è il nome proposto/configurabile dello scope, non una decisione di prodotto né una configurazione già creata in Logto.
- `/health` è liveness e non prova che il database sia raggiungibile.

## Decisioni / stato

- [ADR-0001 — stack C0](decisions/ADR-0001-c0-stack.md)
- [ADR-0002 — PostgreSQL per la persistenza](decisions/ADR-0002-postgresql-persistence.md)
- [API preliminare](API.md)
- Specifiche approvate: [docs/platform/README.md](platform/README.md) e documenti collegati.
- Snapshot ADR iOS: `docs/decisions/ios/`; l'implementazione e lo stato iOS restano nel repository separato AURINFORMATC.

## Non implementato / rinviato

Frontend/PWA, workflow browser OIDC, deploy K3s, sync iOS, SSE/LIVE completo, provider CSI, risultati/statistiche estese, votazioni, contenuti e mutazioni infrastrutturali non fanno parte di questo slice.
