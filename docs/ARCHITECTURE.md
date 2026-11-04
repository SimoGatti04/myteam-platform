# Architettura

**Aggiornato:** 4 novembre 2026. **Stato:** Web/PWA, API e primo flusso persistente sono integrati su `main`; lo staging è stato rilasciato; **non esiste ancora un rilascio di produzione** e il prodotto non è l'MVP completo.

## Stato attuale verificato

- `main` contiene il monorepo: frontend Web/PWA (`apps/web`), API Fastify (`apps/api`), contratti condivisi (`packages/contracts`) e la prima persistenza PostgreSQL con migrazioni versionate.
- Il packaging immagini (GHCR) e i manifest di staging fanno parte del repository; lo staging è stato distribuito da un candidato integrato. La produzione è preparata come tooling ma **non rilasciata**.
- I candidati funzionali in corso (risultati/eventi gara lato Core, relativa UI amministrativa Web) sono **draft non integrati**: non descrivono comportamento presente su `main`.
- L'app iOS e la sua sincronizzazione sono un progetto separato, non incluso in questo repository.

Le sezioni seguenti descrivono l'architettura corrente; i checkpoint datati in [`STATUS.md`](STATUS.md) restano snapshot storici.

## Forma del sistema

Repository separata organizzata come monorepo pnpm. Backend TypeScript su Node.js come monolite modulare Fastify (`apps/api`); schemi e tipi condivisi in `packages/contracts`; frontend Web/PWA TypeScript/Vite (`apps/web`). Non introdurre microservizi finché non esiste un requisito operativo per deploy, scalabilità, sicurezza o failure isolation indipendenti.

Ownership: Core (`apps/api`, `packages/contracts`, configurazione condivisa e architettura), Web (`apps/web`), QA (`tests`), Integrations (`packages/integrations`). Core non modifica i file degli altri moduli senza coordinamento. Il frontend consuma l'API e non accede direttamente al database.

## Persistenza e dominio

PostgreSQL 16 è la persistenza durevole del flusso iniziale; non è un archivio temporaneo per l'integrazione iOS. Lo schema SQL è versionato e applicato dal runner con checksum. Le operazioni di dominio sono transazionali e scrivono audit; variazioni di data/stato partita hanno uno storico separato. `compose.yaml` serve solo lo sviluppo locale, esposto su loopback. Le migrazioni non vengono applicate automaticamente dall'API: sono un passo esplicito (`pnpm db:migrate`) e, negli ambienti distribuiti, un job dedicato prima del rollout.

Il primo slice copre squadra/stagione, giocatori/appartenenze stagionali, avversarie/competizioni, partite, pubblicazione esplicita e proiezioni pubbliche. Le proiezioni vengono lette dalle tabelle autorevoli e non espongono dati amministrativi. Gli schemi TypeBox sono contratti preliminari, non il modello definitivo: dettagli ulteriori si introducono seguendo le specifiche approvate e il primo MVP.

## Sicurezza

- Le API pubbliche di lettura non richiedono Logto.
- Ogni rotta `/api/v1/admin/*` è protetta; senza configurazione Logto risponde `503`, con token non valido `401`, senza scope `403`.
- Verifica admin: firma tramite JWKS configurato esplicitamente oppure scoperto dal documento OIDC, più `iss`, `aud`, `exp` e scope configurato. La configurazione dell'istanza e del resource indicator va verificata sull'istanza Logto esistente.
- `platform:admin` è il nome proposto/configurabile dello scope, non una decisione di prodotto né una configurazione già creata in Logto.
- `/health` è liveness e non prova che il database sia raggiungibile; `/ready` verifica la dipendenza PostgreSQL (`SELECT 1` con timeout fail-closed) e risponde `503` in caso di indisponibilità. Nessuna migrazione o verifica di schema avviene nelle probe.
- Le proiezioni pubbliche usano DTO espliciti e non espongono stato amministrativo, provenienza o audit.

## Decisioni / stato

- [ADR-0001 — stack C0](decisions/ADR-0001-c0-stack.md)
- [ADR-0002 — PostgreSQL per la persistenza](decisions/ADR-0002-postgresql-persistence.md)
- [API preliminare](API.md)
- Specifiche approvate: [docs/platform/README.md](platform/README.md) e documenti collegati.
- Snapshot ADR iOS: `docs/decisions/ios/`; l'implementazione e lo stato iOS restano nel repository iOS separato, fuori da questo repository.

## Non implementato / rinviato

Rilascio di produzione, sincronizzazione iOS, SSE/LIVE completo, provider dati esterni (CSI), risultati/eventi e statistiche estese, votazioni, contenuti editoriali e classifiche non fanno parte dello stato attuale di `main`. I candidati draft in corso non cambiano questo elenco finché non sono integrati.
