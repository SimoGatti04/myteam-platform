# Test e verifiche

## Comandi locali

- `pnpm check` esegue build, typecheck TypeScript e suite automatica.
- `pnpm test` avvia i test con il runner integrato di Node tramite `tsx`.
- Per il controllo HTTP manuale, avviare `pnpm dev` e richiamare `curl --fail http://127.0.0.1:3000/health`.

## C0

I test verificano il contratto liveness, la risposta HTTP prodotta da Fastify e la validazione della configurazione. Non verificano ancora database, autenticazione, API di prodotto o deployment.

## Test persistenti futuri

Le semantiche che dipendono dal database devono essere testate contro PostgreSQL, non simulate solo con mock. I test con servizi devono dichiarare prerequisiti, versione immagine e modalità di avvio/arresto; i comandi locali ordinari non devono mutare infrastruttura remota né dati di produzione.
