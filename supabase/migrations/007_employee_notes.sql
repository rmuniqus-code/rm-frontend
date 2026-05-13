-- ============================================================
-- Migration 007 — Employee Notes (confidential, role-gated)
-- ============================================================
-- One note record per employee. Visible only to admin / rm / slh roles.
-- Not exposed to the employee themselves.
-- ============================================================

CREATE TABLE IF NOT EXISTS employee_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  note        TEXT NOT NULL DEFAULT '',
  updated_by  TEXT,                         -- name or email of the last editor
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_employee ON employee_notes(employee_id);

-- RLS: authenticated users can read; service-role writes (backend only).
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_employee_notes"
  ON employee_notes FOR SELECT TO authenticated USING (true);

-- Only the service-role key (used by the backend) can INSERT / UPDATE / DELETE.
-- Frontend never touches this table directly.
