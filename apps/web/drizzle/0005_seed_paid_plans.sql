-- Public plan catalog. Limits are the enforced values (NULL = unlimited); prices are US cents and
-- NULL = not purchasable. Paid access is time-limited through user_plans.expires_at.
UPDATE "plans" SET
  "listed" = true, "sort_order" = 0,
  "tagline" = 'Para probar ideas y aprender',
  "features" = '["Todos los activos y temporalidades","Todas las condiciones y patrones de velas","Estrategias predefinidas","Repetición animada del backtest"]'::jsonb
WHERE "id" = 'free';

INSERT INTO "plans" ("id", "name", "max_strategies", "max_backtests_total", "max_backtests_per_day", "history_size", "ip_share_multiplier", "listed", "sort_order", "tagline", "features", "price_monthly_cents", "price_yearly_cents")
VALUES
  ('pro', 'Pro', 50, NULL, 30, 50, NULL, true, 1,
   'Para quien itera estrategias cada semana',
   '["Todo lo del plan Gratis","30 backtests al día","Hasta 50 estrategias","Historial de 50 backtests"]'::jsonb,
   900, 9000),
  ('max', 'Max', NULL, NULL, 150, 200, NULL, true, 2,
   'Para uso intensivo y optimización',
   '["Todo lo del plan Pro","150 backtests al día","Estrategias ilimitadas","Historial de 200 backtests"]'::jsonb,
   2400, 24000)
ON CONFLICT ("id") DO NOTHING;
