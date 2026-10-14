-- Default plans. Limits are data: change them with an UPDATE (NULL = unlimited).
-- guest: anonymous visitors, lifetime quotas, IP bucket = 3x the cookie quota.
-- free:  registered users, daily backtest quota, lifetime strategy quota.
INSERT INTO "plans" ("id", "name", "max_strategies", "max_backtests_total", "max_backtests_per_day", "history_size", "ip_share_multiplier")
VALUES
  ('guest', 'Invitado', 1, 2, NULL, 2, 3),
  ('free', 'Gratis', 3, NULL, 3, 5, NULL)
ON CONFLICT ("id") DO NOTHING;
