# ADR-0008 — Sincronizzazione offline-first, gerarchia delle fonti e regole di piattaforma

- **Stato:** ACCETTATO — 27 ottobre 2026
- **Ambito:** Piattaforma `myteam-platform`, integrazione app iOS, gerarchia delle fonti, statistiche e riconoscimenti
- **Dipendenze:** ADR-0001, ADR-0003, ADR-0004, ADR-0006, ADR-0007

## Contesto

L'app iOS privata (consolidata al checkpoint C3.3 con SwiftData V3) gestisce operativamente le gare in modalità offline-first. È stata definita l'architettura complessiva per la piattaforma pubblica `myteam-platform` (sito responsive/PWA, backend autoritativo per dati condivisi e distribuzione real-time via Server-Sent Events).

Si rende necessario formalizzare i principi architetturali approvati per:
1. La sincronizzazione tra l'app iOS privata e il backend.
2. La riconciliazione tra fonti concorrenti e disallineate nel tempo (amministratore, CSI/fonti esterne, app iOS).
3. Il confine di visibilità tra dati pubblici e privati, e le regole di calcolo delle statistiche.
4. Il modello dei riconoscimenti e la gestione dei pari merito.

## Decisione

### 1. Sincronizzazione offline-first con coda persistente
- L'app iOS resta operativa in modo completamente indipendente dal backend: il salvataggio locale SwiftData avviene senza alcuna attesa di rete.
- Le modifiche operative generano elementi in una coda persistente locale di aggiornamenti da trasmettere.
- La trasmissione avviene via HTTPS con identificativi operativi univoci, conferme (ACK) e policy di ritrasmissione idempotente senza duplicazioni.
- Il backend riceve, convalida, riconcilia e pubblica gli aggiornamenti pubblici tramite SSE (Server-Sent Events) senza ricaricamento della pagina web.
- Dopo una disconnessione, la piattaforma garantisce il recupero dello stato completo coerente.

### 2. Gerarchia delle fonti con priorità prevalente sulla recenza
La riconciliazione dei dati di gara segue un ordine rigido a 4 livelli, in cui il livello superiore ha sempre precedenza rispetto al livello inferiore, indipendentemente dal timestamp di arrivo (la priorità prevale sulla recenza):

1. **Correzioni manuali dell'amministratore** (priorità massima).
2. **CSI o fonte esterna ufficiale** (omologazione risultati/referto ufficiale).
3. **CSI o fonte esterna ufficiosa** (risultati provvisori/non ancora omologati).
4. **App iOS privata** (dati operativi dal campo).

Regole di riconciliazione:
- La riconciliazione avviene **per singolo dato/campo**: i campi non forniti o non sovrascritti dalla fonte di grado superiore conservano il valore disponibile dalla fonte di grado inferiore.
- Ogni dato originale resta tracciabile nello storico del backend.
- Le correzioni amministrative non vengono sovrascritte automaticamente da successive sincronizzazioni o importazioni, e possono essere revocate solo esplicitamente dall'amministratore.
- Una correzione operativa eseguita nell'app iOS non costituisce un override amministrativo; ruoli e permessi saranno esplicitati nei contratti di sincronizzazione.

### 3. Integrazione CSI opzionale e condizionata
- L'acquisizione automatica da CSI/fonti esterne è opzionale: sarà implementata solo dopo averne accertato fattibilità tecnica, semplicità e affidabilità.
- Ciclo di polling mirato post-partita:
  - Primo controllo al termine della gara con attesa minima configurabile.
  - In assenza di risultato, tentativi controllati e distanziati.
  - Al riscontro di un risultato ufficioso, importazione e prosecuzione a intervalli regolari.
  - Al riscontro del risultato ufficiale, importazione definitiva e cessazione dei controlli automatici.
- Se l'integrazione automatica non è affidabile, la gestione ricade interamente sull'app iOS e sull'area amministrativa web.

### 4. Calcolo delle statistiche e riservatezza dei dati
- **Solo partite concluse**: le statistiche aggregate di squadra (partite, W/D/L, gol, differenza reti, andamento, posizione), dei giocatori e le classifiche interne considerano esclusivamente partite concluse.
- **Isolamento del LIVE**: durante la gara, il flusso LIVE aggiorna risultato ed eventi nel dettaglio partita e nella Home pubblica, ma non altera in alcun modo le statistiche aggregate.
- **Ricalcolo reattivo**: alla conclusione della partita e a seguito di ogni correzione o importazione prevalente, le statistiche aggregate interessate vengono ricalcolate.
- **Riservatezza dei dati**:
  - *Dati pubblici*: dettaglio dei singoli gol (inclusi marcatore, minuto, tempo e assistman del gol).
  - *Dati rigorosamente privati (esclusi dalla piattaforma pubblica)*: minutaggi complessivi individuali, assist totali aggregati, medie assist e classifiche assistman.

### 5. Riconoscimenti unificati e pari merito
- POTM (Player of the Match) e Player of the Month derivano dal sistema unificato di votazioni.
- Il modello ammette esplicitamente più vincitori per il medesimo riconoscimento in caso di parità di voti (pari merito).
- Ogni vincitore condiviso riceve l'attribuzione completa del riconoscimento (+1) nelle proprie statistiche e lo storico conserva la condivisione del premio.

## Conseguenze

- L'app iOS non dipende dal backend per il proprio ciclo vitale e non blocca l'utente in assenza di connettività.
- I payload e le strutture dati di sincronizzazione dovranno essere progettati senza alterare lo schema SwiftData V3 locale prima della definizione del piano di migrazione.
- Il backend diventa l'unico custode della gerarchia delle fonti e della maschera di proiezione pubblica (Public DTO).
- I dettagli implementativi dei contratti di sincronizzazione, dell'autenticazione, dei payload e dello schema della coda restano da progettare.

## Alternative considerate

- **Last-Write-Wins (LWW) su base temporale**: scartato poiché una sincronizzazione ritardata dell'app iOS o una correzione ufficiosa successiva non deve poter sovrascrivere un'omologazione ufficiale o una correzione manuale dello staff.
- **Ricalcolo continuo delle statistiche in LIVE**: scartato per evitare fluttuazioni su gare in corso, carichi computazionali inutili e discrepanze in caso di rettifiche durante la partita.
- **Vincitore singolo forzato (es. sorteggio o criterio arbitrario)**: scartato per conformità con le decisioni di prodotto sulle votazioni che ammettono pari merito con pieno valore statistico per tutti i vincitori.

## Verifica

Le decisioni sono state approvate il 27 ottobre 2026. L'implementazione dei contratti e dei componenti avverrà per gradi, partendo dalla documentazione e preservando integralmente la suite di test C3.3.
