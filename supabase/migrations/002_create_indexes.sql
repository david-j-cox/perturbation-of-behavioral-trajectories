-- 002_create_indexes.sql
-- Performance indexes for all query patterns

-- sessions
CREATE INDEX idx_sessions_participant_id ON sessions(participant_id);
CREATE INDEX idx_sessions_experiment_id ON sessions(experiment_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_is_test ON sessions(is_test);

-- order_assignments
CREATE INDEX idx_oa_session_id ON order_assignments(session_id);
CREATE INDEX idx_oa_participant_id ON order_assignments(participant_id);
CREATE INDEX idx_oa_experiment_id ON order_assignments(experiment_id);
CREATE INDEX idx_oa_assigned_order ON order_assignments(assigned_order);
CREATE INDEX idx_oa_assignment_status ON order_assignments(assignment_status);
CREATE INDEX idx_oa_reservation_expires ON order_assignments(reservation_expires_at);
CREATE INDEX idx_oa_status_order ON order_assignments(assignment_status, assigned_order);

-- event_log
CREATE INDEX idx_event_session_id ON event_log(session_id);
CREATE INDEX idx_event_type ON event_log(event_type);
CREATE INDEX idx_event_phase_label ON event_log(phase_label);
CREATE INDEX idx_event_session_timestamp ON event_log(session_id, event_timestamp);

-- bin_log
CREATE INDEX idx_bin_session_id ON bin_log(session_id);
CREATE INDEX idx_bin_session_phase_bin ON bin_log(session_id, phase_index, bin_index);

-- phase_summary
CREATE INDEX idx_phase_session_id ON phase_summary(session_id);
CREATE INDEX idx_phase_session_index ON phase_summary(session_id, phase_index);
