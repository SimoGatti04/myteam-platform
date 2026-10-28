# Autenticazione, autorizzazione e deployment

**Stato:** requisiti APPROVATI, onboarding Logto specifico e deployment myteam-platform NON ancora effettuati.

## Accesso web, app e API

- **Più amministratori fin dal primo MVP**, **un unico ruolo `admin`** con accesso all'area amministrativa intera e all'app iOS privata. Ruoli più granulari eventualmente in futuro.
- Riutilizzare **l'istanza Logto già attiva** nel K3s di infra, senza implementare autenticazione proprietaria; account diversi, medesimo ruolo.
- **Client OAuth/OIDC distinti:** web admin e iOS nativo. Stessa identità Logto, credenziali/sessioni e configurazioni client **non condivise**.
- **Web admin:** login OIDC, gestione corretta sessione e autorizzazione backend; **app iOS:** Authorization Code con PKCE, token nel Keychain, nessun client secret incorporato; la gestione locale offline non richiede rete/login disponibile in quel momento, il successivo upload invece richiede autorizzazione valida.
- **Backend:** controllare issuer, firma, audience, scadenza e ruolo/permessi per ogni endpoint riservato; ID token non equivale ad access token API.
- **Sito/PWA pubblico, LIVE, lettura dati e invio voti:** liberi **senza Logto né Cloudflare Access interattivo**. Voti protetti tramite limiti per browser e anti-abuso (non account).
- **API di sincronizzazione iOS:** solo access token Logto per ruolo admin, **senza** login browser Cloudflare Access.

### Cloudflare Access

Può essere un'ulteriore barriera per **area amministrativa web e sue route**, se il piano URL/policy lo permette; **non** sostituisce i controlli applicativi Logto e non deve bloccare votanti, consultazione pubblica, OAuth callback o iOS. La specifica configurazione degli host/path e l'eventuale ulteriore protezione Access restano **da progettare/verificare** secondo `infra`.

**PROPOSTA non ancora approvata:** usare inizialmente la Console Logto per assegnare utenti e ruolo, senza UI di gestione amministratori all'interno del sito.

## Target operativo APPROVATO

- Deploy su **K3s esistente**, con **Traefik / Gateway API**, **Cloudflare Tunnel condiviso** e DNS wildcard dove applicabile. Non aprire porte pubbliche né creare tunnel aggiuntivi per il sito.
- Routing Cloudflare e relative modifiche Terraform **esclusivamente** tramite la partizione K3s e il workflow documentato, con saved plan/review/approvazione per mutazioni Cloudflare Access. Partizione Mac mini separata.
- Immagini applicative in **GHCR** con tag immutabili; secret tramite **Infisical + External Secrets Operator**. Niente credenziali in Git.
- **PostgreSQL preferito** per dati backend relazionali, senza database su NFS; dimensionamento effettivo, nodo, PVC, backup e ripristino vanno definiti durante il design/deploy.
- ATTENZIONE: `infra/k3s/apps/myteam` è un **servizio video preesistente**, con namespace e DB propri; non associarlo o migrarlo automaticamente a myteam-platform. Anche il servizio `auri` già esiste. Scegliere identificativi, namespace, GHCR image e hostname specifici del nuovo progetto.
- Runtime, network, registry e stato reale dell'infrastruttura sono governati **solo dai runbook di infra**, non da ipotesi tratte da questa specifica.

## Riferimenti obbligatori prima di operazioni reali

- `/projects/workspace/infra/AGENTS.md`, `README.md`;
- `infra/docs/01-cluster-architecture.md`, `02-networking.md`, `03-registry-build-policy.md`, `04-storage.md`, `05-secrets-management.md`, `08-operational-commands.md`;
- `infra/docs/10-cloudflare-domain-management.md` per la **partizione K3s** (e `11-cloudflare-macmini-terraform.md` solo se necessario);
- `infra/config/exposure.yaml` e `infra/config/domains.yaml` quali source of truth dell'esposizione e del dominio;
- `infra/k3s/apps/logto/README.md` per onboarding OIDC, audience, client, ruoli, scope e autorizzazione.

Prima del deployment: definire isolamento endpoints pubblici/privati, backup/restore testato, healthcheck, readiness, rollback, osservabilità, retention del voto nominale e asset, test auth di audience/scope/revoca. Nessuna modifica K3s, Cloudflare o Terraform autorizzata da questa sola documentazione.
