-- Migration 001: Persistent admin store
-- Run this SQL once in your Supabase project SQL editor.
-- All tables gracefully fall back to in-memory if they do not exist.

-- ── Announcements ────────────────────────────────────────────────────────────
-- Stores the single active system-wide announcement.
CREATE TABLE IF NOT EXISTS app_announcements (
  id      TEXT PRIMARY KEY,
  text    TEXT        NOT NULL,
  type    TEXT        NOT NULL CHECK (type IN ('info', 'warning', 'error')),
  active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Feature Flags ─────────────────────────────────────────────────────────────
-- Toggle individual product features without redeploying.
CREATE TABLE IF NOT EXISTS feature_flags (
  key     TEXT    PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed the default flags (safe to re-run; ON CONFLICT is a no-op).
INSERT INTO feature_flags (key, enabled) VALUES
  ('exam',         true),
  ('quiz',         true),
  ('voice',        true),
  ('pdf_upload',   true),
  ('image_upload', true),
  ('payments',     true)
ON CONFLICT (key) DO NOTHING;

-- ── Admin Messages ────────────────────────────────────────────────────────────
-- Messages sent from admin to individual users.
CREATE TABLE IF NOT EXISTS admin_messages (
  id         TEXT        PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  text       TEXT        NOT NULL,
  from_admin TEXT        NOT NULL,
  ts         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read       BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS admin_messages_user_id_idx ON admin_messages (user_id);
CREATE INDEX IF NOT EXISTS admin_messages_read_idx    ON admin_messages (user_id, read);
