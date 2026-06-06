import { pool } from "@workspace/db";
import { logger } from "./logger";

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS academic_profiles (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  institution     TEXT,
  department      TEXT,
  academic_level  TEXT,
  semester        TEXT,
  study_goals     TEXT,
  exam_dates      TEXT,
  weekly_schedule TEXT,
  personal_notes  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  course_code  TEXT NOT NULL,
  course_title TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);
`;

export async function initAcademicTables(): Promise<void> {
  if (!pool) {
    logger.warn("DATABASE_URL not set — skipping academic profile table migration (apply migration 004_academic_profile.sql via Supabase dashboard)");
    return;
  }
  try {
    await pool.query(MIGRATION_SQL);
    logger.info("Academic profile tables verified / created");
  } catch (err) {
    logger.warn({ err }, "Academic profile table migration failed — apply 004_academic_profile.sql via Supabase dashboard");
  }
}
