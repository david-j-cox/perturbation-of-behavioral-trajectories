-- 006_enable_rls.sql
-- Row Level Security policies.
--
-- DESIGN PRINCIPLES
-- -----------------
-- 1. All RPC functions are SECURITY DEFINER and bypass RLS.
-- 2. The browser anon key may INSERT events/bins/phase-summaries
--    (write-only telemetry — no SELECT, no UPDATE, no DELETE).
-- 3. Session rows are created by anon INSERT.  All subsequent status
--    changes go through SECURITY DEFINER RPCs.  Anon cannot UPDATE or
--    DELETE sessions.
-- 4. order_assignments has NO anon policies — access is exclusively
--    through RPCs.
-- 5. participants is insert-only for anon.

ALTER TABLE participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bin_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE phase_summary      ENABLE ROW LEVEL SECURITY;

-- participants: anon can insert (upsert handled by ON CONFLICT in RPC)
CREATE POLICY participants_insert ON participants
  FOR INSERT TO anon
  WITH CHECK (true);

-- sessions: anon can insert new sessions only
CREATE POLICY sessions_insert ON sessions
  FOR INSERT TO anon
  WITH CHECK (true);

-- sessions: anon can read only their own session by id
-- (needed so the client can confirm the session was created)
CREATE POLICY sessions_select_own ON sessions
  FOR SELECT TO anon
  USING (true);
  -- NOTE: This allows anon to SELECT any session.  Session rows contain
  -- no secrets (no assignment details).  If you want tighter scoping,
  -- pass the session_id as a Supabase JWT claim and filter on it here.

-- order_assignments: NO anon policies.
-- All access goes through SECURITY DEFINER RPCs.

-- event_log: anon can insert (write-only telemetry)
CREATE POLICY event_log_insert ON event_log
  FOR INSERT TO anon
  WITH CHECK (true);

-- bin_log: anon can insert
CREATE POLICY bin_log_insert ON bin_log
  FOR INSERT TO anon
  WITH CHECK (true);

-- phase_summary: anon can insert
CREATE POLICY phase_summary_insert ON phase_summary
  FOR INSERT TO anon
  WITH CHECK (true);

-- Views and admin queries are accessible to authenticated / service role
GRANT SELECT ON active_order_counts TO authenticated;
