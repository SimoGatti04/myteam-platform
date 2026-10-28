# Operatività locale e deploy

## Locale

`pnpm dev` avvia l'API sul loopback (`127.0.0.1:3000`). Impostare `HOST=0.0.0.0` solo in un container/rete di sviluppo che lo richieda e `PORT` per cambiare porta. `/health` indica che il processo HTTP è attivo; in C0 non dichiara dipendenze o database pronti.

## Configurazione

C0 non richiede segreti né file `.env`. Le variabili non sensibili supportate sono `HOST` e `PORT`. Validazione centralizzata in `apps/api/src/config.ts`.

## Produzione

Non esiste ancora una configurazione di produzione. Prima di pubblicare il servizio, consultare i runbook aggiornati di `infra/`, configurare Logto e i segreti fuori da Git, aggiungere readiness per le dipendenze e verificare logging, backup e recupero del database. Non creare namespace, tunnel, DNS o risorse K3s in questo checkpoint.
