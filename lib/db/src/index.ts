import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

// db is null when DATABASE_URL is not set (e.g. when using Supabase JS client instead)
export const db = pool ? drizzle(pool, { schema }) : (null as unknown as ReturnType<typeof drizzle>);

export * from "./schema";
