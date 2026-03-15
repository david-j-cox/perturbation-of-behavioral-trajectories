-- 001_create_tables.sql
-- Core tables for the concurrent operants experiment

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id text NOT NULL,
  experiment_id text NOT NULL,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','reserved','active','completed','abandoned','expired','cancelled')),
  completed boolean DEFAULT false,
  is_test boolean DEFAULT false,
  debug_mode boolean DEFAULT false,
  app_version text,
  rng_seed text,
  user_agent text,
  screen_width integer,
  screen_height integer,
  timezone text,
  metadata_json jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE order_assignments (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL UNIQUE REFERENCES sessions(id),
  participant_id text NOT NULL,
  experiment_id text NOT NULL,
  assigned_order text NOT NULL
    CHECK (assigned_order IN ('BCD','BDC','CBD','CDB','DBC','DCB')),
  assignment_status text NOT NULL DEFAULT 'reserved'
    CHECK (assignment_status IN ('reserved','active','completed','released','expired','cancelled')),
  reservation_expires_at timestamptz NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  manual_override boolean DEFAULT false,
  candidate_orders_json jsonb DEFAULT '[]'::jsonb,
  assignment_metadata_json jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE event_log (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  participant_id text NOT NULL,
  experiment_id text NOT NULL,
  event_type text NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  client_timestamp_ms double precision,
  phase_label text,
  phase_index integer,
  key text,
  side text,
  rt_ms double precision,
  points integer,
  schedule_value_ms double precision,
  was_baited boolean,
  cod_active boolean,
  lockout_active boolean,
  metadata_json jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE bin_log (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  participant_id text NOT NULL,
  experiment_id text NOT NULL,
  phase_label text NOT NULL,
  phase_index integer NOT NULL,
  bin_index integer NOT NULL,
  bin_start_ms double precision NOT NULL,
  bin_end_ms double precision NOT NULL,
  left_responses integer DEFAULT 0,
  right_responses integer DEFAULT 0,
  total_responses integer DEFAULT 0,
  left_reinforcers integer DEFAULT 0,
  right_reinforcers integer DEFAULT 0,
  left_allocation double precision,
  right_allocation double precision,
  metadata_json jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE phase_summary (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  participant_id text NOT NULL,
  experiment_id text NOT NULL,
  phase_label text NOT NULL,
  phase_index integer NOT NULL,
  phase_type text NOT NULL,
  perturbation_type text,
  start_time_ms double precision NOT NULL,
  end_time_ms double precision NOT NULL,
  duration_ms double precision NOT NULL,
  ended_by text NOT NULL,
  total_left_responses integer DEFAULT 0,
  total_right_responses integer DEFAULT 0,
  total_left_reinforcers integer DEFAULT 0,
  total_right_reinforcers integer DEFAULT 0,
  final_left_allocation double precision,
  steady_state_reached boolean DEFAULT false,
  steady_state_slope double precision,
  steady_state_sd double precision,
  preferred_key text,
  vi_left_ms double precision,
  vi_right_ms double precision,
  metadata_json jsonb DEFAULT '{}'::jsonb
);
