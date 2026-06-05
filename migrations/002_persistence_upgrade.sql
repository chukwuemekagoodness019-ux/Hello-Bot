-- ============================================================
-- Migration 002 — Persistence Upgrade
-- Run these statements once in the Supabase SQL editor.
-- All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- so they are safe to re-run.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Spaced repetition review schedules
--    Survives server restarts; replaces in-memory Map.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_schedules (
  id             serial PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject        text NOT NULL,
  due_at         timestamptz NOT NULL,
  interval_label text NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_schedules_user_id ON review_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_review_schedules_due_at  ON review_schedules(due_at);

-- ────────────────────────────────────────────────────────────
-- 2. Server-side conversation history
--    Backs up client localStorage; enables cross-device access.
--    FILE_CONTEXT messages are stripped by the client before sync
--    to keep row sizes manageable.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_conversations (
  id         text PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New Chat',
  messages   jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_conversations_user_id
  ON user_conversations(user_id, updated_at DESC);

-- ────────────────────────────────────────────────────────────
-- 3. Supabase Storage bucket for payment screenshots
--    Run in the Supabase dashboard → Storage → New bucket:
--      Name:   payment-screenshots
--      Public: true   (allows serving the image directly via URL)
--    Or run the SQL below if using the management API:
-- ────────────────────────────────────────────────────────────
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('payment-screenshots', 'payment-screenshots', true)
-- ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. CORS env var reminder
--    Set CORS_ORIGIN in your server environment secrets:
--      CORS_ORIGIN=https://yourapp.replit.app,https://www.yourdomain.com
--    Comma-separated.  localhost is always allowed automatically.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- 5. Remove VITE_ payment env var aliases
--    Rename these in your Replit/Render secrets:
--      VITE_ACCOUNT_NAME   → PAYMENT_ACCOUNT_NAME
--      VITE_ACCOUNT_NUMBER → PAYMENT_ACCOUNT_NUMBER
--      VITE_BANK_NAME      → PAYMENT_PROVIDER
--    The VITE_ versions are no longer read by the backend.
-- ────────────────────────────────────────────────────────────
