# AURINFORMATC — Istruzioni per gli agenti

Questa è la guida operativa specifica per l'app **MAPI GROUP Match Manager**. Le regole generali non sono ridefinite qui: la fonte autorevole è il repository fratello `../../development-environment/`.

## Lettura iniziale

Per un'attività non banale consulta:

1. `../../development-environment/AGENTS.md` e i documenti normativi applicabili in `docs/engineering/` e `docs/environment/`;
2. `docs/ARCHITECTURE.md` e `docs/STATUS.md`;
3. `docs/FEATURES.md` per lo stato funzionale e i requisiti ancora pianificati;
4. gli ADR attivi in `docs/decisions/`;
5. `docs/TESTING.md` per comandi e limiti di verifica.

Il workflow operativo corrente è descritto in `docs/WORKFLOW.md`.

## Confini e manutenzione

- Il progetto è attualmente un'app iOS SwiftUI locale. L'architettura corrente e i confini proposti sono descritti in `docs/ARCHITECTURE.md`; non assumere una migrazione web, un backend o un servizio cloud.
- Modifica solo lo scope necessario. Mantieni l'interfaccia e gli asset esistenti quando la richiesta non richiede esplicitamente un cambiamento visivo.
- La compatibilità con le chiavi e i payload JSON locali esistenti è un vincolo fino a una migrazione pianificata, testata e recuperabile; vedi ADR-0002.
- Le vecchie istruzioni “niente Git”, “niente refactoring” e “niente database” non sono regole permanenti. Applica gli standard generali con proporzionalità e decisioni documentate.
- Git è locale alla root `AURINFORMATC/`; non esiste un remote configurato. Non aggiungere remote, fare push o pubblicare senza esplicita richiesta.
- A0 non ha modificato intenzionalmente il codice funzionale, l'interfaccia o gli asset. Il lavoro successivo deve comunque verificare il proprio diff e validare ogni cambiamento.

## Xcode e test

- Progetto: `APP.xcodeproj`; scheme condiviso: `APP`.
- Target app: `APP`; target XCTest: `APPTests`.
- Comandi riproducibili e limiti dell'ambiente: `docs/TESTING.md`.
- Distinguere sempre build, compilazione dei test, esecuzione dei test e verifica visiva/funzionale.
