# myteam-platform — Documentazione di prodotto e handoff

**Aggiornato nella fonte:** 27 ottobre 2026. **Stato:** specifiche di prodotto approvate; web/backend non ancora implementati al momento della stesura.

Questo dossier è una copia iniziale trasferita il 28 ottobre 2026 dalla working copy `AURINFORMATC/docs/platform/`; gli originali sono stati lasciati intatti. La fonte locale aveva modifiche e nuovi documenti non ancora committati. Non confondere il progetto con **MyTeam Video**, progetto e servizio K3s separati.

## Indice

- [PUBLIC-WEB.md](PUBLIC-WEB.md) — Home, partite, LIVE, rosa, statistiche, sondaggi, Instagram, sponsor e PWA.
- [ADMIN-WEB.md](ADMIN-WEB.md) — navigazione amministrativa definitiva a sei sezioni, Panoramica operativa e sezione Partite unificata.
- [IOS-INTEGRATION.md](IOS-INTEGRATION.md) — app iOS esistente, stato C3.3 e requisiti offline-first.
- [BACKEND-DATA.md](BACKEND-DATA.md) — dati condivisi, differenza tra inserimento/override, sincronizzazione e provider.
- [ACCESS-DEPLOYMENT.md](ACCESS-DEPLOYMENT.md) — Logto, Cloudflare Access, K3s e gestione operativa.
- [MVP-HANDOFF.md](MVP-HANDOFF.md) — primo MVP, **roadmap approvata a quattro fasi**, modalità operativa multi-agente/parallela, checkpoint visibili, decisioni aperte e handoff.

## Fonti autorevoli e precedenza

- **Codice e stato iOS correnti:** restano nella repository sorella `../AURINFORMATC`, nei file `app/docs/ARCHITECTURE.md`, `app/docs/STATUS.md` e `app/docs/TESTING.md`. Non sono stati copiati; questa repository non dichiara lo stato iOS corrente.
- **Gerarchia delle fonti e sincronizzazione:** [ADR-0008, snapshot di riferimento](../decisions/ios/ADR-0008-platform-sync-and-source-hierarchy.md). Gli ADR iOS pertinenti sono conservati in `../decisions/ios/`; sono copie, non l'autorità per implementazioni iOS.
- **Procedure di deployment reali:** repository separato `infra/` e relativi runbook. Questo dossier documenta requisiti, non sostituisce runbook o configurazione applicata; nessuna configurazione infra è stata copiata o modificata.
- **Convenzioni di sviluppo:** repository `SimoGatti04/development-environment` (`AGENTS.md` e documenti specialistici pertinenti).

Usare sempre APPROVATO per decisioni, PROPOSTO per ipotesi da scegliere, DA VERIFICARE per fattibilità sconosciuta e IMPLEMENTATO/TESTATO solo per stato tecnico accertato. Il backend, la PWA e la sincronizzazione non sono implementati soltanto perché sono approvati.

## Principi APPROVATI

Una squadra per installazione, branding personalizzabile (MAPI GROUP primo caso); web responsive e PWA sono **un solo frontend**. App iOS privata funzionante offline e backend per dati condivisi/pubblicati. Accesso libero al sito pubblico e ai voti, più amministratori Logto con unico ruolo admin. Priorità delle fonti per singolo campo indipendente dalla recenza; override admin esplicito in cima. MVP funzionante presto con base duratura; integrazioni CSI solo se facilmente fattibili.

## Agenti

Leggere la specifica pertinente, gli ADR e lo stato reale prima di lavorare. Niente modifiche simultanee allo stesso file; niente reorg Git, remote, migrazione SwiftData o mutazione infra fuori da un incarico specifico. Ogni report deve separare approvato, implementato e testato.
