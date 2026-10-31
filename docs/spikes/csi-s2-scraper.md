# CSI-S2 — Scraper CSI configurabile: prototipo tecnico e architettura di integrazione

**Data:** 31 ottobre 2026
**Ruolo:** Integrations / Research Spike, sola lettura sulla fonte
**Branch:** `integrations/csi-s2-scraper`
**Base:** `f6382175b2fa9488994d3dfbb460d995ede97e5c` (candidato I1)
**Precedente:** [csi-s1-feasibility.md](csi-s1-feasibility.md) sul branch `research/integrations-csi-s1`
**Perimetro:** prototipo isolato in `packages/integrations/`, fixture sintetiche, documentazione. Nessuna modifica a Web, Core, iOS, schemi PostgreSQL applicati, job schedulati, infrastruttura.

## Verdetto

| Esito | Valutazione |
|---|---|
| **CSI-S2 PROTOTYPE PASS** | Pipeline configurabile completa, 60 test deterministici superati, typecheck pulito, nessun identificativo di squadra/competizione nel codice. |
| **Acquisizione live verificata** | **NO.** Il portale Live risponde con una challenge Cloudflare gestita (`403`, `cf-mitigated: challenge`). Nessun campione HTML reale è stato ottenuto. |
| **Uso automatizzato consentito** | **NON DIMOSTRATO.** Nessuna API/export documentato, nessuna licenza di riuso, nessuna autorizzazione scritta. Il prototipo resta dietro un gate esplicito. |
| **Integrazione Admin/Backend** | **SOLO PROGETTATA.** Contratti e DDL sono proposte; nessuna rotta, migrazione o schermata è stata implementata. |

Il verdetto positivo riguarda la *fattibilità tecnica del prototipo*, non la fattibilità dell'acquisizione automatica oggi. Il percorso preferibile resta: **export manuale PDF + inserimento/override amministrativo** come percorso primario, con lo scraper come opzione futura subordinata ad autorizzazione e a un campione reale.

## 1. Condizioni di accesso — prove effettuate

Sei richieste HTTPS in totale, nessuna autenticazione, nessun header camuffato, nessun JavaScript, nessun tentativo di superare la challenge.

| # | Richiesta | Esito | Evidenza |
|---|---|---|---|
| 1 | `GET https://live.centrosportivoitaliano.it/robots.txt` | `403` | `cf-mitigated: challenge`, pagina "Just a moment..." |
| 2 | `GET .../25/Calcio-a-5/Lombardia/Bergamo/C203/` | `403` | identica challenge (5.585 byte) |
| 3 | `GET https://sport.centrosportivoitaliano.it/` | `200` | portale riservato, titolo "Attività Login" |
| 4 | `GET https://sport.centrosportivoitaliano.it/robots.txt` | `200` | "Portale riservato: indicizzabile la sola pagina di accesso... `Disallow: /`" |
| 5 | `GET https://www.centrosportivoitaliano.it/p/portale-sport` | `200` | sito associativo pubblico |
| 6 | `GET https://www.centrosportivoitaliano.it/robots.txt` | `200` | contenuti pubblici crawlabili; nessuna indicazione su API o export |

Conseguenze:

- **Non è stato possibile verificare** HTML senza JavaScript, endpoint JSON, PDF, né alcun identificativo su una risposta reale.
- Superare la challenge Cloudflare richiederebbe browser automation con risoluzione di challenge: è esplicitamente escluso dall'incarico e non è stato tentato.
- Il portale sportivo delle società è dichiaratamente riservato (`Disallow: /`): l'accesso autorizzato per società è un canale da attivare con CSI, non da forzare.
- Contatto tecnico ufficiale già identificato in CSI-S1: **`helpdesk@csi-net.it`**. Nessun messaggio è stato inviato.

## 2. Fonti esaminate

- `https://live.centrosportivoitaliano.it/` e relativi percorsi stagione/regione/comitato/girone (esempio tecnico Bergamo `C203`, non MAPI).
- `https://live.centrosportivoitaliano.it/faq` (già letto in CSI-S1: export PDF di calendario e classifica; risultato rosso = ufficioso, nero = omologato).
- `https://sport.centrosportivoitaliano.it/` (portale società, area riservata).
- `https://www.centrosportivoitaliano.it/p/portale-sport` (pagina pubblica di presentazione del portale sport).
- Rapporto CSI-S1 per la struttura degli URL e delle tabelle indicizzate.

## 3. Matrice dei dati

Stato riferito alla fonte live: `UNKNOWN` = non verificabile nel perimetro autorizzato; `FEASIBLE (fixture)` = il prototipo lo produce correttamente da fixture sintetiche.

| Dato | Fonte/URL | Identificativo | Formato | Stato live | Note |
|---|---|---|---|---|---|
| Stagione, regione, comitato, disciplina, competizione, girone | percorso URL `/25/<Disciplina>/<Regione>/<Comitato>/C203/` + selettore girone | segmenti testuali; `C203` ricorre per più gironi | HTML + parametri | UNKNOWN | `C203` è opaco e **non** identifica il girone: va sempre accoppiato a stagione+comitato+girone |
| Squadre partecipanti | tabella squadre / celle gara | `/S<num>/` osservato | HTML | UNKNOWN | stabilità non documentata |
| Loghi | `<img>` nelle righe squadra | URL asset | PNG/JPG | UNKNOWN | diritti di riuso da chiarire; il prototipo non scarica immagini |
| Calendario (giornata, data, ora, campo, casa/trasferta) | tabella calendario | `P<...>` osservato | HTML | UNKNOWN | date in formato italiano nel campione indicizzato |
| Risultati | cella risultato | come sopra | HTML | UNKNOWN | assenza di marcatore ⇒ trattato come **ufficioso** |
| Stato ufficioso/omologato | classe CSS sulla cella/riga | — | HTML | UNKNOWN (convenzione documentata in FAQ) | mappa classe→stato configurabile nel profilo |
| Classifica completa | tabella classifica (`Pt, PG, V, N, P, GF, GS, DR`) | squadra come sopra | HTML + PDF | UNKNOWN | il prototipo non ricostruisce mai la classifica dai risultati |
| Rinvii/recuperi | riga marcata rinviata + data modificata | `P...` invariato | HTML | UNKNOWN | gestiti come *reschedule* con stessa identità gara |
| Marcatori / dati giocatori | — | — | — | escluso | non acquisiti |

## 4. Architettura del prototipo

```
packages/integrations/
  src/
    security/url-policy.ts     allowlist host, HTTPS, no IP letterali, no credenziali,
                               no traversal, porte, controllo IP privati risolti
    security/rate-limit.ts     token bucket + single-flight
    acquire/client.ts          GET con timeout, limite byte, redirect rivalidati,
                               retry/backoff, cache TTL, content-type allowlist
    html/tokenizer.ts          tokenizer tollerante (script/style raw, entità)
    html/dom.ts                albero DOM con chiusura implicita td/tr/li/option
    html/selector.ts           sottoinsieme CSS (tag, #id, .classe, [attr op v], ' ', '>')
    csi/profile.ts             profilo di estrazione dichiarativo (markup fuori dal codice)
    csi/parse.ts               squadre, gare, classifica, stato, diagnostica
    csi/discovery.ts           opzioni progressive (stagioni/comitati/gironi)
    csi/ids.ts                 estrazione ID osservati + chiave di match
    csi/normalize.ts           nomi, stagioni, date/ore, fuso Europe/Rome con DST
    csi/matching.ts            binding CSI→locale, alias, omonimie
    csi/snapshot.ts            JSON canonico + digest sha256 (senza fetchedAt)
    csi/diff.ts                added/removed/score/status/reschedule/venue/standings
    csi/import-plan.ts         intenti con gate di pubblicazione e override
    csi/pipeline.ts            acquire→parse→snapshot→diff→plan + lock per sorgente
    contracts/admin-csi.ts     contratti Admin proposti (tipi, nessuna rotta)
    sql/proposed-csi-s2.sql    DDL proposto (non applicato)
  fixtures/                    HTML sintetico, dichiarato tale
  test/                        60 test deterministici
```

Scelte rilevanti:

1. **Nessun identificativo nel codice.** Squadra, girone, stagione e comitato sono dati di configurazione o di pagina; il codice conosce solo *come* estrarli.
2. **Markup isolato nel profilo.** Se CSI cambia template, si aggiorna `CSI_PROFILE_V0`; parser, snapshot, diff e piani restano invariati. Un profilo alternativo dimostra la configurabilità (discovery da `<select>` o da `<ul><li><a>`).
3. **Zero dipendenze aggiuntive.** Parser HTML e selettori sono scritti nel modulo; non è stato introdotto alcuno stack nuovo né modificato `pnpm-workspace.yaml` (file Core).
4. **Nessun browser automation.** Il parser opera su HTML già ottenuto; l'acquisizione è un semplice client HTTP con guardie.

## 5. Contratti Core proposti

Tipi in `src/contracts/admin-csi.ts`, da convertire in TypeBox dentro `packages/contracts` in un checkpoint coordinato:

- `CsiSourceUpsertRequest` / `CsiSourceView` — configurazione persistente, `enabled`, limiti, timezone.
- `CsiDiscoveryRequest` / `CsiDiscoveryResponse` — opzioni progressive, con `fetchedAt` e `fromCache`.
- `CsiPreviewRequest` / `CsiPreviewResponse` — anteprima con `snapshotDigest`, `planDigest`, `previewToken`.
- `CsiImportRequest` / `CsiImportResponse` — conferma con `idempotencyKey` e binding squadre.
- `CsiSyncRunSummary` — stato, errori, conteggi.

Rotte previste (non implementate):

```
GET  /api/v1/admin/integrations/csi/sources
PUT  /api/v1/admin/integrations/csi/sources/:sourceId
POST /api/v1/admin/integrations/csi/discover
POST /api/v1/admin/integrations/csi/preview
POST /api/v1/admin/integrations/csi/import
GET  /api/v1/admin/integrations/csi/sources/:sourceId/runs
```

Invarianti: ogni mutazione richiede admin autenticato e chiave di idempotenza; ogni URL è rivalidato lato server; il `previewToken` lega l'import allo snapshot esatto mostrato.

## 6. Modello dati proposto

`sql/proposed-csi-s2.sql` (non applicato) propone:

- `integration_source` — configurazione persistente della sorgente.
- `integration_competition_link` — girone CSI ↔ competizione/stagione locali (più link per installazione).
- `integration_snapshot` — snapshot immutabile con `digest` univoco per link.
- `integration_sync_run` — esecuzioni, con indice univoco parziale che impedisce due run attive per sorgente.
- `integration_team_binding` — associazione confermata CSI → `team_profile`/`opponents`.
- `integration_match_binding` — identità gara stabile attraverso rinvii.
- `integration_import_batch` — conferma admin, idempotente su `(applied_by, idempotency_key)`.

La provenienza non viene sparsa su `matches`: resta in snapshot, binding e `audit_events`, coerente con ADR-0008.

## 7. Specifica Admin (progettata, non implementata)

Percorso: **Admin → Partite → Importazioni → CSI**.

1. **Elenco sorgenti**: stato, ultima sincronizzazione, ultimo errore, numero conflitti aperti.
2. **Configurazione**: base URL, allowlist (mostrata in sola lettura), timezone, limiti (timeout, byte, redirect, richieste/minuto, TTL cache), abilitazione.
3. **Selezione progressiva**: stagione → regione → comitato → disciplina → categoria → girone → squadra, popolata da `discover`; in alternativa incolla un URL di competizione e associa manualmente.
4. **Anteprima**: competizione, squadre con stato di matching (`matched`/`ambiguous`/`unmatched`), gare con stato risultato, classifica, diagnostica.
5. **Riepilogo**: nuovi, modifiche, rimozioni, conflitti, elementi protetti da override, risultati ufficiosi.
6. **Associazione squadre**: per ogni squadra CSI → identità locale esistente, creazione nuova (conferma esplicita), oppure ignora.
7. **Conferma import**: riepilogo + `idempotencyKey`; nulla è pubblicato prima della conferma.
8. **Stato**: ultima sincronizzazione, esito, errori tipizzati, elementi bloccati.
9. **Abilitazione e frequenza automatica**: la frequenza resta disabilitata finché CSI-S3 non valida metodo e autorizzazione.

Regole UI: si renderizzano solo campi normalizzati e tipizzati; **nessun HTML remoto** viene inserito nelle viste; i loghi sono URL con policy CSP, non markup.

## 8. Integrità dei dati

| Requisito | Implementazione nel prototipo |
|---|---|
| Override admin prioritario | `protectedMatchKeys`, `protectedTeamLocalIds`, `competitionLocked` → intento `skip-protected`, mai sovrascritto |
| No duplicati avversari | binding `csiTeamId → localId`; match esatto/alias; ambiguità ⇒ `conflict`, mai scelta automatica |
| Rinvii mantengono identità | chiave `id:<P…>` stabile; cambio di data/campo = `rescheduled`/`venue`, non nuova gara |
| Ufficioso vs omologato | `resultStatus` da classi configurate; assenza di marcatore ⇒ `unofficial` + diagnostica |
| Idempotenza | digest calcolato senza `fetchedAt`; snapshot identico ⇒ zero intenti; `planDigest` deterministico |
| Provenienza e storico | snapshot immutabili + `fetchedAt` + profilo parser + futura `audit_events` |
| Nessuna pubblicazione automatica | gate `blocked-unconfirmed` / `blocked-unofficial` su ogni intento |
| Classifiche | trattate come dato autonomo con stato proprio; mai ricostruite dai risultati della nostra squadra |

## 9. Sicurezza

- **SSRF**: allowlist rigorosa, solo HTTPS, porta 443, niente credenziali, niente IP letterali, rifiuto di `localhost`/range privati anche dopo risoluzione DNS, rivalidazione di ogni redirect e obbligo di restare sullo stesso host.
- **Limiti**: timeout, dimensione massima dichiarata e in streaming, numero di redirect, content-type allowlist.
- **Carico**: token bucket (default 6 req/min), cache TTL, single-flight per URL, lock per sorgente con errore `concurrent_sync`, backoff esponenziale con rispetto di `Retry-After`.
- **Persistenza**: nessun job schedulato, nessuna coda, nessun polling continuo nel prototipo.
- **Superficie admin**: solo dati normalizzati, nessun HTML remoto.

## 10. Verifiche

- `tsc -p packages/integrations/tsconfig.test.json` → **0 errori**.
- `node --import tsx --test packages/integrations/test/*.test.ts` → **60 test, 60 pass, 0 fail**.
- Copertura: parsing e fixture malformate; dati mancanti; omonimie e ID ambigui; modifiche di calendario; ufficioso→omologato e regressione inversa; rimozioni; idempotenza; rifiuto URL non autorizzati; redirect cross-host; timeout; retry; limite byte; cache; concorrenza; discovery con markup alternativo.
- **Nessun test live**: tutte le prove usano una sorgente finta iniettata. È il limite principale di questo spike.
- `git diff --check` pulito.

## 11. Rischi di manutenzione

1. **Markup non verificato**: il contratto DOM è provvisorio; il primo campione reale richiederà calibrazione e nuovi test.
2. **Challenge Cloudflare**: può cambiare senza preavviso e non va aggirata.
3. **Condizioni d'uso**: riuso e redistribuzione non sono stati autorizzati per iscritto.
4. **Identificativi opachi**: `C203`, `S…`, `P…` non sono documentati come stabili; servono binding confermate.
5. **Convenzioni stagione**: due cifre ambigue; risolte con configurazione esplicita.
6. **Diritti sui loghi**: da chiarire prima di mostrare stemmi di terzi.
7. **Classifiche ufficiose**: rischio di pubblicare dati non omologati se il gate venisse aggirato.

## 12. Piano CSI-S3

| Fase | Attività | Criterio di uscita |
|---|---|---|
| S3.0 | Richiesta scritta a `helpdesk@csi-net.it`: export/API, identificativi, frequenza, riuso, loghi | risposta documentata |
| S3.1 | Campione reale autorizzato (stagione corrente + storica + secondo comitato) | fixture versionate, profilo `v1` con `verifiedAgainstLiveSource: true` |
| S3.2 | Migrazione Core + servizi di dominio secondo il DDL proposto | test PostgreSQL verdi |
| S3.3 | Rotte admin e schermate Web | flusso anteprima→conferma→storico |
| S3.4 | Esecuzione manuale con feature flag, scheduler spento | sync manuale riproducibile |
| S3.5 | Frequenza automatica conservativa (se autorizzata) | monitoraggio, backoff, alert |

## 13. Informazioni mancanti per localizzare MAPI

- Denominazione CSI registrata della società e della squadra.
- Comitato territoriale, disciplina, categoria/fase e girone.
- Stagione di riferimento e URL/ID della competizione.
- Se i risultati sono già omologati e chi li conferma.
- Referente societario per l'accesso al portale riservato.
- Esito della richiesta di autorizzazione a export/riuso.

## 14. Verdetti separati

- **CSI-S2 PROTOTYPE PASS** — prototipo, test e documentazione completi; nessuna integrazione Admin/Backend dichiarata.
- **Acquisizione live**: **NON VERIFICATA** (challenge Cloudflare, nessun campione).
- **Uso automatizzato**: **NON CONSENTITO allo stato attuale**; richiede autorizzazione e verifica tecnica.
- **Percorso preferibile oggi**: export manuale PDF + inserimento/override admin (funziona anche senza CSI).
- **Alternativa**: API/export ufficiale se CSI lo fornisce; lo scraper resta opzione di riserva.
