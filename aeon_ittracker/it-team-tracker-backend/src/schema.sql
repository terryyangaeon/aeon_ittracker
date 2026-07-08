-- IT Team Tracker v2 — Schema (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  pin           TEXT NOT NULL DEFAULT '1111',
  role          TEXT NOT NULL DEFAULT 'General',
  admin         BOOLEAN NOT NULL DEFAULT false,
  last_modified TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add admin column if missing (safe for existing tables)
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- System Configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS system_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,
  value         TEXT NOT NULL DEFAULT '',
  display_value TEXT NOT NULL DEFAULT '',
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_config_type ON system_config(type);

-- ============================================================
-- Work Entries (Daily + Weekly PPP unified)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  event_type        TEXT NOT NULL DEFAULT 'Daily',
  sites             TEXT[] DEFAULT '{}',
  description       TEXT DEFAULT '',
  blockage          TEXT DEFAULT '',
  next_week_target  TEXT DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'Draft',
  leave_am          BOOLEAN NOT NULL DEFAULT false,
  leave_pm          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date, event_type)
);
CREATE INDEX IF NOT EXISTS idx_entries_user ON work_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_date ON work_entries(date);
CREATE INDEX IF NOT EXISTS idx_entries_type ON work_entries(event_type);

-- ============================================================
-- Monthly Objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_objectives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  month       INT NOT NULL,
  objectives  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_obj_user ON monthly_objectives(user_id);

-- ============================================================
-- Email Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS email_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  recipient_role TEXT NOT NULL DEFAULT 'General',
  schedule_day  TEXT NOT NULL DEFAULT 'Friday',
  schedule_time TEXT NOT NULL DEFAULT '15:00',
  enabled       BOOLEAN NOT NULL DEFAULT true,
  last_sent     TIMESTAMPTZ,
  last_result   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Seed Users (skip if already present)
-- ============================================================
INSERT INTO users (name, email, pin, role, admin) VALUES
  ('Philip Chiang', 'philip.chiang@aeondelightasia.com', '9999', 'Reviewer', false),
  ('Terry Yang',    'terry.yang@aeondelightasia.com',    '1111', 'General',  true),
  ('James Yip',     'james.yip@aeondelightasia.com',     '1111', 'General',  false),
  ('Jimmy Lam',     'jimmy.lam@aeondelightasia.com',     '1111', 'General',  false),
  ('Timothy Lee',   'timothy.lee@aeondelightasia.com',   '1111', 'General',  false),
  ('Riot Chan',     'riot.chan@aeondelightasia.com',      '1111', 'General',  false)
ON CONFLICT (email) DO NOTHING;

-- Ensure Terry Yang is admin
UPDATE users SET admin = true WHERE email = 'terry.yang@aeondelightasia.com';

-- ============================================================
-- Seed System Configuration (skip if data exists)
-- ============================================================
INSERT INTO system_config (type, value, display_value, sort_order)
SELECT * FROM (VALUES
  ('Site', 'TKOT',           'Tseung Kwan O Tunnel',    1),
  ('Site', 'CHT',            'Cross Harbour Tunnel',    2),
  ('Site', 'LRT',            'Lions Rock Tunnel',       3),
  ('Site', 'SMT',            'Shing Mun Tunnel',        4),
  ('Site', 'KTT',            'Kai Tak Tunnel',          5),
  ('Site', 'PWH',            'Prince of Wales Hospital', 6),
  ('Site', 'KWH',            'Kwong Wah Hospital',      7),
  ('Site', 'Other Hospital', 'Other Hospital',          8),
  ('Site', 'Back Office',    'Back Office',             9),
  ('Site', 'Remote',         'Remote Control',          10),
  ('Site', 'Others',         'Others',                  11),
  ('Site', 'ASTW',           'Aeon Store - Tsuen Wan',  12),
  ('Site', 'ASMK',           'Aeon Store - Mong Kok',   13),
  ('Email_Alert', '{"days":["Friday"],"time":"15:00","enabled":true}', 'Friday 15:00', 1),
  ('Status', 'Draft',     'Draft',     1),
  ('Status', 'Submitted', 'Submitted', 2),
  ('Status', 'Reviewed',  'Reviewed',  3),
  ('Event',  'Daily',     'Daily',     1),
  ('Event',  'Weekly',    'Weekly',    2)
) AS seed(type, value, display_value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM system_config LIMIT 1);

-- ============================================================
-- Seed July 2026 Objectives (skip if already present)
-- ============================================================
INSERT INTO monthly_objectives (user_id, year, month, objectives)
SELECT u.id, 2026, 7, obj.text
FROM (VALUES
  ('jimmy.lam@aeondelightasia.com',
   E'Develop MC6 Unified Network\nPWH POC for Meal Card Delivery platform\nAttendance & Job Dispatch platform'),
  ('james.yip@aeondelightasia.com',
   E'PWH Human Robot Integration platform\nTD ACRS Upgrade (iTimex Replacement)'),
  ('riot.chan@aeondelightasia.com',
   E'HA CMMS Purchase Orders & QPOMS Implementation'),
  ('terry.yang@aeondelightasia.com',
   E'PWH IoT Management platform (Live)'),
  ('timothy.lee@aeondelightasia.com',
   E'HA CMMS Demo with Data to showcase')
) AS obj(email, text)
JOIN users u ON u.email = obj.email
ON CONFLICT (user_id, year, month) DO NOTHING;

-- ============================================================
-- Seed SMTP Configuration (skip if data exists)
-- ============================================================
INSERT INTO system_config (type, value, display_value, sort_order)
SELECT * FROM (VALUES
  ('SMTP', 'host',     'smtp.office365.com', 1),
  ('SMTP', 'port',     '587',                2),
  ('SMTP', 'user',     '',                   3),
  ('SMTP', 'password', '',                   4),
  ('SMTP', 'secure',   'false',              5)
) AS seed(type, value, display_value, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM system_config WHERE type = 'SMTP' LIMIT 1);

-- ============================================================
-- Seed Default Email Alert (skip if data exists)
-- ============================================================
INSERT INTO email_alerts (name, subject, body, recipient_role, schedule_day, schedule_time, enabled)
SELECT 'Weekly PPP Reminder',
       'Submit Weekly PPP for IT Tracker',
       E'Please be reminded to submit your "Weekly PPP" on or before every Friday.\n\nIT Tracker: https://adg-it-tracker.zeabur.app/',
       'General', 'Friday', '15:00', true
WHERE NOT EXISTS (SELECT 1 FROM email_alerts LIMIT 1);
