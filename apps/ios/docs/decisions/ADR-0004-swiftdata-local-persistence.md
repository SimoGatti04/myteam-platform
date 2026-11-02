# ADR-0004 — SwiftData come persistenza locale per i dati gestionali

- **Stato:** ACCETTATO — 24 ottobre 2026
- **Ambito:** rosa, calendario, storico; la sessione live è separata in C3 tramite aggregate JSON locale (ADR-0005)

## Contesto

Le decisioni di prodotto confermano un'app privata nativa iOS, operativa offline, destinata a un prodotto generico per squadre. Rosa, calendario e storico sono oggi raccolte Codable in UserDefaults; relazioni e query stanno crescendo e gli errori di persistenza devono essere visibili. Il backend futuro sarà la fonte autorevole dei dati condivisi, ma non è ancora introdotto. La sessione live richiede un checkpoint dedicato per essere resa durevole.

## Decisione

Usare SwiftData locale e versionato come unica fonte operativa per rosa, partite programmate e storico. Separare le entità SwiftData dai modelli Codable usati dall'UI/importazione tramite `MatchDataStore`. Migrare una volta i tre array UserDefaults V1, preservando UUID, valori, ordinamento utile e snapshot storico. Conservare i payload originali, scrivere una ricevuta durevole soltanto dopo rilettura e verifica, e bloccare il bootstrap con errore esplicito se i dati non sono leggibili o salvabili.

Lo schema iniziale è `MatchManagerSchemaV1` (1.0.0), con piano `MatchManagerMigrationPlan`; ogni evoluzione incompatibile aggiungerà un nuovo `VersionedSchema` e migration stage espliciti. Nessuna modifica delle chiavi legacy. Nessun CloudKit, backend, autenticazione, sincronizzazione, tenant o migrazione automatica a PWA.

## Modello e integrità

- Rosa, calendario e record storico sono entità distinte con UUID applicativo stabile.
- Partecipanti e gol sono entità figlie del record, con relazioni cascade e snapshot dei nomi/statistiche/eventi.
- La relazione del partecipante alla rosa e il collegamento calendario-storico sono ID logici, non foreign key cascade: il passato sopravvive alla rimozione del giocatore o della partita programmata.
- Salvataggi espliciti; in caso di errore la UI non aggiorna lo snapshot come se l'operazione fosse riuscita.

## Alternative considerate

- Continuare con tre blob UserDefaults: semplice ma senza transazioni, interrogazioni o error handling adeguato.
- JSON in file: praticabile ma richiederebbe comunque un protocollo manuale per versionamento/relazioni e non offre qui vantaggi rispetto a SwiftData.
- Core Data/SQLite gestiti direttamente: più basso livello e non necessario per il volume o le query attuali.
- CloudKit/backend: fuori scope e in conflitto con la decisione di introdurli solo dopo un contratto di sincronizzazione.

## Migrazione, recovery e rollback

La migrazione decodifica tutti i valori prima delle scritture, distingue chiavi assenti da payload errati, rifiuta ID duplicati/conflitti e salva i record. Un nuovo contesto rilegge e confronta gli elementi prima che venga salvato il receipt. Un retry dopo commit dei dati ma prima del receipt non duplica né sovrascrive contenuti diversi. Le chiavi originali restano intatte.

La copia legacy è soltanto pre-migrazione. Dopo aggiornamenti in SwiftData non può essere riutilizzata da sola per un rollback senza perdere quelle modifiche; non azzerare il receipt. Per le release sarà necessario un backup/restore coordinato dello store e dei dati che lo riguardano. Nessuna migrazione di dati reali è stata eseguita o validata in C3.1.

## Conseguenze

- SwiftData è un adapter locale, non il contratto condiviso del backend.
- I modelli di dominio rimangono indipendenti da SwiftData e UI; non si introduce un package separato.
- La sessione live è stata separata in C3 come aggregate JSON locale (ADR-0005), per mantenere una transazione coerente senza introdurre un nuovo schema relazionale per un singolo documento.
- I test isolano store in-memory e persistenti temporanei; restano da fare prova con dati reali/backup dispositivo prima di dichiarare validata la migrazione in produzione.
