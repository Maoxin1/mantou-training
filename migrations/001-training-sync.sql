CREATE TABLE IF NOT EXISTS training_sync (
  user_id text PRIMARY KEY,
  state jsonb NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- API verifies the signed subject and scopes every read/write to that subject.
-- Browser users never receive a database connection string.
ALTER TABLE training_sync ENABLE ROW LEVEL SECURITY;
