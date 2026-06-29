-- IT Team Tracker — PostgreSQL Schema
-- Run once to bootstrap; safe to re-run (IF NOT EXISTS everywhere).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Users / team members
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  pin        TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member',   -- 'member' | 'reviewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the five members + reviewer (skip if already present)
INSERT INTO users (name, pin, role) VALUES
  ('Jimmy',   '1111', 'member'),
  ('James',   '2222', 'member'),
  ('Riot',    '3333', 'member'),
  ('Terry',   '4444', 'member'),
  ('Timothy', '5555', 'member'),
  ('Philip',  '9999', 'reviewer')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Daily attendance / work records
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member        TEXT NOT NULL,
  date          DATE NOT NULL,
  site          TEXT,                          -- MC6, PWH, KWH, UCH, CHT, SMT, TKO
  tasks         TEXT,                          -- work completed today
  deliverables  TEXT,                          -- deliverables / outcomes
  submitted_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_member ON daily_records (member);
CREATE INDEX IF NOT EXISTS idx_daily_date   ON daily_records (date);

-- ============================================================
-- Weekly PPP (Progress / Plans / Problems)
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_ppp (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member        TEXT NOT NULL,
  week_ending   DATE NOT NULL,                 -- always a Friday
  progress      TEXT,
  plans         TEXT,
  problems      TEXT,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member, week_ending)
);

CREATE INDEX IF NOT EXISTS idx_weekly_member ON weekly_ppp (member);
CREATE INDEX IF NOT EXISTS idx_weekly_week   ON weekly_ppp (week_ending);

-- ============================================================
-- Monthly objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS objectives (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member     TEXT NOT NULL,
  month      TEXT NOT NULL,                    -- e.g. 'July 2026'
  text       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (member, month)
);

CREATE INDEX IF NOT EXISTS idx_obj_member ON objectives (member);
CREATE INDEX IF NOT EXISTS idx_obj_month  ON objectives (month);

-- Seed July 2026 example objectives
INSERT INTO objectives (member, month, text) VALUES
  ('Jimmy',   'July 2026', 'Complete MC6 network upgrade phase 2'),
  ('James',   'July 2026', 'Deploy new monitoring dashboards for all sites'),
  ('Riot',    'July 2026', 'Finish security audit remediation items'),
  ('Terry',   'July 2026', 'Launch IoT sensor data pipeline v2'),
  ('Timothy', 'July 2026', 'Migrate legacy applications to containerised environment')
ON CONFLICT (member, month) DO NOTHING;
