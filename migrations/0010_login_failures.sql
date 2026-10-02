-- Failed owner-login attempts (global throttle: there is a single account).
CREATE TABLE IF NOT EXISTS login_failures (
  at INTEGER NOT NULL -- epoch milliseconds
);
CREATE INDEX IF NOT EXISTS idx_login_failures_at ON login_failures (at);
