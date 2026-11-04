-- C2 vertical slice: match result and goal/card events.
-- Additive only: existing matches/audit tables are unchanged.

CREATE TABLE match_results (
  match_id uuid PRIMARY KEY REFERENCES matches(id) ON DELETE RESTRICT,
  team_score smallint NOT NULL,
  opponent_score smallint NOT NULL,
  source_kind varchar(32) NOT NULL DEFAULT 'admin_entry',
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_results_team_score_valid CHECK (team_score BETWEEN 0 AND 99),
  CONSTRAINT match_results_opponent_score_valid CHECK (opponent_score BETWEEN 0 AND 99),
  CONSTRAINT match_results_source_kind_valid CHECK (source_kind IN ('admin_entry'))
);

CREATE TABLE match_events (
  id uuid PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
  kind varchar(16) NOT NULL,
  team_side varchar(10) NOT NULL,
  period smallint NOT NULL,
  minute smallint NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  assist_player_id uuid REFERENCES players(id) ON DELETE RESTRICT,
  client_event_id varchar(128),
  source_kind varchar(32) NOT NULL DEFAULT 'admin_entry',
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_events_kind_valid CHECK (kind IN ('goal', 'yellow_card', 'red_card')),
  CONSTRAINT match_events_team_side_valid CHECK (team_side IN ('team', 'opponent')),
  CONSTRAINT match_events_period_valid CHECK (period IN (1, 2)),
  CONSTRAINT match_events_minute_valid CHECK (minute BETWEEN 1 AND 120),
  CONSTRAINT match_events_source_kind_valid CHECK (source_kind IN ('admin_entry')),
  CONSTRAINT match_events_team_event_has_player CHECK (
    (team_side = 'team' AND player_id IS NOT NULL)
    OR (team_side = 'opponent' AND player_id IS NULL)
  ),
  CONSTRAINT match_events_assist_is_team_goal CHECK (
    assist_player_id IS NULL
    OR (kind = 'goal' AND team_side = 'team')
  ),
  CONSTRAINT match_events_assist_differs_from_scorer CHECK (
    assist_player_id IS NULL OR assist_player_id <> player_id
  )
);

CREATE INDEX match_events_match_order_idx
  ON match_events (match_id, period, minute, created_at, id);

CREATE UNIQUE INDEX match_events_client_event_idx
  ON match_events (match_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
