-- 005_create_rpc_helpers.sql
-- Helper RPC functions for assignment lifecycle management.
--
-- All functions are SECURITY DEFINER so they run with owner privileges
-- regardless of the calling role.  This means the anon key can invoke
-- them via supabase.rpc() without needing direct table policies on
-- order_assignments.

-- -----------------------------------------------------------------
-- activate_assignment
-- Transitions:  reserved -> active
-- Guards:       only fires if the current status is 'reserved'.
--               Returns the number of rows actually updated so the
--               caller can detect no-ops (e.g. double-call).
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION activate_assignment(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE order_assignments
  SET assignment_status = 'active',
      activated_at = now()
  WHERE session_id = p_session_id
    AND assignment_status = 'reserved';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE sessions
    SET status = 'active'
    WHERE id = p_session_id
      AND status = 'reserved';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows
  );
END;
$$;

-- -----------------------------------------------------------------
-- complete_assignment
-- Transitions:  reserved | active -> completed
-- Guards:       will NOT override expired / cancelled sessions.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_assignment(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE order_assignments
  SET assignment_status = 'completed',
      completed_at = now()
  WHERE session_id = p_session_id
    AND assignment_status IN ('reserved', 'active');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE sessions
    SET status = 'completed',
        completed = true,
        ended_at = now()
    WHERE id = p_session_id
      AND status IN ('created', 'reserved', 'active');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows
  );
END;
$$;

-- -----------------------------------------------------------------
-- abandon_assignment
-- Transitions:  reserved | active -> abandoned
-- Use when the participant explicitly quits, or when the server
-- detects a disconnect before meaningful task start.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION abandon_assignment(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE order_assignments
  SET assignment_status = 'released',
      released_at = now()
  WHERE session_id = p_session_id
    AND assignment_status IN ('reserved', 'active');
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE sessions
    SET status = 'abandoned',
        ended_at = now()
    WHERE id = p_session_id
      AND status IN ('created', 'reserved', 'active');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'rows_updated', v_rows
  );
END;
$$;

-- -----------------------------------------------------------------
-- expire_stale_reservations
-- Bulk-expire all reservations past their deadline.
-- Uses a CTE with RETURNING to scope the companion session UPDATE
-- to exactly the rows touched in this call.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_stale_reservations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH newly_expired AS (
    UPDATE order_assignments
    SET assignment_status = 'expired',
        released_at = now()
    WHERE assignment_status = 'reserved'
      AND reservation_expires_at < now()
    RETURNING session_id
  )
  UPDATE sessions
  SET status = 'expired'
  WHERE id IN (SELECT session_id FROM newly_expired)
    AND status = 'reserved';

  -- Count how many assignments were expired.
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'expired_count', v_count
  );
END;
$$;

-- -----------------------------------------------------------------
-- get_order_counts
-- Returns a row per order with counts broken out by status.
-- Only counts non-test (production) sessions.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_order_counts()
RETURNS TABLE (
  assigned_order text,
  reserved_count bigint,
  active_count bigint,
  completed_count bigint,
  expired_count bigint,
  cancelled_count bigint,
  total_production bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH all_orders AS (
    SELECT unnest(ARRAY['BCD','BDC','CBD','CDB','DBC','DCB']) AS assigned_order
  )
  SELECT
    ao.assigned_order,
    COUNT(*) FILTER (WHERE oa.assignment_status = 'reserved'  AND s.is_test = false),
    COUNT(*) FILTER (WHERE oa.assignment_status = 'active'    AND s.is_test = false),
    COUNT(*) FILTER (WHERE oa.assignment_status = 'completed' AND s.is_test = false),
    COUNT(*) FILTER (WHERE oa.assignment_status = 'expired'   AND s.is_test = false),
    COUNT(*) FILTER (WHERE oa.assignment_status = 'cancelled' AND s.is_test = false),
    COUNT(*) FILTER (WHERE oa.assignment_status IN ('reserved','active','completed') AND s.is_test = false)
  FROM all_orders ao
  LEFT JOIN order_assignments oa ON oa.assigned_order = ao.assigned_order
  LEFT JOIN sessions s ON s.id = oa.session_id
  GROUP BY ao.assigned_order
  ORDER BY ao.assigned_order;
$$;
