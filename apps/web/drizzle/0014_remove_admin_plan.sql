-- The internal `admin` plan (migration 0012) must not exist in production. It is now created only
-- on the owner's machine by `npm run admin:grant`, and `resolveIdentity` ignores it unless
-- `ALLOW_ADMIN_PLAN=true`.
DELETE FROM "user_plans" WHERE "plan_id" = 'admin';--> statement-breakpoint
DELETE FROM "plans" WHERE "id" = 'admin';
