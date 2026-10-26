ALTER TABLE "plans" ADD COLUMN "max_mc_paths" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Monte Carlo over synthetic paths: paths per run by plan (guests: none). A run costs a fixed number
-- of backtests whatever the number of paths, so this only bounds the work of one request.
UPDATE "plans" SET "max_mc_paths" = 100 WHERE "id" = 'free';--> statement-breakpoint
UPDATE "plans" SET "max_mc_paths" = 500 WHERE "id" = 'pro';--> statement-breakpoint
UPDATE "plans" SET "max_mc_paths" = 1000 WHERE "id" IN ('max', 'admin');
