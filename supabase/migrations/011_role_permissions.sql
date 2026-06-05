-- ============================================================
-- 011: Role Permissions Matrix
-- Stores per-role per-permission grants so the UI can edit them.
-- Run this in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id       TEXT NOT NULL,        -- 'admin' | 'rm' | 'slh' | 'employee' | 'viewer'
  permission_id TEXT NOT NULL,        -- matches ALL_PERMISSIONS ids in the UI
  granted       BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (role_id, permission_id)
);

-- Seed with the defaults that match the current hardcoded matrix
INSERT INTO role_permissions (role_id, permission_id, granted) VALUES
  -- Admin
  ('admin', 'manage_users',       TRUE),
  ('admin', 'manage_roles',       TRUE),
  ('admin', 'configure_system',   TRUE),
  ('admin', 'view_all',           TRUE),
  ('admin', 'view_service_line',  FALSE),
  ('admin', 'view_own',           FALSE),
  ('admin', 'view_dashboards',    FALSE),
  ('admin', 'view_reports',       FALSE),
  ('admin', 'edit_all',           TRUE),
  ('admin', 'edit_allocations',   FALSE),
  ('admin', 'approve_requests',   TRUE),
  ('admin', 'manage_resources',   FALSE),
  ('admin', 'submit_requests',    FALSE),
  ('admin', 'enter_timesheet',    FALSE),
  ('admin', 'smart_allocate',     FALSE),
  ('admin', 'view_forecasting',   FALSE),
  ('admin', 'view_audit',         TRUE),
  -- Resource Manager
  ('rm', 'manage_users',          FALSE),
  ('rm', 'manage_roles',          FALSE),
  ('rm', 'configure_system',      FALSE),
  ('rm', 'view_all',              TRUE),
  ('rm', 'view_service_line',     FALSE),
  ('rm', 'view_own',              FALSE),
  ('rm', 'view_dashboards',       FALSE),
  ('rm', 'view_reports',          FALSE),
  ('rm', 'edit_all',              FALSE),
  ('rm', 'edit_allocations',      TRUE),
  ('rm', 'approve_requests',      TRUE),
  ('rm', 'manage_resources',      TRUE),
  ('rm', 'submit_requests',       FALSE),
  ('rm', 'enter_timesheet',       FALSE),
  ('rm', 'smart_allocate',        TRUE),
  ('rm', 'view_forecasting',      TRUE),
  ('rm', 'view_audit',            FALSE),
  -- Service Line Head
  ('slh', 'manage_users',         FALSE),
  ('slh', 'manage_roles',         FALSE),
  ('slh', 'configure_system',     FALSE),
  ('slh', 'view_all',             FALSE),
  ('slh', 'view_service_line',    TRUE),
  ('slh', 'view_own',             FALSE),
  ('slh', 'view_dashboards',      FALSE),
  ('slh', 'view_reports',         FALSE),
  ('slh', 'edit_all',             FALSE),
  ('slh', 'edit_allocations',     FALSE),
  ('slh', 'approve_requests',     TRUE),
  ('slh', 'manage_resources',     FALSE),
  ('slh', 'submit_requests',      FALSE),
  ('slh', 'enter_timesheet',      FALSE),
  ('slh', 'smart_allocate',       FALSE),
  ('slh', 'view_forecasting',     TRUE),
  ('slh', 'view_audit',           FALSE),
  -- Employee
  ('employee', 'manage_users',    FALSE),
  ('employee', 'manage_roles',    FALSE),
  ('employee', 'configure_system',FALSE),
  ('employee', 'view_all',        FALSE),
  ('employee', 'view_service_line',FALSE),
  ('employee', 'view_own',        TRUE),
  ('employee', 'view_dashboards', FALSE),
  ('employee', 'view_reports',    FALSE),
  ('employee', 'edit_all',        FALSE),
  ('employee', 'edit_allocations',FALSE),
  ('employee', 'approve_requests',FALSE),
  ('employee', 'manage_resources',FALSE),
  ('employee', 'submit_requests', TRUE),
  ('employee', 'enter_timesheet', TRUE),
  ('employee', 'smart_allocate',  FALSE),
  ('employee', 'view_forecasting',FALSE),
  ('employee', 'view_audit',      FALSE),
  -- Viewer
  ('viewer', 'manage_users',      FALSE),
  ('viewer', 'manage_roles',      FALSE),
  ('viewer', 'configure_system',  FALSE),
  ('viewer', 'view_all',          FALSE),
  ('viewer', 'view_service_line', FALSE),
  ('viewer', 'view_own',          FALSE),
  ('viewer', 'view_dashboards',   TRUE),
  ('viewer', 'view_reports',      TRUE),
  ('viewer', 'edit_all',          FALSE),
  ('viewer', 'edit_allocations',  FALSE),
  ('viewer', 'approve_requests',  FALSE),
  ('viewer', 'manage_resources',  FALSE),
  ('viewer', 'submit_requests',   FALSE),
  ('viewer', 'enter_timesheet',   FALSE),
  ('viewer', 'smart_allocate',    FALSE),
  ('viewer', 'view_forecasting',  FALSE),
  ('viewer', 'view_audit',        FALSE)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Index for fast role lookups
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Enable RLS so the anon/authenticated Supabase keys cannot bypass access.
-- The backend uses the service-role key (bypasses RLS), so all API calls
-- continue to work.  Direct browser calls using the anon key are denied.
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access (no policy = no access for non-service-role).
-- If you ever need Supabase Auth users to read the matrix directly from the
-- client without going through the backend, add a SELECT policy here.
-- Example (read-only for any authenticated user):
--   CREATE POLICY "authenticated read" ON role_permissions
--     FOR SELECT USING (auth.role() = 'authenticated');
