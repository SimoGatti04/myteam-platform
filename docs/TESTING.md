# Verifica

## Comandi

- `pnpm check`: build, type-check (incluse le prove API) e test unitari.
- `pnpm test`: suite automatica locale senza dipendenza da PostgreSQL.
- `pnpm test:integration`: test reali PostgreSQL tramite `TEST_DATABASE_URL`.
- `pnpm --filter @myteam/contracts build`: prepara il package condiviso dopo un checkout pulito.
- `pnpm --filter @myteam/api dev`: avvia il backend in sviluppo (default `127.0.0.1:3000`). Questo è il comando diretto per il backend; `pnpm dev` a livello root resta un wrapper che compila i contratti e poi lo avvia.
- `pnpm db:migrate`: applica le migrazioni versionate al database indicato da `DATABASE_URL`.

## Test PostgreSQL

1. Preparare `.env` solo se assente (`cp -n .env.example .env`) e configurare esclusivamente un database locale autorizzato.
2. Il runner accetta solo host loopback e un database con suffisso `_test`; crea uno schema casuale isolato, applica e riapplica le migrazioni, poi rimuove solo quello schema.
3. Avviare PostgreSQL con `pnpm db:up` solo se il servizio/volume Compose è sicuramente gestito per questo progetto e l'avvio è autorizzato; altrimenti usare un database locale già autorizzato. Non puntare mai il test a `DATABASE_URL` come fallback.
4. Eseguire `pnpm test:integration`.

Il Compose definisce PostgreSQL 16 e crea `myteam_platform_test` alla prima inizializzazione del volume. Le prove devono usare la stessa major version prevista per il deployment. Nessun test di questa slice richiede Logto reale: i test JWT usano una chiave/JWKS locali e il flusso usa un verificatore iniettato.

## Prova integrata: admin → PostgreSQL → pubblicazione → API pubblica → browser

Questa procedura richiede il backend Core e il frontend Web compatibile in worktree distinti, oltre a un database locale autorizzato. Per i flussi admin via browser servono anche le impostazioni Logto già approvate per l'ambiente di sviluppo e un utente con la permission admin. Non modificare tenant o configurazione Logto reali per sbloccare il test: se tali prerequisiti mancano, segnare la prova browser come **NOT RUN**.

1. Nel worktree Core, configurare `.env` senza sovrascrivere un file esistente. `DATABASE_URL` deve puntare al database locale di sviluppo; `TEST_DATABASE_URL` al database locale dedicato con suffisso `_test`. Non committare `.env` o segreti.
2. Se serve un database nuovo, avviare `pnpm db:up` solo dopo aver confermato ownership e autorizzazione del servizio. Applicare poi le migrazioni con `pnpm db:migrate`.
3. Terminale Core: eseguire `pnpm --filter @myteam/contracts build`, poi `pnpm --filter @myteam/api dev`; verificare che il backend parta su `http://127.0.0.1:3000`.
4. Nel worktree Web compatibile, avviare `pnpm --filter @myteam/web dev`. Vite è configurato su `http://127.0.0.1:5173` e inoltra `/api` al backend locale sulla porta 3000.
5. Nel browser aprire `http://127.0.0.1:5173`, autenticarsi con l'account di sviluppo autorizzato e creare/configurare i dati supportati dal pannello: stagione, rosa/giocatore, avversaria, competizione e partita. Le operazioni admin richiedono Bearer token; non usare access token condivisi in log o screenshot.
6. Verificare che la scrittura sia persistita nel database locale (ad esempio leggendo `seasons`, `players`, `season_roster_memberships`, `opponents`, `competitions` e `matches` con un client PostgreSQL autorizzato). Il client Web del branch W1 attualmente espone la lettura `GET /api/v1/admin/team` e le scritture del flusso; le letture admin di collezione elencate in `API.md` sono disponibili lato Core ma non risultano ancora invocate dai metodi del client Web.
7. Pubblicare esplicitamente squadra e partita tramite il pannello/rotte admin. Confermare in PostgreSQL che `published_at` sia valorizzato per i record pubblicati.
8. Verificare le proiezioni senza token, per esempio `curl -i http://127.0.0.1:3000/api/v1/public/team`, `curl -i http://127.0.0.1:3000/api/v1/public/matches` e `curl -i http://127.0.0.1:3000/api/v1/public/matches/<id-pubblicato>`.
9. Ricaricare nel browser la vista pubblica Web compatibile e confrontare squadra/partita con le risposte API. Partite non pubblicate devono restare fuori dalle letture pubbliche; il dettaglio pubblico non include risultati o eventi.

La sequenza separa persistenza e pubblicazione: la sola creazione admin non rende un record pubblico. La configurazione Logto e i servizi condivisi non vengono modificati da questa procedura.
