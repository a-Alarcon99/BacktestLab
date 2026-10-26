-- Starter limits go up a little and multi-asset runs get a per-plan cap (`max_batch_items`):
-- every asset of a batch consumes one backtest, so the quotas stay the real ceiling.
UPDATE "plans" SET "max_backtests_total" = 3, "max_batch_items" = 1 WHERE "id" = 'guest';--> statement-breakpoint
UPDATE "plans" SET "max_backtests_per_day" = 5, "max_batch_items" = 3 WHERE "id" = 'free';--> statement-breakpoint
UPDATE "plans" SET "max_batch_items" = 10 WHERE "id" = 'pro';--> statement-breakpoint
UPDATE "plans" SET "max_batch_items" = 20 WHERE "id" = 'max';
