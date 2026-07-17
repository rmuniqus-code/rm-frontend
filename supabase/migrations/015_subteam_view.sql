-- Migration 015: Add v_chargeability_by_subteam view
--
-- Mirrors v_chargeability_by_dept but grouped by sub_function so the
-- dashboard sub-service-line chart has a reliable, pre-aggregated source.
-- Uses the same COALESCE(tc.department_id, e.department_id) logic as the
-- department view so split-department rows are attributed correctly.

CREATE OR REPLACE VIEW v_chargeability_by_subteam AS
SELECT
  d.name                                                        AS department,
  COALESCE(sf.name, d.name)                                     AS sub_team,
  tc.period_month,
  COUNT(DISTINCT tc.employee_id)                                AS headcount,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                             AS avg_chargeability,
  ROUND(
    SUM(tc.total_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                             AS avg_compliance,
  SUM(tc.chargeable_hours)                                      AS total_chargeable,
  SUM(tc.available_hours)                                       AS total_available,
  SUM(tc.total_hours)                                           AS total_hours_logged
FROM timesheet_compliance tc
JOIN employees    e  ON e.id  = tc.employee_id
JOIN departments  d  ON d.id  = COALESCE(tc.department_id, e.department_id)
LEFT JOIN sub_functions sf ON sf.id = e.sub_function_id
GROUP BY d.name, COALESCE(sf.name, d.name), tc.period_month;
