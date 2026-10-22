# ADR-0003 — Tempo partita basato su riferimenti monotoni

- **Stato:** ACCETTATO — 22 ottobre 2026
- **Ambito:** motore temporale in-process e avvio della formazione in C2
- **Dipendenze:** C1; dettagli implementativi correnti in `../ARCHITECTURE.md`

## Contesto

Il timer precedente aggiungeva un secondo per callback `Timer.publish`, quindi callback omessi o ritardati potevano sottostimare il tempo. Anche i minuti individuali erano aggiornati per tick, e il primo avvio poteva precedere la conferma della formazione. Il comportamento di background, lock e terminazione doveva essere distinto: il requisito C2 conferma il conteggio durante background/lock, ma la sessione live non è persistita.

## Decisione

- Introdurre `MatchTiming` come componente interno al target, privo di SwiftUI e storage.
- In produzione misurare segmenti attivi con `ContinuousClock`; in test iniettare un clock controllabile. I tick UI sono solo refresh/sincronizzazioni e non costituiscono la fonte autorevole.
- Conservare fase, attività, durata per periodo/intervallo/timeout e registro dei partecipanti con nanosecondi accumulati. Il gioco attribuisce tempo solo al giocatore in campo mentre l'attività è `.playing`.
- Richiedere presenze/distinta confermate, formazione confermata e cinque giocatori effettivi in campo per il primo Play. La conferma e l'ingresso nella schermata live non avviano il tempo; pause/riprese successive non rivalutano il numero iniziale.
- Fermare l'accumulo ai limiti dei periodi; intervallo e secondo tempo richiedono le azioni esplicite già previste.
- Separare il countdown del timeout dal gioco. Se la squadra era in gioco, la scadenza esatta autorizza la ripresa; una sincronizzazione ritardata consuma il residuo post-timeout come gioco fino al limite del periodo. Il termine manuale riprende dal momento dell’azione. Se il timeout era iniziato durante una pausa, non riprende il gioco.
- Esporre `MatchTimingSnapshot` Codable come contratto minimo futuro: tempi e stato logico persistibili, partecipanti, configurazione e `capturedAt` wall-clock. L'anchor monotono non viene serializzato o riutilizzato.
- Non collegare il snapshot alla persistenza in C2. Restore, recovery e policy cold-start sono C3.

## Alternative considerate

1. **Incremento per tick:** semplice ma non misura tempo trascorso; già presente e causa del problema.
2. **Solo `Date` nel processo:** confrontabile e serializzabile ma soggetto a variazioni dell'orologio civile durante la misurazione live.
3. **`ContinuousClock` con anchor monotono:** scelto perché misura elapsed time nel processo indipendentemente dall'orologio civile e continua durante sleep del sistema; l'anchor non è un contratto durevole dopo il riavvio.
4. **Framework timer/background mode o impedire sospensione:** non necessario; il processo può essere sospeso senza callback e il motore riconcilia il tempo al successivo accesso.
5. **Persistere immediatamente la sessione / introdurre SwiftData o un backend:** fuori scope C2; richiede una policy di recovery e test di migrazione/errori, assegnati a C3.

## Conseguenze

- L'accumulo è indipendente dalla quantità di tick UI consegnati e può essere testato deterministicamente.
- Un callback ritardato che attraversa il termine di un periodo non genera automaticamente gioco nel periodo successivo.
- Una scadenza di timeout dopo cui la ripresa era già autorizzata accredita il tempo post-timeout effettivamente trascorso e applica i limiti del periodo. Una scadenza da pausa non avvia il gioco; il residuo oltre la fine di un periodo non avvia intervallo o periodo successivo.
- Il motore è pronto a essere serializzato, ma il cold-start non è recuperabile prima di C3.
- I modelli Codable storici, le chiavi UserDefaults V1, la UI e gli asset non richiedono migrazione.

## Verifica prevista/effettuata

La suite `MatchTimingTests` usa una sorgente finta controllabile e copre formazione, avvio esplicito, tempi individuali, cambi/rientri, pause, callback mancanti, background/lock simulati, timeout, intervallo, limiti dei periodi e round-trip Codable del snapshot. La compilazione e l'esecuzione effettiva sono registrate in `../TESTING.md`; i test con clock finto non sostituiscono una prova OS reale di background/lock e non dimostrano il ripristino dopo terminazione.
