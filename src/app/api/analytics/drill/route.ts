/**
 * `GET /api/analytics/drill` — the tickets behind any number on the Trend dashboard.
 *
 * Takes the dashboard's own window and filters (range, from, to, studio, department), plus
 * either `ids` (a recurrence cluster's tickets) or any of `f.<dimension>=<value>` (a breakdown
 * row, combinable), `dow`+`hour` (a heatmap cell), `age` (an ageing bucket) and `state`
 * (open | overdue | resolved). Returns the matching rows and a profile of them: counts by
 * status, priority, studio, owner, subcategory and trainer, a weekly series, and the headline
 * figures — so the drawer can explain the slice, not just list it.
 */
import { NextRequest } from "next/server";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { requireWorkspace, errorResponse } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { metricSql } from "@/lib/reports";
import { ticketScope } from "@/lib/tickets";
import { round1, slaCompliance, zonedDayEnd, zonedDayStart } from "@/lib/metrics";
import { queryKey, shortCache } from "@/lib/short-cache";
import { AGE_BUCKETS, DIM_SQL, DRILL_DIMS, reportWindow, type DrillDim } from "@/lib/analytics-intel";

export const dynamic = "force-dynamic";
const LIMIT = 400;
const n = (where: SQL) => sql<number>`count(*) filter (where ${where})::int`;

export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    // A minute's reuse per person and slice: reopening a drill, or stepping back out of a
    // narrowed one, costs nothing.
    const body = await shortCache(`drill:${user.id}:${queryKey(req.nextUrl.searchParams)}`, 60_000, async () => {
    const cfg = await getConfig();
    const tz = cfg.timezone;
    const now = new Date();
    const q = req.nextUrl.searchParams;
    const w = reportWindow(q, tz, now.getTime(), zonedDayStart, zonedDayEnd);
    const ids = (q.get("ids") || "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 500);
    const clauses: (SQL | undefined)[] = [ticketScope(user)];
    // A cluster's ids already carry its window; re-applying the range would only drop rows
    // the dashboard counted at the edges.
    if (ids.length) clauses.push(inArray(tickets.id, ids));
    else clauses.push(gte(tickets.createdAt, new Date(w.from)), lte(tickets.createdAt, new Date(w.to)));
    if (w.studio) clauses.push(eq(tickets.studio, w.studio));
    if (w.department) clauses.push(eq(tickets.departmentName, w.department));
    const applied: {dim: string; value: string}[] = [];
    for (const dim of DRILL_DIMS) {
      const value = q.get("f." + dim);
      if (value === null) continue;
      clauses.push(sql`${DIM_SQL[dim as DrillDim]} = ${value}`);
      applied.push({ dim, value });
    }
    const dow = q.get("dow"), hour = q.get("hour");
    if (dow !== null) clauses.push(sql`extract(isodow from ${tickets.createdAt} at time zone ${tz})::int - 1 = ${Number(dow)}`);
    if (hour !== null) clauses.push(sql`extract(hour from ${tickets.createdAt} at time zone ${tz})::int = ${Number(hour)}`);
    const age = AGE_BUCKETS.find((b) => b.bucket === q.get("age"));
    if (age) {
      clauses.push(metricSql.open, sql`${tickets.source} <> 'system'`);
      clauses.push(sql`${now}::timestamptz - ${tickets.createdAt} >= ${age.from} * interval '1 day'`);
      if (age.to !== null) clauses.push(sql`${now}::timestamptz - ${tickets.createdAt} < ${age.to} * interval '1 day'`);
    }
    const state = q.get("state");
    if (state === "open") clauses.push(metricSql.open);
    if (state === "overdue") clauses.push(metricSql.breachedOpen(now));
    if (state === "resolved") clauses.push(metricSql.resolved);
    const where = and(...clauses.filter((c): c is SQL => Boolean(c)));

    const by = (dim: DrillDim, limit = 8) =>
      db.select({ key: sql<string>`${DIM_SQL[dim]}`, count: sql<number>`count(*)::int`, open: n(metricSql.open) })
        .from(tickets).where(where).groupBy(sql`1`).orderBy(sql`2 desc`).limit(limit);
    const week = sql<string>`to_char(date_trunc('week', ${tickets.createdAt} at time zone ${tz}), 'YYYY-MM-DD')`;

    const [rows, [k], status, priority, studio, owner, subcategory, trainer, weekly] = await Promise.all([
      db.select({
        id: tickets.id, ticketNumber: tickets.ticketNumber, title: tickets.title, status: tickets.status, priority: tickets.priority,
        category: tickets.category, subcategory: tickets.subcategory, studio: tickets.studio, memberName: tickets.memberName,
        trainer: tickets.trainer, assignedStaffName: tickets.assignedStaffName, departmentName: tickets.departmentName,
        createdAt: tickets.createdAt, resolvedAt: tickets.resolvedAt, slaDueAt: tickets.slaDueAt, resolutionRequired: tickets.resolutionRequired,
        isEscalated: tickets.isEscalated,
      }).from(tickets).where(where).orderBy(desc(tickets.createdAt)).limit(LIMIT),
      db.select({
        total: sql<number>`count(*)::int`, open: n(metricSql.open), resolved: n(metricSql.resolved),
        overdue: n(metricSql.breachedOpen(now)),
        breached: sql<number>`(count(*) filter (where ${metricSql.breachedOpen(now)}) + count(*) filter (where ${metricSql.breachedResolved()}))::int`,
        tracked: n(metricSql.tracked), critical: n(sql`${tickets.priority} = 'critical'`),
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${metricSql.resolutionHours}) filter (where ${metricSql.durationEligible})`,
        first: sql<string | null>`min(${tickets.createdAt})`, last: sql<string | null>`max(${tickets.createdAt})`,
        members: sql<number>`count(distinct ${tickets.memberName})::int`,
      }).from(tickets).where(where),
      by("status"), by("priority"), by("studio"), by("owner"), by("subcategory"), by("trainer"),
      db.select({ week, count: sql<number>`count(*)::int` }).from(tickets).where(where).groupBy(sql`1`).orderBy(sql`1`),
    ]);
    return {
      applied,
      totals: {
        total: k.total, open: k.open, resolved: k.resolved, overdue: k.overdue, critical: k.critical, members: k.members,
        slaCompliance: slaCompliance(k.tracked, k.breached),
        medianResolutionHours: round1(k.median === null ? null : Number(k.median)),
        firstSeen: k.first, lastSeen: k.last,
      },
      breakdown: { status, priority, studio, owner, subcategory, trainer },
      weekly,
      tickets: rows,
      truncated: k.total > rows.length,
    };
    }, { fresh: req.nextUrl.searchParams.has("fresh") });
    return Response.json(body);
  } catch (e) {
    return errorResponse(e);
  }
}
