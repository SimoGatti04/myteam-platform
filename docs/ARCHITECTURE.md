# Architettura — baseline C0

**Stato:** struttura iniziale implementata; API di prodotto, persistenza, autenticazione e frontend ancora da implementare.

## Forma del sistema

Repository separata organizzata come monorepo pnpm. Il backend parte come monolite modulare TypeScript su Node.js, con API Fastify (`apps/api`) e contratti/schemi condivisi (`packages/contracts`). I moduli futuri vanno aggiunti quando un flusso concreto ne giustifica il codice; non sono previsti microservizi.

Confini di ownership: Core (`apps/api`, `packages/contracts`, configurazione condivisa), Web (`apps/web`), QA (`tests`), Integrations (`packages/integrations`). I consumer condividono contratti versionati; il frontend non accede direttamente ai dati persistenti.

## Persistenza e sicurezza

C0 espone solo `GET /health` e non apre connessioni a database. Il prossimo flusso persistente dovrà partire da un archivio relazionale durevole scelto per l'uso condiviso; non utilizzare SQLite o un archivio provvisorio destinato a essere sostituito. PostgreSQL è la scelta tecnica proposta per la prima implementazione; schema, migrazioni, provisioning e compatibilità operativa devono essere verificati nel relativo ADR prima del rilascio.

Le scritture admin richiedono il modello Logto approvato; non esporre rotte di modifica prive di autorizzazione. Le proiezioni pubbliche devono restare separate dai dati amministrativi. Deployment e configurazione K3s rimangono sotto i runbook del repository `infra/`.

## Decisioni e stato

- [ADR-0001 — scelte C0 e percorso tecnico](decisions/ADR-0001-c0-stack.md)
- Requisiti approvati: `platform/README.md` e dossier collegato.
- Riferimenti iOS: snapshot in `decisions/ios/`; verificare il repository sorgente prima di qualsiasi lavoro iOS.
