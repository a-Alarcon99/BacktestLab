// Local only: gives an account the internal `admin` plan (no quotas). Run from apps/web with
//   npm run admin:grant -- you@example.com
// Needs `ALLOW_ADMIN_PLAN=true` in .env.local; production never sets it, and `resolveIdentity`
// ignores the plan without it. Uses DIRECT_DATABASE_URL (falls back to DATABASE_URL).
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env" });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:grant -- <email>");
  process.exit(1);
}
if (process.env.ALLOW_ADMIN_PLAN !== "true") {
  console.error("Refusing: set ALLOW_ADMIN_PLAN=true in .env.local (local machine only).");
  process.exit(1);
}

const sql = postgres(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!, { prepare: false, max: 1 });
try {
  const [user] = await sql`select id from "user" where lower(email) = ${email}`;
  if (!user) {
    console.error(`No account with email ${email}.`);
    process.exit(1);
  }
  await sql`
    insert into plans (id, name, max_strategies, max_backtests_total, max_backtests_per_day, history_size,
                       max_batch_items, max_mc_paths, ip_share_multiplier, listed, sort_order)
    values ('admin', 'Admin', null, null, null, 500, 100, 1000, null, false, 99)
    on conflict (id) do nothing`;
  await sql`
    insert into user_plans (user_id, plan_id, expires_at) values (${user.id}, 'admin', null)
    on conflict (user_id) do update set plan_id = 'admin', expires_at = null, updated_at = now()`;
  console.log(`${email} now has the admin plan.`);
} finally {
  await sql.end();
}
