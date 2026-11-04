# myteam-platform — Documentazione di prodotto e handoff

**Aggiornato nella fonte:** 27 ottobre 2026. **Stato:** specifiche di prodotto approvate; lo stato di implementazione Web/API è riportato in [`../STATUS.md`](../STATUS.md).

Questo dossier raccoglie le specifiche di prodotto approvate, trasferite in questa repository il 28 ottobre 2026; le fonti originali restano nel repository separato del progetto app. Non confondere il progetto con altri servizi eventualmente ospitati sulla stessa infrastruttura.

## Indice

- [PUBLIC-WEB.md](PUBLIC-WEB.md) — Home, partite, LIVE, rosa, statistiche, sondaggi, Instagram, sponsor e PWA.
- [ADMIN-WEB.md](ADMIN-WEB.md) — navigazione amministrativa definitiva a sei sezioni, Panoramica operativa e sezione Partite unificata.
- [IOS-INTEGRATION.md](IOS-INTEGRATION.md) — app iOS esistente, stato C3.3 e requisiti offline-first.
- [BACKEND-DATA.md](BACKEND-DATA.md) — dati condivisi, differenza tra inserimento/override, sincronizzazione e provider.
- [ACCESS-DEPLOYMENT.md](ACCESS-DEPLOYMENT.md) — Logto, Cloudflare Access, K3s e gestione operativa.
- [MVP-HANDOFF.md](MVP-HANDOFF.md) — primo MVP, **roadmap approvata a quattro fasi**, modalità operativa multi-agente/parallela, checkpoint visibili, decisioni aperte e handoff.

## Fonti autorevoli e precedenza

- **Perimetro di questo branch Web+API:** `apps/ios/` e i documenti di importazione/migrazione iOS non sono inclusi. Le specifiche iOS e gli ADR condivisi restano requisiti/documentazione di riferimento; l’implementazione iOS non è parte di questo candidato.
- **Gerarchia delle fonti e sincronizzazione:** [ADR-0008, snapshot di riferimento](../decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md). Gli ADR iOS pertinenti sono conservati in `../decisions/ios/`; sono copie, non l'autorità per implementazioni iOS.
- **Procedure di deployment reali:** runbook operativi dell'infrastruttura dell'owner, non pubblicati in questo repository. Questo dossier documenta requisiti, non sostituisce runbook o configurazione applicata.
- **Convenzioni di sviluppo:** standard di ingegneria del workspace dell'owner, non incluso in questo repository; per il codice qui valgono `AGENTS.md` e i documenti di progetto.

Usare sempre APPROVATO per decisioni, PROPOSTO per ipotesi da scegliere, DA VERIFICARE per fattibilità sconosciuta e IMPLEMENTATO/TESTATO solo per stato tecnico accertato. Il backend, la PWA e la sincronizzazione non sono implementati soltanto perché sono approvati.

## Principi APPROVATI

Una squadra per installazione, branding personalizzabile (MAPI GROUP primo caso); web responsive e PWA sono **un solo frontend**. App iOS privata funzionante offline e backend per dati condivisi/pubblicati. Accesso libero al sito pubblico e ai voti, più amministratori Logto con unico ruolo admin. Priorità delle fonti per singolo campo indipendente dalla recenza; override admin esplicito in cima. MVP funzionante presto con base duratura; integrazioni CSI solo se facilmente fattibili.

## Agenti

Leggere la specifica pertinente, gli ADR e lo stato reale prima di lavorare. Niente modifiche simultanee allo stesso file; niente reorg Git, remote, migrazione SwiftData o mutazione infra fuori da un incarico specifico. Ogni report deve separare approvato, implementato e testato.
