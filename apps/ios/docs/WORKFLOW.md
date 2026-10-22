# Metodo di Lavoro: ChatGPT → Prompt Manuale → Codex → Xcode

Questo documento descrive il metodo di lavoro adottato per lo sviluppo del progetto **MAPI GROUP**.  
È pensato per permettere a una sviluppatrice alle prime armi di progredire in modo sereno, sicuro e controllato, lavorando interamente in locale con strumenti semplici.

---

## 1. Principi Fondamentali

1. **Semplicità prima di tutto**: niente comandi complessi da riga di comando o strumenti esoterici.
2. **Nessun uso di Git per ora**: niente branch, commit, merge o conflitti. Tutte le modifiche avvengono direttamente sui file locali.
3. **Passi piccoli e verificabili**: una sola modifica o funzionalità alla volta.
4. **Chiarezza dei ruoli**: ognuno dei tre strumenti ha un compito preciso e insostituibile.

---

## 2. I Quattro Passaggi del Ciclo di Lavoro

```
 ┌─────────────────┐       Prompt        ┌─────────────────┐
 │     ChatGPT     │ ──────────────────> │      Codex      │
 │ (Progettazione) │    (Copia/Incolla   │  (Modifica File)│
 └─────────────────┘       Manuale)      └─────────────────┘
          ▲                                       │
          │                                       │ File salvati
          │ Risultato / Errori                    ▼
 ┌─────────────────┐                     ┌─────────────────┐
 │   Sviluppatrice │ <────────────────── │      Xcode      │
 │  (Test Visivo)  │    Compilazione     │ (Simulatore/Run)│
 └─────────────────┘                     └─────────────────┘
```

### Passo 1: Progettazione con ChatGPT
- **Cosa fai**: Ti confronti con ChatGPT su cosa vuoi aggiungere o cambiare nell'app (es. "voglio aggiungere il pulsante della Rosa nella schermata iniziale").
- **Cosa fa ChatGPT**:
  - Ti spiega la soluzione tecnica in termini semplici.
  - Scompone l'obiettivo in compiti piccoli e sicuri.
  - Prepara un **prompt pronto all'uso** formulato appositamente per Codex, con indicazioni precise su quali file toccare e quali vincoli rispettare.

### Passo 2: Esecuzione con Codex (Prompt Manuale)
- **Cosa fai**: Copi il prompt preparato da ChatGPT e lo incolli a Codex.
- **Cosa fa Codex**:
  - Legge i file necessari.
  - Applica le modifiche richieste direttamente al codice sorgente o alla documentazione.
  - Non esegue comandi Git e non tocca file estranei alla richiesta.
  - Al termine, ti conferma quali file sono stati aggiornati e riassume cosa è cambiato.

### Passo 3: Verifica e Compilazione su Xcode
- **Cosa fai**:
  - Torni su Xcode (che rileva automaticamente i file aggiornati).
  - Premi **Cmd + R** (o il tasto Play ▶) per compilare ed eseguire l'app nel simulatore.
  - Verifichi con i tuoi occhi il comportamento e la grafica della nuova schermata.

### Passo 4: Feedback e Chiusura del Ciclo
- **Se tutto funziona**: informi ChatGPT che il risultato è perfetto e si passa alla funzionalità successiva.
- **Se c'è un errore o qualcosa non torna**:
  - Copi l'errore di Xcode (o descrivi cosa vedi di strano).
  - Lo mostri a ChatGPT.
  - ChatGPT ti prepara un rapido prompt correttivo da passare a Codex, senza farti perdere il controllo del codice.

---

## 3. Regole d'Oro per Evitare Problemi

- **Non saltare passaggi**: non chiedere a Codex di fare refactoring massicci o riscritture complete in un solo colpo.
- **Modifiche isolate**: assicurati che un componente compili e funzioni prima di passare al successivo.
- **Backup semplici**: se desideri fare un punto di ripristino prima di modifiche importanti, puoi semplicemente duplicare la cartella del progetto nel Finder (ad es. `app_backup_data`).
- **Niente librerie esterne non concordate**: nessun CocoaPods, Carthage o SPM a meno di esplicita decisione con ChatGPT.
