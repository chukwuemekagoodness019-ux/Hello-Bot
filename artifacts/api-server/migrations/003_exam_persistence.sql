-- Migration 003: Exam and exam-limit persistence
-- Run this SQL once in your Supabase project SQL editor.
-- All tables fall back gracefully to in-memory if they do not exist.

-- ── Active Exams ──────────────────────────────────────────────────────────────
-- Persists shareable exam sessions so they survive server restarts/redeploys.
CREATE TABLE IF NOT EXISTS active_exams (
  id                  TEXT        PRIMARY KEY,
  user_id             TEXT        NOT NULL,
  title               TEXT        NOT NULL,
  questions           JSONB       NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ,
  time_minutes        INTEGER,
  subject             TEXT,
  difficulty          TEXT,
  question_type       TEXT,
  max_attempts        INTEGER     NOT NULL DEFAULT 0,
  submitted_user_ids  TEXT[]      NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS active_exams_user_id_idx   ON active_exams (user_id);
CREATE INDEX IF NOT EXISTS active_exams_expires_at_idx ON active_exams (expires_at);

-- ── Exam Creation Limits ──────────────────────────────────────────────────────
-- Tracks weekly/monthly exam creation counts per user so limits survive restarts.
CREATE TABLE IF NOT EXISTS exam_limits (
  user_id     TEXT    NOT NULL,
  period      TEXT    NOT NULL,  -- 'week' or 'month'
  period_key  TEXT    NOT NULL,  -- ISO week key e.g. '2026-W22' or '2026-06'
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);
