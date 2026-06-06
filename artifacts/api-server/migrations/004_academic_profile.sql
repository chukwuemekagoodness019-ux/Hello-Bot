-- Academic Profile System
-- Phase 1: academic_profiles table — one row per user, upsertable
CREATE TABLE IF NOT EXISTS academic_profiles (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  institution   TEXT,
  department    TEXT,
  academic_level TEXT,
  semester      TEXT,
  study_goals   TEXT,
  exam_dates    TEXT,
  weekly_schedule TEXT,
  personal_notes TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Phase 2: courses table — many per user
CREATE TABLE IF NOT EXISTS courses (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  course_code   TEXT NOT NULL,
  course_title  TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_courses_user_id ON courses(user_id);
