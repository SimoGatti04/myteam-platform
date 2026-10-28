# API Core C1.1 — contratti preliminari

**Stato:** API v1 iniziale implementata sul branch `codex/core-persistent-flow`. Tutti gli schemi TypeBox in `packages/contracts/src/platform.ts` sono **preliminari** e soggetti a coordinamento con Web, QA, iOS e Integrations; non sono ancora contratti di prodotto congelati né il completamento dell'MVP. Le liste restituite dalle rotte admin sono array JSON dei DTO di risorsa già definiti, senza involucro di paginazione.

## Letture pubbliche

| Metodo e percorso | Risultato |
| --- | --- |
| `GET /api/v1/public/team` | Branding pubblicato e stagione corrente |
| `GET /api/v1/public/roster` | Giocatori attivi nella stagione corrente, con numero di maglia |
| `GET /api/v1/public/matches` | Partite pubblicate, separate tra programmate e senza data |
| `GET /api/v1/public/matches/{id}` | Dettaglio limitato alla proiezione `PublicMatchDto` già usata nell'elenco |

Queste rotte non richiedono token. Una squadra non ancora pubblicata produce `404 public_team_not_found`. Il dettaglio partita produce `404 public_match_not_found` per una partita inesistente o non pubblicata. La proiezione disponibile contiene ID, stagione, avversaria, competizione, ufficialità, data/stato; non contiene risultato o eventi gara.

## Letture amministrative

Tutte le rotte admin, incluse le letture, richiedono `Authorization: Bearer <access_token>` con issuer, firma/JWKS, audience API, scadenza e scope admin validi. `platform:admin` resta una permission proposta da associare alla configurazione Logto reale.

| Metodo e percorso | Risultato |
| --- | --- |
| `GET /api/v1/admin/team` | Configurazione singleton, inclusa la bozza |
| `GET /api/v1/admin/seasons` | Array di `SeasonDto`, stagioni recenti prima |
| `GET /api/v1/admin/players` | Array di `PlayerDto`, ordinato stabilmente per nome |
| `GET /api/v1/admin/roster-memberships` | Array di `RosterMembershipDto`; filtri opzionali `seasonId` e `playerId` (UUID) combinabili |
| `GET /api/v1/admin/opponents` | Array di `OpponentDto` |
| `GET /api/v1/admin/competitions` | Array di `CompetitionDto` |
| `GET /api/v1/admin/matches` | Array di `MatchDto`, incluse bozze/non pubblicate e tutti gli stati; filtro opzionale `seasonId` (UUID) |

Le query sconosciute o gli UUID non validi sono rifiutati con `400 request_validation_failed`. Le liste non hanno ancora paginazione: sono previste per il primo pannello e dataset iniziali.

## Scritture amministrative

| Metodo e percorso | Operazione |
| --- | --- |
| `PUT /api/v1/admin/team` | Salva branding e stagione corrente |
| `POST /api/v1/admin/team/publish` | Pubblica il branding (nome e stemma obbligatori) |
| `POST /api/v1/admin/seasons` | Crea una stagione |
| `POST /api/v1/admin/players` | Crea un giocatore |
| `POST /api/v1/admin/roster-memberships` | Aggiunge un periodo di appartenenza stagionale |
| `POST /api/v1/admin/roster-memberships/{id}/end` | Registra la fine di un'appartenenza |
| `POST /api/v1/admin/opponents` | Crea un'avversaria |
| `POST /api/v1/admin/competitions` | Crea una competizione |
| `POST /api/v1/admin/matches` | Crea una partita non pubblicata in stato programmato/da programmare |
| `PATCH /api/v1/admin/matches/{id}/schedule` | Riprogramma o aggiorna lo stato, conservando lo storico |
| `POST /api/v1/admin/matches/{id}/publish` | Rende la partita visibile nella proiezione pubblica |

Creazione risorsa risponde `201`; validazione `400`; token mancante/non valido `401`; scope insufficiente `403`; risorsa assente `404`; conflitto dominio `409`. Gli errori hanno forma `{ "error": "code" }`; gli errori interni non restituiscono dettagli del database.

## Semantica preliminare e limiti

- Configurazione squadra singleton identificata internamente da `1`; pubblicazione idempotente. Una volta pubblicata, nome e stemma non possono essere svuotati senza un flusso esplicito di ritiro della pubblicazione.
- Le appartenenze sono intervalli inclusivi e devono ricadere nelle date inclusive della stagione associata. `activeUntil: null` resta aperto fino al termine della stagione. Sono ammesse appartenenze storiche e rientri con periodi non sovrapposti; il giorno di confine è incluso, quindi un nuovo periodo può iniziare il giorno successivo alla fine del precedente.
- La stagione di una partita è un'attribuzione, non un vincolo rigido sulla data programmata: al momento la API non rifiuta date fuori dall'intervallo stagione, così da non impedire rinvii o competizioni prolungate. È una policy tecnica preliminare, non una decisione di prodotto definitiva; una futura policy di avviso/verifica richiede coordinamento.
- Ogni partita nuova resta non pubblicata e inizia `scheduled` con data oppure `to_be_scheduled` senza data. Le modifiche di calendario/stato conservano lo stesso ID e registrano lo storico.
- La modifica esplicita esistente riguarda configurazione squadra, chiusura delle appartenenze e calendario/stato partita. Non sono introdotte in C1.1 modifiche/eliminazioni generiche per identità giocatore, avversaria o competizione, né correzione dei legami stagione/avversaria/competizione della partita; restano fuori finché non sono definiti i requisiti di audit e riconciliazione.
- Dopo la pubblicazione, le proiezioni pubbliche includono solo squadra e partite pubblicate. La pubblicazione è esplicita; aggiornare il calendario di una partita pubblicata aggiorna la proiezione conservandone lo storico.

Risultati, distinte, eventi gara, statistiche, correzioni multi-fonte, sincronizzazione iOS, votazioni e contenuti restano fuori da questo slice. Cfr. `docs/platform/BACKEND-DATA.md`, `docs/platform/MVP-HANDOFF.md` e `docs/decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md`.
