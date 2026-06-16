-- SCIM Users table
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id   TEXT,
  username      TEXT UNIQUE NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  display_name  TEXT,
  email         TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  raw_attributes JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_username_idx   ON users (username);
CREATE INDEX IF NOT EXISTS users_external_id_idx ON users (external_id);
CREATE INDEX IF NOT EXISTS users_email_idx       ON users (email);

-- SCIM Groups table
CREATE TABLE IF NOT EXISTS groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id   TEXT,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS groups_display_name_idx ON groups (display_name);

-- Group membership junction table
CREATE TABLE IF NOT EXISTS group_members (
  group_id  UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
