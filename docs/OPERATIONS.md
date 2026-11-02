# Operatività

## Sviluppo locale

1. Copiare `.env.example` in `.env` e installare con `pnpm install`.
2. `pnpm db:up` avvia `postgres:16-alpine`, solo su `127.0.0.1:54329`; il volume persiste anche dopo `pnpm db:down`.
3. `pnpm db:migrate` applica le migrazioni. L'API non le applica automaticamente.
4. `pnpm dev` parte con `DATABASE_URL`; `HOST` e `PORT` sono configurabili. `/health` controlla solo la liveness del processo.

Il database di test è separato (`myteam_platform_test`). Non usare `docker compose down --volumes` se si vuole conservare i dati di sviluppo. Le credenziali d'esempio sono solo locali e non devono essere riutilizzate in produzione.

## Autenticazione

Impostare `LOGTO_ISSUER` e `LOGTO_AUDIENCE` secondo la configurazione reale dell'istanza Logto. Se `LOGTO_JWKS_URL` è vuoto, il backend consulta il documento OIDC discovery dell'issuer e usa il `jwks_uri` restituito; il suo issuer deve coincidere. `LOGTO_ADMIN_SCOPE` deve corrispondere a una permission assegnata al ruolo `admin`; `platform:admin` è solo il valore proposto nell'esempio. Se Logto non è configurato, le scritture admin falliscono chiuse con `503`.

## Produzione

Non è stato configurato o modificato K3s. Nessun contesto kubectl è stato selezionato. Backup/restore, TLS, credenziali production, rete, migrazioni di deploy, readiness/HA e runbook reali devono essere verificati in `infra/` prima di un rilascio.

Non committare `.env` o segreti.
