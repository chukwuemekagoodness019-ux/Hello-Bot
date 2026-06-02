-- Migration 002: Persistent rejection reasons and AI error log
-- Run this SQL once in your Supabase project SQL editor.
-- All tables gracefully fall back to in-memory if they do not exist.

-- ── Payment Rejection Reasons ─────────────────────────────────────────────────
-- Stores admin-supplied rejection reasons for payment submissions.
-- Survives server restarts so users always see why their payment was rejected.
CREATE TABLE IF NOT EXISTS payment_rejection_reasons (
  payment_id  INTEGER     PRIMARY KEY,
  reason      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── AI Error Log ──────────────────────────────────────────────────────────────
-- Persists AI provider errors so they survive redeploys and restarts.
-- Allows historical debugging in the admin dashboard.
CREATE TABLE IF NOT EXISTS ai_error_log (
  id          BIGSERIAL   PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL,
  provider    TEXT        NOT NULL,
  stage       TEXT        NOT NULL,
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_error_log_ts_idx ON ai_error_log (ts DESC);
