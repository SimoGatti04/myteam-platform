# Integrations workspace

Provider adapters for `myteam-platform`. Adapters submit source-attributed inputs through Core domain services; they never write public projections directly.

## CSI-S2 prototype (research, not wired)

`src/` contains a self-contained, dependency-free prototype of the CSI
acquisition pipeline:

- `security/`, `acquire/` — URL allowlist, DNS/private-IP guard, timeouts, size
  caps, redirect re-validation, retry/backoff, rate limiting, single-flight,
  in-memory cache.
- `html/` — tolerant tokenizer, tree builder and CSS-subset selector engine.
- `csi/` — declarative extraction profile, parser, snapshot digest, diff,
  team matching, import plan, pipeline orchestration.
- `contracts/admin-csi.ts` — proposed admin API shapes (documentation only).
- `sql/proposed-csi-s2.sql` — proposed migration, **not applied**.

It is intentionally **not** part of the pnpm workspace yet: `pnpm-workspace.yaml`
is Core-owned. Run it directly:

```sh
node --import tsx --test packages/integrations/test/*.test.ts
node_modules/.bin/tsc -p packages/integrations/tsconfig.test.json
```

Live acquisition is **not** enabled or verified: the CSI Live portal answers
with a Cloudflare managed challenge, and no authorised API/export exists. The
parser is calibrated on synthetic fixtures whose markup is a documented,
provisional contract (`CSI_PROFILE_V0`), not on a captured live page.

See `docs/spikes/csi-s2-scraper.md` for the full feasibility report.
