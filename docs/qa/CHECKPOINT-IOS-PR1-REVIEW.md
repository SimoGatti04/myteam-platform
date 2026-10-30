# QA-PR1-REVIEW — Verifica indipendente della Draft PR iOS #1

**Agente:** QA (persistente)
**Checkpoint:** QA-PR1-REVIEW
**Data:** 2026-10-30
**Branch QA:** `qa/ios-pr1-review-report`
**PR verificata:** [SimoGatti04/myteam-platform#1](https://github.com/SimoGatti04/myteam-platform/pull/1)
**Ambito modificato da QA:** esclusivamente `docs/qa/`. Nessuna modifica a codice, nessun merge su `main`, nessun deploy.

---

## 1. SHA esatto verificato

| Riferimento | SHA |
|---|---|
| Base PR | `7fd81044e6dab4f6cf732c99d7f2f3019977b665` |
| Head PR (verificato) | `42912195b63b401d5c6200f314338ca9a2754d06` |
| Commit di merge d'integrazione QA | `0db5b6b53ce7558ef68a53cec587be8b570f5bc7` (Q2-D, non coinvolto) |
| Commit QA di questo rapporto | vedi §12 |

**Nota:** la base `7fd8104` non è antenata di `main` (`66b4987`). La PR importa la storia iOS da un repository separato (AURINFORMATC) su una base dedicata. Questo è il comportamento atteso per una migration PR, non un'anomalia.

---

## 2. Verdetto

**READY FOR INTEGRATION REVIEW** (con condizioni — vedi §10).

La PR importa correttamente la storia iOS filtrata sotto `apps/ios/`, non modifica Web/Core/contratti, non contiene dati reali o backup privati, il progetto Xcode è integro e builda con successo. I test non sono stati eseguiti in questa sessione per vincoli ambientali (simulatore non avviabile in modo stabile), ma la build è riuscita e la struttura dei test è coerente con la documentazione.

---

## 3. Matrice PASS/FAIL/NOT VERIFIED

| # | Controllo | Esito | Evidenza |
|---|---|---|---|
| 1 | Ancestry PR e preservazione storia | **PASS** | §4 |
| 2 | Collocazione coerente sotto `apps/ios/` | **PASS** | §5 |
| 3 | Assenza modifiche inattese a Web/Core/contratti | **PASS** | §6 |
| 4 | Audit file pubblicati (asset e metadati) | **PASS** | §7 |
| 5 | Esclusione dataset reali e backup privati | **PASS** | §8 |
| 6 | Coerenza rapporti/commit/dichiarazioni build-test | **PASS** | §9 |
| 7 | Integrità progetto Xcode e dipendenze locali | **PASS** (build) / **NOT VERIFIED** (test) | §10 |
| 8 | Stato documentazione e riferimenti storici | **PASS** | §11 |
| 9 | Rischi di merge e divergenza | **PASS con condizioni** | §12 |

---

## 4. Ancestry PR e preservazione storia

**Esito: PASS.**

- 28 commit tra base `7fd8104` e head `4291219`.
- La storia preserva i commit iOS originali: `chore: establish local AURINFORMATC baseline`, `feat: add deterministic match timing engine`, `feat(persistence): add SwiftData store and legacy import`, `feat(match): persist and recover live session`, `feat(match): add attendance timeline and correction workflows`, ecc.
- I commit di importazione sono espliciti: `docs(ios): import filtered iOS history under apps/ios` (b871f1a), `docs(ios): align imported module and R1-A3 guidance` (4568542), `docs(ios): record R1-A3 publication readiness` (4291219).
- Nessun commit di merge o rebase che alteri la storia. I commit mantengono i messaggi originali.

**Evidenza:** `git log --oneline --reverse 7fd8104..4291219` → 28 commit, tutti con messaggi coerenti con la storia iOS.

---

## 5. Collocazione coerente sotto `apps/ios/`

**Esito: PASS.**

Tutti i file Swift, asset, test, documentazione e script sono sotto `apps/ios/`:

```
apps/ios/
├── AGENTS.md
├── APP/                    # sorgenti Swift (289-1472 LOC per file)
├── APP.xcodeproj/          # progetto Xcode (project.pbxproj, scheme, xcworkspace)
├── APPTests/               # test unitari (7 file, 700-925 LOC)
├── APPUITests/             # test UI (449 LOC)
├── README.md
├── docs/                   # architettura, stato, test, ADR (13 file)
├── scripts/                # create_synthetic_recovery_fixture.py
└── .gitignore              # esclusioni iOS-specifiche
```

Nessun file iOS è stato collocato fuori da `apps/ios/`. L'unico file fuori scope è `AGENTS.md` (root), modificato per aggiungere il riferimento al modulo iOS — modifica minima e coerente.

---

## 6. Assenza di modifiche inattese a Web, Core e contratti

**Esito: PASS.**

`git diff --name-only 7fd8104..4291219 | grep -v "^apps/ios/" | grep -v "^docs/"` → solo `AGENTS.md`.

Nessuna modifica a:
- `apps/web/` (Web W2-R4 invariato)
- `apps/api/` (Core C1.2 invariato)
- `packages/contracts/` (contratti invariati)
- `tests/` (suite QA invariata)

L'unica modifica fuori `apps/ios/` e `docs/` è `AGENTS.md`, che aggiunge il riferimento al modulo iOS e aggiorna la nota sugli ADR. Modifica minima e coerente.

---

## 7. Audit dei file pubblicati (asset e metadati)

**Esito: PASS.**

### 7.1 Asset
- `Assets.xcassets/`: AccentColor, AppIcon, FooterGeese, WelcomeBackground, WelcomeLogo — tutti con `Contents.json` valido.
- Nessun file binario sospetto (immagini PNG/JPEG con nomi descrittivi).
- Asset con spazi nel nome (`logo ingresso - mapi group 5.png`, `Immagine ChatGPT 9 ott 2026, 15_55_55.png`) — funzionali ma non ideali per un monorepo; non bloccante.

### 7.2 Metadati
- `.gitignore` completo: esclude `xcuserdata/`, `DerivedData/`, `build/`, `*.xcresult`, `*.ipa`, `*.dSYM`, backup (`*.bak`, `*.backup`), database (`*.sqlite`, `*.db`), credenziali (`.env`, `*.p12`, `*.p8`, `*.pem`, `*.key`), log.
- `project.pbxproj`: 558 righe, scheme condiviso (`APP.xcscheme`), workspace con `contents.xcworkspacedata`.
- Nessun file `.xcuserstate` o `xcuserdata/` committato (verificato con `find`).

### 7.3 Dimensione
- Nessun file > 1 MB. Le immagini asset sono < 1 MB ciascuna.
- Nessun file binario non-asset (es. `.zip`, `.dmg`).

---

## 8. Esclusione dataset reali e backup privati

**Esito: PASS.**

### 8.1 Dati reali
- Grep per termini sensibili (`gatti`, `@gmail`, `password`, `secret`, `token`, `mobileprovision`, `.p12`, `.p8`) in `apps/ios/`: solo riferimenti documentali al percorso workspace (`/Users/gatti/Workspace`) in `BASELINE_AUDIT.md` e ADR-0005. **Nessun dato personale o credenziale.**
- Il fixture sintetico (`create_synthetic_recovery_fixture.py`) usa UUID anonimi (`a0000000-0000-4000-8000-000000000001`, ecc.) e un avversario fittizio (`Recovery Synthetic FC`). Nessun dato reale.
- Nessun file `.sqlite`, `.db`, `.csv`, `.xlsx` committato.

### 8.2 Backup privati
- Nessun file `*.bak`, `*.backup`, `*.orig`, `*.tmp` committato.
- La directory `/backups/` è nel `.gitignore` e non esiste nel tree.

### 8.3 Credenziali
- Nessun file `.env`, `.p12`, `.p8`, `.pem`, `.key`, `.mobileprovision` committato.
- Nessuna stringa che assomigli a un token o secret nel codice Swift (verificato con grep).

---

## 9. Coerenza rapporti, commit testati e dichiarazioni

**Esito: PASS.**

### 9.1 Documentazione iOS (13 file in `apps/ios/docs/`)
- `ARCHITECTURE.md`, `BASELINE_AUDIT.md`, `FEATURES.md`, `MIGRATION_PLAN.md`, `STATUS.md`, `TESTING.md`, `WORKFLOW.md`
- `decisions/ADR-0001..0006` (6 ADR)
- `decisions/ADR-0004-swiftdata-local-persistence.md`, `ADR-0005-live-session-json-recovery.md`, `ADR-0006-swiftdata-concurrency.md`

### 9.2 Coerenza con la storia
- `BASELINE_AUDIT.md` referenzia il commit baseline `4dd2b3b87cad9239df43662abccc08544f970e4f` del repo AURINFORMATC — coerente con la provenienza dichiarata.
- `STATUS.md` e `TESTING.md` documentano lo stato dei test e i risultati attesi.
- Gli ADR sono snapshot di riferimento, coerenti con l'implementazione in `apps/ios/`.

### 9.3 Dichiarazioni di build/test
- La documentazione dichiara che i test sono stati eseguiti sul repo AURINFORMATC (non sul monorepo). Questa è una dichiarazione onesta e coerente con lo stato attuale (importazione in corso).
- Nessuna dichiarazione falsa di build/test sul monorepo.

---

## 10. Integrità progetto Xcode e dipendenze locali

**Esito: PASS (build) / NOT VERIFIED (test).**

### 10.1 Build
- `xcodebuild -project APP.xcodeproj -scheme APP -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build` → **BUILD SUCCEEDED** (verificato in questa sessione, ~90s, Xcode 27.0, iOS 27.0 Simulator).
- Il progetto compila senza errori. Nessun warning critico.
- Le dipendenze locali (nessuna dipendenza esterna via SPM o CocoaPods — il progetto è self-contained) sono integre.
- `project.pbxproj` (558 righe) è valido e parsabile da Xcode.

### 10.2 Test
- **NOT VERIFIED.** I test unitari (`APPTests`, 7 file) e UI (`APPUITests`, 1 file) non sono stati eseguiti in questa sessione.
- **Motivo:** il simulatore iOS non si avvia in modo stabile in questo ambiente (tentativi multipli, boot fallito o bloccato). Il build è riuscito, ma il test runner non ha potuto lanciare i test.
- **Mitigazione:** la struttura dei test è coerente con la documentazione (`TESTING.md` descrive 7 suite unitarie + 1 UI). I test sono stati eseguiti sul repo AURINFORMATC prima dell'importazione (dichiarato in STATUS.md). La build del progetto conferma che il codice compila correttamente.
- **Azione richiesta:** eseguire i test su un ambiente con simulatore funzionante prima del merge.

### 10.3 Scheme e workspace
- Scheme condiviso: `APP.xcscheme` con build/test/profile/archive/analyze actions.
- Workspace: `project.xcworkspace/contents.xcworkspacedata` valido.
- Nessun scheme utente (`xcuserdata/`) committato.

---

## 11. Stato documentazione e riferimenti storici

**Esito: PASS.**

- `apps/ios/README.md` (51 righe): panoramica del modulo, struttura, come buildare.
- `apps/ios/AGENTS.md` (67 righe): regole specifiche del modulo iOS.
- `docs/ARCHITECTURE.md`: architettura del monorepo (aggiornato per includere iOS).
- `docs/STATUS.md`: stato del progetto (aggiornato).
- `docs/platform/IOS-MONOREPO-MIGRATION.md`: piano di migrazione iOS (presente, non tracciato — file untracked nel checkout Web).
- I riferimenti storici (AURINFORMATC, commit baseline) sono coerenti e ben documentati.

---

## 12. Rischi di merge e divergenza

**Esito: PASS con condizioni.**

### 12.1 Rischi identificati

1. **Divergenza con altri branch:** la base `7fd8104` è su un branch dedicato (`codex/ios-r1-a3-publication`), non su `main`. Il merge su `main` richiederà una strategia di integrazione (merge o rebase) che preservi la storia. La storia iOS è importata tramite `git filter-repo` o equivalente, il che è corretto.

2. **File untracked nel checkout Web:** il checkout `web/w2-logto-auth` contiene directory non tracciate (`docs/qa/`, `tests/`, `docs/platform/IOS-MONOREPO-MIGRATION.md`) che potrebbero interferire con merge futuri. Questi file sono preesistenti e non sono stati creati in questa sessione.

3. **Asset con nomi non standard:** due immagini hanno spazi e caratteri speciali nel nome. Non bloccante ma da normalizzare.

4. **Test non eseguiti:** i test iOS non sono stati eseguiti in questa sessione. La build è riuscita, ma la verifica funzionale è incompleta.

### 12.2 Condizioni per l'integrazione

1. Eseguire i test iOS su un ambiente con simulatore funzionante (tutti i 7 file APPTests + 1 APPUITests).
2. Verificare che il merge su `main` preservi la storia (non squash).
3. Pulire gli untracked nel checkout Web prima del merge.
4. Normalizzare i nomi degli asset con spazi.

---

## 13. Giudizio finale

**READY FOR INTEGRATION REVIEW.**

La PR importa correttamente la storia iOS filtrata sotto `apps/ios/`, non modifica Web/Core/contratti, non contiene dati reali o backup privati, il progetto Xcode è integro e builda con successo. La documentazione è coerente e completa. I test non sono stati eseguiti per vincoli ambientali, ma la build conferma la correttezza sintattica e la struttura dei test è coerente con la documentazione.

**Non è un integration PASS completo** — i test iOS devono essere eseguiti prima del merge. La classificazione è READY FOR INTEGRATION REVIEW, non PASS.

---

## 14. Riferimenti

- PR: https://github.com/SimoGatti04/myteam-platform/pull/1
- Base: `7fd81044e6dab4f6cf732c99d7f2f3019977b665`
- Head: `42912195b63b401d5c6200f314338ca9a2754d06`
- Branch QA: `qa/ios-pr1-review-report`
- Build log: `docs/qa/evidence/ios-pr1-review/build-stdout.log`
- Nessun merge su `main`, nessun force push, nessun deploy.
- Nessuna modifica applicativa (solo `docs/qa/`).
