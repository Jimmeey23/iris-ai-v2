import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Liveness + database reachability. Read-only (`select 1`): it never seeds, migrates
 *  or writes, so uptime monitors can hit it freely. Reports nothing secret. */
export async function GET() {
  const meta = {
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "up", ...meta }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[health] database check failed:", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, db: "down", ...meta }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
