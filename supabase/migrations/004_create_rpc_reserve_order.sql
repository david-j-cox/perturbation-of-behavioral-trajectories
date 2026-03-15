-- 004_create_rpc_reserve_order.sql
-- Atomic counterbalanced order assignment with advisory lock.
--
-- CONCURRENCY MODEL
-- -----------------
-- Every call acquires a transaction-scoped advisory lock keyed on the
-- experiment_id.  This serialises all concurrent assignment attempts for
-- the same experiment, guaranteeing that the count query and the INSERT
-- see a consistent snapshot.  The lock is released automatically when the
-- transaction commits or rolls back.
--
-- IDEMPOTENCY
-- -----------
-- The session_id idempotency check is performed *inside* the locked
-- region so that two simultaneous calls with the same session_id cannot
-- both pass the check before the lock is held.
--
-- STALE-RESERVATION CLEANUP
-- -------------------------
-- Before computing counts the function expires any reservation whose
-- reservation_expires_at has passed.  The CTE captures exactly the
-- session_ids that were expired in *this* invocation so the companion
-- sessions UPDATE is precisely scoped.

CREATE OR REPLACE FUNCTION reserve_counterbalanced_order(
  p_participant_id text,
  p_session_id uuid,
  p_experiment_id text,
  p_manual_order text DEFAULT NULL,
  p_is_test boolean DEFAULT false,
  p_reservation_minutes integer DEFAULT 30,
  p_target_n integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_all_orders text[] := ARRAY['BCD','BDC','CBD','CDB','DBC','DCB'];
  v_counts jsonb;
  v_min_count integer;
  v_eligible_orders text[];
  v_chosen_order text;
  v_expires_at timestamptz;
  v_existing record;
  v_session_exists boolean;
BEGIN
  -- ---------------------------------------------------------------
  -- 1. Acquire advisory lock first — everything below is serialised.
  -- ---------------------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtext('order_assignment_' || p_experiment_id));

  -- ---------------------------------------------------------------
  -- 2. Idempotency check (inside the lock to prevent double-insert).
  -- ---------------------------------------------------------------
  SELECT * INTO v_existing
  FROM order_assignments
  WHERE session_id = p_session_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'assigned_order', v_existing.assigned_order,
      'already_assigned', true,
      'assignment_status', v_existing.assignment_status
    );
  END IF;

  -- ---------------------------------------------------------------
  -- 3. Verify the session row exists (FK guard).
  -- ---------------------------------------------------------------
  SELECT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id)
  INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session does not exist.  Create the session before requesting assignment.'
    );
  END IF;

  -- ---------------------------------------------------------------
  -- 4. Expire stale reservations (scoped via RETURNING).
  -- ---------------------------------------------------------------
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

  -- ---------------------------------------------------------------
  -- 5. Determine the order to assign.
  -- ---------------------------------------------------------------
  IF p_manual_order IS NOT NULL THEN
    -- Manual override — validate and use directly.
    IF NOT (p_manual_order = ANY(v_all_orders)) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'Invalid order: ' || p_manual_order
      );
    END IF;
    v_chosen_order  := p_manual_order;
    v_eligible_orders := ARRAY[p_manual_order];
  ELSE
    -- Compute per-order counts (production sessions only).
    WITH counts AS (
      SELECT oa.assigned_order, COUNT(*) AS cnt
      FROM order_assignments oa
      JOIN sessions s ON s.id = oa.session_id
      WHERE oa.assignment_status IN ('reserved', 'active', 'completed')
        AND s.is_test = false
      GROUP BY oa.assigned_order
    ),
    all_counts AS (
      SELECT unnest(v_all_orders) AS assigned_order
    )
    SELECT jsonb_object_agg(ac.assigned_order, COALESCE(c.cnt, 0))
    INTO v_counts
    FROM all_counts ac
    LEFT JOIN counts c ON c.assigned_order = ac.assigned_order;

    -- Find minimum count.
    SELECT MIN(value::integer) INTO v_min_count
    FROM jsonb_each_text(v_counts);

    -- All orders at target?  (Test sessions bypass this gate.)
    IF v_min_count >= p_target_n AND NOT p_is_test THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'All orders have reached target N (' || p_target_n || ')',
        'counts', v_counts
      );
    END IF;

    -- Eligible = orders at the minimum count.
    SELECT array_agg(key ORDER BY key)
    INTO v_eligible_orders
    FROM jsonb_each_text(v_counts)
    WHERE value::integer = v_min_count;

    -- Pseudorandom choice among eligible (server-side Postgres random()).
    v_chosen_order := v_eligible_orders[
      1 + floor(random() * array_length(v_eligible_orders, 1))::integer
    ];
  END IF;

  -- ---------------------------------------------------------------
  -- 6. Compute expiry and persist.
  -- ---------------------------------------------------------------
  v_expires_at := now() + make_interval(mins => p_reservation_minutes);

  -- Ensure participant row exists.
  INSERT INTO participants (participant_id)
  VALUES (p_participant_id)
  ON CONFLICT (participant_id) DO NOTHING;

  -- Insert the assignment.
  INSERT INTO order_assignments (
    session_id, participant_id, experiment_id,
    assigned_order, assignment_status,
    reservation_expires_at, manual_override,
    candidate_orders_json, assignment_metadata_json
  ) VALUES (
    p_session_id, p_participant_id, p_experiment_id,
    v_chosen_order, 'reserved',
    v_expires_at, (p_manual_order IS NOT NULL),
    to_jsonb(v_eligible_orders),
    jsonb_build_object(
      'assignment_timestamp', now(),
      'eligible_count', array_length(v_eligible_orders, 1),
      'is_test', p_is_test,
      'random_method', 'pg_random',
      'counts_at_assignment', v_counts,
      'target_n', p_target_n
    )
  );

  -- Mark session reserved.
  UPDATE sessions
  SET status = 'reserved'
  WHERE id = p_session_id
    AND status IN ('created');  -- only advance from 'created'

  -- ---------------------------------------------------------------
  -- 7. Return result.
  -- ---------------------------------------------------------------
  RETURN jsonb_build_object(
    'success', true,
    'assigned_order', v_chosen_order,
    'already_assigned', false,
    'candidate_orders', to_jsonb(v_eligible_orders),
    'reservation_expires_at', v_expires_at,
    'assignment_status', 'reserved',
    'counts_after', v_counts
  );
END;
$$;
