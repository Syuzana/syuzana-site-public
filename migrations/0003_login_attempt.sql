-- Failed admin logins, used to rate-limit by client IP. Rows are deleted as they age out.
CREATE TABLE IF NOT EXISTS login_attempt (
  ip TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempt_ip_at ON login_attempt (ip, at);
