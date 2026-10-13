import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Same files Next.js reads; the first one wins for each variable.
config({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema",
  out: "./drizzle",
  dbCredentials: {
    // Direct connection (port 5432) — migrations need a session, not the transaction pooler.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
