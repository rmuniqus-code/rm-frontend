-- Migration 006: Multi-step resource allocation workflow
--
-- New flow:
--   1. EM/EP raises request (approval_status = 'pending')
--   2. RM shortlists resources (approval_status = 'shortlisted')
--      → candidates stored in request_shortlisted_resources
--   3. EM/EP reviews profiles and selects one (approval_status = 'em_approved')
--      → em_approved_resource_id set on the request
--   4. RM gives final approval → resource allocated (approval_status = 'approved')

-- ── New columns on resource_requests ─────────────────────────────
ALTER TABLE resource_requests
  ADD COLUMN IF NOT EXISTS em_approved_resource_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS em_approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS em_approval_notes        TEXT;

-- ── Shortlisted resources table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS request_shortlisted_resources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL REFERENCES resource_requests(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id),
  employee_name   TEXT NOT NULL,
  grade           TEXT,
  service_line    TEXT,
  sub_service_line TEXT,
  location        TEXT,
  utilization_pct NUMERIC(5,1),
  fit_score       INTEGER,
  shortlisted_by  TEXT,
  notes           TEXT,
  status          TEXT DEFAULT 'shortlisted'
                    CHECK (status IN ('shortlisted', 'em_selected', 'rejected')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (request_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_shortlisted_request
  ON request_shortlisted_resources(request_id);

-- ── Row Level Security ────────────────────────────────────────────
-- All access goes through the Express backend (service role), which bypasses RLS.
-- Direct client access is blocked by default when RLS is enabled.
ALTER TABLE request_shortlisted_resources ENABLE ROW LEVEL SECURITY;

-- Allow the service role (backend) unrestricted access (service role bypasses RLS,
-- but this policy covers authenticated role used in some Supabase setups)
CREATE POLICY "Backend full access" ON request_shortlisted_resources
  FOR ALL
  USING (true)
  WITH CHECK (true);
