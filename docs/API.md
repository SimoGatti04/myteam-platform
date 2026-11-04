# API Core C1.2 — contratti preliminari

**Stato:** API v1 iniziale implementata sul branch `codex/core-persistent-flow`; la slice C2 aggiunge risultati e eventi gara sul branch `core/c2-match-results-events`. Tutti gli schemi TypeBox in `packages/contracts/src/platform.ts` sono **preliminari** e soggetti a coordinamento con Web, QA, iOS e Integrations; non sono ancora contratti di prodotto congelati né il completamento dell'MVP. Le liste restituite dalle rotte admin sono array JSON dei DTO di risorsa già definiti, senza involucro di paginazione.

## Letture pubbliche

| Metodo e percorso | Risultato |
| --- | --- |
| `GET /api/v1/public/team` | Branding pubblicato e stagione corrente |
| `GET /api/v1/public/roster` | Giocatori attivi nella stagione corrente, con numero di maglia |
| `GET /api/v1/public/matches` | Partite pubblicate, separate tra programmate e senza data |
| `GET /api/v1/public/matches/{id}` | Dettaglio limitato alla proiezione `PublicMatchDto` già usata nell'elenco |
| `GET /api/v1/public/matches/{id}/scoreboard` | Risultato e eventi registrati, solo per partita pubblicata, completata e con risultato |

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
| `GET /api/v1/admin/matches/{id}/result` | `MatchResultDto`; `404 match_result_not_found` se assente |
| `GET /api/v1/admin/matches/{id}/events` | Array di `MatchEventDto`, ordinato per periodo, minuto, creazione e id |

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
| `PATCH /api/v1/admin/matches/{id}/schedule` | Riprogramma o aggiorna lo stato, conservando lo storico; rifiuta le partite già completate |
| `POST /api/v1/admin/matches/{id}/publish` | Rende la partita visibile nella proiezione pubblica |
| `PUT /api/v1/admin/matches/{id}/result` | Inserisce o corregge il punteggio e porta la partita a `completed`; operazione idempotente |
| `POST /api/v1/admin/matches/{id}/events` | Registra un gol o cartellino; `201` alla creazione, `200` su retry idempotente identico |

Creazione risorsa risponde `201`; validazione `400`; token mancante/non valido `401`; scope insufficiente `403`; risorsa assente `404`; conflitto dominio `409`. Gli errori hanno forma `{ "error": "code" }`; gli errori interni non restituiscono dettagli del database. Il PATCH calendario/stato risponde `400 completed_match_schedule_is_immutable` se la partita è già `completed` o se la richiesta tenta di impostare tale stato. Il risultato si registra esclusivamente tramite `PUT .../result`, che completa la partita nella stessa transazione e conserva storico/audit.

## Semantica preliminare e limiti

- Configurazione squadra singleton identificata internamente da `1`; pubblicazione idempotente. Una volta pubblicata, nome e stemma non possono essere svuotati senza un flusso esplicito di ritiro della pubblicazione.
- Le appartenenze sono intervalli inclusivi e devono ricadere nelle date inclusive della stagione associata. `activeUntil: null` resta aperto fino al termine della stagione. Sono ammesse appartenenze storiche e rientri con periodi non sovrapposti; il giorno di confine è incluso, quindi un nuovo periodo può iniziare il giorno successivo alla fine del precedente.
- La stagione di una partita è un'attribuzione, non un vincolo rigido sulla data programmata: al momento la API non rifiuta date fuori dall'intervallo stagione, così da non impedire rinvii o competizioni prolungate. È una policy tecnica preliminare, non una decisione di prodotto definitiva; una futura policy di avviso/verifica richiede coordinamento.
- Ogni partita nuova resta non pubblicata e inizia `scheduled` con data oppure `to_be_scheduled` senza data. Le modifiche di calendario/stato conservano lo stesso ID e registrano lo storico.
- La modifica esplicita esistente riguarda configurazione squadra, chiusura delle appartenenze e calendario/stato partita. Non sono introdotte in C1.1 modifiche/eliminazioni generiche per identità giocatore, avversaria o competizione, né correzione dei legami stagione/avversaria/competizione della partita; restano fuori finché non sono definiti i requisiti di audit e riconciliazione.
- Dopo la pubblicazione, le proiezioni pubbliche includono solo squadra e partite pubblicate. La pubblicazione è esplicita; aggiornare il calendario di una partita pubblicata aggiorna la proiezione conservandone lo storico.

## C2 — risultati e eventi gara (slice additive)

Contratto versionato in `packages/contracts/src/platform.ts`; specifica e decisioni in `docs/CORE-C2-MATCH-RESULTS-EVENTS-SLICE.md`.

- `PUT /api/v1/admin/matches/{id}/result` accetta `{ teamScore, opponentScore, reason? }` (interi `0..99`) e risponde con `MatchResultDto`. La scrittura è transazionale: risultato, stato `completed`, `match_schedule_history` e `audit_events`. Una partita `cancelled` produce `409 cancelled_match_result_not_allowed`.
- `POST /api/v1/admin/matches/{id}/events` accetta `{ kind, side, period, minute, playerId?, assistPlayerId?, clientEventId? }`. `kind` è `goal|yellow_card|red_card`; `side` è `team|opponent`; `period` è `1|2`; `minute` è il minuto registrato **dentro il periodo** (`1..120`), non un clock assoluto normalizzato.
- Per eventi `team` il `playerId` è obbligatorio; per eventi `opponent` non è ammesso. L'assist è solo su un gol `team` e deve essere un giocatore diverso dal marcatore.
- `clientEventId` opzionale rende la creazione idempotente per partita: stesso payload → `200` con lo stesso evento; stesso identificativo con payload diverso → `409 idempotency_key_conflict`.
- Ordinamento amministrativo e pubblico: `(period, minute, created_at, id)`. Un evento al `1'` del secondo tempo precede un evento al `20'` del primo tempo.
- La proiezione pubblica è separata: `PublicMatchDto` resta invariato. `GET /api/v1/public/matches/{id}/scoreboard` risponde solo se squadra e partita sono pubblicate, la partita è `completed` e il risultato esiste; altrimenti `404 public_match_scoreboard_not_found`. Non espone `recordedBy`, `sourceKind`, `clientEventId`, audit o stato amministrativo.
- Il punteggio è autorevole e non viene derivato dagli eventi. Gli eventi registrati possono essere parziali: non vengono inventati marcatori, minuti, presenze o statistiche.

Distinte/partecipazione effettiva, correzioni multi-fonte e override, sincronizzazione iOS, statistiche aggregate, votazioni e contenuti restano fuori da questa slice. Cfr. `docs/platform/BACKEND-DATA.md`, `docs/platform/MVP-HANDOFF.md` e `docs/decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md`.
