# Workflow operativo — AURINFORMATC

## Fonte delle convenzioni

Le regole generali di engineering e dell'ambiente sono definite in `../../development-environment/`. Per attività non banali leggere l'entry point del repository, l'AGENTS di AURINFORMATC, l'architettura, lo stato, gli ADR pertinenti e i documenti normativi applicabili. AURINFORMATC non replica né modifica le convenzioni globali.

## Flusso esecutivo corrente

Al 22 ottobre 2026 **Codex Supervisor non è operativo**. Il flusso praticabile è:

```text
ChatGPT supervisore
    → prepara scope, criteri e prompt indirizzato all'esecutore
    → l'utente inoltra il prompt a Codex esecutore
    → Codex ispeziona, modifica, verifica e restituisce un rapporto
    → ChatGPT supervisore confronta il rapporto con i file reali tramite Local Workspace/GitHub quando disponibili
    → aggiorna la fonte di verità e definisce il checkpoint successivo
```

L'utente trasporta il prompt e il rapporto; la scomposizione tecnica, l'interpretazione, l'integrazione e la verifica restano responsabilità del supervisore. Se gli strumenti di verifica non sono disponibili, il rapporto deve dichiarare il limite senza presentare il controllo come eseguito.

Non presupporre automazione, delega automatica o presenza di un connettore. Il workflow potrà essere aggiornato quando Supervisor sarà nuovamente disponibile.

## Ciclo di lavoro

1. **Preflight:** controllare `git status`, branch, file non tracciati/ignorati, progetto Xcode, documentazione e artefatti locali prima di operazioni.
2. **Definizione:** separare requisito da soluzione, fissare file autorizzati, invarianti, esclusioni, rischi e criteri di accettazione. Per dati persistiti pianificare compatibilità e recupero.
3. **Implementazione incrementale:** modifiche coese e minimali; preservare UX e dati salvo scope esplicito. Non iniziare un refactoring generale per accompagnare una modifica locale.
4. **Verifica:** eseguire prima i test mirati, poi build/test più ampi e verifica visiva quando pertinente. Registrare i comandi e classificare ogni verifica come PASS, FAIL, SKIPPED, NOT RUN o UNAVAILABLE.
5. **Review:** ispezionare diff, stato Git, asset, dati/runtime, segreti, documentazione e file fuori scope. Non usare reset/clean o riallineamenti distruttivi per ottenere uno stato pulito.
6. **Handoff:** riportare file modificati, decisioni, prove, limiti, rischio residuo, commit locali e prossimo checkpoint.

## Git e recupero

La root Git locale è `AURINFORMATC/`; la baseline corrente è stata registrata nel commit `4dd2b3b`. Il repository non ha remote. Un commit locale è recupero per il codice tracciato, non per i valori `UserDefaults` del dispositivo. `backups/` è esclusa da Git e non va cancellata o trattata come copia identica della baseline.

Non configurare remote, fare push o pubblicare senza richiesta esplicita. Non cancellare backup, stato utente o artefatti di proprietà incerta. Per ogni nuovo lavoro: commit semanticamente coesi sono preferibili quando la verifica è completata e il diff è revisionato.

## Comandi comuni

Build e build del target test sono in `README.md`; strategia e stato dei test in `TESTING.md`. La compilazione generica non sostituisce l'avvio nel simulatore, la prova visuale né il collaudo di un dispositivo.
