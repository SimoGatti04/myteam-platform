# Piano incrementale di consolidamento

Questo piano registra i checkpoint successivi ad A0. Gli stati non sostituiscono i risultati effettivi riportati in `STATUS.md` e `TESTING.md`.

## Completato — C1: characterization test

Suite XCTest iniziale per contratti Codable/CSV, fixture sintetiche e baseline verificabile.

## Completato — C2: motore temporale

`MatchTiming` deterministico con clock monotono controllabile, formazione iniziale obbligatoria, contabilizzazione dei giocatori in campo, pausa/timeout/intervallo e test sui salti temporali. La sessione live non è ancora persistita.

## Completato — C3.1: persistenza locale rosa/calendario/storico

**Problema risolto:** UserDefaults era l'archivio operativo dei tre array e gli errori di decode/scrittura potevano sembrare raccolte vuote o salvataggi riusciti.

**Implementazione:** schema SwiftData V1 versionato, adapter `MatchDataStore`, import una tantum dalle tre chiavi legacy con verifica e receipt durevole, errori espliciti, scritture CRUD esplicite, entità storiche figlie e fixture/test per store isolati.

**Verifiche:** build e suite completa C1+C2+C3.1 su iPhone 18 Pro Simulator iOS 27.0: 53 PASS, 0 FAIL, 0 SKIPPED. Non verificata una migrazione con payload reali di dispositivo.

**Recupero:** le tre chiavi UserDefaults non vengono cancellate. Se l'import non è verificabile, l'app non accede alla UI funzionale. Se si interrompe dopo il commit delle righe e prima del receipt, il retry confronta gli ID e completa senza duplicazioni. Dopo modifiche successive in SwiftData, le chiavi legacy sono stale: non cancellare il receipt o reimportarle alla cieca. Per un rollback operativo successivo serve una copia coerente dello store o un flusso di export/import verificato.

## Prossimo — C3.2: sessione live durevole

**Problema:** la partita in corso è volatile e si perde alla terminazione del processo.

**Scope:** modello SwiftData separato per sessione con UUID stabile, stato/fase, snapshot `MatchTiming`, riferimenti temporali serializzabili, formazione e partecipanti, eventi temporali rilevanti e stato/riferimento di finalizzazione; scritture esplicite e recupero idempotente.

**Dipendenze:** usare `MatchTiming` validato in C2 senza cambiare la semantica temporale; definire il contract di snapshot senza dipendenze SwiftUI/UserDefaults; preservare record, ID e chiavi storiche. La sessione deve rimanere offline-capable. Non introdurre backend, sync, CloudKit o autenticazione.

**Rischi:** doppia finalizzazione, tempo da accreditare oltre un periodo, timeout/pausa al cold start, crash tra salvataggio del record storico e chiusura della sessione, associazione allo storico e migrazione dello schema.

**Verifiche/accettazione:** XCTest su store persistente temporaneo e riaperto; kill/relaunch simulator/device dove possibile; nessun doppio accredito o record; errori recovery espliciti; app compilabile e flussi esistenti intatti. Backup/rollback documentati prima di una release.

**Stato atteso:** una sessione live locale durevole e recuperabile, senza affermare ancora sincronizzazione backend o recovery su dispositivi reali prima delle prove.

## Successivi, da rivalutare dopo C3.2

1. Verificare backup/esportazione e recovery di tutti i dati locali, inclusa la sessione.
2. Aggiungere evoluzioni di schema solo su requisiti concreti, con nuovi `VersionedSchema` e stage di migrazione testati.
3. Separare gradualmente contratti di dominio e responsabilità già coesive da `ContentView.swift`, proteggendo ogni estrazione con test.
4. Definire più avanti le regole di sincronizzazione e conflitto con il backend autorevole, senza duplicare ora le fonti.
