# Stato del progetto — MAPI GROUP Match Manager

**Aggiornato:** 24 ottobre 2026 — checkpoint C3

## Stato corrente

La persistenza live C3 è implementata: la sessione usa un aggregate JSON versionato con scrittura atomica, generazione precedente recuperabile, validazione, restore temporale e finalizzazione idempotente nello storico SwiftData. La conferma della formazione viene resa durevole prima di entrare nella schermata live; il primo avvio del cronometro resta un’azione esplicita.

La suite deterministica integrata C1+C2+C3.1+C3 è passata (81 XCTest, 0 falliti, 0 skipped) su iPhone 18 Pro Simulator con iOS 27.0. Due test aggiuntivi verificano il recupero del backup dopo mismatch SHA-256 e la finalizzazione dopo corruzione della primary successiva al commit dello storico. Hanno portato a due correzioni: promozione esplicita del backup anche per errori di decodifica tipizzati e doppia scrittura del marker finalizing prima dello storico, così entrambe le generazioni contengono il record stabile. Build app-only e compilazione del target test sono riuscite. **Stato complessivo: PARTIAL**, perché non è stata eseguita una prova manuale end-to-end di terminazione forzata e rilancio dell’app. Il tentativo di controllo UI è stato bloccato dal Mac host bloccato; nessun reset del simulatore è stato tentato. Il risultato dei test non va presentato come prova di cold start reale su dispositivo o come verifica di dati di produzione.

## Baseline e repository

- Repository locale: root `AURINFORMATC/`, branch `main`, baseline C2 `8b834a1`; C3.1 era HEAD `c8dde71` all’inizio di questo checkpoint.
- Nessun remote configurato; nessun push effettuato o previsto.
- Implementazione e test C3: commit locale `b2f71a1` (`feat(match): persist and recover live session`); la documentazione di esito è inclusa nel commit documentale di questo checkpoint. Nessun remote è configurato e nessun push è stato effettuato.
- Il repository fratello `development-environment/` aveva modifiche preesistenti non correlate e non è stato modificato.
- Progetto Xcode `app/APP.xcodeproj`, scheme `APP`, target app `APP`, XCTest `APPTests`.
- Ambiente: Xcode 27.0 (`27A266a`); iOS Simulator 27.0, iPhone 18 Pro.

## Fonti locali e compatibilità

- SwiftData resta la sola fonte operativa per rosa, calendario e storico; schema `MatchManagerSchemaV1`.
- La migrazione UserDefaults è una tantum dalle chiavi `FutsalRosterV1`, `FutsalScheduleV1`, `FutsalMatchHistoryV1`; le chiavi originali restano conservate e non vengono aggiornate come archivio parallelo.
- La partita live usa un documento JSON distinto in Application Support. Non modifica chiavi legacy né introduce migrazioni SwiftData.
- Lo storico finale è inserito tramite `MatchDataStore.insertHistoryRecordIfAbsent`, usando lo UUID live come ID del record e confrontando i dati su retry.
- Le fixture e i dati usati dai test sono sintetici e anonimi; non sono stati acquisiti dati personali di giocatori o dati reali da un dispositivo.

## Recovery live e limiti

- Snapshot schema 1 con fase/attività e tempi `MatchTiming`, partecipanti e formazione, metadati necessari, eventi/assist, riferimenti calendario, timestamp civile/monotono e stato di finalizzazione.
- Primary e backup vengono validati; i payload corrotti o di versione non supportata non vengono cancellati né trasformati in una sessione vuota.
- Nel processo, il clock monotono è autorevole; sul cold start, il delta monotono è confrontato con il timestamp civile. Salti non plausibili richiedono revisione e l’intervallo viene limitato alla durata recuperabile.
- Non è salvato un boot ID affidabile: il rilevamento del reboot combina clock monotono e civile ed è euristico; l’interazione tra reboot e clock alterato non è coperta da un identificatore di boot.
- Il recupero dell’app dopo una terminazione reale, la protezione file del dispositivo e dati legacy reali non sono stati verificati manualmente.
- Backend, sincronizzazione, CloudKit, autenticazione, PWA, multi-squadra e branding dinamico non sono stati introdotti.

## Verifiche effettivamente eseguite

- `xcodebuild test -project app/APP.xcodeproj -scheme APP -destination 'platform=iOS Simulator,id=94F3DA93-9BEA-4674-AAE8-CE127F97EBF7' -parallel-testing-enabled NO`: **PASS — 79, 0 fail, 0 skipped**. Result bundle in `/private/tmp/aurinformatc-c3-verified-20261024.xcresult`.
- `xcodebuild build -quiet -project app/APP.xcodeproj -scheme APP -destination 'generic/platform=iOS Simulator'`: **PASS**.
- I test coprono round-trip/reopen, recovery temporale, pausa/running/timeout/intervallo, periodi, clock incoerenti, payload invalido, backup, errori di salvataggio e finalizzazione interrotta/idempotente.
- Prova visuale e kill/relaunch manuale dell’app: **NOT RUN**.
- Recupero dopo reboot reale e migrazione dei dati reali dell’utente: **NOT RUN**.
- Nessun test è stato saltato nel run registrato. L’accesso a CoreSimulator dal contesto ristretto non era disponibile; il run autorizzato di Xcode è riuscito sul simulatore indicato.

## Prossimo intervento consigliato

Prima di un checkpoint funzionale successivo, eseguire una prova end-to-end su simulatore con una sessione sintetica salvata: background, terminazione forzata, rilancio, verifica di timer/eventi e pulizia dei dati di prova. Valutare separatamente se una futura versione necessita di un boot identifier più forte. Non cambiare la politica temporale né avviare ulteriori migrazioni senza test e decisione documentata.
