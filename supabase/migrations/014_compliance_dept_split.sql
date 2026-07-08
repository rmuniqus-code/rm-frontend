-- Migration 014: Allow one employee to have compliance rows for multiple departments
--
-- Adds department_id to timesheet_compliance so that employees who split time
-- across two service lines (e.g. SCC + GRC) can have one row per department
-- per period, each with their own hours and chargeability.
--
-- Existing rows get department_id = NULL; views fall back to e.department_id
-- via COALESCE so no existing data or dashboards are affected.

-- 1. Add nullable department_id column
ALTER TABLE timesheet_compliance
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);

-- 2. Drop the old unique constraint
ALTER TABLE timesheet_compliance
  DROP CONSTRAINT IF EXISTS timesheet_compliance_employee_id_period_start_period_end_key;

-- 3. Add new unique constraint that includes department_id
--    NULLS are treated as distinct in Postgres unique constraints,
--    so existing NULL rows won't conflict with each other.
ALTER TABLE timesheet_compliance
  ADD CONSTRAINT timesheet_compliance_employee_dept_period_key
  UNIQUE (employee_id, department_id, period_start, period_end);

-- 4. Update v_chargeability_by_dept to use tc.department_id when present,
--    falling back to the employee's own department_id for legacy rows.
CREATE OR REPLACE VIEW v_chargeability_by_dept AS
SELECT
  d.name AS department,
  tc.period_month,
  COUNT(DISTINCT tc.employee_id) AS headcount,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_chargeability,
  ROUND(
    SUM(tc.total_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_compliance,
  SUM(tc.chargeable_hours)  AS total_chargeable,
  SUM(tc.available_hours)   AS total_available,
  SUM(tc.total_hours)       AS total_hours_logged
FROM timesheet_compliance tc
JOIN employees   e ON e.id = tc.employee_id
JOIN departments d ON d.id = COALESCE(tc.department_id, e.department_id)
GROUP BY d.name, tc.period_month;
