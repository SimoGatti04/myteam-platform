CREATE TABLE seasons (
  id uuid PRIMARY KEY,
  label varchar(80) NOT NULL UNIQUE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seasons_dates_valid CHECK (ends_on >= starts_on)
);

CREATE TABLE team_profile (
  id smallint PRIMARY KEY CHECK (id = 1),
  name varchar(120),
  crest_url text,
  primary_color char(7),
  secondary_color char(7),
  current_season_id uuid REFERENCES seasons(id) ON DELETE RESTRICT,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_profile_primary_color_valid CHECK (primary_color IS NULL OR primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT team_profile_secondary_color_valid CHECK (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE players (
  id uuid PRIMARY KEY,
  display_name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE season_roster_memberships (
  id uuid PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  jersey_number smallint,
  active_from date NOT NULL,
  active_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT roster_membership_jersey_valid CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 99),
  CONSTRAINT roster_membership_dates_valid CHECK (active_until IS NULL OR active_until >= active_from)
);
CREATE INDEX season_roster_memberships_public_idx
  ON season_roster_memberships (season_id, active_until, active_from);
CREATE INDEX season_roster_memberships_player_idx
  ON season_roster_memberships (player_id, season_id, active_from);

CREATE TABLE opponents (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE competitions (
  id uuid PRIMARY KEY,
  name varchar(120) NOT NULL,
  category varchar(20) NOT NULL,
  is_official boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competitions_category_valid CHECK (category IN ('league', 'cup', 'tournament', 'friendly', 'other'))
);

CREATE TABLE matches (
  id uuid PRIMARY KEY,
  season_id uuid NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
  opponent_id uuid NOT NULL REFERENCES opponents(id) ON DELETE RESTRICT,
  competition_id uuid REFERENCES competitions(id) ON DELETE RESTRICT,
  is_official boolean NOT NULL,
  scheduled_at timestamptz,
  status varchar(24) NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_status_valid CHECK (status IN ('scheduled', 'to_be_scheduled', 'postponed', 'cancelled', 'completed')),
  CONSTRAINT scheduled_match_requires_date CHECK (status <> 'scheduled' OR scheduled_at IS NOT NULL),
  CONSTRAINT tbd_match_has_no_date CHECK (status <> 'to_be_scheduled' OR scheduled_at IS NULL)
);
CREATE INDEX matches_public_schedule_idx
  ON matches (published_at, scheduled_at, id);
CREATE INDEX matches_season_idx ON matches (season_id, scheduled_at, id);

CREATE TABLE match_schedule_history (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
  scheduled_at timestamptz,
  status varchar(24) NOT NULL,
  source_kind varchar(32) NOT NULL,
  actor_subject text NOT NULL,
  reason varchar(500),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_schedule_history_status_valid CHECK (status IN ('scheduled', 'to_be_scheduled', 'postponed', 'cancelled', 'completed'))
);
CREATE INDEX match_schedule_history_match_idx
  ON match_schedule_history (match_id, recorded_at, id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  entity_type varchar(40) NOT NULL,
  -- IDs are UUIDs except for the singleton team aggregate ("1").
  entity_id text NOT NULL,
  operation varchar(40) NOT NULL,
  source_kind varchar(32) NOT NULL,
  actor_subject text NOT NULL,
  reason varchar(500),
  changes jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_source_kind_valid CHECK (source_kind IN ('admin_entry', 'admin_correction', 'external_official', 'external_unofficial', 'ios'))
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, recorded_at, id);
