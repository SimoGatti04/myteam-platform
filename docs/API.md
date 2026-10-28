# API Core — primo slice

**Stato:** rotte v1 preliminari implementate nel branch Core; evolvono con i consumer senza esporre direttamente lo schema SQL. Non dichiarano il completamento dell'MVP.

## Lettura pubblica

| Metodo e percorso | Risultato |
| --- | --- |
| `GET /api/v1/public/team` | Branding pubblicato e stagione corrente |
| `GET /api/v1/public/roster` | Giocatori attivi nella stagione corrente, con numero di maglia |
| `GET /api/v1/public/matches` | Partite pubblicate, separate tra programmate e senza data |

Queste rotte non richiedono token. Una squadra non ancora pubblicata produce `404 public_team_not_found`; record di gestione e audit non fanno parte delle proiezioni.

## Scritture amministrative

Tutte le rotte seguenti richiedono `Authorization: Bearer <access_token>` con issuer, firma/JWKS, audience API, scadenza e scope admin validi:

| Metodo e percorso | Operazione |
| --- | --- |
| `GET /api/v1/admin/team` | Legge la configurazione singleton |
| `PUT /api/v1/admin/team` | Salva branding e stagione corrente |
| `POST /api/v1/admin/team/publish` | Pubblica il branding (nome e stemma obbligatori) |
| `POST /api/v1/admin/seasons` | Crea una stagione |
| `POST /api/v1/admin/players` | Crea un giocatore |
| `POST /api/v1/admin/roster-memberships` | Aggiunge un periodo di appartenenza stagionale |
| `POST /api/v1/admin/roster-memberships/{id}/end` | Registra la fine di un'appartenenza |
| `POST /api/v1/admin/opponents` | Crea un'avversaria |
| `POST /api/v1/admin/competitions` | Crea una competizione |
| `POST /api/v1/admin/matches` | Crea una partita in stato iniziale programmato/da programmare |
| `PATCH /api/v1/admin/matches/{id}/schedule` | Riprogramma o aggiorna lo stato, conservando lo storico |
| `POST /api/v1/admin/matches/{id}/publish` | Rende la partita visibile nella proiezione pubblica |

Creazione risorsa risponde `201`; validazione `400`; token mancante/non valido `401`; scope insufficiente `403`; risorsa assente `404`; conflitto dominio `409`. Gli errori hanno forma stabile `{ "error": "code" }`; gli errori interni non restituiscono dettagli del database.

## Semantica provvisoria

- Configurazione squadra singleton identificata internamente da `1`; pubblicazione idempotente. Una volta pubblicata, nome e stemma non possono essere svuotati senza un flusso esplicito di ritiro della pubblicazione.
- Gli intervalli di rosa sono inclusivi e non possono sovrapporsi per giocatore/stagione. La rosa pubblica include solo appartenenze attive nella data corrente.
- Ogni partita inizia `scheduled` con data oppure `to_be_scheduled` senza data. Le modifiche di calendario/stato conservano lo stesso ID e registrano lo snapshot successivo nello storico.
- Partite e squadra entrano nelle viste pubbliche solo dopo pubblicazione esplicita. Dopo la pubblicazione, una riprogrammazione amministrativa aggiorna la proiezione e conserva la cronologia.

Il modello non copre ancora risultati, distinte, eventi gara, statistiche, correzioni multi-fonte, sync iOS, votazioni o contenuti. Cfr. `docs/platform/BACKEND-DATA.md`, `docs/platform/MVP-HANDOFF.md` e ADR-0008.
