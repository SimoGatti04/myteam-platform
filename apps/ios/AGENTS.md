# Istruzioni per gli Agenti — AURINFORMATC (MAPI GROUP)

Questo documento contiene le regole operative essenziali per qualsiasi agente di intelligenza artificiale (Codex, ecc.) che collabora allo sviluppo dell'app iOS **MAPI GROUP**.

---

## 1. Ambito e Regola Fondamentale di Isolamento

- **Valido esclusivamente per AURINFORMATC**: Le convenzioni descritte in questo repository si applicano **esclusivamente** al progetto `AURINFORMATC`.
- **Nessuna modifica esterna**: Non devono in alcun modo modificare, influenzare o alterare altri progetti, tool condivisi o le impostazioni generali del workspace.
- **Riferimento al Workspace Generale**: Le convenzioni generali definite dal proprietario del workspace sono consultabili nel repository `SimoGatti04/development-environment`. Vanno considerate come principio ispiratore (in particolare il criterio di **proporzionalità al contesto** per progetti personali leggeri), ma **non devono essere modificate**.

---

## 2. Profilo della Sviluppatrice e Ambiente di Lavoro

- La sviluppatrice è alle prime armi e desidera un flusso di sviluppo **semplice, lineare e comprensibile**.
- L'ambiente è interamente locale e composto unicamente da:
  1. **Xcode** (per visualizzare, compilare e testare l'app su simulatore o dispositivo reale).
  2. **ChatGPT** (per ideare le funzionalità, preparare i prompt tecnici e verificare i risultati).
  3. **Codex** (per eseguire le modifiche ai file di codice e alla documentazione su indicazione dei prompt).
- **Nessun uso di Git per il momento**: Non eseguire comandi `git`, non creare commit o branch e non presupporre un controllo di versione attivo.

---

## 3. Ruoli Operativi

| Ruolo | Responsabilità |
| :--- | :--- |
| **Sviluppatrice** | Riceve i prompt da ChatGPT, li inoltra a Codex, esegue il progetto in Xcode e valida visivamente/funzionalmente l'app. |
| **ChatGPT** | Guida l'architettura, scompone i compiti in piccoli passi, scrive prompt chiari per Codex e analizza eventuali errori segnalati. |
| **Codex** | Esegue le modifiche ai file richieste dal prompt, in modo chirurgico e rispettando lo stile del progetto. |

---

## 4. Direttive di Codifica e Comportamento per Codex

Quando ricevi un prompt per modificare questo progetto:

1. **Modifiche minime e mirate**:
   - Modifica solo ciò che è esplicitamente richiesto dal prompt.
   - Non riscrivere parti funzionanti dell'applicazione a meno che non sia specificato.
2. **Nessun refactoring non autorizzato**:
   - Non suddividere arbitrariamente i file esistenti né introdurre architetture complesse (es. Clean Architecture, VIPER, coordinator pesanti).
   - Mantieni la struttura SwiftUI attuale a meno di indicazioni esplicite.
3. **Nessun database o SwiftData**:
   - Attualmente la persistenza usa `UserDefaults` con JSON. **Non introdurre SwiftData, CoreData o librerie esterne** finché non concordato espressamente.
4. **Rispetto dello stile visivo e del tema**:
   - Utilizza i colori e le costanti di `MapiTheme`.
   - Mantieni lo stile grafico (forme morbide, angoli arrotondati, riferimenti alle ochette mascotte).
5. **Chiarezza e commenti in italiano**:
   - Commenta i passaggi complessi in modo semplice e chiaro per facilitare la comprensione alla sviluppatrice.
6. **Verificabilità**:
   - Al termine di ogni intervento, elenca esattamente quali file sono stati modificati e spiega cosa è stato fatto.

---

## 5. Mappa della Documentazione

- **[`README.md`](README.md)**: Presentazione dell'app MAPI GROUP e guida rapida per aprirla ed eseguirla con Xcode.
- **[`docs/WORKFLOW.md`](docs/WORKFLOW.md)**: Dettaglio del ciclo di lavoro ChatGPT → prompt manuale → Codex → Xcode.
- **[`docs/FEATURES.md`](docs/FEATURES.md)**: Registro completo delle funzionalità attuali e di quelle concordate da realizzare.
- **[`docs/STATUS.md`](docs/STATUS.md)**: Situazione corrente del progetto, avanzamento e prossimi interventi pianificati.
