-- App-managed user table: stores role assignments independently of Keycloak.
-- keycloak_id = JWT `sub` claim (Keycloak user UUID).
-- On first login the app upserts a row here with role = 'viewer'.
-- Admins change roles via the Admin > Users panel.

CREATE TABLE IF NOT EXISTS app_users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keycloak_id  TEXT UNIQUE NOT NULL,
  email        TEXT,
  name         TEXT,
  role         TEXT NOT NULL DEFAULT 'viewer',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_keycloak_id ON app_users (keycloak_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email       ON app_users (email);
