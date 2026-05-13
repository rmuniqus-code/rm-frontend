-- ============================================================
-- Migration 008 — RMS Employee Status Fields
-- ============================================================
-- Adds employee_status, skill_set, pm_name, pm_email, and
-- reporting_partner_email to the employees table, then redefines
-- is_active to use the status value when available (falling back
-- to the old date_of_exit IS NULL logic for legacy rows).
--
-- Status values from the RMS sheet:
--   Active, Serving notice period, Contract → is_active = true
--   Exited, Deceased, Absconding           → is_active = false
-- ============================================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_status         TEXT,
  ADD COLUMN IF NOT EXISTS skill_set               TEXT,
  ADD COLUMN IF NOT EXISTS pm_name                 TEXT,
  ADD COLUMN IF NOT EXISTS pm_email                TEXT,
  ADD COLUMN IF NOT EXISTS reporting_partner_email TEXT;

-- Redefine is_active with status-aware logic.
-- DROP CASCADE removes the three dependent views; we recreate them below.

ALTER TABLE employees DROP COLUMN IF EXISTS is_active CASCADE;

ALTER TABLE employees ADD COLUMN is_active BOOLEAN
  GENERATED ALWAYS AS (
    CASE
      WHEN employee_status IS NOT NULL
        THEN employee_status IN ('Active', 'Serving notice period', 'Contract')
      ELSE date_of_exit IS NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);

-- ── Recreate views dropped by CASCADE ──────────────────────────

-- 1. v_employee_details (dropped because it selected is_active)
CREATE OR REPLACE VIEW v_employee_details AS
SELECT
  e.employee_id        AS emp_code,
  e.name,
  e.email,
  des.name             AS designation,
  des.category,
  d.name               AS department,
  sf.name              AS sub_function,
  l.name               AS location,
  r.name               AS region,
  e.employee_region,
  e.work_mode,
  e.ft_core,
  e.rocketlane_status,
  e.date_of_joining,
  e.date_of_exit,
  e.is_active,
  e.employee_status,
  e.skill_set,
  e.pm_name,
  e.pm_email,
  e.reporting_partner_email
FROM employees e
LEFT JOIN designations des ON des.id = e.designation_id
LEFT JOIN departments  d   ON d.id   = e.department_id
LEFT JOIN sub_functions sf ON sf.id  = e.sub_function_id
LEFT JOIN locations    l   ON l.id   = e.location_id
LEFT JOIN regions      r   ON r.id   = l.region_id;

-- 2. v_available_resources (filtered by is_active)
CREATE OR REPLACE VIEW v_available_resources AS
SELECT
  e.employee_id        AS emp_code,
  e.name               AS employee_name,
  des.name             AS designation,
  sf.name              AS sub_function,
  l.name               AS location,
  fa.week_start,
  fa.allocation_pct    AS available_pct
FROM forecast_allocations fa
JOIN employees e ON e.id = fa.employee_id
LEFT JOIN designations des ON des.id = e.designation_id
LEFT JOIN sub_functions sf ON sf.id  = e.sub_function_id
LEFT JOIN locations    l   ON l.id   = e.location_id
WHERE fa.allocation_status = 'available'
  AND e.is_active = true;

-- 3. v_skill_roster (filtered by is_active)
CREATE OR REPLACE VIEW v_skill_roster AS
SELECT
  sk.name          AS skill_name,
  sk.slug          AS skill_slug,
  es.skill_type,
  e.employee_id    AS emp_code,
  e.name           AS employee_name,
  e.email,
  es.skill_order
FROM employee_skills es
JOIN skills    sk ON sk.id = es.skill_id
JOIN employees e  ON e.id  = es.employee_id
WHERE e.is_active = true;
