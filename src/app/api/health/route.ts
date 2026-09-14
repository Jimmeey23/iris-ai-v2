import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureSeeded();
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[health] failed:', error instanceof Error ? error.stack : error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
