import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";
import { newDb } from "pg-mem";
import fs from "fs";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsMemDb?: any;
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

function createMemDbPool(): Pool {
  if (globalForDb.__arenaNextJsMemDb) {
    return globalForDb.__arenaNextJsMemDb.pool;
  }
  const mem = newDb();
  mem.public.registerFunction({
    name: "gen_random_uuid",
    implementation: () => require("crypto").randomUUID(),
  });
  mem.public.registerFunction({
    name: "pg_advisory_xact_lock",
    args: [mem.public.getType("integer" as any)],
    implementation: (_lockId: number) => null,
  });
  mem.public.registerFunction({
    name: "hashtext",
    args: [mem.public.getType("text" as any)],
    implementation: (_text: string) => 12345,
  });
  mem.public.registerFunction({
    name: "btrim",
    args: [mem.public.getType("text" as any)],
    implementation: (text: string) => (text ? text.trim() : text),
  });
  mem.public.registerFunction({
    name: "lpad",
    args: [
      mem.public.getType("text" as any),
      mem.public.getType("integer" as any),
      mem.public.getType("text" as any),
    ],
    implementation: (str: string, len: number, pad: string) =>
      String(str).padStart(len, pad),
  });

  const cwd = process.cwd();
  const sql0Path = path.join(cwd, "drizzle", "0000_baseline.sql");
  const sql1Path = path.join(cwd, "drizzle", "0001_nice_random.sql");

  if (fs.existsSync(sql0Path)) {
    const sql0 = fs.readFileSync(sql0Path, "utf-8");
    mem.public.none(sql0);
  }
  if (fs.existsSync(sql1Path)) {
    const sql1 = fs.readFileSync(sql1Path, "utf-8");
    mem.public.none(sql1);
  }

  const pg = mem.adapters.createPg();
  (pg as any).types = {
    getTypeParser: () => (val: unknown) => val,
    setTypeParser: () => {},
  };

  const poolInstance = new pg.Pool() as unknown as Pool;
  globalForDb.__arenaNextJsMemDb = { mem, pool: poolInstance };
  return poolInstance;
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
  (!databaseUrl || databaseUrl === "memory"
    ? createMemDbPool()
    : new Pool({
        connectionString: databaseUrl,
        keepAlive: true,
        max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 3,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 10000,
        ssl: sslConfig(databaseUrl),
      }));

if (!existingPool && databaseUrl && databaseUrl !== "memory") {
  pool.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });

  attachDatabasePool(pool);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__arenaNextJsPostgresqlPool = pool;
  }
}

export const db = drizzle(pool, { schema });
