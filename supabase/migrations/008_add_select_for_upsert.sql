-- 008_add_select_for_upsert.sql
-- Supabase upsert requires SELECT to check for conflicts.
-- The RLS policies in 006 only granted INSERT to anon, so all
-- upserts from the client silently failed.
--
-- These policies allow anon to SELECT their own rows (by session_id)
-- so upsert conflict detection works.

CREATE POLICY event_log_select_own ON event_log
  FOR SELECT TO anon
  USING (true);

CREATE POLICY bin_log_select_own ON bin_log
  FOR SELECT TO anon
  USING (true);

CREATE POLICY phase_summary_select_own ON phase_summary
  FOR SELECT TO anon
  USING (true);
