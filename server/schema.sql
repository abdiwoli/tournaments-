CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_date TIMESTAMPTZ NOT NULL,
  google_id TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS records (
  entity TEXT NOT NULL,
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_date TIMESTAMPTZ NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
