-- Migration 013: Fix chargeability and compliance % calculations
--
-- All metrics now use the correct hours-based formula:
--   Chargeability % = SUM(chargeable_hours) / SUM(available_hours) * 100
--   Compliance %    = SUM(total_hours)      / SUM(available_hours) * 100
--
-- The old formula AVG(pct_column) * 100 was wrong because averaging individual
-- percentages gives a different (incorrect) result to the true aggregate ratio.

-- ── v_chargeability_by_dept ─────────────────────────────────────────────────
-- Added: total_hours_logged (needed for compliance YTD aggregation in JS)
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
JOIN departments d ON d.id = e.department_id
GROUP BY d.name, tc.period_month;

-- ── v_chargeability_by_region ───────────────────────────────────────────────
-- Added: total_chargeable, total_available, total_hours_logged
-- Must DROP first because column order changed from the original definition
DROP VIEW IF EXISTS v_chargeability_by_region;
CREATE VIEW v_chargeability_by_region AS
SELECT
  r.name AS region,
  tc.period_month,
  COUNT(DISTINCT tc.employee_id) AS headcount,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_chargeability,
  ROUND(
    SUM(tc.total_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_compliance,
  SUM(tc.chargeable_hours) AS total_chargeable,
  SUM(tc.available_hours)  AS total_available,
  SUM(tc.total_hours)      AS total_hours_logged,
  tc.category
FROM timesheet_compliance tc
JOIN employees e  ON e.id = tc.employee_id
JOIN locations l  ON l.id = e.location_id
JOIN regions   r  ON r.id = l.region_id
GROUP BY r.name, tc.period_month, tc.category;

-- ── v_compliance_overview ───────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_compliance_overview AS
SELECT
  tc.period_month,
  COUNT(DISTINCT tc.employee_id) AS total_employees,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_chargeability,
  ROUND(
    SUM(tc.total_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  ) AS avg_compliance,
  SUM(tc.available_hours)  AS total_available_hours,
  SUM(tc.chargeable_hours) AS total_chargeable_hours,
  SUM(tc.total_hours)      AS total_logged_hours,
  COUNT(*) FILTER (WHERE tc.compliance_pct < 0.8) AS low_compliance_count,
  COUNT(*) FILTER (WHERE tc.total_hours = 0)      AS zero_hours_count
FROM timesheet_compliance tc
GROUP BY tc.period_month;
