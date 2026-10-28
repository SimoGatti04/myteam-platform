# App iOS — stato attuale e specifica di integrazione

**Stato:** iOS fino a C3.3 IMPLEMENTATO (come da report e documenti iOS); integrazione backend e autenticazione NON implementate.

## Fonte autorevole dello stato

Leggere `AURINFORMATC/app/AGENTS.md`, `AURINFORMATC/app/docs/ARCHITECTURE.md`, `AURINFORMATC/app/docs/STATUS.md`, `AURINFORMATC/app/docs/TESTING.md` e ADR-0003, 0006, 0007 e 0008. Questo documento riguarda **l'integrazione futura**, non sostituisce lo stato del codice.

Al checkpoint C3.3 (report del 27/10/2026), SwiftData **V3** è l'archivio operativo (rosa, calendario, storico, sessione live, metadata correzioni). Payload live versione 3, timeline ingressi/uscite con sequenza e copertura verificabile, motore unico del tempo `MatchTiming`, proposte di correzione/undo limitato. Esito riportato: **122 PASS, 0 FAIL, 0 SKIPPED** (119 APPTests, 3 XCUITest) su simulatore. **NOT RUN:** device reale e lock/unlock fisico. **Aperti:** due warning SwiftUI `Invalid frame dimension (negative or non-finite)`. Ultimo HEAD riportato `2bb9459` sul branch locale `main`, senza remote; verificare lo stato corrente prima di operare.

## Offline-first — APPROVATO

- Il motore iOS funziona **senza rete e senza backend**: cronometro, entrate/uscite, sostituzioni, eventi e correzioni operative restano disponibili e salvate localmente. Non introdurre un secondo clock, un JSON operativo parallelo o dipendenze remote nel salvataggio critico.
- Ogni modifica da pubblicare viene registrata in una **coda locale persistente**; trasmissione HTTPS con ID univoci, ACK e retry idempotenti. Crash, chiusura app, ACK perso e disconnessione non devono perdere aggiornamenti.
- Gli eventi dello stesso secondo vanno ordinati in modo deterministico rispettando la sequenza logica, non l'ordine casuale di UUID o arrivo.
- Dopo riapertura l'app recupera pendenti e li trasmette quando il login è valido; il backend recupera correttamente lo stato LIVE e pubblica al browser tramite SSE.
- L'operatore può continuare offline anche se Logto non è raggiungibile; la sincronizzazione richiede access token ancora valido o rinnovo/login quando ritorna Internet.
- L'app è fonte **operativa del LIVE**, ma **non** superiore all'override amministrativo sul backend; una correzione nell'app non equivale automaticamente a un override admin prioritario.

## Autenticazione iOS — APPROVATA

Unico ruolo Logto `admin`, con più utenti; gli stessi utenti possono accedere alla gestione web. Client OAuth nativo separato dal client web, **Authorization Code con PKCE**, credenziali/tokens conservati con sicurezza piattaforma (Keychain), nessun client secret hardcoded. API di sincronizzazione protette con access token Logto validati lato backend (issuer, firma, audience, scadenza e ruolo). **Non usare una sessione Cloudflare Access interattiva** per le API native.

## Distinta della singola partita nell'app — FUNZIONALITÀ APPROVATA DA INTRODURRE

- La **distinta della partita** è separata dalla **rosa stagionale**: permette di selezionare i giocatori presenti per una gara, usando la rosa attiva della stagione come elenco iniziale, senza modificare l'appartenenza stagionale.
- **Funzionalità da introdurre/integrare nell'app iOS**: scegliere e modificare la distinta per ogni gara nel flusso prepartita; usarla per predisporre partecipanti prima di impostare titolari, panchina e avviare i cronometri. Non duplicare la logica già esistente di partecipanti, titolari, portiere, panchina o timing: verificare prima lo stato del codice C3.3 e ampliare solo gli aspetti mancanti.
- La distinta della stessa partita dovrà poter essere sincronizzata in futuro con il backend e con l'area admin, tramite ID stabili e riconciliazione non distruttiva; **offline-first** e persistente localmente, senza dipendenza di rete per preparare una gara. Regole su editing concorrente web/app e sincronizzazione della distinta ancora **DA PROGETTARE**.
- **Nessuna implementazione ora**: questo è un requisito di prodotto approvato per un checkpoint futuro, non un'attestazione che il flusso o la sincronizzazione siano già disponibili. Qualsiasi modifica SwiftData successiva richiederà progettazione/versionamento/migrazione e regressione.

## Presenze statistiche derivate dalla partecipazione reale — APPROVATO

Una **presenza** si attribuisce solo quando il giocatore **entra effettivamente in campo** almeno una volta nella gara; essere incluso nella distinta o rimanere in panchina non basta. Il flusso partita iOS dovrà derivare l'informazione dagli eventi operativi di ingresso/titolarità effettiva **già registrati**, contando una sola presenza per giocatore per gara indipendentemente da sostituzioni e rientri. Non equiparare automaticamente «selezionato», «titolare configurato» e «sceso in campo» senza verifica dell'avvio reale. Le partite gestite solo da web potranno indicare manualmente i giocatori realmente scesi in campo, senza inventare dati temporali. Implementazione della proiezione condivisa da verificare durante lo sviluppo dell'integrazione; non dichiararla già testata in C3.3.

## Evoluzioni del modello — PLANNED, non implementate

Per il web pubblico serviranno dati ulteriori: stagione/competizione strutturate, identificatori o mapping cross-system, numeri maglia/foto opzionali, cartellini negli eventi, collegamento a sondaggi e riconoscimenti. Questi sono **gap da valutare**, non l'autorizzazione a introdurre ora SwiftData V4 o a modificare i ruoli oltre il portiere. Gli assist sono disponibili nell'app privata, ma non diventano statistiche aggregate pubbliche. POTM può avere più vincitori, quindi non modellarlo soltanto con un singolo `potmPlayerID`.

Prima di qualsiasi migrazione SwiftData: contratti condivisi, impatto sugli snapshot legacy, migrazione versionata e test con store sintetici. Niente reinterpretazione retroattiva di minutaggi legacy incompleti.

## Casi di verifica per il futuro sync

Persistenza offline/restart, idempotenza dopo retry e ACK perso, ordine sostituzioni simultanee, invio tardivo dopo override admin o import CSI, autorizzazione negata/revocata, rinnovo token, recupero SSE snapshot, isolamento dati privati, migrazioni store. Prima della release dell'app: test reali su device/lock-unlock e diagnosi dei warning C3.3.
