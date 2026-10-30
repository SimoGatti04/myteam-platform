# Migrazione Git dell'app iOS nel monorepo

**Decisione:** APPROVATA il 29 ottobre 2026 — l'app nativa iOS sarà un modulo del monorepo `myteam-platform` in `apps/ios/`.  
**Esecuzione:** R1-A/R1-A2 completati; R1-A3 ha finalizzato localmente la cronologia iOS nel branch isolato `codex/ios-r1-a3-publication`. R1-B ha pubblicato il branch su GitHub all'SHA `42912195b63b401d5c6200f314338ca9a2754d06`; R1-C ha aperto la Draft PR #1. La revisione QA indipendente è pendente e non è stato eseguito alcun merge su `main`.
**Gate:** R1-B = PASS per la preparazione locale al push; la pubblicazione è stata eseguita in R1-B. R1-C = Draft PR #1 aperta, review QA pendente. Build e suite C3.3: **122 PASS, 0 FAIL, 0 SKIPPED** sul commit testato `4568542756051abbadf0c175559f08735cd9eb26`; il tip documentale successivo non è stato testato separatamente. CI remota: **NOT RUN**. Nessun deploy o distribuzione iOS.
**Fonte iOS:** `AURINFORMATC` (Git locale, branch `main`, HEAD verificato `2bb9459c6f5efa7ea9b41c00b1eb658dbbc21e27`, nessun remote).  
**Destinazione:** `SimoGatti04/myteam-platform` (repository GitHub pubblico).  
**Base documentale:** `docs/ios-c4-platform-decisions-20261029`; nessun merge su `main`.

## 1. Struttura di arrivo — APPROVATA

```text
myteam-platform/
  apps/
    api/                   # Core Fastify
    web/                   # PWA / sito e admin
    ios/                   # Root Xcode iOS, derivata da AURINFORMATC/app/
      APP.xcodeproj/
      APP/
        Assets.xcassets/
        MyApp.swift
        MatchTiming.swift
        ...
      APPTests/
      APPUITests/
      scripts/
      docs/                # stato/test/architettura iOS autorevoli
      grafica/              # asset sorgente, se autorizzati dopo audit
      AGENTS.md
      README.md
      .gitignore            # esclusioni Xcode/iOS locali da trasferire/adattare
  packages/
    contracts/
  db/
  docs/
    platform/               # decisioni di prodotto della piattaforma
    decisions/ios/          # snapshot storici, non fonte operativa iOS
```

Il progetto Xcode rimane nativo e autonomo: `xcodebuild -project apps/ios/APP.xcodeproj -scheme APP`. Non inglobare l'iOS nel workspace pnpm come package JavaScript, non introdurre un nuovo schema SwiftData, non cambiare Bundle ID, firma, icone, palette o aspetto MAPI nel solo trasferimento.

La radice originaria `AURINFORMATC/docs/platform/` è già stata copiata e consolidata in `myteam-platform/docs/platform/`: non importarla come duplicato. La cartella `AURINFORMATC/backups/` è locale e non deve essere migrata. Il file `app/calendario_mapi_2026_2027.csv` e gli asset `app/grafica/` richiedono una verifica esplicita prima di entrare in un repository pubblico; non supporre che una fixture storica sia anonima.

## 2. Preservazione della storia Git — APPROVATA; metodo condizionato all'audit

**Requisito:** mantenere la tracciabilità dei cambiamenti e dei checkpoint iOS, inclusa la possibilità di investigare commit anteriori a C3.3. Non limitarsi a copiare lo snapshot corrente in un singolo nuovo commit.

**Metodo preferito dopo audit:** su una **copia temporanea** dell'originale, ottenere una cronologia del solo sottoprogetto `app/` tramite `git subtree split --prefix=app` (oppure `git filter-repo` in clone usa-e-getta, filtrando/radicalizzando `app/`), e importarla **senza `--squash`** nel branch dedicato `myteam-platform` sotto `apps/ios/`.

Questa opzione preserva in modo percorribile i commit che hanno interessato l'app, con autori, date, messaggi e modifiche; **gli hash dei commit filtrati possono cambiare** perché cambia la storia/il percorso. Conservare il commit originario `2bb9459...`, gli altri riferimenti rilevanti e una mappa origine→destinazione. La storia totale della radice `AURINFORMATC` non viene trasferita automaticamente, perché include documenti e file estranei al modulo iOS.

**Alternativa, solo se tutta la storia è sicura da pubblicare e si richiedono gli SHA originali:** import `git subtree` dell'intera storia senza squash (che conserva gli SHA ancestrali originali) seguito da una riorganizzazione `git mv`. Può introdurre nell'ancestry tutti i file storici della radice, anche se poi cancellati. **NON scegliere questa via senza audit completo della storia pubblicabile.**

Se la storia originale contiene dati/segreti non pubblicabili, non fare mai push di quella storia. Filtrare solo la copia temporanea, registrando con precisione quali commit/oggetti sono stati esclusi e che gli SHA differiscono; se la bonifica non è affidabile, conservare la cronologia integrale solo in archivio privato e pubblicare il massimo sottoinsieme sicuro, indicando la limitazione.

## 3. Gate R0 — audit di sola lettura obbligatorio

Prima di qualsiasi import/push:

1. Verificare `git status --porcelain=v1`, `git branch -avv`, `git rev-parse HEAD`, `git remote -v`, tags/refs e `git fsck` per **entrambe** le repository. Preservare modifiche locali e worktree esistenti; non cambiare branch al repository Web attualmente in uso.
2. Inventariare `git ls-files`, l'intera cronologia `git log --all --name-status`, blob grandi e file precedentemente rimossi/rinominati. Ricercare segreti, token, certificati, signing, chiavi, dataset e informazioni personali/di squadre reali nella storia, non soltanto nel tree corrente. Non stampare segreti nel rapporto.
3. Verificare `.gitignore`: nello storico i file possono essere tracciati anche se la versione attuale li ignora. `AURINFORMATC/backups/` è esclusa nell'ignore corrente, ma va controllata la storia.
4. Distinguere materiale sorgente/pubblicabile da materiale personale o artefatti storici: particolare attenzione a `calendario_mapi_2026_2027.csv`, `grafica/`, `Assets.xcassets/`, vecchi dump/test e dati di dispositivo.
5. Creare **backup privati e verificati**, ad esempio `git bundle create <percorso-privato>/AURINFORMATC-preimport.bundle --all` e `git bundle verify`; preservare anche i refs del monorepo prima dell'import. Non committare bundle nel repository pubblico.
6. Consegnare un report `PASS/STOP` sulla pubblicabilità dell'intera storia `app/`, sul metodo consigliato, sul mapping e sui file esclusi. In caso di `STOP`, nessun push e nessuna pulizia distruttiva della sorgente.

## 4. Gate R1 — import su branch/worktree isolato (solo dopo R0 PASS)

- Creare un branch dedicato, ad es. `ios/migrate-aurinformatc-history`, da una **base integrata indicata esplicitamente** e stabile (`docs/ios-c4-platform-decisions-20261029` o una sua integrazione aggiornata); non lavorare sul `main` o sul worktree Web.
- Preparare una copia locale temporanea dell'originale. Eseguire lo split/filtraggio solo in questa copia, verificare l'assenza di dati non pubblicabili e creare l'import sotto `apps/ios/` **senza squash**. Mai inserire una directory `.git/` annidata o sostituire l'originale con un symlink/submodule.
- Trasportare le regole Xcode di `.gitignore` senza indebolire quelle di sicurezza del monorepo. Coordinare ownership (`apps/ios/ → iOS`) nel root `AGENTS.md` e correggere i riferimenti relativi in `apps/ios/AGENTS.md`, README e docs.
- Conservare i documenti C3.3 in `apps/ios/docs/` come fonte iOS autorevole; aggiornare gli indici della piattaforma che puntano ancora al repository separato. Non duplicare la documentazione di piattaforma antica.
- Eseguire `git diff --check`, `git log` sul subtree importato, `git ls-tree` e un confronto checksum/file-per-file dello snapshot importato con l'originale al commit selezionato. Evidenziare tutte le esclusioni autorizzate; non dedurre equivalenza dall'assenza di errori Git.
- Verificare la build e gli XCTest nativi su macOS con Xcode autorizzato usando `apps/ios/APP.xcodeproj`, schema `APP` e un simulatore isolato. Baseline documentata C3.3: 122 PASS (119 XCTest di app e 3 XCUITest), con due warning SwiftUI già noti; distinguere regressioni da warning storici. Nessun test con archivi reali/backup del dispositivo.
- Eseguire anche il controllo integrità Core/Web/contratti e verificare che file, pnpm, database e lockfile non abbiano cambiamenti inattesi.
- Soltanto dopo risultati e audit accettabili pubblicare il branch remoto; riportare commit nuovo, parent, mapping history, file inclusi/esclusi, file di provenienza, risultati e limiti. **Nessun merge su `main` e nessun deploy o distribuzione iOS.**

## 5. Gate R2 — pulizia architetturale separata dalla migrazione

Il trasferimento Git deve essere un checkpoint tecnico isolato. Non combinare in un unico diff con:
- estrazione branding MAPI e tema dinamico;
- rimozione CRUD rosa/calendario/CSV;
- nuova distinta;
- modifica del motore `MatchTiming` per i tempi configurabili;
- login Logto nativo, SyncQueue, SSE, nuova UI LIVE.

Queste modifiche sono progettate nei checkpoint C4/C5 documentati separatamente. La migrazione non deve compromettere le migrazioni SwiftData V1→V2→V3, gli import legacy né la disponibilità offline.

**Gate finale:** il nuovo repository monorepo deve consentire di seguire la cronologia iOS, compilare/eseguire il progetto, ritrovare la documentazione autorevole e preservare l'originale `AURINFORMATC` immutato. Pubblicare la storia solo dopo un giudizio esplicito di sicurezza.

## R1-A3 — Cronologia pubblicabile finalizzata (29 ottobre 2026)

**Verdetto al termine di R1-A3:** PASS per il gate locale R1-B; in quella fase il push GitHub e il merge su `main` non erano stati eseguiti e il branch era isolato e locale. La pubblicazione è avvenuta successivamente in R1-B.

### Base, ancestry e rewriting

- Base pubblicata verificata su GitHub: `docs/ios-c4-platform-decisions-20261029` @ `7fd81044e6dab4f6cf732c99d7f2f3019977b665`; parent `d1001e5a4e7f7c5ceecc254cb2cc3233d9fb321d`.
- Branch R1-A3: `codex/ios-r1-a3-publication`. Merge d'importazione `b871f1a1c4b35229663327efbfbb37b120b3e54f`, parent 1 `7fd81044…`, parent 2 `ab622c0f6884b32a2f126ababebaf5c56a6ce57a` (25 commit iOS filtrati). Il candidato verificato da Xcode è `4568542756051abbadf0c175559f08735cd9eb26`; il commit conclusivo del rapporto R1-A3 è documentale e non modifica codice o progetto Xcode.

| Passaggio | SHA |
|---|---|
| AURINFORMATC originale (`main`) | `2bb9459c6f5efa7ea9b41c00b1eb658dbbc21e27` |
| Clone filtrato R1-A | `3b74e866800763095bc129d81b94d962be3fddf4` |
| Tip filtrato R1-A2 | `383bfa3e01c1c310d194101b8bbd93c70aac33c2` |
| Import locale R1-A2 (base non GitHub) | `37d3e26d1fbd4bdaf2aee799460b3adf526b52d0` |
| Tip iOS con prefisso R1-A3 | `ab622c0f6884b32a2f126ababebaf5c56a6ce57a` |
| Merge d'importazione R1-A3 | `b871f1a1c4b35229663327efbfbb37b120b3e54f` |
| Commit candidato testato | `4568542756051abbadf0c175559f08735cd9eb26` |
- `git-filter-repo` è stato usato soltanto nel clone temporaneo `/private/tmp/myteam-ios-r1a3-rewrite`; tutti i 25 commit iOS hanno il prefisso `apps/ios/`, non solo il merge. Nomi autore/committer, timestamp e messaggi sono preservati; l'email storica è stata normalizzata a `55622211+SimoGatti04@users.noreply.github.com`. Tale indirizzo coincide con quello del commit base pubblicato, che GitHub associa al login `SimoGatti04` (account ID `55622211`). La verifica GitHub del commit base segnala `unsigned`: l'attribuzione GitHub dell'email non equivale a firma crittografica dei commit.
- Il mapping integrale di 25 righe è in [IOS-MIGRATION-HISTORY-MAP.tsv](IOS-MIGRATION-HISTORY-MAP.tsv): SHA AURINFORMATC → R1-A → R1-A2 → R1-A3. Il mapping privato completo e gli artefatti R1-A3 sono conservati nel backup permanente.

### Motivo della base locale R1-A2

R1-A2 era una prova locale sullo scaffold `ios/import-r1a` e usava il commit `bdeb7d759a50520de793b72a81491a84a1de0c0b` del repository temporaneo `ios-monorepo-import`. L'ispezione del commit conferma un commit root senza parent e tree vuoto (`4b825dc…`); il suo remote `ios-source` puntava al clone filtrato locale, non a GitHub. R1-A3 è stato ricostruito sulla base GitHub pubblicata verificata. `bdeb7d7…` è assente dal database oggetti e dall'ancestry del branch finale.

### Audit della storia e struttura

- `git log -- apps/ios/APP/MyApp.swift`: 5 commit; `git log --follow -- apps/ios/APP/MatchTiming.swift`: 3 commit; `git blame apps/ios/APP/MatchTiming.swift`: 1.472 righe. La navigazione per percorso risale ai commit iOS riscritti.
- `apps/ios/APP.xcodeproj` e lo scheme condiviso `APP` sono presenti; nessun `.git` annidato; `git fsck --full --strict` termina senza errori. Le regole Xcode in `apps/ios/.gitignore` sono efficaci per `xcuserdata`, DerivedData, build, SwiftPM e credenziali di firma.
- Nessun oggetto raggiungibile dal candidato contiene `calendario_mapi_2026_2027.csv`, `grafica/` o `IMG_4252.JPG`; nessun path Web/Core/QA inatteso è stato aggiunto rispetto alla base. Il CSV con dati reali resta escluso dalla storia pubblicabile e conservato solo nei backup privati.
- La verifica del manifest file R1-A2 ha trovato 47 corrispondenze byte-per-byte su 51; le sole 4 differenze sono documentazione intenzionalmente aggiornata (`apps/ios/AGENTS.md`, `apps/ios/README.md`, `apps/ios/docs/STATUS.md`, `apps/ios/docs/decisions/README.md`). I PNG MAPI runtime sono byte-identici ai valori attesi, con gli SHA-256 riportati sotto.
- Bundle ID `com.aurorabellinipersonalteam.APP` e Team ID `9G4GA2DW9Y` sono invariati. Non è stato fatto refactoring Swift.

### Documenti divergenti

Sono stati confrontati gli snapshot storici divergenti (`BACKEND-DATA.md`, `IOS-INTEGRATION.md`, `MVP-HANDOFF.md`, `README.md`) con le versioni recenti già presenti nella base pubblicata di `myteam-platform`, considerate autorevoli. Non è emerso contenuto storico ancora pertinente e mancante da sovrapporre; sono state mantenute le versioni correnti e aggiornato il solo stato di migrazione necessario. ADR-0008 resta nella posizione canonica `docs/decisions/ios/` senza duplicati in `apps/ios/docs/`.

### Asset e sicurezza dei binari

I tre asset runtime sono byte-identici (SHA-256):

| Asset | SHA-256 |
|---|---|
| `FooterGeese` | `14857bffafc30a96aabe14ff240612b55a1bc0ad248eef1df4289408a2113906` |
| `WelcomeBackground` | `9d7c50168ec62d381b778a62a7cba2b5301242f222bc1a40838a4faeb2981502` |
| `WelcomeLogo` | `e627da311bb8032dc3579cc1411fe698cba36ba23e92ee0582b4c22901c5166e` |

I PNG contengono il chunk C2PA `caBX`; i CRC sono validi. Il contenuto C2PA viene conservato come **metadato di provenienza non verificato crittograficamente**: non è stata attestata autenticità, catena o firma. La scansione dei chunk non immagine non ha trovato marker di credenziali né campi GPS/telefono; i pattern numerici generici corrispondono a coordinate SVG, timestamp, UUID o dati del certificato, non a contatti telefonici. Un indirizzo email associato al certificato/provenienza C2PA (`ca@trufo.ai`) resta presente nei metadata; non è stato rimosso perché altererebbe l'asset byte-identico.

### Build e test

- Build Xcode 27.0: **PASS** sul commit `4568542756051abbadf0c175559f08735cd9eb26`.
- Suite C3.3 su iPhone 18 Pro Simulator, iOS 27.0 (runtime build `24A434`): **122 PASS, 0 FAIL, 0 SKIPPED** sullo stesso commit. Result bundle e log sono archiviati nel backup R1-A3. Il commit documentale finale successivo non è stato testato come commit distinto; non cambia Swift, asset o input Xcode.
- Due warning noti `Invalid frame dimension (negative or non-finite)` compaiono nei test UI di lifecycle già noti, che risultano passati. Il warning AppIntents segnala solo che il framework non è dipendenza del target. Nessuna prova su dispositivo fisico.

### Backup e stato di consegna

R1-A2 rimane intatto in `/Users/gatti/Workspace/backups/myteam-ios-migration-20261029/`; il bundle originale ha SHA-256 `91d9c3598e5395eca7f2447db6973f34509bae938811dc1df7ecd4cdc2554f28` e il manifest R1-A2 ha SHA-256 `ebb2180133c92d1879b6b1185d117ac705a6fcdd86962d75ea93d0b6a4e16d83`. I nuovi materiali R1-A3 sono aggiunti in `/Users/gatti/Workspace/backups/myteam-ios-migration-20261029/R1-A3/`, senza sostituire R1-A2 o gli originali. Il branch finale è conservato nel clone isolato `/Users/gatti/Workspace/myteam-platform-ios-r1a3-final`; SHA finale e checksum del pacchetto sono nel verbale privato di consegna R1-A3.
