# ADR-0002 — PostgreSQL come persistenza durevole del flusso Core

- **Stato:** ACCETTATO per il primo flusso persistente — 28 ottobre 2026
- **Ambito:** backend `myteam-platform`, modello relazionale condiviso e sviluppo locale
- **Dipendenze:** ADR-0001 C0, specifiche `docs/platform/BACKEND-DATA.md`, ADR-0008 snapshot iOS

## Contesto

Il backend deve servire inserimenti amministrativi, future integrazioni iOS/provider e letture pubbliche usando gli stessi servizi e la stessa persistenza. L'utente ha escluso un database provvisorio da sostituire al momento dell'integrazione iOS. Il primo dominio richiede relazioni tra stagioni, giocatori, rose, competizioni, avversarie e partite, transazioni, storico e audit. La configurazione infrastrutturale esistente usa PostgreSQL 16; in locale è disponibile l'immagine `postgres:16-alpine`.

## Decisione

Usare PostgreSQL 16 come database applicativo durevole già dal primo slice. Il backend usa `pg`, query parametrizzate, una connessione transaction-scoped per ogni operazione atomica e migrazioni SQL numerate con checksum. Il runner non modifica una migrazione già applicata: le modifiche successive richiedono una nuova migrazione.

Compose avvia PostgreSQL soltanto per sviluppo/test locale e lo pubblica su `127.0.0.1:54329`; la configurazione K3s e il repository `infra` non vengono modificati da questo ADR.

## Alternative considerate

- **SQLite:** scartato come archivio dell'applicazione perché introdurrebbe un backend locale differente dal database condiviso previsto e porterebbe a una migrazione proprio durante l'integrazione iOS.
- **MySQL/MariaDB:** tecnicamente possibile, ma non offre un vantaggio concreto per questo dominio e non riusa la scelta PostgreSQL già presente nell'infrastruttura.
- **Database documentale:** meno adatto ai vincoli relazionali e alle transazioni del percorso, senza necessità di flessibilità schemaless.
- **Servizi separati:** rinviati; le responsabilità condividono lifecycle e transazioni e restano in un monolite modulare.

## Conseguenze e limiti

- Lo schema resta preliminare e dovrà seguire gerarchia fonti, audit e compatibilità specificati in ADR-0008; non è un modello definitivo di tutti i domini.
- L'immagine in cache e il Compose locale non verificano backup, HA, credenziali, policy di rete o upgrade in produzione/K3s.
- Il database non viene migrato automaticamente all'avvio dell'API; l'operazione è esplicita (`pnpm db:migrate`).
- La scelta va riaperta se emergono un vincolo operativo reale del cluster o requisiti di scalabilità/isolamento incompatibili con il monolite.
- `platform:admin` resta un nome scope proposto e configurabile: deve corrispondere alla permission effettivamente predisposta in Logto.
