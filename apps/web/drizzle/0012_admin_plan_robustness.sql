-- Robustness tests (rolling windows, parameter sensitivity, neighbouring timeframes) cost one
-- backtest per simulation, so the per-run cap (`max_batch_items`) grows: a 2-parameter sensitivity
-- grid is 25 simulations. The quotas stay the real ceiling.
UPDATE "plans" SET "max_batch_items" = 5 WHERE "id" = 'free';--> statement-breakpoint
UPDATE "plans" SET "max_batch_items" = 25 WHERE "id" = 'pro';--> statement-breakpoint
UPDATE "plans" SET "max_batch_items" = 50 WHERE "id" = 'max';--> statement-breakpoint
-- Internal plan for the owner's own account(s): no quota, no strategy cap, big history. Assigned
-- through `user_plans`; not listed on the public plans page.
INSERT INTO "plans" ("id", "name", "max_strategies", "max_backtests_total", "max_backtests_per_day", "history_size", "max_batch_items", "ip_share_multiplier", "listed", "sort_order")
VALUES ('admin', 'Admin', NULL, NULL, NULL, 500, 100, NULL, false, 99)
ON CONFLICT ("id") DO NOTHING;
