-- ============================================================
-- Migration 012 — Expose days_mask in v_resource_allocation_grid
-- ============================================================
-- The days_mask column (added in 009) is not surfaced by the view,
-- so day-level deletes/extends are invisible to the resource grid.
-- Rebuild the view to include it.
--
-- Bit layout (mirrors forecast_allocations.days_mask):
--   bit 0 (1)  = Monday
--   bit 1 (2)  = Tuesday
--   bit 2 (4)  = Wednesday
--   bit 3 (8)  = Thursday
--   bit 4 (16) = Friday
--   31         = all five days (default / full week)
-- ============================================================

DROP VIEW IF EXISTS v_resource_allocation_grid;
CREATE VIEW v_resource_allocation_grid AS
SELECT
  e.employee_id AS emp_code,
  e.name AS employee_name,
  des.name AS designation,
  d.name AS department,
  sf.name AS sub_function,
  l.name AS location,
  e.work_mode,
  e.ft_core,
  fa.week_start,
  fa.allocation_pct,
  fa.allocation_status,
  p.name AS project_name,
  p.client AS project_client,
  p.engagement_manager,
  p.engagement_partner,
  p.project_type,
  fa.raw_text,
  e.current_em_ep,
  COALESCE(fa.days_mask, 31) AS days_mask
FROM forecast_allocations fa
JOIN employees e ON e.id = fa.employee_id
LEFT JOIN projects p ON p.id = fa.project_id
LEFT JOIN designations des ON des.id = e.designation_id
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN sub_functions sf ON sf.id = e.sub_function_id
LEFT JOIN locations l ON l.id = e.location_id;
