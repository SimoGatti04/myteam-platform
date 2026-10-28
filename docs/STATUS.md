# Stato — myteam-platform

**Aggiornato:** 28 ottobre 2026. **Checkpoint:** baseline C0 locale verificata; commit e primo push in corso. C0 non è l’MVP completo.

## Baseline C0

- Repo locale distinta: `/Users/gatti/Workspace/myteam-platform`; branch iniziale `main`; remote `git@github.com:SimoGatti04/myteam-platform.git`.
- **PASS:** prima del push, `git ls-remote` autenticato via SSH ha restituito zero ref; repo GitHub vuota al controllo del 28 ottobre 2026.
- **PASS:** copia del dossier `AURINFORMATC/docs/platform/` e snapshot di sette ADR iOS pertinenti; gli originali AURINFORMATC non sono stati modificati.
- **PASS:** Node.js 26.5.0, pnpm 10.32.1; installazione dipendenze con lockfile.
- **PASS:** `pnpm check` — build, typecheck e 3 test (3 PASS, 0 FAIL).
- **PASS:** smoke HTTP reale `GET http://127.0.0.1:3000/health` — HTTP 200 e contratto atteso.
- **PASS:** 23 link Markdown locali verificati, nessun target locale mancante.
- **NOT RUN:** CI GitHub Actions (workflow non configurato); database/integration test (non parte di C0); K3s/deploy (nessun contesto kubectl attivo verificato).

## Implementato

Workspace pnpm/TypeScript, API Fastify e pacchetto contratti TypeBox; `GET /health`; configurazione `HOST`/`PORT`; documentazione e ownership per Core, Web, QA e Integrations.

## Non incluso / non dichiarato completo

Autenticazione Logto, CRUD/API admin, database e migrazioni, API pubblica di prodotto, frontend, sync iOS, SSE/LIVE completo, provider CSI, votazioni, deployment o mutazioni K3s.

## Direzione tecnica proposta

TypeScript/Fastify per il monolite modulare. PostgreSQL è proposto come persistenza durevole del primo flusso; schema, migrazioni e verifica operativa vanno chiusi nel branch Core successivo, senza database transitorio.

## Prossimo gate

Su branch Core dedicato, implementare configurazione squadra → giocatore/rosa stagionale → partita → pubblicazione → lettura tramite proiezione API pubblica. Testare il comportamento persistente contro PostgreSQL. Non implementare sync iOS, LIVE completo, scraping CSI, votazioni o mutazioni K3s in questo gate.
