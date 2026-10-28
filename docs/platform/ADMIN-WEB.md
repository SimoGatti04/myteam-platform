# Area amministrativa web — organizzazione

**Stato:** struttura definitiva a sei sezioni, organizzazione di Partite, scheda partita unica e contenuti della Panoramica **APPROVATI**. Dettagli dei layout e delle interazioni ancora in progettazione. **Non implementata**.

## Regola confermata: Partite come sezione unica (opzione A)

Nel menu amministrativo esiste un'unica voce principale **Partite**. All'interno, sottosezioni o viste contestuali gestiscono:
- **Calendario e risultati**: elenco e gestione gare, dettaglio, esiti e singoli eventi;
- **Competizioni e stagioni**: anagrafiche e associazioni alle partite;
- **Squadre avversarie**: anagrafica persistente e riutilizzabile tra gare e stagioni, alimentata da creazione manuale oppure da importazioni provider verificate; modifica e associazione/matching gestibili dall'admin, con stemmi e metadati facoltativi;
- **Modifiche e importazioni**: provenienza dei dati, modifiche rilevate da CSI (solo se integrazione fattibile), conflitti e override espliciti.

**Non** creare voci principali indipendenti «Competizioni» e «Squadre avversarie»: sono strumenti della gestione Partite. Navigazione utilizzabile anche da smartphone; le sottosezioni non richiedono necessariamente pagine separate: scegliere la soluzione UX più semplice.

## Scheda partita unica e compilazione progressiva — APPROVATO

La creazione, la programmazione, il completamento del risultato e la correzione di una partita avvengono attraverso **la stessa scheda partita**, senza procedure distinte che duplicano dati o responsabilità. La scheda presenta gruppi logici, adattati al contesto e allo stato della gara:

1. **Informazioni generali:** competizione, stagione, avversario, casa/trasferta, data, orario e campo.
2. **Risultato ed eventi:** punteggio, gol, marcatori, assist associati agli eventi, cartellini se disponibili.
3. **Provenienza e correzioni:** fonte dei dati, storico, dati importati e operazione separata di override amministrativo esplicito.

L'amministratore può **salvare una bozza privata incompleta** e integrarla in qualsiasi momento. **«Salva bozza» e «Pubblica» sono azioni distinte**. Per pubblicare una partita bastano **l'avversario** e, se nota, **la data**: orario, campo, risultato ed eventi possono essere aggiunti successivamente. È approvata anche la pubblicazione di una gara **senza data**, esplicitamente marcata **«Data da definire»**. Le partite senza data devono apparire in una sezione pubblica separata dalle gare ordinate cronologicamente, senza essere collocate arbitrariamente nella timeline o considerate la prossima partita temporalmente più vicina. Restano possibili sia la bozza privata sia la pubblicazione senza data. I controlli di coerenza e gli ulteriori metadati facoltativi saranno definiti nella progettazione; non inventare una data fittizia. I requisiti nome+stemma per pubblicare il **sito della squadra** rimangono distinti.

Se l'avversario non esiste nell'anagrafica, consentirne la **creazione contestuale nella scheda** senza perdere i dati già inseriti o obbligare a cambiare pagina; l'avversario creato è una vera entità riutilizzabile in altre gare. Gli avversari **creati manualmente e quelli importati dal provider** fanno parte della **stessa anagrafica**: l'admin può modificarli e **abbinare esplicitamente** una voce provider a una squadra già censita, evitando duplicazioni. Associazioni e correzioni devono conservare collegamenti alle gare e provenienza dei dati; in caso di corrispondenze dubbie, chiedere revisione. Il completamento di risultato/eventi e la rettifica non devono creare partite duplicate. Nella sezione provenienza la **modifica ordinaria** rimane semanticamente diversa dalla **correzione prioritaria esplicita** secondo ADR-0008 e BACKEND-DATA.md.

## Distinta della singola partita — APPROVATO

- La **rosa stagionale** indica chi appartiene alla squadra in quella stagione; la **distinta della partita** indica chi è stato selezionato per **quella specifica gara**. Sono informazioni distinte: una variazione della distinta non aggiunge/rimuove automaticamente il giocatore dalla rosa stagionale e viceversa.
- Nella **scheda partita unica** l'amministratore può scegliere i giocatori effettivamente presenti usando la rosa attiva della stagione come elenco di partenza, e **modificare la selezione** senza toccare la rosa stagionale. Se una gara è solo programmata, la distinta può essere preparata e completata in seguito; non è un requisito per pubblicare la partita.
- La distinta deve mantenere riferimenti alle **identità permanenti** dei giocatori e alla partita, preservando partecipazioni ed eventi storici quando cambia la rosa attiva. Il modello e il flusso web devono consentire la **futura sincronizzazione bidirezionale con la distinta nell'app iOS**, senza assumere già implementata l'integrazione.
- Distinguere **selezionati/presenti** da titolari/panchina e dai **minuti realmente giocati**: queste informazioni operative saranno gestite dall'app e non vanno dedotte automaticamente dalla sola selezione. Dettagli dei conflitti quando entrambe le interfacce modificano la distinta: ancora da progettare.
- **Presenza statistica — APPROVATO:** conta una presenza **solo chi è effettivamente entrato in campo almeno una volta** (titolare sceso in campo o subentrato), indipendentemente dal numero di ingressi nella stessa gara. Il giocatore in distinta rimasto sempre in panchina **non** ottiene una presenza. Nelle partite gestite senza app l'amministratore può **marcare manualmente chi ha giocato**, senza dover ricostruire i minutaggi. Una mera selezione in distinta non può diventare presenza statistica per default.

## Dati storici di partecipazione incompleti — APPROVATO

- L'amministratore può registrare una **partita storica conclusa** anche se conosce risultato, marcatori o altri eventi ma **non tutta la lista di chi è sceso effettivamente in campo**. La pubblicazione non richiede di inventare presenze o minutaggi.
- Le presenze confermate sono conservate; per i giocatori non documentati lo stato rimane **sconosciuto**, non «assente» e non «presente». L'admin deve vedere chiaramente che la rilevazione dei partecipanti è **incompleta**, potendola integrare successivamente.
- **Presentazione dei dati parziali — APPROVATA (opzione A, senza avvisi pubblici):** mostrare nel sito soltanto le informazioni confermate, senza presentare un conteggio parziale come totale certo. Dove necessario, usare una **denominazione neutra** come «Presenze registrate» invece di «Presenze totali»: è un'etichetta del dato, non un avviso tecnico. **Nessun banner, badge o messaggio pubblico** sulla gestione dell'archivio, sulla sua incompletezza o sul lavoro necessario per completarlo; questi indicatori di qualità e le relative azioni rimangono **esclusivamente nell'area admin**. Evitare medie e classifiche distorte dai dati incompleti, pur mantenendo accessibili risultati e altri valori attendibili. Nessun dettaglio operativo interno deve trapelare nei DTO pubblici.

## Registrazione manuale di POTM e Player of the Month storici — APPROVATA

Nella sezione **Votazioni**, oltre a creare una nuova votazione, l'admin può **registrare un riconoscimento già attribuito in passato**, senza simulare lo svolgimento di un sondaggio sulla piattaforma.

- Selezionare **tipo premio** (POTM o Player of the Month), **vincitore o vincitori** dalle identità permanenti già registrate, **partita ufficiale** per il POTM quando identificabile oppure **periodo di riferimento/stagione** per il Player of the Month; consentire immagine/copertina facoltativa e informazioni storiche disponibili senza inventare quelle assenti.
- Per l'archivio eventualmente incompleto, evitare di obbligare alla ricostruzione di **candidati, distinta o voti storici** che non sono noti. Mantenere la distinzione con le regole di **candidabilità delle nuove votazioni**, le quali restano valide e controllate dal backend. Il premio storico deve riferirsi a una gara o periodo ufficiale attendibile, non a un'amichevole.
- Presentare la registrazione come **premio storico inserito dall'admin**, non come votazione conclusa, e **non richiedere/inventare percentuali, schede di voto o identità dei votanti**. Consentire assegnazione condivisa e rettifica tracciata, segnalando sovrapposizioni con premi già presenti per evitare doppi conteggi.
- I premi storici confermati contribuiscono ai **totali dei riconoscimenti del giocatore** esattamente come i premi annunciati tramite votazione, senza generare automaticamente una seconda assegnazione se esiste già quella del sondaggio collegato.

**Rilascio:** possibilità funzionale APPROVATA, da implementare insieme al sistema premi/votazioni o successivamente, non necessaria per il primo MVP di inserimento delle partite.

## Candidati votazioni legati alla distinta — APPROVATO

- **POTM solo per gare ufficiali:** per una partita amichevole non creare un POTM. Per un **POTM** relativo a una gara ufficiale, la lista dei giocatori **idonei** è esattamente la **distinta di quella partita**: la UI permette di scegliere manualmente i candidati **solo** al suo interno, senza giocatori esterni. Il fatto che uno sia rimasto in panchina non lo esclude automaticamente dal POTM, mentre per le **presenze statistiche** conta esclusivamente l'ingresso effettivo in campo.
- Se non è stata compilata la distinta, l'admin deve poterla completare dalla scheda partita **prima di aprire il POTM**. La scelta dei candidati rimane manuale, senza selezione obbligatoria automatica; seleziona tutti/deseleziona agisce sui soli componenti della distinta. Una modifica della distinta con votazione già aperta deve rispettare la regola esistente di protezione delle candidature e dei voti: comportamento preciso da definire in implementazione.
- **Periodo del Player of the Month — APPROVATO (opzione B):** l'admin parte dalla proposta del **mese solare** e può passare a un **intervallo personalizzato** con data iniziale e finale. Le date scelte si applicano congiuntamente alla ricerca delle distinte e al riepilogo statistico del periodo; includono **tutte le competizioni ufficiali, escludendo le amichevoli**. Mostrare chiaramente il periodo effettivo prima di scegliere i candidati e nelle impostazioni della votazione. **L'apertura della votazione può essere anticipata rispetto alla fine del periodo**, anche per un mese solare le cui gare sono già terminate; data di fine periodo e finestra di voto sono indipendenti. **Fissare i candidati al momento dell'apertura** e non aggiungere automaticamente successivi idonei; i dati statistici del periodo possono aggiornarsi se arrivano gare concluse o rettifiche. Comportamento di modifica del periodo dopo l'apertura e gestione dei voti già espressi: da definire, senza mutazioni retroattive arbitrarie.
- **Recuperi e periodo del Player of the Month — APPROVATO:** per eleggibilità e statistiche selezionare le gare in base alla **data effettiva di svolgimento**, non a quella originaria. Una partita prevista in ottobre ma recuperata in novembre entra nel premio di novembre; l'anagrafica della gara e lo storico del rinvio rimangono invariati. L'admin vede entrambe le date nello storico e, quando la gara non è ancora stata disputata, nessuna partecipazione o statistica conclusa è inventata. Se il voto del nuovo periodo è già aperto, preservare le candidature fissate.
- **Player of the Month — VINCOLO AGGIORNATO:** l'insieme degli idonei è l'**unione deduplicata delle distinte delle partite ufficiali nel periodo selezionato, in tutte le competizioni ufficiali**. Le amichevoli non contribuiscono e la loro distinta non genera idoneità. Un giocatore che non compare in alcuna distinta di quel periodo non è candidabile, anche se appartiene alla rosa o vi apparteneva in passato; chi compare in distinta può essere candidato anche senza ingresso effettivo in campo. L'admin seleziona manualmente i candidati tra gli idonei. Le distinte mancanti vanno completate prima di inserire quei giocatori; non inventare eleggibilità in assenza di dati.
- **Riepilogo statistico visibile durante entrambe le votazioni — APPROVATO:** POTM mostra per ciascun candidato le statistiche **della singola partita**, Player of the Month quelle **dell'intero periodo** attraverso **tutte le competizioni ufficiali**, senza conteggiare le amichevoli. L'admin può verificare il contesto e i dati; il frontend pubblico mostra soltanto metriche ammesse e attendibili (gol, cartellini, presenze confermate nel periodo), evitando totali di assist, minutaggi individuali e avvisi tecnici pubblici. Non mostrare conteggi o percentuali del sondaggio prima dell'annuncio. Proteggere le candidature/voti quando vengono modificate distinte o eventi dopo l'apertura.

## Rosa amministrativa — identità stabile e appartenenze stagionali APPROVATE

- La voce principale **Rosa** distingue la **scheda permanente del giocatore** dalle sue **appartenenze alle singole stagioni**. Un giocatore si crea una sola volta; si associa o si rimuove dalla rosa della stagione senza duplicare o cancellare la persona.
- È consentito il cambio del **numero di maglia tra stagioni**, così come l'uscita e il rientro in rosa. Conservare informazioni e statistiche delle stagioni precedenti.
- **Cambi in corso di stagione — APPROVATI:** l'admin può segnare un giocatore come **non più attivo nella rosa corrente** e, se necessario, riattivarlo successivamente **nella stessa stagione**. La data di ingresso/uscita è **facoltativa**; le transizioni restano storicizzate. Il giocatore non compare più nella rosa corrente durante l'inattività, ma rimane nello storico e nei dati statistici della stagione. Non confondere «non più in rosa» con cancellazione del giocatore o annullamento delle sue presenze.
- Prevedere viste **rosa corrente** e **archivio storico**, senza azioni distruttive implicite sulla storia delle partite.
- **Creazione della rosa di una nuova stagione — APPROVATO:** offrire due modalità. **A) Riparti dalla rosa precedente**, suggerita quando esiste una stagione anteriore: mostrare i giocatori già preselezionati e permettere di togliere chi è uscito, confermare chi resta e aggiungere nuovi arrivi. **B) Componi una nuova rosa**, partendo da una selezione vuota di giocatori esistenti e consentendo di creare nuovi giocatori. Entrambe portano a una verifica/modifica prima del salvataggio.
- Le operazioni sulla nuova rosa creano/modificano **soltanto appartenenze alla nuova stagione**, non duplicano schede permanenti, non modificano retroattivamente i numeri/ruoli storici e non cancellano statistiche o eventi pregressi. Gli eventuali nuovi numeri di maglia possono essere assegnati alla nuova appartenenza.
- Foto e numero sono facoltativi. Il portiere è l'unico ruolo speciale approvato per l'app iOS: non introdurre nuovi ruoli senza decisione.

## Classifiche ufficiali — stessa gestione dei dati partita, APPROVATO

- Nell'unica sezione **Partite**, all'interno di **Competizioni e stagioni**, prevedere gestione delle **classifiche per competizione e stagione**. Quando fattibile e attendibile, acquisirle dal provider (es. CSI), usando il medesimo modello di provenienza, riconciliazione e storico delle gare.
- Consentire **inserimento/aggiornamento manuale ordinario** come fonte iniziale o fallback quando il provider non è accessibile; distinguerlo dalla **correzione amministrativa prioritaria esplicita** che prevale su importazioni successive. L'admin deve poter vedere la provenienza e gli eventuali conflitti, senza creare una classifica duplicata per la stessa competizione/stagione.
- Abbinare le squadre delle righe classifica alle **anagrafiche di squadre già esistenti** (o crearle/collegarle con revisione quando necessario), conservando gli identificativi del provider. Non stimare una classifica completa dai soli risultati della squadra gestita.
- **Distribuzione pubblica APPROVATA:** nella **Home**, accanto alla prossima gara o all'ultimo risultato, le **posizioni attuali di entrambe le squadre**, ricavate dall'ultima classifica attendibile della **competizione/stagione della partita mostrata**, anche quando il risultato è passato: **non** le posizioni storiche alla data della gara. In **Partite/Calendario**, la **classifica completa** della competizione/stagione selezionata; in **Statistiche**, **solo la posizione della nostra squadra**. Evitare copie integrali della classifica nelle altre sezioni.
- Se mancano dati attendibili, **non mostrare la classifica o la posizione** sul sito; nessun valore fittizio. Mancanze e richieste di revisione sono visibili solo agli admin. La definizione del dettaglio dei campi disponibili (punti, giornate, penalizzazioni, criteri, aggiornamento) resta subordinata alla progettazione e ai dati reali del provider.

## Competizioni, amichevoli e statistiche — APPROVATO (opzione B)

- Gestire **campionati, coppe, tornei e amichevoli** nella stessa sezione Partite e nella stessa scheda di gara. Distinguere in configurazione le **gare ufficiali** dalle **amichevoli**; l'ufficialità di un torneo non è presunta automaticamente.
- **Statistiche principali predefinite:** solo partite ufficiali concluse. Amichevoli visibili e analizzabili separatamente; possibilità di includerle esplicitamente quando si consultano i totali. La classificazione e le correzioni non eliminano lo storico delle partite.
- **Premi ufficiali — APPROVATO (B):** POTM soltanto per partite ufficiali; Player of the Month con candidati e statistiche dalle sole gare ufficiali del periodo, considerando tutte le competizioni ufficiali. Le amichevoli restano escluse dai due premi anche quando il visitatore le include esplicitamente nelle statistiche generali. I sondaggi generici restano indipendenti.

## Stagione corrente — APPROVATO

- L'amministratore **seleziona esplicitamente una sola stagione corrente**; il sistema suggerisce come scelta iniziale quella cronologicamente più recente disponibile, ma **non applica automaticamente** il suggerimento né cambia stagione in base alla data del calendario.
- La scelta persiste finché un amministratore non la modifica. La stagione corrente governa la **rosa predefinita** e i contesti/filtri iniziali del sito, senza nascondere stagioni precedenti o impedire più competizioni nella stessa stagione.
- La proposta automatica non deve scavalcare una selezione manuale già confermata. Se non esistono stagioni o non ne è stata selezionata una, evitare di inventare l'appartenenza alla rosa corrente e rendere esplicita la configurazione mancante in amministrazione.

## Stati di calendario e partita — APPROVATO

- **Da programmare**: data non ancora disponibile, con visualizzazione «Data da definire» se pubblicata; non equivale a rinvio.
- **Rinviata**: la partita era già programmata, ma va ripianificata. Conservare nello storico la **data precedente** e associarne una nuova alla **stessa gara** quando nota, senza creare duplicati. Durante il rinvio il nuovo orario/data può essere sconosciuto.
- **Annullata**: la partita non verrà disputata; può restare consultabile se pubblicata ma **non contribuisce alle statistiche**.
- Questi stati possono essere impostati manualmente o aggiornati dal provider quando i dati sono attendibili; rispettare le regole di autorità per campo e gli override admin. Non inferire rinvii o annullamenti dal solo scorrere del tempo.

## Implicazioni vincolanti

- Il pannello deve consentire di pubblicare partite con informazioni parziali e completarle in seguito.
- La correzione prioritaria è un'operazione **esplicita**, distinta da aggiornamento ordinario, con provenienza e storico.
- Qualsiasi importazione CSI deve riusare le stesse entità e il medesimo servizio backend usato dagli inserimenti manuali.
- Calendario delle **partite pubbliche** resta una lista cronologica, non vista mensile, come da `PUBLIC-WEB.md`. Questa decisione non impone lo stesso dettaglio di presentazione al **pannello admin**.

## Panoramica amministrativa — CONTENUTI APPROVATI

La pagina iniziale dell'area admin è una **dashboard operativa**, orientata alle azioni da svolgere e non una seconda sezione Statistiche. Prevedere i seguenti moduli contestuali, con accesso diretto alle relative schede:

- **Prossime partite:** incontri imminenti e accesso rapido alla scheda partita e alla sua **distinta**, senza duplicare calendario e gestione gare.
- **Votazioni:** stato delle votazioni **programmate, aperte e chiuse in attesa di annuncio**, con collegamento alla gestione del sondaggio. Non esporre pubblicamente parziali o risultati prima dell'annuncio.
- **Dati da completare:** segnalazioni amministrative per gare con informazioni mancanti o da verificare (ad es. partecipanti storici ignoti, distinte da completare, bozze), con link al punto esatto dove intervenire. **Le anomalie e le incompletenze restano private agli admin**, non diventano banner o messaggi sul sito pubblico.
- **Aggiornamenti CSI/provider:** modifiche ricevute, possibili conflitti, matching e rettifiche da verificare, **soltanto se un'integrazione provider fattibile è effettivamente attiva**. Le segnalazioni non conferiscono automaticamente ai dati importati priorità superiore agli override espliciti.
- **Azioni rapide:** **Nuova partita**, **Nuovo giocatore**, **Nuova votazione**, che aprono i flussi di creazione già previsti, senza introdurre CRUD paralleli.

**Rilascio graduale:** nel primo MVP la panoramica presenta i moduli supportati dalle funzioni realmente disponibili (partite, dati da completare, creazione partita/giocatore). Il modulo votazioni compare quando il relativo sistema sarà implementato; quello CSI solo dopo integrazione verificata. **Nessuna card vuota, metrica fittizia o alert inventato**. La stessa capacità operativa deve essere accessibile su desktop e smartphone, con composizione responsive e importanza dei compiti concreti sopra grafici decorativi. Dettagli di ordinamento, numero massimo di elementi per modulo e layout finale restano scelte UX da progettare.

## Contenuti — gestione e pubblicazione APPROVATE (opzione B)

La voce amministrativa **Contenuti** comprende due sottosezioni, senza nuove voci principali: **Instagram** e **Sponsor e partner**. I dati possono essere preparati prima di renderli pubblici, con le **stesse azioni di visibilità distinte** per entrambe le tipologie:

- **Salva bozza:** memorizza il contenuto e le impostazioni anche senza renderlo visibile sul sito. L'admin può modificarlo e riordinarlo internamente.
- **Pubblica:** azione esplicita e separata dal salvataggio che rende il contenuto eleggibile alla visualizzazione pubblica quando sono presenti le informazioni necessarie (da validare secondo tipologia).
- **Nascondi:** ritira temporaneamente un elemento già pubblicato **senza cancellarlo**; resta disponibile e modificabile nell'area admin, con possibilità di **ripubblicazione**. Non confondere nascondere con eliminare.
- **Pubblico:** mostra esclusivamente elementi **pubblicati e visibili**; le bozze, gli elementi nascosti e le relative informazioni interne non devono entrare in proiezioni o API pubbliche. Se non esistono elementi visibili, omettere la sezione sul sito.

**Instagram:** per ogni post inserire il link, selezionare **embed ufficiale o card personalizzata** (copertina facoltativa), organizzare i post manualmente e prevedere fallback card/link quando l'embed non funziona. Nessun feed automatico né pubblicazione su Instagram.

**Sponsor e partner:** un'unica anagrafica con nome, logo, URL facoltativo, categoria **sponsor principale / altri sponsor / partner** e ordine personalizzabile; sponsor principali con maggior risalto nel pubblico. Gli elementi rimangono gestibili anche quando nascosti, senza ricreare la scheda.

**Collaborazioni per stagione — APPROVATE (opzione B):** un solo record permanente per sponsor/partner, al quale l'admin associa **una o più stagioni** in cui la collaborazione è esistita, comprese stagioni non consecutive e rinnovi successivi. Si possono modificare le associazioni senza duplicare il soggetto né eliminare le stagioni passate quando termina una collaborazione. **Storico stagionale riservato agli admin: nessun archivio pubblico dei vecchi sponsor (opzione A APPROVATA).** La schermata distingue (1) **stagioni di collaborazione**, (2) **collaborazione attualmente attiva/inattiva**, impostata o confermata dall'admin senza dedurla dal solo cambio della stagione corrente, e (3) **pubblicazione** (bozza/pubblicato/nascosto). Per comparire sul sito servono **collaborazione attiva e pubblicazione visibile**. Quando una collaborazione viene dichiarata terminata, lo sponsor sparisce dal pubblico **anche se precedentemente pubblicato**, ma rimane nell'anagrafica e nello storico privato; un rinnovo non deve renderlo visibile senza un'esplicita conferma di pubblicazione. Eventuali dettagli come date esatte e variazioni della categoria negli anni rimangono da specificare.

**Rilascio:** requisito funzionale approvato per la fase **Contenuti**, successiva al primo MVP; non implica funzionalità già implementate. Restano da progettare le validazioni specifiche e il layout amministrativo.

## Navigazione amministrativa definitiva — SEI SEZIONI APPROVATE

Sono **approvate esattamente sei voci principali** del pannello; le funzionalità subordinate non richiedono voci principali aggiuntive:

1. **Panoramica**: dashboard operativa con prossime partite, votazioni da gestire, dati da completare, aggiornamenti provider quando presenti e azioni rapide (vedi sezione dedicata).
2. **Partite**: calendario e risultati, schede gara e distinte, competizioni e stagioni, **classifiche**, squadre avversarie, modifiche e importazioni. Nessuna voce principale indipendente per queste funzioni.
3. **Rosa**: identità dei giocatori, rosa della stagione corrente, appartenenze stagionali, ingressi/uscite, archivio storico.
4. **Votazioni**: creazione e gestione POTM, Player of the Month, sondaggi generici, candidati, risultati e annunci, **registrazione di premi storici senza votazione fittizia**.
5. **Contenuti**: gestione dei contenuti Instagram selezionati, sponsor e partner.
6. **Impostazioni**: identità e branding della squadra, nome, stemma, immagini, colori e configurazioni già approvate.

**Struttura definitiva ≠ tutte le funzioni nel primo MVP:** le sei destinazioni costituiscono l'architettura informativa di riferimento, ma ogni voce/modulo va reso visibile e utilizzabile soltanto quando la sua funzione è implementata. In particolare Votazioni e Contenuti sono previsti nelle fasi successive già proposte; integrazioni CSI soltanto dopo una verifica di fattibilità. **Non mostrare pagine vuote** per anticipare sezioni future.

La navigazione deve essere **responsive** su desktop e smartphone, preservando l'accesso alle medesime operazioni senza aggiungere o sottrarre voci principali. Pattern di navigazione mobile, ordine visuale delle sottosezioni e dettagli UI rimangono da progettare. Non introdurre un pannello autonomo separato dal sito senza una motivazione emersa nella progettazione tecnica.

## Importazione iniziale da file CSV/Excel — APPROVATA (opzione B)

Oltre all'inserimento manuale e all'eventuale CSI, l'admin può **caricare file CSV o Excel** per recuperare **in blocco giocatori, partite e risultati storici**, senza reinserire ogni voce a mano. Il percorso di importazione è collocato nelle funzioni pertinenti di **Rosa** e **Partite → Modifiche e importazioni**, **senza nuove voci principali**.

- **Prima di salvare:** leggere il file, proporre la corrispondenza tra colonne e campi del modello quando riconoscibile e permettere all'admin di correggere gli abbinamenti, indicando stagione/competizione dove pertinenti. Mostrare **anteprima delle righe**, dati riconosciuti, errori, campi assenti e possibili duplicati; l'admin verifica e conferma esplicitamente la scrittura.
- **Identità e riconciliazione:** riusare giocatori, avversari e gare già presenti; un nome coincidente non è sufficiente per fondere automaticamente entità incerte. Rendere risolvibili gli abbinamenti dubbi prima di importare; non sovrascrivere silenziosamente informazioni attendibili.
- **Stessa gestione dei dati manuali:** importazione da file come **ingresso ordinario tracciato**, non override prioritario. Le correzioni esplicite già applicate e la gerarchia di fonti restano valide. Mantenere provenienza del file/importazione e dare un esito comprensibile delle righe accettate e scartate.
- **Dati parziali:** ammettere gli stessi dati storici incompleti che il pannello consente di inserire manualmente, senza inventare presenze, minuti o risultati. L'importazione non pubblica automaticamente contenuti non ancora confermati.

**Fase di rilascio:** la funzione è **approvata come capacità di prodotto**, ma **può essere introdotta dopo il primo MVP**, che resta utilizzabile con inserimento manuale. Formati/schemi di esempio, regole operative per grossi batch e UX dettagliata sono da definire in progettazione, senza assumere che ogni foglio Excel arbitrario sia importabile automaticamente.

## Questioni aperte

- Layout concreto della sezione Partite: tab, sottomenù o navigazione interna;
- Dettagli di validazione/UX degli incontri senza data e loro passaggio alla lista cronologica una volta programmati;
- Dettagli UX dei tre gruppi della scheda, dei pulsanti «Salva bozza»/«Pubblica», delle notifiche importazione e delle rettifiche;
- Dettagli formati/mapping e convalida dei file CSV/Excel, con flusso di anteprima, deduplicazione e conferma (capacità APPROVATA, non implementata);
- Panoramica amministrativa: composizione responsive, ordinamento e soglie di visualizzazione dei moduli (contenuti funzionali già APPROVATI);
- Asset, campi e validazione per avversari, stagioni e competizioni.

## Altre fonti

`PUBLIC-WEB.md` per il sito pubblico, `BACKEND-DATA.md` e ADR-0008 per provenienza/override, `ACCESS-DEPLOYMENT.md` per Logto e autorizzazione, `MVP-HANDOFF.md` per il rilascio graduale.
