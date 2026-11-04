# Operatività

## Sviluppo locale

1. Copiare `.env.example` in `.env` e installare con `pnpm install`.
2. `pnpm db:up` avvia `postgres:16-alpine`, solo su `127.0.0.1:54329`; il volume persiste anche dopo `pnpm db:down`.
3. `pnpm db:migrate` applica le migrazioni. L'API non le applica automaticamente.
4. `pnpm dev` parte con `DATABASE_URL`; `HOST` e `PORT` sono configurabili. `/health` controlla solo la liveness del processo; `/ready` verifica la disponibilità di PostgreSQL (query `SELECT 1` con timeout limitato) e risponde `503` in caso di errore, timeout, pool assente o non inizializzato.
5. `pnpm --filter @myteam/web dev` avvia il frontend su `127.0.0.1:5173` con proxy `/api` verso `127.0.0.1:3000`.

Il database di test è separato (`myteam_platform_test`). Non usare `docker compose down --volumes` se si vuole conservare i dati di sviluppo. Le credenziali d'esempio sono solo locali e non devono essere riutilizzate in produzione.

## Autenticazione

Impostare `LOGTO_ISSUER` e `LOGTO_AUDIENCE` secondo la configurazione reale dell'istanza Logto. Se `LOGTO_JWKS_URL` è vuoto, il backend consulta il documento OIDC discovery dell'issuer e usa il `jwks_uri` restituito; il suo issuer deve coincidere. `LOGTO_ADMIN_SCOPE` deve corrispondere a una permission assegnata al ruolo `admin`; `platform:admin` è solo il valore proposto nell'esempio. Se Logto non è configurato, le scritture admin falliscono chiuse con `503`.

## Ambienti distribuiti

Staging è distribuito tramite immagini GHCR e manifest versionati in `deploy/`; la produzione è preparata come tooling gated e **non è stata rilasciata**. Esecuzione, credenziali, rete, TLS, backup/restore, migrazioni di deploy, readiness/HA e procedure di ripristino dipendono dall'infrastruttura dell'owner e dai relativi runbook operativi, che non fanno parte di questo repository pubblico: qui restano documentati solo i requisiti e il contratto delle probe.

Regole portabili da rispettare in qualsiasi ambiente:

- `/health` è la liveness probe; `/ready` è la readiness probe e richiede PostgreSQL raggiungibile.
- Le migrazioni non vengono applicate automaticamente: sono un passo di rilascio esplicito prima del rollout.
- Le credenziali arrivano solo da secret gestiti dall'ambiente; nessun segreto nel repository o nelle immagini.
- Non committare `.env` o segreti.
