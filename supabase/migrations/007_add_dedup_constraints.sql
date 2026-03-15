-- 007_add_dedup_constraints.sql
-- Prevent duplicate rows on flush retry (see TODO items S1, S2)

-- S1: Unique constraint on bin_log to deduplicate retried bin flushes
ALTER TABLE bin_log
  ADD CONSTRAINT uq_bin_log_session_phase_bin
  UNIQUE (session_id, phase_index, bin_index);

-- S2: Add a client-side sequence number to event_log for deduplication.
-- Multiple events can share the same (session_id, event_type, client_timestamp_ms)
-- when they fire in the same animation frame (e.g. multiple bin_closed events),
-- so a monotonic sequence number is the only safe dedup key.
ALTER TABLE event_log
  ADD COLUMN event_seq integer;

ALTER TABLE event_log
  ADD CONSTRAINT uq_event_log_session_seq
  UNIQUE (session_id, event_seq);

-- S1 companion: Unique constraint on phase_summary
ALTER TABLE phase_summary
  ADD CONSTRAINT uq_phase_summary_session_phase
  UNIQUE (session_id, phase_index);
