import { NextRequest } from "next/server";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { requireWorkspace, errorResponse } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { metricSql } from "@/lib/reports";
import { ticketScope } from "@/lib/tickets";
import { dayBuckets, round1, slaCompliance, zonedDayEnd, zonedDayStart } from "@/lib/metrics";
export const dynamic = "force-dynamic";

const n = (label: string, where: SQL) => sql<number>`count(*) filter (where ${where})::int`.as(label);

export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    const cfg = await getConfig();
    const tz = cfg.timezone;
    const nowMs = Date.now(), now = new Date(nowMs);
    const range = req.nextUrl.searchParams.get("range") || "30";
    const fromParam = req.nextUrl.searchParams.get("from"),
      toParam = req.nextUrl.searchParams.get("to");
    // Custom dates are whole days in the workspace timezone (IST by default).
    const from = (fromParam ? zonedDayStart(fromParam, tz) : null) ??
      (range === "all" ? 0 : nowMs - Math.min(Number(range) || 30, 730) * 86400000);
    const to = (toParam ? zonedDayEnd(toParam, tz) : null) ?? nowMs;
    const studio = req.nextUrl.searchParams.get("studio") || "",
      department = req.nextUrl.searchParams.get("department") || "";
    // Range, studio, department and access all run in SQL against tickets_created_idx, and the
    // numbers come back as aggregates — no ticket rows are read into the route at all.
    const clauses: (SQL | undefined)[] = [
      gte(tickets.createdAt, new Date(from)),
      lte(tickets.createdAt, new Date(to)),
      ticketScope(user),
    ];
    if (studio) clauses.push(eq(tickets.studio, studio));
    if (department) clauses.push(eq(tickets.departmentName, department));
    const where = and(...clauses.filter((c): c is SQL => Boolean(c)));
    const allTimeClauses: (SQL | undefined)[] = [ticketScope(user)];
    if (studio) allTimeClauses.push(eq(tickets.studio, studio));
    if (department) allTimeClauses.push(eq(tickets.departmentName, department));
    const allTimeWhere = and(...allTimeClauses.filter((c): c is SQL => Boolean(c)));

    const days = dayBuckets(range === "7" ? 7 : 14, to, tz);
    const trendFrom = new Date(Math.max(from, zonedDayStart(days[0].date, tz) ?? from));
    const createdDay = sql<string>`to_char(${tickets.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
    const resolvedDay = sql<string>`to_char(${tickets.resolvedAt} at time zone ${tz}, 'YYYY-MM-DD')`;
    const dims = {
      category: tickets.category, status: tickets.status, priority: tickets.priority, studio: tickets.studio,
      departmentName: tickets.departmentName, assignedStaffName: tickets.assignedStaffName, source: tickets.source,
    };
    const dimNames = Object.keys(dims) as (keyof typeof dims)[];
    const dimCols = Object.values(dims);

    const [[t], groups, createdTrend, resolvedTrend, ownerLifetime] = await Promise.all([
      db.select({
        all: sql<number>`count(*)::int`,
        open: n("open", metricSql.open),
        resolved: n("resolved", metricSql.resolved),
        recorded: n("recorded", metricSql.recordOnly),
        critical: n("critical", and(metricSql.open, eq(tickets.priority, "critical")) as SQL),
        tracked: n("tracked", metricSql.tracked),
        breachedOpen: n("breached_open", metricSql.breachedOpen(now)),
        breachedResolved: n("breached_resolved", metricSql.breachedResolved()),
        iris: n("iris", eq(tickets.source, "iris")),
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${metricSql.resolutionHours}) filter (where ${metricSql.durationEligible})`,
      }).from(tickets).where(where),
      // Every breakdown, and the per-owner table, from one GROUPING SETS pass.
      db.select({
        ...Object.fromEntries(dimNames.map((k) => [k, dims[k]])),
        rolled: sql<string>`(${sql.join(dimCols.map((c) => sql`grouping(${c})::text`), sql` || `)})`,
        total: sql<number>`count(*)::int`,
        open: n("open", metricSql.open),
        resolved: n("resolved", metricSql.resolved),
        overdue: n("overdue", metricSql.breachedOpen(now)),
      }).from(tickets).where(where)
        .groupBy(sql`grouping sets (${sql.join(dimCols.map((c) => sql`(${c})`), sql`, `)})`),
      // Grouped by ordinal: the timezone is a bind parameter, so repeating the expression in
      // GROUP BY would be a different parameter and Postgres would reject it.
      db.select({ day: createdDay, count: sql<number>`count(*)::int` }).from(tickets)
        .where(and(where, gte(tickets.createdAt, trendFrom))).groupBy(sql`1`),
      db.select({ day: resolvedDay, count: sql<number>`count(*)::int` }).from(tickets)
        .where(and(where, gte(tickets.resolvedAt, trendFrom))).groupBy(sql`1`),
      db.select({
        name: tickets.assignedStaffName,
        assigned: sql<number>`count(*)::int`,
        open: n('open', metricSql.open),
        closed: n('closed', metricSql.resolved),
        overdue: n('overdue', metricSql.breachedOpen(now)),
        critical: n('critical', and(metricSql.open, eq(tickets.priority, 'critical')) as SQL),
        medianHours: sql<number | null>`percentile_cont(0.5) within group (order by ${metricSql.resolutionHours}) filter (where ${metricSql.durationEligible})`,
      }).from(tickets).where(allTimeWhere).groupBy(tickets.assignedStaffName),
    ]);

    const by: Record<string, Record<string, number>> = Object.fromEntries(dimNames.map((k) => [k, {}]));
    const owners: { name: string; total: number; open: number; resolved: number; overdue: number }[] = [];
    for (const g of groups as unknown as (Record<string, string | null> & { rolled: string; total: number; open: number; resolved: number; overdue: number })[]) {
      const i = g.rolled.indexOf("0");
      if (i < 0) continue;
      const dim = dimNames[i], key = g[dim] || "Unassigned";
      by[dim][key] = (by[dim][key] || 0) + g.total;
      if (dim === "assignedStaffName") owners.push({ name: key, total: g.total, open: g.open, resolved: g.resolved, overdue: g.overdue });
    }
    const createdBy = new Map(createdTrend.map((r) => [r.day, r.count]));
    const resolvedBy = new Map(resolvedTrend.map((r) => [r.day, r.count]));
    const breached = t.breachedOpen + t.breachedResolved;
    return Response.json({
      totals: {
        all: t.all,
        open: t.open,
        resolved: t.resolved,
        recorded: t.recorded,
        critical: t.critical,
        breached,
        breachedOpen: t.breachedOpen,
        breachedResolved: t.breachedResolved,
        iris: t.iris,
        slaCompliance: slaCompliance(t.tracked, breached),
        medianResolutionHours: round1(t.median === null ? null : Number(t.median)),
      },
      trend: days.map((d) => ({ ...d, created: createdBy.get(d.date) || 0, resolved: resolvedBy.get(d.date) || 0 })),
      byCategory: by.category,
      byStatus: by.status,
      byPriority: by.priority,
      byStudio: by.studio,
      byDepartment: by.departmentName,
      byAssignee: by.assignedStaffName,
      bySource: by.source,
      owners: owners.sort((a, b) => b.total - a.total),
      ownerLeaderboard: ownerLifetime.map(o => ({...o, name: o.name || 'Unassigned', medianHours: round1(o.medianHours === null ? null : Number(o.medianHours))})).sort((a, b) => b.closed - a.closed || b.assigned - a.assigned),
      scope: {
        from: from ? new Date(from).toISOString() : null,
        to: new Date(to).toISOString(),
        studio,
        department,
      },
      computedAt: now.toISOString(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
