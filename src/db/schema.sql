-- Very Light CMS — SQLite schema
-- All statements use IF NOT EXISTS (additive-only, safe to re-apply).
-- Column alterations or CHECK changes require migration scripts, not re-init.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Pages ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  title       TEXT    NOT NULL,
  description TEXT,
  tags        TEXT,                        -- JSON array, e.g. '["design","ux"]'
  draft       INTEGER NOT NULL DEFAULT 1,  -- 0 = published, 1 = draft (boolean)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pages_slug      ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_pages_draft     ON pages(draft);
CREATE INDEX IF NOT EXISTS idx_pages_created   ON pages(created_at DESC);

-- ── Media ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT    NOT NULL UNIQUE,
  mime_type   TEXT    NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  alt_text    TEXT,
  uploaded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_media_filename  ON media(filename);
CREATE INDEX IF NOT EXISTS idx_media_mime      ON media(mime_type);

-- ── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  password_hash TEXT  NOT NULL,             -- bcrypt hash, never plaintext
  role        TEXT    NOT NULL DEFAULT 'editor',  -- 'admin' | 'editor'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);

-- ── Settings ──────────────────────────────────────────────────────────────────
-- Key-value store for CMS-wide configuration (site title, theme, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT    PRIMARY KEY,
  value       TEXT    NOT NULL,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ── Auth log ──────────────────────────────────────────────────────────────────
-- Audit trail of every authentication attempt (admin + API).
-- success=0 rows are the bruteforce surface; consult ip + recent count to
-- decide on additional response (e.g. tighter rate-limit for repeat IPs).
CREATE TABLE IF NOT EXISTS auth_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT,                          -- email attempted (may not exist in users)
  ip          TEXT,                          -- client IP (best-effort, may be "unknown")
  success     INTEGER NOT NULL,              -- 1 = login succeeded, 0 = failed
  reason      TEXT,                          -- 'invalid_credentials' | 'rate_limited' | 'ok' | …
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_auth_log_ip      ON auth_log(ip);
CREATE INDEX IF NOT EXISTS idx_auth_log_email   ON auth_log(email);
CREATE INDEX IF NOT EXISTS idx_auth_log_created ON auth_log(created_at DESC);
