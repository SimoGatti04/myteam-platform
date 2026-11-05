# Core C2 — risultati e eventi gara (thin slice)

- **Stato:** IMPLEMENTATO, TESTATO e pubblicato come draft PR #7; **PREVIEW OWNER / RE-QA richiesti**. Nessun merge o deploy.
- **Branch:** `core/c2-match-results-events`
- **Base verificata:** `origin/main` @ `08763f60bbf0550b8a5f212c5a552da6cbaec9c3` (riconciliata il 4 novembre 2026: PR #5, #6, #9 documentazione portabile e #10 dipendenze). Il candidato originale era basato su `77cf1302`.
- **Data:** 3 novembre 2026.
- **Ownership:** `apps/api`, `packages/contracts`, migrazione additiva, test Core e documentazione Core. Nessuna modifica a Web, iOS, Infra, CSI, workflow o manifest di deploy.

## 1. Perimetro

La slice consente a un amministratore autenticato di:

1. registrare o correggere il punteggio finale di una partita esistente;
2. registrare gol e cartellini con periodo, minuto, lato squadra, marcatore e assist opzionale;
3. leggere la stessa informazione in area amministrativa;
4. esporre risultato ed eventi registrati in una proiezione pubblica separata, solo dopo pubblicazione esplicita della partita.

Non introduce: distinte, titolarità, presenze effettive, minuti giocati, statistiche aggregate, eventi live automatici, correzioni multi-fonte/override, sync iOS, classifiche, votazioni o contenuti.

## 2. Ambiguità di prodotto e decisioni conservative

Queste scelte sono esplicite e richiedono preview owner prima di essere considerate policy definitiva.

| Tema | Ambiguità | Decisione di questa slice | Motivo |
| --- | --- | --- | --- |
| Lato evento | Il modello partita non persiste casa/trasferta, anche se `ADMIN-WEB.md` la prevede nella scheda partita | `side: "team" \| "opponent"` | Non inventare una sede assente. Mappare a casa/trasferta richiede un attributo partita separato. |
| Minuto | Minuto assoluto o minuto dentro il periodo | `period: 1\|2` + `minute` dentro il periodo, ordinamento `(period, minute, ...)` | Coerente con la richiesta di ordinare correttamente `1'` secondo tempo dopo `20'` primo tempo; nessuna normalizzazione o inferenza sui recuperi. |
| Completamento | Nessuna rotta esistente può portare una partita a `completed` | `PUT .../result` è l'unica transizione a `completed`, atomica con il risultato | Il PATCH calendario resta immutabile dopo il completamento; non si duplica la responsabilità dello stato. |
| Pubblicazione | Risultato/eventi potrebbero avere un gate proprio | Riuso di `matches.published_at`, unico gate esplicito già esistente | Scrivere risultato/eventi **non** pubblica la partita. La proiezione pubblica richiede squadra pubblicata + partita pubblicata + stato `completed` + risultato presente. |
| Coerenza punteggio/eventi | Gli eventi potrebbero essere incompleti o assenti | Il punteggio è autorevole; non viene derivato dagli eventi e non viene imposto un conteggio | Evita di inventare marcatori o statistiche. L'assenza di eventi non viene presentata come completezza. |
| Identità marcatore | Potrebbe essere un giocatore fuori rosa o un avversario | Eventi `team` richiedono un `playerId` esistente; eventi `opponent` non ammettono identità nostra | Non si deduce la presenza dalla distinta né si inventano identità avversarie. La validazione di appartenenza stagionale è lasciata al futuro gate di distinta. |
| Assist | Potrebbe essere registrato su cartellini o eventi avversari | Solo gol `team`, con giocatore diverso dal marcatore | Evita combinazioni senza significato. |
| Idempotenza eventi | I retry HTTP possono duplicare gli eventi | `clientEventId` opzionale univoco per partita; stesso payload → `200`, payload diverso → `409` | Rende la scrittura ripetibile senza successo fittizio. |
| Provenienza | Servono fonte e autore | Ogni riga ha `source_kind = 'admin_entry'` e `recorded_by`; ogni scrittura aggiunge `audit_events` | Provenienza minima e verificabile. La gerarchia multi-fonte/override resta C2-R1 e non è simulata qui. |

## 3. Contratto HTTP (v1 preliminare)

Schemi TypeBox in `packages/contracts/src/platform.ts`.

### 3.1 Risultato

`PUT /api/v1/admin/matches/{id}/result`

```json
{
  "teamScore": 2,
  "opponentScore": 1,
  "reason": "referto amministrativo"
}
```

Risposta `200`:

```json
{
  "matchId": "…",
  "teamScore": 2,
  "opponentScore": 1,
  "recordedAt": "2026-11-03T01:50:31.803Z",
  "updatedAt": "2026-11-03T01:50:31.803Z"
}
```

- `teamScore` / `opponentScore`: interi `0..99`.
- `reason`: opzionale, max 500; finisce nello storico e nell'audit.
- Idempotente: stessi punteggi su partita già completata restituiscono il record senza nuove scritture.
- `404 match_not_found`; `409 cancelled_match_result_not_allowed`; `401/403` secondo autorizzazione admin.

`GET /api/v1/admin/matches/{id}/result` → `MatchResultDto`; `404 match_result_not_found` se assente.

### 3.2 Evento

`POST /api/v1/admin/matches/{id}/events`

```json
{
  "kind": "goal",
  "side": "team",
  "period": 1,
  "minute": 20,
  "playerId": "…",
  "assistPlayerId": "…",
  "clientEventId": "goal-first-half-20"
}
```

Risposta `201` (creazione) o `200` (retry identico):

```json
{
  "id": "…",
  "matchId": "…",
  "kind": "goal",
  "side": "team",
  "period": 1,
  "minute": 20,
  "player": { "id": "…", "displayName": "Mario Rossi" },
  "assist": { "id": "…", "displayName": "Luca Bianchi" }
}
```

- `kind`: `goal | yellow_card | red_card`.
- `side`: `team | opponent`.
- `period`: `1 | 2`; `minute`: `1..120` dentro il periodo.
- `playerId`: obbligatorio per `team`, vietato per `opponent`.
- `assistPlayerId`: solo per gol `team`, diverso dal marcatore.
- Errori: `400 match_event_player_required`, `400 match_event_player_not_allowed`, `400 match_event_assist_requires_goal`, `400 match_event_assist_requires_team_goal`, `400 match_event_assist_must_differ`, `404 match_event_player_not_found`, `404 match_event_assist_player_not_found`, `409 idempotency_key_conflict`, `409 cancelled_match_event_not_allowed`.

`GET /api/v1/admin/matches/{id}/events` → `MatchEventDto[]` ordinato per `(period, minute, created_at, id)`.

### 3.3 Proiezione pubblica

`GET /api/v1/public/matches/{id}/scoreboard`

```json
{
  "matchId": "…",
  "status": "completed",
  "teamScore": 2,
  "opponentScore": 1,
  "events": [
    {
      "id": "…",
      "matchId": "…",
      "kind": "goal",
      "side": "team",
      "period": 1,
      "minute": 20,
      "player": { "id": "…", "displayName": "Mario Rossi" },
      "assist": { "id": "…", "displayName": "Luca Bianchi" }
    }
  ]
}
```

- `404 public_match_scoreboard_not_found` se squadra non pubblicata, partita non pubblicata, partita non `completed` o risultato assente.
- Non espone autore, fonte, idempotency key, audit o altri metadati amministrativi.
- `PublicMatchDto` e `GET /api/v1/public/matches/{id}` restano invariati: nessuna rottura del contratto Web esistente.

## 4. Persistenza e audit

Migrazione additiva `db/migrations/0002-match-results-and-events.sql`:

- `match_results` (`match_id` PK/FK, punteggi, `source_kind`, `recorded_by`, timestamp).
- `match_events` (`id`, `match_id` FK, `kind`, `team_side`, `period`, `minute`, `player_id`, `assist_player_id`, `client_event_id`, `source_kind`, `recorded_by`, timestamp).
- Vincoli: punteggi `0..99`, periodi `1|2`, minuti `1..120`, lato/identità coerenti, assist solo gol `team`, assist diverso dal marcatore.
- Indice di ordinamento `(match_id, period, minute, created_at, id)`.
- Indice univoco parziale `(match_id, client_event_id)` per idempotenza.
- `ON DELETE RESTRICT` verso partite e giocatori: nessuna cancellazione implicita di risultati/eventi.
- `audit_events`: `match_result` (`create`/`update`) e `match_event` (`create`); il completamento aggiunge `match.complete` e una riga in `match_schedule_history`.

## 5. Evidenza demo operativa

Eseguita contro PostgreSQL 16 effimero locale (container temporaneo, schema usa-e-getta, nessun database condiviso o live):

```text
1) PUT admin result -> 200 {"matchId":"8e623d59-…","teamScore":2,"opponentScore":1,"recordedAt":"2026-11-03T01:50:31.803Z","updatedAt":"2026-11-03T01:50:31.803Z"}
2) POST goal -> 201 {"kind":"goal","side":"team","period":1,"minute":20,"player":{"displayName":"Mario Rossi"},"assist":{"displayName":"Luca Bianchi"},…}
3) identical retry -> 200 (same event id)
4) POST second-half goal -> 201 {"period":2,"minute":1,…}
5) POST opponent card -> 201 {"kind":"yellow_card","side":"opponent","period":2,"minute":10,"player":null,…}
6) public before publish -> 404 {"error":"public_match_scoreboard_not_found"}
7) public after publish -> 200 {"status":"completed","teamScore":2,"opponentScore":1,"events":[period 1/20, period 2/1, period 2/10]}
8) DB result row -> {"team_score":2,"opponent_score":1,"source_kind":"admin_entry","recorded_by":"admin-demo"}
9) DB audit rows -> match / complete; match_result / create; match_event / create ×3
```

## 6. Test

- `pnpm check` (build + typecheck + unit/API suite): **PASS**.
- Test unitari Core nuovi: 5 PASS (identità evento/assist).
- Test API esistenti (`/health`, `/ready`): PASS.
- Integrazione PostgreSQL 16 reale effimera (`TEST_DATABASE_URL` + `REQUIRE_POSTGRES_INTEGRATION=1`): **3/3 PASS**, inclusi:
  - migrazione `0001` + `0002` e seconda applicazione idempotente;
  - admin 401/403, risultato, completamento, storico, audit;
  - eventi, retry idempotente, conflitto `clientEventId`, validazioni;
  - ordinamento `(period, minute)` con `1'` secondo tempo dopo `20'` primo tempo;
  - 404 pubblico prima della pubblicazione e dopo correzione non pubblicata;
  - proiezione pubblica senza metadati amministrativi;
  - partita cancellata fail-closed; partita inesistente `404`;
  - suite preesistenti `platform-flow` e readiness PostgreSQL: PASS.
- **Ricontrollo su base combinata (4 novembre 2026):** dopo il merge di `origin/main` @ `08763f6`, `CI=true pnpm install --frozen-lockfile` PASS, `pnpm check` PASS (22 test unitari + 5 HTTP), integrazione PostgreSQL 16 reale 3/3 PASS con migrazioni `0001` + `0002`.
- Migrazione/round-trip: verificati dalla suite di integrazione.
- **NOT RUN:** nessun deploy, nessun test staging/prod, nessuna verifica Web/iOS consumer su questa branch.

## 7. Rischi residui e domande per la preview owner

1. **Casa/trasferta non è nel modello partita.** La UI approvata la prevede; questa slice usa `team/opponent`. Serve una decisione separata e additiva sul modello partita.
2. **Minuto nel periodo, non clock assoluto.** Se il prodotto vuole minuti assoluti o recuperi normalizzati, il contratto va rivisto prima del Web.
3. **Nessuna correzione/eliminazione evento.** Le correzioni del risultato sono auditate; un evento errato oggi non ha una rotta di modifica. Va deciso se aggiungere una correzione esplicita e auditata.
4. **Eventi parziali.** Il pubblico mostra solo gli eventi registrati; non dichiara la completezza. Se serve un indicatore “referto completo”, è una nuova decisione di dominio.
5. **Visibilità immediata dopo pubblicazione.** Su una partita già pubblicata, un risultato/evento aggiunto o corretto compare subito nella proiezione pubblica (pur con audit). Se serve un gate di pubblicazione separato per le correzioni, va approvato.
6. **Validazione rosa.** Il marcatore deve esistere come giocatore, ma non è ancora vincolato alla distinta o all'appartenenza stagionale: la distinta non è modellata in questa slice.
7. **Completamento senza data.** Una partita `to_be_scheduled` può ricevere un risultato e passare a `completed` con data nulla. Se il prodotto richiede una data per il completamento, serve una regola esplicita.
8. **Provenienza admin non ancora esposta dai DTO.** `source_kind`, `recorded_by` e l'audit sono persistiti, ma la UI amministrativa non li legge ancora: richiede una lettura/proiezione admin dedicata, senza riutilizzare il DTO pubblico.

## 8. Handoff Web / QA

### 8.1 Superficie stabile per il primo verticale Web

Le rotte admin richiedono `Authorization: Bearer <access token OIDC>` con scope admin; le rotte pubbliche non richiedono token. I DTO sono esportati da `@myteam/contracts` (nessun deep import).

| Uso nella UI | Endpoint | Risposta |
| --- | --- | --- |
| Elenco partite (bozze e pubblicate) | `GET /api/v1/admin/matches` (+ `?seasonId=`) | `MatchDto[]` |
| Elenco giocatori | `GET /api/v1/admin/players` | `PlayerDto[]` |
| Appartenenze rosa | `GET /api/v1/admin/roster-memberships` (+ `?seasonId=`, `?playerId=`) | `RosterMembershipDto[]` |
| Avversarie | `GET /api/v1/admin/opponents` | `OpponentDto[]` |
| Leggere il risultato | `GET /api/v1/admin/matches/{id}/result` | `MatchResultDto` (`404 match_result_not_found` se assente) |
| Salvare o correggere il risultato | `PUT /api/v1/admin/matches/{id}/result` | `MatchResultDto` (`200`) |
| Leggere gli eventi | `GET /api/v1/admin/matches/{id}/events` | `MatchEventDto[]` |
| Registrare un evento | `POST /api/v1/admin/matches/{id}/events` | `MatchEventDto` (`201` creato, `200` replay idempotente) |
| Punteggio pubblico | `GET /api/v1/public/matches/{id}/scoreboard` | `PublicMatchScoreboardDto` |

Questa superficie è sufficiente per il primo verticale: **non servono nuove API**. Non esistono `PATCH`/`DELETE` evento né una rotta separata di correzione risultato; il `PUT` del risultato è l'unica correzione prevista.

### 8.2 Comportamento UI sicuro

- **Bozza locale prima dell'invio.** Il server accetta solo la creazione di eventi: modifiche e rimozioni vivono nella bozza client finché l'utente non invia il `POST`. Dopo l'invio l'evento non è modificabile lato server.
- **Nessuna falsa promessa di correzione.** La UI non deve offrire "modifica/elimina evento" contro il server; al massimo un'azione locale prima dell'invio.
- **Nessun successo atomico su salvataggi parziali.** Risultato ed eventi sono operazioni separate: se il risultato riesce e un evento fallisce, la UI riporta l'esito reale di ciascuna operazione, non un "salvato" complessivo. Il `PUT` è idempotente; ogni `POST` evento è indipendente e idempotente tramite `clientEventId`.
- **Nessuna pubblicazione implicita.** Salvare risultato o eventi non pubblica nulla: `POST /api/v1/admin/matches/{id}/publish` resta l'unica azione di pubblicazione e non va chiamata come effetto collaterale. Finché squadra o partita non sono pubblicate, lo scoreboard pubblico risponde `404`.
- **Punteggio autorevole.** La UI mostra e salva `teamScore`/`opponentScore` dal `PUT` e non deriva il punteggio dal numero di eventi. Eventi parziali non implicano un referto completo.
- **Lato `team`/`opponent`.** Il modello non ha casa/trasferta: la UI usa `side` con l'etichetta di prodotto scelta (es. "noi"/"loro") senza introdurre un campo home/away.
- **Errori da trattare come errori.** `409 idempotency_key_conflict` = stesso `clientEventId` con payload diverso; `409 cancelled_match_*` = partita annullata; `404 match_event_player_not_found` / `match_event_assist_player_not_found` = riferimenti non validi; `400 match_event_*` = regole semantiche (marcatore obbligatorio per `team`, vietato per `opponent`, assist solo su gol `team` e diverso dal marcatore).
- **Generazione `clientEventId`.** Deve essere stabile per l'evento in bozza e cambiare solo se cambia il contenuto dell'evento; è il meccanismo che rende sicuro il retry di rete.

QA deve verificare: `200`/`404` di pubblicazione, ordine eventi tra periodi, idempotenza, assenza di campi amministrativi nelle proiezioni pubbliche, `401/403`, e che il risultato non venga derivato dagli eventi.

### 8.3 Stato di pubblicazione

- Branch pubblicato: `core/c2-match-results-events`, riconciliato su `main` @ `08763f60bbf0550b8a5f212c5a552da6cbaec9c3`, draft PR #7; nessun merge o deploy eseguito da Core.
- Verifica su base combinata: `pnpm install --frozen-lockfile`, `pnpm check`, integrazione PostgreSQL 16 reale (migrazioni `0001` + `0002`) — cfr. sezione 6.
