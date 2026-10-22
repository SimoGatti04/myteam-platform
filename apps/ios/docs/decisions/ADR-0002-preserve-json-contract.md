# ADR-0002 — Preservare i contratti JSON locali durante il consolidamento

- **Stato:** ACCETTATO — 22 ottobre 2026
- **Ambito:** rosa, calendario, storico e futura sessione live

## Contesto

L'app salva tre array Codable nelle preferenze standard con le chiavi `FutsalRosterV1`, `FutsalScheduleV1` e `FutsalMatchHistoryV1`. I dati reali del dispositivo non sono disponibili nel repository; i test A0 coprono solo alcuni payload sintetici. Il codice corrente ignora con `try?` gli errori di encoding/decoding. La partita live non è persistita integralmente.

## Decisione

A0 non rinomina né elimina le chiavi V1, non migra i dati e non sostituisce la tecnologia di persistenza. Qualunque cambiamento futuro deve conservare lettura dei payload esistenti, rendere espliciti gli errori e fornire una strategia verificata di backup/rollback prima di una scrittura irreversibile. Una sessione live futura deve usare un formato esplicito/versionato e non alterare i payload storici.

La soluzione da valutare per prima è un adapter locale con JSON Codable e semantica di scrittura/recupero più affidabile. UserDefaults può rimanere per preferenze piccole. SQLite o SwiftData sono candidati condizionali, non una decisione anticipata.

## Alternative considerate

- Continuare a usare `UserDefaults` senza protezioni: minimo cambiamento ma gli errori restano silenziosi e il live non si recupera.
- JSON file con write atomico, diagnostica e copie recuperabili: evoluzione locale proporzionata da valutare dopo test/fixture.
- SQLite/Core Data/SwiftData: utile se query, volume, transazioni o relazioni lo richiedono; introduce schema/migrazione e rischio non giustificati solo dalla possibile crescita futura.
- Cloud/backend: non autorizzato né richiesto in A0.

## Conseguenze

- Le chiavi e la forma Codable esistenti sono contratti locali finché esistono dati utente che dipendono da essi.
- La retrocompatibilità verificata resta parziale: `RosterPlayer`, `MatchPlayer` e alcuni campi opzionali di `MatchRecord` hanno characterization test sintetici; i payload effettivi dell'utente non sono stati letti.
- Una futura migrazione deve testare fixture legacy, nuovo round-trip, guasto durante scrittura e recupero su una copia, prima di cambiare source of truth.
- La sessione live e la semantica di background/riavvio vanno progettate insieme, senza assumere automaticamente che il clock continui o si fermi quando l'app è sospesa.

## Evidenza

`ContentView.swift` definisce le tre chiavi e funzioni save/load JSON con `try?`; `onAppear` carica solo rosa, storico e calendario. Vedi `BASELINE_AUDIT.md` e `TESTING.md`.
