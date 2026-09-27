import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * TLS. When DATABASE_CA_CERT holds the provider's root certificate (PEM; Supabase:
 * Dashboard → Database → SSL Configuration → Download certificate), the server
 * certificate is fully verified. Without it, Supabase hosts keep the previous
 * behaviour — encrypted but unverified, because the pooler's chain does not reach
 * Node's default CA bundle — and other hosts (local Postgres) connect as before.
 * `\n` escapes are accepted so the PEM can live on one line in an env var.
 */
function sslConfig(url: string): PoolConfig["ssl"] {
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  if (url.includes("supabase.com")) return { rejectUnauthorized: false };
  return undefined;
}

/**
 * Serverless sizing: every Vercel function instance gets its own pool, so a small
 * per-instance cap keeps the total under the Supabase pooler's client limit even when
 * many instances are warm. DB_POOL_MAX overrides it (e.g. for a long-lived server).
 */
const poolMax = Number.parseInt(process.env.DB_POOL_MAX ?? "", 10);

// Reuse the pool across module evaluations in dev so we don't leak connection
// pools or keep re-registering error listeners on every Fast Refresh.
const existingPool = globalForDb.__arenaNextJsPostgresqlPool;
export const pool =
  existingPool ??
  new Pool({
    connectionString: databaseUrl,
    keepAlive: true,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 3,
    // Close idle clients quickly: a suspended function should not hold pooler slots.
    idleTimeoutMillis: 5000,
    // Fail fast rather than letting requests queue invisibly behind an exhausted pool.
    connectionTimeoutMillis: 10000,
    ssl: sslConfig(databaseUrl),
  });

if (!existingPool) {
  // An idle client dropped by the pooler emits `error` on the pool; without a
  // listener Node treats it as unhandled and tears down the process. Attach it
  // only once, when the pool is first created.
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  // On Vercel (Fluid compute) this keeps the instance alive just long enough to
  // close idle clients before suspension, so connections are not leaked. It is a
  // no-op everywhere else.
  attachDatabasePool(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }
}

export const db = drizzle(pool, { schema });
