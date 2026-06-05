-- Add structured metadata to notifications for rich detail cards
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB;
