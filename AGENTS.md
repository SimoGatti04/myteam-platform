# myteam-platform — Agent entry point

Leggere questo file, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/TESTING.md`, `docs/platform/README.md` e gli ADR attivi pertinenti prima di modificare il progetto. Le convenzioni generali sono in `SimoGatti04/development-environment`; consultare i documenti specialistici applicabili.

## Ownership dei moduli

- **Core:** `apps/api/`, `packages/contracts/`, configurazione condivisa, architettura e decisioni.
- **Web:** `apps/web/`.
- **QA:** `tests/`.
- **Integrations:** `packages/integrations/`.

Non modificare file di un altro modulo-agente senza coordinamento. Le modifiche ai contratti condivisi richiedono aggiornamento coordinato di API, consumer e test. Un elenco `AGENTS.md` locale può precisare i confini.

## Regole di progetto

- I documenti in `docs/platform/` distinguono decisioni APPROVATE da ipotesi PROPOSTE, punti DA VERIFICARE e stato IMPLEMENTATO/TESTATO. Non trasformare requisiti approvati in affermazioni di implementazione.
- Gli ADR in `docs/decisions/ios/` sono snapshot di riferimento: l'implementazione e lo stato iOS restano nel repository separato AURINFORMATC.
- Il backend è una base condivisa e durevole per ingressi admin, futura app iOS e provider; non introdurre persistence temporanea da sostituire.
- Nessuna mutazione dell'infrastruttura K3s o del repository `infra/` in questo incarico.
- Non aggiungere segreti al repository; usare `.env.example` solo con valori non sensibili.

## Comandi canonici

- `pnpm dev` — API in ascolto in locale.
- `pnpm check` — build, typecheck e test.
- `pnpm test` — suite automatica locale.

Aggiornare `docs/STATUS.md` con stato verificato e prossimo gate. Preservare ogni modifica esistente e non usare riallineamenti Git distruttivi.
