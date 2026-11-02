# ADR-0001 — Monolite modulare nello stesso target Xcode

- **Stato:** ACCETTATO — 22 ottobre 2026
- **Ambito:** presa in carico tecnica A0 e prossime estrazioni interne

## Contesto

L'app è un prodotto locale iOS SwiftUI di una squadra, con un solo lifecycle e senza backend o consumers indipendenti. Gran parte dell'implementazione è in `ContentView.swift` (10.737 righe), rendendo logica deterministica e UI difficili da testare separatamente. È possibile una futura PWA, ma non è stata scelta.

## Decisione

Mantenere un'app e un repository locali, con confini modulari coesivi nel target `APP`. Estrarre codice gradualmente per dominio/comportamento quando la testabilità o l'ownership migliora; mantenere le regole MAPI/futsal distinte da funzioni generiche. Nessun package separato, framework cross-platform, backend o servizio viene introdotto in A0.

## Alternative considerate

- Lasciare permanentemente tutto in `ContentView.swift`: nessun costo immediato, ma i test significativi rimangono difficili e aumenta il rischio di accoppiamento.
- Suddividere in molti package/framework: confini più rigidi, ma oggi un solo consumer e più overhead Xcode, API e versioning.
- Servizi indipendenti/backend: nessun requisito di deployment/scaling/ownership indipendente che lo giustifichi.
- Migrazione a React/TypeScript o React Native: piattaforma futura non decisa e fuori scope.

## Conseguenze

- Inizialmente i moduli condividono processo, target e ciclo di rilascio iOS; una cartella da sola non è considerata modulo.
- Si possono aggiungere test allo stesso progetto senza separare i modelli come package.
- Le logiche pure sono candidati portabili concettualmente, ma non si presume compatibilità di codice Swift con PWA.
- La decisione va riesaminata se esistono un secondo consumer reale o un ciclo di rilascio/deploy separato.

## Evidenza

La configurazione locale ha un target app, un target test aggiunto in A0, nessuna dipendenza esterna o servizio e un file principale monolitico. A0 ha soltanto preparato test/build e documentazione; non ha eseguito la modularizzazione produttiva.
