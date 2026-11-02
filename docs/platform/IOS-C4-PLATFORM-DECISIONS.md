# C4 — Decisioni approvate per app iOS, branding e regolamento partita

**Data:** 29 ottobre 2026  
**Stato:** requisiti di prodotto APPROVATI; progettazione dei contratti e implementazione NON AVVIATE.  
**Ambito:** myteam-platform (Core/PWA) e repository iOS separato AURINFORMATC.

## Fonti, tracciabilità e versionamento

- Backend Fastify, contratti condivisi, PWA/sito e test QA sono versionati nel monorepo GitHub `SimoGatti04/myteam-platform`, ciascuno in branch/worktree dedicati; nessun merge a `main` autorizzato da questo documento.
- L'app nativa è versionata in un repository Git **separato, locale**, `AURINFORMATC`, senza remote configurato alla verifica del 29/10/2026. L'ultimo checkpoint attestato dai documenti iOS è C3.3 (`2bb9459`); verificare HEAD e working tree prima di operare. Preservare l'intera storia Git, gli asset e le migrazioni; non aggiungere remote o trasferire codice senza incarico esplicito.
- Fonti iOS autorevoli: `AURINFORMATC/app/docs/{FEATURES,ARCHITECTURE,STATUS,TESTING}.md` e ADR-0003/0006/0007/0008. Gli snapshot in `myteam-platform/docs/decisions/ios/` non sostituiscono gli originali.
- Questo record **non modifica** codice, contratti, database, schema SwiftData, risorse o infrastruttura. Le descrizioni “APPROVATO” non costituiscono implementazione.

## 1. Responsabilità di piattaforma — APPROVATO

- Core è la fonte condivisa per identità della squadra, branding, giocatori e appartenenze stagionali, competizioni, calendario e distinte pubblicate/sincronizzate; conserva provenienza, audit e priorità delle correzioni.
- PWA/admin gestisce la rosa e i ruoli abituali, le stagioni, le competizioni e il calendario; permette di creare/modificare la distinta della singola partita e configurare il branding e i regolamenti delle competizioni.
- iOS diventa client operativo del campo: recupera e conserva offline squadra/branding, rosa e calendario; seleziona una gara esistente o ne crea una locale non ancora in calendario; crea/modifica la distinta; gestisce formazione, panchina, cronometro, cambi, suggerimenti, Handicap, Superpower, eventi, correzioni e sessione live.
- Eliminare dall'interfaccia operativa iOS il CRUD ordinario della rosa, l'amministrazione del calendario e l'import CSV **solo dopo** aver verificato cache e migrazione delle informazioni legacy. Non eliminare lettori storici né dati preesistenti prematuramente.
- La gara locale non calendarizzata deve poter partire offline. In riconciliazione occorrono matching esplicito o creazione di bozza senza duplicazioni, mai pubblicazione automatica.

## 2. Branding e asset centralizzati — APPROVATO

- L'app iOS deve essere generica e configurabile per squadra. La prima istanza MAPI GROUP deve mantenere il **medesimo aspetto attuale**, inclusi colori, stile e asset esistenti; ogni modifica grafica va verificata per equivalenza visiva.
- Progettare un **Team Brand Profile** versionato con identità, design tokens (colori/ruoli, superfici, tipografia e varianti pertinenti) e riferimenti a immagini e asset per ruolo (logo, sfondo welcome, decorazioni, ecc.). Distinguere bozza da versione pubblicata, con revisioni, audit e rollback progettato.
- **Proposta tecnica da validare:** metadata/configurazione/versioni in PostgreSQL; binari in object storage compatibile S3; manifest revisionato con hash/ETag; cache persistente iOS e Web. Non considerare già approvato un provider o uno schema concreto.
- Tutti i client della stessa squadra condividono l'identità grafica pubblicata ma possono avere componenti e layout nativi differenti. Nessun valore MAPI hardcoded nelle istanze generiche; fallback tecnico neutro.
- Prima dell'implementazione censire asset reali (tra cui `WelcomeLogo`, `WelcomeBackground`, `FooterGeese`) e colori/stili nel repository iOS; disegnare un percorso di migrazione e verifica dei checksum/asset senza perdita.

## 3. Ruolo portiere e responsabilità della rosa — APPROVATO

- Il ruolo **abituale** portiere/giocatore di movimento viene configurato nella rosa tramite PWA e letto dall'iOS; è un segnale per automazioni e suggerimenti, **non** un vincolo di formazione.
- Durante la singola partita l'operatore può assegnare liberamente la posizione/ruolo effettivo in campo e modificarla, anche schierando un portiere abituale in movimento o un giocatore di movimento in porta.
- Separare semanticamente ruolo abituale e assegnazione operativa. L'attuale `isGoalkeeper` locale compare in `RosterPlayer` e `MatchPlayer`: preservare interpretazione e compatibilità storica durante la migrazione, evitando sovrascritture e deduzioni retroattive.
- Nessun ampliamento arbitrario dei ruoli anagrafici è richiesto ora.

## 4. Distinta bidirezionale — APPROVATO

- La distinta è **per partita** e distinta dalla rosa stagionale, dalla formazione e dalle presenze statistiche. È creabile e modificabile sia dalla PWA sia dall'iOS; al primo accesso la si recupera, se esiste, oppure si propone la selezione dalla rosa disponibile.
- La distinta può essere preparata offline; le modifiche si registrano e sincronizzano senza bloccare la preparazione/formazione/live.
- **DA PROGETTARE:** ID stabili, revisioni e concorrenza fra modifiche PWA/iOS, merge/rifiuto conflitti senza last-write-wins distruttivo, regole dopo il primo Play e collegamento alle partite nate offline.
- Distinta/panchina non assegnano presenze: una presenza statistica nasce solo dall'ingresso effettivo registrato (o confermato manualmente da admin per gare non tracciate), massimo una per gara.

## 5. Calendario, prepartita e LIVE — APPROVATO

- L'iOS mostra il calendario ricevuto dal backend e permette una selezione rapida della gara. Resta sempre disponibile «Gioca partita non in calendario», anche offline.
- Restano la selezione formazione/panchina, il Play esplicito, `MatchTiming` come **unica autorità temporale**, pause, cambi, timeline presenze, suggerimenti di rotazione, Handicap, Superpower, gol/assist, correzioni e undo limitato.
- **Target UX:** campo da calcio a 5 come superficie principale della schermata LIVE, con titolari posizionati sul campo, panchina accessibile, cronometro e punteggio sempre visibili, menu/azioni contestuali per cambi, gol, cartellini, ruolo operativo e altri comandi. L'interazione touch non deve dipendere dal solo drag-and-drop. Il layout concreto va progettato e testato, non è implementato.
- **Gol avanzati:** dopo una registrazione rapida, dettagli opzionali modificabili: posizione nella porta (coordinate normalizzate), piede destro/sinistro/testa/altro, situazione (azione/punizione/rigore/...), dinamica (diretto/deviazione/rimpallo/carambola/...), autogol, giocatore/squadra attribuita e assist se noto. Dimensioni separate e combinabili; niente ricostruzioni obbligatorie o inventate. Definire privacy e proiezioni pubbliche successivamente.

## 6. Regolamento tempi configurabile — APPROVATO (29/10/2026)

- La **configurazione della competizione**, gestita tramite PWA/admin e salvata da Core, definisce il **numero di tempi** e la **durata di ogni tempo**. Il modello deve consentire durate differenti tra periodi; non presumere sempre due periodi identici.
- Una **singola partita** eredita di default la configurazione della competizione associata; l'operatore iOS può modificarla per **quella partita**, senza cambiare la competizione né le altre gare. L'override per partita va salvato e reso coerente con il backend alla sincronizzazione.
- Gerarchia dei valori: **configurazione competizione → override esplicito partita → snapshot effettivo della sessione LIVE**. Dopo l'inizio, lo snapshot preserva le regole applicate: cambi successivi alla competizione non riscrivono minuti, eventi e storico. Le modifiche durante una sessione già avviata richiedono una policy esplicita da progettare e testare.
- Gli attuali **2 × 20 minuti** restano comportamento di **compatibilità** solo per partite legacy/locali senza configurazione, non un limite del nuovo modello. Anche il numero di periodi e le transizioni vanno adattati con cautela al motore `MatchTiming`, che oggi è tarato sul futsal 2 × 20.
- **DA DEFINIRE:** regolazione di intervalli, timeout, supplementari, limiti ammissibili, eventuali tempi aggiuntivi e UX della modifica del regolamento. Non presumere che siano già parametrizzabili.
- I contratti preliminari Core `CompetitionDto` e `MatchDto` oggi non includono questa configurazione: serviranno cambi versionati, migrazione SQL, validazione backend, test di ereditarietà/override/storicizzazione, e una migrazione SwiftData/payload LIVE **progettata prima di implementare**.

## 7. Offline-first, autenticazione e riconciliazione — invariati e APPROVATI

- SwiftData V3 rimane fonte locale delle operazioni sul campo; non introdurre un secondo archivio operativo o un secondo clock. La futura coda persistente conserva le mutazioni in locale prima dell'HTTPS, usa operation ID, ACK e retry idempotenti.
- Logto OAuth nativo con Authorization Code + PKCE e Keychain; nessuna dipendenza dalla login Web e nessun client secret embedded.
- Gerarchia condivisa: override amministrativo esplicito > CSI ufficiale > CSI ufficioso > dati operativi iOS, per campo e non per timestamp. Storico e provenienza persistenti. SSE pubblica soltanto proiezioni autorizzate.
- I dati LIVE non contribuiscono ad aggregati stagionali fino alla conclusione; assist aggregati e minutaggi individuali restano privati.

## 8. Preflight e prossimi checkpoint — PROPOSTI

1. **C4-A, audit read-only** di dipendenze iOS, asset MAPI, modelli e prove C3.3; definizione contratti con Core/Web e piano versionamento/migrazione.
2. **Platform C4-B**: contratto e backend per branding/asset, ruoli abituali, distinte e regolamento competizioni/partite, con amministrazione PWA.
3. **iOS C4-C/D/E**: tema e cache, flussi distinta/calendario, conversione di `MatchTiming` a periodi configurabili, nuovo LIVE e metadata evento, con regressioni/migrazioni.
4. **C5**: Logto nativo, SyncQueue e sincronizzazione HTTPS, riconciliazione e LIVE SSE.

L'ordine abilita prototipi indipendenti in parallelo, ma non consente di rimuovere funzioni legacy o cambiare lo schema SwiftData senza verifica preventiva.

**Gate:** nessun merge su `main`, nessun remote iOS creato, nessuna implementazione o deployment autorizzati da questa sola registrazione.

## 9. Collocazione iOS nel monorepo — APPROVATO (29/10/2026)

- L'app iOS nativa sarà trasferita dal repository Git locale `AURINFORMATC` al monorepo `myteam-platform` sotto `apps/ios/`, accanto a `apps/api/` e `apps/web/`. Il progetto Xcode resta nativo e indipendente dal workspace pnpm.
- **Preservazione della storia:** il trasferimento deve mantenere navigabile la storia di sviluppo che riguarda l'app, con autori, date, messaggi e modifiche, senza ridurla a un commit di copia. Se si filtra il sottoprogetto `app/`, gli SHA Git possono cambiare: documentare mapping e conservare il repository originale immutato.
- **Gate obbligatorio di sicurezza:** `myteam-platform` è pubblico, `AURINFORMATC` finora solo locale. Verificare **tutta la storia importabile** per segreti, dati personali, backup, calendari reali, signing e blob prima di qualunque push; non pubblicare una storia non bonificata. Il materiale storico escluso resta conservato privatamente.
- Non trasferire automaticamente `AURINFORMATC/backups/` o la documentazione `AURINFORMATC/docs/platform/` già consolidata. La migrazione di codice, test, script e asset avviene senza redesign, migrazioni SwiftData o modifiche al bundle ID.
- **Runbook:** [IOS-MONOREPO-MIGRATION.md](IOS-MONOREPO-MIGRATION.md). **Stato:** decisione approvata, migrazione non ancora eseguita; nessun merge su `main`.
