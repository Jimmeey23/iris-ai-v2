import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    keepAlive: true,
    idleTimeoutMillis: 30000,
    // The database is a long round-trip away, so a query holds its connection for a
    // comparatively long time. Cap the pool and fail fast rather than letting requests
    // queue invisibly behind an exhausted pool until they time out.
    max: 10,
    connectionTimeoutMillis: 10000,
    // Supabase requires TLS; its pooler presents a cert the default CA bundle
    // does not chain to, so verification is relaxed for that host only.
    ssl: databaseUrl.includes("supabase.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

// An idle client dropped by the pooler emits `error` on the pool; without a listener
// Node treats it as unhandled and tears down the process.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool, { schema });
