-- =============================================================================
-- PROPOSTA, NON APPLICATA.
-- Integrations / CSI-S2. Nessuna migrazione e' stata aggiunta a db/migrations/
-- e nessun ambiente e' stato modificato. La creazione effettiva richiede un
-- checkpoint Core coordinato (contratti + servizi di dominio + test).
--
-- Principi (ADR-0008):
--  * lo snapshot e' immutabile: e' la prova di cio' che la fonte pubblicava;
--  * la provenienza vive in integration_* e in audit_events, non in colonne
--    "provider" sparse su matches/competitions;
--  * un override amministrativo e' rappresentato dai record locali esistenti
--    e dalle binding confermate: l'importer non li sovrascrive;
--  * nessuna scrittura pubblica avviene senza una import batch confermata.
-- =============================================================================

CREATE TABLE integration_source (
  id uuid PRIMARY KEY,
  provider varchar(32) NOT NULL CHECK (provider IN ('csi')),
  slug varchar(41) NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL,
  config_revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE integration_source IS
  'Configurazione persistente della sorgente CSI (allowlist, timezone, limiti). Mai nello stato React.';

CREATE TABLE integration_competition_link (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES integration_source(id) ON DELETE RESTRICT,
  competition_id uuid NOT NULL REFERENCES competitions(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  season_segment varchar(8),
  region_slug varchar(64),
  committee_slug varchar(64),
  discipline_slug varchar(64),
  competition_segment varchar(32),
  group_label varchar(160),
  competition_url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_competition_link_url_unique UNIQUE (source_id, competition_url)
);

COMMENT ON TABLE integration_competition_link IS
  'Un girone/competizione CSI associato a una competizione e stagione locali. Piu'' link per installazione sono ammessi.';

CREATE INDEX integration_competition_link_season_idx
  ON integration_competition_link (season_id);

CREATE TABLE integration_snapshot (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES integration_source(id) ON DELETE RESTRICT,
  competition_link_id uuid NOT NULL REFERENCES integration_competition_link(id) ON DELETE RESTRICT,
  digest char(71) NOT NULL,
  fetched_at timestamptz NOT NULL,
  parser_profile varchar(64) NOT NULL,
  parser_version varchar(32) NOT NULL,
  standings_status varchar(16) NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_snapshot_digest_unique UNIQUE (competition_link_id, digest),
  CONSTRAINT integration_snapshot_digest_format CHECK (digest LIKE 'sha256:%')
);

COMMENT ON TABLE integration_snapshot IS
  'Snapshot immutabile del contenuto pubblicato. Nessun UPDATE/DELETE previsto: una nuova acquisizione crea una nuova riga.';

CREATE INDEX integration_snapshot_link_fetched_idx
  ON integration_snapshot (competition_link_id, fetched_at DESC);

CREATE TABLE integration_sync_run (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES integration_source(id) ON DELETE RESTRICT,
  competition_link_id uuid NOT NULL REFERENCES integration_competition_link(id) ON DELETE RESTRICT,
  snapshot_id uuid REFERENCES integration_snapshot(id) ON DELETE RESTRICT,
  previous_snapshot_id uuid REFERENCES integration_snapshot(id) ON DELETE RESTRICT,
  trigger_kind varchar(16) NOT NULL CHECK (trigger_kind IN ('manual', 'scheduled')),
  status varchar(16) NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'blocked')),
  error_code varchar(48),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE integration_sync_run IS
  'Esecuzione di sincronizzazione. Lo stato serve alla diagnostica admin; nessun job persistente esiste finche'' CSI-S3 non lo approva.';

-- Impedisce due sincronizzazioni concorrenti della stessa sorgente.
CREATE UNIQUE INDEX integration_sync_run_single_active
  ON integration_sync_run (source_id)
  WHERE status = 'running';

CREATE TABLE integration_team_binding (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES integration_source(id) ON DELETE RESTRICT,
  csi_team_id varchar(32) NOT NULL,
  local_kind varchar(16) NOT NULL CHECK (local_kind IN ('team_profile', 'opponent')),
  local_id text NOT NULL,
  confidence numeric(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_team_binding_unique UNIQUE (source_id, csi_team_id)
);

COMMENT ON TABLE integration_team_binding IS
  'Associazione confermata squadra CSI -> identita'' locale. Solo l''admin crea o modifica una binding: e'' il punto in cui si evita il duplicato avversario.';

CREATE TABLE integration_match_binding (
  id uuid PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES integration_source(id) ON DELETE RESTRICT,
  csi_match_id varchar(40) NOT NULL,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
  id_confidence varchar(16) NOT NULL CHECK (id_confidence IN ('observed', 'derived')),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_match_binding_unique UNIQUE (source_id, csi_match_id)
);

COMMENT ON TABLE integration_match_binding IS
  'Identita'' della gara attraverso rinvii e riprogrammazioni: il match_id locale resta lo stesso.';

CREATE TABLE integration_import_batch (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES integration_sync_run(id) ON DELETE RESTRICT,
  plan_digest char(71) NOT NULL,
  idempotency_key varchar(80) NOT NULL,
  applied_by text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL,
  CONSTRAINT integration_import_batch_idempotent UNIQUE (applied_by, idempotency_key)
);

COMMENT ON TABLE integration_import_batch IS
  'Conferma admin di un piano di import. La coppia (applied_by, idempotency_key) rende il replay sicuro.';
