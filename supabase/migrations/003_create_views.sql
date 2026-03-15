-- 003_create_views.sql
-- View for active order balancing counts

CREATE OR REPLACE VIEW active_order_counts AS
SELECT
  oa.assigned_order,
  COUNT(*) FILTER (WHERE oa.assignment_status = 'reserved') AS reserved_count,
  COUNT(*) FILTER (WHERE oa.assignment_status = 'active') AS active_count,
  COUNT(*) FILTER (WHERE oa.assignment_status = 'completed') AS completed_count,
  COUNT(*) AS total_active_count
FROM order_assignments oa
JOIN sessions s ON s.id = oa.session_id
WHERE oa.assignment_status IN ('reserved', 'active', 'completed')
  AND s.is_test = false
GROUP BY oa.assigned_order;
