# Migrazione Git dell'app iOS nel monorepo

**Decisione:** APPROVATA il 29 ottobre 2026 — l'app nativa iOS sarà un modulo del monorepo `myteam-platform` in `apps/ios/`.  
**Esecuzione:** NON AVVIATA. Questo è un piano di migrazione con gate di sicurezza, non un'autorizzazione al push della storia originaria senza audit.  
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
