# CSI-S1 — Studio di fattibilità per l’importazione CSI

**Data della verifica:** 31 ottobre 2026
**Ruolo:** Integrations / Research Spike, sola lettura
**Branch di ricerca:** `research/integrations-csi-s1`
**Base verificata:** `f6382175b2fa9488994d3dfbb460d995ede97e5c` (`codex/integration-i0-candidate` dopo merge BUILD B1)
**Perimetro:** campionamento di fonti pubbliche CSI; nessun accesso autenticato, nessun adapter, scraping, polling, modifica di codice o database.

## Sintesi e verdetto

CSI Live rende pubblicamente consultabili calendari, risultati, classifiche e informazioni di squadra. L’FAQ ufficiale documenta anche l’esportazione PDF di calendario e classifica. Il contenuto testuale indicizzato di pagine ufficiali mostra un calendario per giornata e una classifica tabellare completa. Il portale distingue risultato ufficioso e omologato: l’FAQ indica rosso per ufficioso e nero per omologato; la pagina campione reca comunque un avviso generale secondo cui i dati sono da considerarsi ufficiosi fino all’omologazione.

**Questo non dimostra una API pubblica o un’autorizzazione al riuso automatizzato.** Nessuna API ufficialmente documentata, schema export CSV/XLSX/JSON/ICS, SLA, rate limit o licenza di riutilizzo è stata individuata nelle fonti ufficiali consultate. La ricerca web sui percorsi di Live è stata bloccata dal controllo robots del servizio di consultazione; non ho aggirato il blocco con richieste HTTP, browser automation o ispezione di richieste interne. La prova di parsing è quindi limitata al testo estratto dall’indice del portale, non alla risposta HTTP grezza né a una verifica JavaScript disabilitato.

| Esito richiesto | Valutazione I0 | Significato |
|---|---|---|
| **API OFFICIAL FEASIBLE** | **UNKNOWN / non dimostrata** | Nessuna documentazione pubblica o canale API autorizzato trovato. Non assumere che eventuali richieste JSON interne siano riutilizzabili. |
| **PUBLIC DATA FEASIBLE, WITH CONDITIONS** | **FEASIBLE per consultazione; condizionale per ingestione** | Pagine e dati sono pubblici nell’interfaccia; l’acquisizione automatizzata è bloccata/non autorizzata nel perimetro verificato. Serve una modalità consentita e stabile. |
| **MANUAL EXPORT FEASIBLE** | **FEASIBLE** | FAQ ufficiale: PDF accanto a calendario e classifica. Il file concreto non è stato scaricato né validato nello spike. |
| **PERMISSION REQUIRED** | **SÌ come gate del progetto per ingestione automatica/redistribuzione** | Non ho trovato il testo di una regola CSI che definisca l’obbligo legale esatto; data l’assenza di licenza/API e il blocco robots, richiedere conferma scritta prima di automatizzare o ripubblicare dati/asset. |
| **NOT FEASIBLE** | **Ingestione automatica affidabile oggi: NOT FEASIBLE nel perimetro autorizzato** | Non è un’impossibilità assoluta: può diventare fattibile con API/export concordato o altra autorizzazione CSI. Il primo deployment non deve dipendere da CSI. |

**Raccomandazione:** mantenere inserimento e correzione manuale come percorso operativo completo. Richiedere al CSI un canale di esportazione/API documentato e permessi per campi, frequenza, retention, attribuzione e redistribuzione. Rivalutare l’adapter solo dopo risposta scritta e test su campione corrente. Non introdurre ora dipendenze provider, crawler o polling.

## Metodo, limiti e rispetto dell’accesso

- Verificato il checkout di ricerca pulito: branch `research/integrations-csi-s1`, HEAD `f6382175b2fa9488994d3dfbb460d995ede97e5c`. La base contiene il candidato I1 integrato; nessun file di progetto è stato modificato durante la ricerca.
- Consultate fonti ufficiali CSI tramite risultati e contenuti testuali indicizzati, con poche query mirate e senza polling persistente. I risultati per le pagine Live riportavano `Content type: text/html` e calendario/classifica estraibili dall’indice.
- Le richieste del servizio di ricerca per FAQ e URL Live sono state esplicitamente rifiutate come `Blocked by robots.txt` / `restricted URL`; anche la lettura diretta di `robots.txt` non era disponibile tramite quel servizio. Non ho riprovato con `curl`, endpoint non documentati, DevTools o un browser automatizzato. Pertanto non affermo di conoscere le direttive letterali del file robots né che il server invii direttamente tutto il contenuto senza JavaScript.
- Nessun login, credenziale, CAPTCHA, endpoint privato o dato individuale di giocatore è stato richiesto/acquisito. Non è stata verificata la risposta effettiva dei pulsanti PDF.
- “Non trovato nelle pagine esaminate” non equivale a prova che un canale API o una policy non esistano: la documentazione potrebbe essere disponibile nel manuale autenticato del Portale Sport o su richiesta al CSI.

## Fonti consultate

Le fonti qui sotto sono ufficiali CSI. I percorsi Live sono stati letti solo come estratti pubblici indicizzati, non come acquisizione diretta del portale.

- **S1 — FAQ CSI Live:** `https://live.centrosportivoitaliano.it/faq` — campi del dettaglio gara; risultato rosso/nero; omologazione; modifiche del risultato; PDF; ricerca delle stagioni precedenti; contatto assistenza.
- **S2 — CSI Live, campione storico tecnico 2025/26:** `https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lombardia/Bergamo/C203/` — CSI Bergamo, Calcio a 5, “CAC / Dilettanti A 5 Gruppo C / B” nell’estratto campionato. Il campione è solo tecnico: **non è identificato come squadra o girone MAPI GROUP**. Le pagine indicizzate riportano anche varianti B/C/D sotto il percorso `C203` con query `j` diverse.
- **S3 — CSI Live home:** `https://live.centrosportivoitaliano.it/` — selettore stagione, sport e comitati; l’estratto consultato mostrava 2026/27 e stagioni precedenti.
- **S4 — “MyCSI e il nuovo portale LIVE: i risultati dei campionati sempre aggiornati!”:** `https://www.centrosportivoitaliano.it/notizie/attivita-sportive/mycsi-e-il-nuovo-portale-live-i-risultati-dei-campionati-sempre-aggiornati` — il CSI descrive aggiornamenti in tempo reale tra MyCSI, Portale Sport e Live. È una descrizione funzionale, non un SLA o una frequenza contrattuale.
- **S5 — Portale Sport CSI:** `https://www.centrosportivoitaliano.it/p/portale-sport` e `https://sport.centrosportivoitaliano.it/` — il Portale Sport gestisce iscrizioni, generazione calendari, risultati e classifiche; il manuale è disponibile all’interno del portale; l’accesso di comitati/strutture avviene tramite area riservata. Contatto assistenza pubblicato: `helpdesk@csi-net.it`.
- **S6 — Contatti CSI:** `https://www.centrosportivoitaliano.it/p/contatti` — include `helpdesk@csi-net.it` tramite la pagina Portale Sport, assistenza MyCSI (`mycsi@csi-net.it`), contatto generale `info@csi-net.it` e ufficio legale `legale@csi-net.it`.
- **S7 — confronto territoriale, CSI Roma 2025/26:** `https://live.centrosportivoitaliano.it/25/Calcio-a-5/Lazio/Roma/C33460/` — estratto pubblico indicizzato con calendario/PDF e categorie/nomi diversi (es. “Calcio di Inizio / Unico”, “Calcio A Cinque / Allievi”). Serve solo a verificare la variabilità interterritoriale.
- **S8 — specifiche locali, non fonte CSI:** `docs/platform/MVP-HANDOFF.md`, `docs/platform/BACKEND-DATA.md`, `docs/platform/PUBLIC-WEB.md`, `docs/decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md`, `packages/integrations/README.md`, `packages/integrations/AGENTS.md`.

Nelle fonti CSI sopra non è stata individuata una API pubblica documentata, un export CSV/XLSX/JSON/ICS, un contratto di riuso, né un rate limit o SLA pubblico. Il footer Live dichiara “Tutti i diritti riservati”; non è stata trovata una licenza che conceda il riuso automatico o la ripubblicazione degli asset.

## Prove tecniche e campioni

### Pagina e contenuto leggibile

L’estrazione indicizzata della pagina storica S2 contiene intestazione di comitato/campionato, blocchi “Andata/Ritorno giornata N”, righe con data, ora, casa, trasferta e punteggi, nonché una tabella classifica. Esempio di una riga pubblica estratta: `29/09/25 20:00 Cluren – Botcraft 1–5`. La classifica espone colonne `#`, `Squadra`, `Pt`, `PG`, `V`, `N`, `P`, `GF`, `GS`, `DR`; il campione mostra 11 squadre. È una prova di leggibilità del testo del contenuto indicizzato, **non** una prova che la pagina sorgente sia server-rendered senza JS, né che sia consentito automatizzare la lettura.

### Identificativi e URL

- Il selettore presenta la stagione `2025/26`; il percorso osservato usa `/25/`. La pagina offre anche un selettore che include `2026/27`, ma non è stato possibile acquisire un campione tecnico corrente di girone 2026/27 attraverso il servizio bloccato.
- Nel percorso campione il segmento di competizione/girone appare come `C203`. Tuttavia il portale indicizzato presenta lo stesso percorso `C203` con selezioni B, C e altre lettere veicolate da diversi valori opachi di query `j`. Quindi `C203` **non basta** a identificare in modo univoco il girone. Non decodificare né usare `j` come schema senza documentazione.
- I link estratti dalla pagina puntano a percorsi squadra del tipo `/S192/` e a percorsi gara del tipo `/P2025203BA0102/`; sono **candidati ID CSI osservati nei link**, non identificativi la cui stabilità o semantica sia garantita. La navigazione dei link è stata bloccata dal medesimo controllo di accesso; non sono stati testati riuso tra stagioni, modifiche, cancellazioni o ricreazione.
- Gli URL leggibili per sport/territorio/anno facilitano una consultazione umana, ma la query `j` è opaca, variabile e presente in molte viste. Non usare nomi squadra, `C203` o URL parametrizzati da soli come chiave di deduplicazione.

### Differenze territoriali

Il campione Bergamo classifica un torneo denominato “CAC / Dilettanti A 5 Gruppo C / B”; l’estratto Roma usa, tra gli altri, “Calcio di Inizio / Unico” e “Calcio A Cinque / Allievi”. La pagina Bergamo organizza le gare per andata/ritorno e gruppi; Roma mostra formati e categorie differenti e in alcune viste un’area “Comunicati”. La struttura semantica generale è simile, ma denominazioni, fasi e gerarchie cambiano: non è dimostrato uno schema uniforme per tutti i comitati o sport.

## Matrice di copertura e affidabilità

| Dato | Evidenza pubblica | ID/formato osservato | Completezza / affidabilità e limiti |
|---|---|---|---|
| Stagione, comitato, sport | Selettore stagione e breadcrumb: es. CSI Bergamo / Lombardia, Calcio a 5 | Token anno nel path; comitato/sport come testo e segmenti URL | FEASIBLE per visualizzazione; mapping canonico e stabilità del token non documentati. 2025/26 verificato come storico; stagione 2026/27 è elencata ma il girone corrente non è stato acquisito. |
| Competizione e girone | Titolo “Dilettanti A 5 Gruppo C / B” e selettori di gruppo | `C203` osservato; scelta gruppo apparentemente associata alla query opaca `j` | FEASIBLE per visualizzazione; `C203` non distingue il gruppo nell’esempio. Chiave canonica non dimostrata. |
| Squadre partecipanti | Sezione “Squadre iscritte”, nomi e collegamenti | Link squadra candidato `/S…/` | FEASIBLE. Stabilità cross-season e identità di società/squadra separate non verificate. Le denominazioni possono essere alias/nomi commerciali. |
| Logo e colori | FAQ elenca logo e colori divisa; pagina campione mostra immagini con URL CDN e alcuni colori in testo | URL immagine sotto host static/CDN; nessuna licenza o versione documentata | Visibili ma qualità/completezza variabile; non presumere presenza o diritto di mirror. Importare solo con consenso/diritti e URL ufficiale stabile. Il logo della squadra gestita è meglio caricarlo dall’admin. |
| Calendario | Giornata, data, ora, casa/trasferta e risultato visibili in estratto | Link gara candidato `/P…/` | Buona copertura sul campione storico. Il campo match-specific non appare nelle righe del calendario; l’FAQ afferma che il dettaglio gara include indirizzo geolocalizzato. Il dato per singolo evento non è stato verificato con fetch. |
| Risultato e stato | Punteggio nelle righe calendario; FAQ distingue rosso ufficioso/nero omologato e procedure di omologazione | Stato apparentemente visuale, non un campo testuale verificato | Punteggio FEASIBLE; stato ufficiale/ufficioso FEASIBLE nella UI, ma ingestione affidabile UNKNOWN finché non si verifica un campo/accessibile indicator. L’estrazione testuale perde il colore. Non trattare ogni punteggio come ufficiale. |
| Classifica completa | Tabella completa per il gruppo storico: posizione, squadra, punti, PG, V/N/P, GF/GS/DR | Tabella HTML-like nell’estrazione; export PDF indicato | FEASIBLE per visualizzazione e export PDF manuale. Non verificati schema PDF, timestamp, criteri eccezionali (penalità/scontri diretti) o stato di omologazione specifico. |
| Rinvii e modifiche calendario | Calendario mostra la data attualmente visibile; FAQ descrive quando il risultato è modificabile | Nessun change ID, revision number o storico modifiche osservato | UNKNOWN per rilevamento autorevole delle modifiche. Senza log/timestamp si potrebbe rilevare una differenza solo con snapshot ripetuti e solo se autorizzati. Nessuna prova di webhook o feed incrementale. |
| Frequenza aggiornamento | CSI descrive aggiornamento “in tempo reale” fra MyCSI, Sport e Live | Nessun campo `updated_at`, SLA o rate limit trovato | Funzionalità dichiarata, ma frequenza garantita e latenza per singolo comitato UNKNOWN. Non dedurre una cadenza di polling consentita. |
| CSV/XLSX/JSON/ICS | Non individuati | Nessuno | UNKNOWN / non dimostrato. L’unico export documentato nella FAQ consultata è PDF per calendario/classifica. |
| Marcatori/giocatori | FAQ e pagina campione mostrano marcatori; il portale espone dati personali sportivi | Dati nominativi | Non prioritari: non acquisiti né inclusi nella proposta. Ridurre superficie privacy e conservazione. |

## Condizioni d’uso, accesso e contatti

- La FAQ dice che registrarsi a MyCSI/Live è gratuito e aperto anche ai non tesserati, e che la registrazione abilita funzioni quali inserimento risultati e preferiti. Il responsabile di squadra opera nell’area squadre con credenziali MyCSI; il Portale Sport dichiara funzioni gestionali e accesso delle strutture tramite area riservata. Questo non equivale a un’autorizzazione per un servizio terzo o per estrazione massiva.
- La FAQ ufficiale documenta un PDF accanto al calendario e alla classifica del campionato. È un’alternativa per download umano/controllato; formato e riutilizzabilità dell’output non sono stati verificati.
- Non è stata reperita una licenza, una policy di riuso dei dati, una specifica API, limiti di frequenza o una dichiarazione che autorizzi caching e ripubblicazione. Non attribuisco al CSI una regola contrattuale non letta: la necessità di consenso scritto è il gate prudenziale di myteam-platform.
- **Richiesta da inviare:** chiedere se CSI autorizza l’uso di un’API/feed o export per calendario, risultati, classifica completa e cambi gara; identificativi persistenti e loro ambito; semantica macchina di ufficialità/omologazione; frequenza/rate limit e policy cache; attribuzione/link-back; diritti su stemmi/loghi/colori; retention e redistribuzione su una PWA pubblica. Chiedere che l’autorizzazione copra sia CSI nazionale sia il Comitato organizzatore competente.
- **Contatto tecnico ufficiale pubblicato per Portale Sport:** `helpdesk@csi-net.it`. La pagina contatti CSI elenca inoltre `mycsi@csi-net.it`, `info@csi-net.it` e ufficio legale `legale@csi-net.it`; chiedere al supporto di inoltrare la richiesta al titolare del portale/dati o all’ufficio competente. Contattare anche il comitato territoriale una volta identificato. Se fosse Bergamo, il registro territoriale ufficiale pubblica `csi@csibergamo.it`; **non assumere che sia il comitato di MAPI**.

## Compatibilità con myteam-platform e architettura minima futura

Le specifiche locali dicono che CSI è un provider opzionale, ammissibile solo dopo verifica di fattibilità/affidabilità. `packages/integrations/README.md` vieta adapter speculativi e `AGENTS.md` assegna gli adapter a Integrations, ma impone l’invio dei dati attribuiti tramite i servizi Core, senza scritture dirette sulle proiezioni pubbliche. Il backend deve mantenere audit e riconciliazione; la classifica deve riferirsi a competizione/stagione e non può essere inventata dai soli risultati MAPI.

Se autorizzato e tecnicamente sostenuto, un adapter minimo dovrebbe:

1. Usare esclusivamente API o export indicati come supportati dal CSI; niente endpoint privati scoperti via browser e niente scraping che dipenda dal markup.
2. Conservare `provider`, ID sorgente e contesto completo (comitato, sport, stagione, competizione/fase/girone), URL sorgente e `fetchedAt`; appendere snapshot/versioni immutabili per audit, minimizzando i dati personali.
3. Mappare squadra e gara tramite ID CSI confermati e alias espliciti. Se l’ID manca/non è stabile, mostrare un’anteprima di associazione all’admin e non unire automaticamente per solo nome o per data avversari: un rinvio cambierebbe i campi usati per una deduplica semplice.
4. Riconciliare per attributo secondo ADR-0008: override manuale admin > CSI ufficiale/omologato > CSI ufficioso > app iOS; preservare la provenienza originaria e le correzioni admin, senza last-write-wins. L’eventuale stato ufficioso deve restare esplicito e non essere presentato come omologato.
5. Importare classifiche complete esclusivamente per stessa competizione/stagione e solo quando la fonte ne fornisce la tabella completa; mantenere righe collegate a identità squadra e chiedere revisione se il mapping è ambiguo. Non ricalcolare una classifica ufficiale da partite parziali.
6. Registrare differenze di data/ora/campo/risultato come nuova revisione con snapshot; non sovrascrivere storico. Senza ID gara confermato, ogni cambiamento di chiave va in revisione admin.
7. Non avviare polling prima dell’autorizzazione e del limite concordato. Se supportati dal provider, rispettare ETag/Last-Modified, backoff e rate limit; questi meccanismi non sono stati osservati e non vanno presunti. Conservare refresh manuale/admin e fallback di inserimento sempre funzionanti.
8. Non importare marcatori o profili giocatore nello spike/MVP. Non copiare asset grafici fino a chiarimento dei diritti.

Questa proposta non cambia il database o il contratto Core. Il candidato rimane un flusso di **preview/revisione amministrativa**, non una sincronizzazione automatica, finché CSI non fornisce canale e condizioni.

## Informazioni mancanti su MAPI GROUP

La ricerca per il nome esatto “MAPI GROUP” non ha restituito un abbinamento CSI corroborato; non è prova che la squadra non sia registrata, perché il portale può usare denominazione affiliata, sponsor o alias. Servono:

- nome ufficiale della società affiliata CSI e nome squadra registrato nel portale;
- comitato territoriale/regionale che organizza la competizione (non deducibile dal campione Bergamo);
- sport/disciplina esatta, categoria, formula/fase e girone;
- stagione interessata (corrente 2026/27 o storico 2025/26);
- link pubblico CSI Live o ID squadra/competizione fornito dall’amministratore/comitato, se disponibile;
- conferma che sia la prima squadra MAPI e il rapporto con eventuale società affiliata distinta;
- consenso/diritto per riuso di logo e dati su web pubblico.

## Gate successivo

**No adapter in I0.** Procedere a un eventuale CSI-S2 solo dopo: (a) identificazione certa del campionato MAPI; (b) risposta scritta CSI su API/export e riuso; (c) esempio di esportazione autorizzata con ID e indicatore di omologazione; (d) verifica diretta consentita di un campionato corrente e confronto di almeno due snapshot per capire rinvii e aggiornamenti. Se una di queste condizioni manca, mantenere il sistema manuale e registrare CSI come non integrato/non bloccante.
