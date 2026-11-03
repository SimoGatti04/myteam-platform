# myteam-platform — production manifests

**Stato:** PREPARAZIONE MANIFEST — NESSUN DEPLOY ESEGUITO.
**Base:** protected `main` `fa34c6de38e964a6546a643437276507a0901b79`.
**Namespace:** `myteam-platform-prod` (distinto da `myteam-platform-staging`).
**Hostname candidato:** `team.simogatti.it` — **NON APPROVATO DALL'OWNER**.

Questo overlay è codice di deployment, non una dichiarazione che l'ambiente
production esista o sia stato approvato. Non copia dati, password, audience o
client Logto dallo staging. Non modifica il servizio legacy
`myteam.simogatti.it`.

## Struttura

| Stage | Contenuto | Gate |
|---|---|---|
| `01-bootstrap` | Namespace, PV/PVC locale isolato, ExternalSecret ESO, PostgreSQL, NetworkPolicy | namespace/produzione, storage e path Infisical distinti |
| `02-migration` | Job migrazioni fail-closed, `backoffLimit: 0` | database Ready e backup/rollback verificati |
| `03-apps` | API e Web con immagini digest, probe e security context | immagini release immutabili |
| `04-routing` | HTTPRoute candidato, ultimo stage | hostname owner-approved e routing verificato |

`deploy-production.sh` senza `--apply` esegue soltanto validazione e render
temporaneo. `--apply` richiede esplicitamente i gate `PRODUCTION_CHANGE_APPROVED`,
`PRODUCTION_HOSTNAME_APPROVED`, `PRODUCTION_STORAGE_PROVISIONED`,
`PRODUCTION_SECRETS_READY`, `PRODUCTION_IMAGES_VERIFIED`,
`PRODUCTION_LOGTO_ONBOARDED`, `PRODUCTION_BACKUP_VERIFIED` e
`PRODUCTION_ROLLBACK_READY`; non è stato eseguito.

## Separazione da staging

| Voce | Production |
|---|---|
| Namespace | `myteam-platform-prod` |
| Secret ESO | `/myteam-platform/prod/*` |
| PostgreSQL | PVC/PV `myteam-platform-prod-*`, path `/srv/myteam-platform-prod/postgres` |
| API/Web | repository MAPI con digest distinti, mai `:latest` o tag mobile |
| Logto | stessa istanza issuer, ma **SPA e API resource production distinti** |
| Hostname | candidato `team.simogatti.it`, da approvare |
| Dati | database nuovo; nessun dump o copia staging |

La collisione namespace/host è stata controllata nel source `infra` disponibile:
non risultano `myteam-platform-prod` né `team.simogatti.it`. Il servizio legacy
`myteam.simogatti.it` resta invariato. Questa verifica non sostituisce un
controllo live prima del deploy.

## Blocchi prima di qualunque deploy

1. **Hostname/URL:** owner deve approvare esplicitamente `team.simogatti.it`
   (o un altro host) e i relativi redirect/logout Logto. Impostare
   `hostname.approved=true` solo dopo tale decisione.
2. **Logto:** creare una SPA production e una API resource production distinte;
   audience/scope non devono essere quelli staging. Il client ID Web va passato
   al build release production; non va copiato dallo staging.
3. **Infisical/ESO:** creare `/myteam-platform/prod/POSTGRES_DB`,
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`, `LOGTO_ISSUER`,
   `LOGTO_AUDIENCE`. Valori nuovi e distinti; nessun valore staging.
4. **Immagini:** eseguire il release workflow sul futuro SHA `main` approvato,
   con la configurazione Web production, e fissare i digest API/Web restituiti.
   `production.values.json` deve contenere soltanto digest `sha256` completi.
5. **Storage:** verificare nodo, capacità, path host e ownership UID/GID `70:70`;
   creare il PV/PVC senza copiare dati. La capacità e il nodo sono placeholder
   finché non esiste una decisione operativa.
6. **Backup/restore:** predisporre dump logico cifrato off-cluster e restore
   isolato verificato. Il primo deploy ha database vuoto, ma la procedura deve
   comunque essere provata; i deploy successivi richiedono backup pre-migrazione.
7. **Routing:** dopo l'approvazione host, la modifica del manifest `infra`
   `config/exposure.yaml`/render target è un change INFRA separato. Il wildcard
   Cloudflare esistente non richiede DNS exact, ma `make exposure-check` deve
   riconoscere il nuovo host e il target HTTPRoute.
8. **Pull GHCR:** verificare l'esistenza del pull secret nel namespace e la label
   `simogatti.io/ghcr-pull=true`; nessuna credenziale va nei manifest.

Nessuno di questi blocchi è stato risolto da questa branch.

## Configurazione

`production.values.json` contiene solo valori pubblici/placeholder:
hostname candidato, nodo/capacità storage, digest immagini, SHA sorgente e
metadati Logto non secret. I secret reali restano esclusivamente in Infisical.

`render-production.py --check` è **fail-closed**: rifiuta hostname non approvato,
host staging/legacy, immagini tag-only, placeholder residui e namespace errato.
`validate-production.py` controlla il template; con `--rendered` verifica che
non siano rimasti identificatori staging o segreti staging.

## Sequenza futura (solo dopo i gate)

```sh
# 1. Compilare production.values.json con valori approvati.
python3 deploy/production/validate-production.py
python3 deploy/production/render-production.py --output /tmp/myteam-prod
python3 deploy/production/validate-production.py --rendered /tmp/myteam-prod

# 2. Solo con approvazione esplicita e backup/rollback verificati:
#    kubectl diff -f ...; kubectl apply -f ... (stage per stage)
#    Il runner fail-closed è deploy/production/deploy-production.sh --apply.
```

Non eseguire `--apply` finché Logto, Infisical, GHCR, storage e hostname non
sono approvati e verificati.

## Backup e rollback

- **Backup:** prima di ogni migrazione su un database non vuoto, dump logico
  cifrato off-cluster, checksum, retention e restore in un namespace isolato.
  Non usare lo stesso PVC come backup.
- **Rollback applicativo:** registrare i digest API/Web correnti prima
  dell'apply; in caso di regressione riapplicare i digest precedenti. Non
  affidarsi a `:latest` o a un tag mobile.
- **Rollback dati:** non invertire automaticamente le migrazioni. Ripristinare
  il dump solo con approvazione esplicita, dopo avere fermato il traffico e
  verificato l'impatto. Preferire una migrazione forward-only compatibile.
- **Routing:** in caso di errore, rimuovere/ripristinare lo stage routing solo
  dopo avere verificato API/Web e database; non cancellare PV/PVC.

## Verifiche locali

```sh
python3 -m unittest discover -s tests/production -p 'test_*.py' -v
bash -n deploy/production/deploy-production.sh
shellcheck deploy/production/deploy-production.sh
for s in 01-bootstrap 02-migration 03-apps 04-routing; do
  kubectl kustomize "deploy/production/$s" >/dev/null
done
```

Il test sintetico usa un hostname e digest fittizi per verificare il renderer;
non è una prova di release e non autorizza un deploy.
