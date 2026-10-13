import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

// Reuse one client across dev hot reloads instead of opening a new pool on every edit.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

// Supabase transaction pooler (port 6543) does not support prepared statements.
const client = globalForDb.pgClient ?? postgres(process.env.DATABASE_URL!, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema });
