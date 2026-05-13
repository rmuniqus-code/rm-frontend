-- ============================================================
-- Migration 009 — Day-level allocation granularity
-- ============================================================
-- Adds days_mask (bitmask of Mon-Fri) to forecast_allocations so
-- individual days within a week can be deleted without removing
-- the entire week row.
--
-- Bit layout (SMALLINT, 5 bits used):
--   bit 0 (1)  = Monday
--   bit 1 (2)  = Tuesday
--   bit 2 (4)  = Wednesday
--   bit 3 (8)  = Thursday
--   bit 4 (16) = Friday
--   31 = 11111 = all five weekdays (default)
-- ============================================================

ALTER TABLE forecast_allocations
  ADD COLUMN IF NOT EXISTS days_mask SMALLINT DEFAULT 31;
