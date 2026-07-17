-- Migration 016: Use stored compliance_pct from sheet instead of recomputing
--
-- The ingestion layer stores the sheet's exact Compliance % as compliance_pct.
-- Previous views recomputed it as SUM(total_hours)/SUM(available_hours) which
-- can differ from the sheet value due to rounding differences or different
-- denominators. Using the weighted average of stored compliance_pct gives
-- results that match the source data exactly.
--
-- Compliance % (weighted avg) = SUM(compliance_pct * available_hours) / SUM(available_hours)
-- When compliance_pct is stored as a fraction (0–1), multiply by 100.
-- When stored as a percentage (0–100), use directly.
-- The ingestion stores it from the sheet value which is already 0–1 (e.g. 0.968).

-- ── v_chargeability_by_dept ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_chargeability_by_dept AS
SELECT
  d.name                                                               AS department,
  tc.period_month,
  COUNT(DISTINCT tc.employee_id)                                       AS headcount,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                    AS avg_chargeability,
  ROUND(
    SUM(tc.compliance_pct * tc.available_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                    AS avg_compliance,
  SUM(tc.chargeable_hours)                                             AS total_chargeable,
  SUM(tc.available_hours)                                              AS total_available,
  SUM(tc.total_hours)                                                  AS total_hours_logged
FROM timesheet_compliance tc
JOIN employees    e ON e.id = tc.employee_id
JOIN departments  d ON d.id = COALESCE(tc.department_id, e.department_id)
GROUP BY d.name, tc.period_month;

-- ── v_chargeability_by_subteam ───────────────────────────────────────────────
CREATE OR REPLACE VIEW v_chargeability_by_subteam AS
SELECT
  d.name                                                               AS department,
  COALESCE(sf.name, d.name)                                            AS sub_team,
  tc.period_month,
  COUNT(DISTINCT tc.employee_id)                                       AS headcount,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                    AS avg_chargeability,
  ROUND(
    SUM(tc.compliance_pct * tc.available_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                    AS avg_compliance,
  SUM(tc.chargeable_hours)                                             AS total_chargeable,
  SUM(tc.available_hours)                                              AS total_available,
  SUM(tc.total_hours)                                                  AS total_hours_logged
FROM timesheet_compliance tc
JOIN employees    e  ON e.id  = tc.employee_id
JOIN departments  d  ON d.id  = COALESCE(tc.department_id, e.department_id)
LEFT JOIN sub_functions sf ON sf.id = e.sub_function_id
GROUP BY d.name, COALESCE(sf.name, d.name), tc.period_month;

-- ── v_compliance_overview ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_compliance_overview AS
SELECT
  tc.period_month,
  COUNT(DISTINCT tc.employee_id)                                        AS total_employees,
  ROUND(
    SUM(tc.chargeable_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                     AS avg_chargeability,
  ROUND(
    SUM(tc.compliance_pct * tc.available_hours) / NULLIF(SUM(tc.available_hours), 0) * 100, 1
  )                                                                     AS avg_compliance,
  SUM(tc.available_hours)                                               AS total_available_hours,
  SUM(tc.chargeable_hours)                                              AS total_chargeable_hours,
  SUM(tc.total_hours)                                                   AS total_logged_hours,
  COUNT(*) FILTER (WHERE tc.compliance_pct < 0.8)                      AS low_compliance_count,
  COUNT(*) FILTER (WHERE tc.total_hours = 0)                           AS zero_hours_count
FROM timesheet_compliance tc
GROUP BY tc.period_month;
