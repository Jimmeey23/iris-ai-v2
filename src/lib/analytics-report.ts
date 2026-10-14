import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import type { Identity } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { metricSql } from "@/lib/reports";
import { ticketScope } from "@/lib/tickets";
import { dayBuckets, round1, slaCompliance, zonedDayEnd, zonedDayStart } from "@/lib/metrics";
import { findRecurrence } from "@/lib/recurrence";
import { analyticsIntel, reportWindow } from "@/lib/analytics-intel";
import { loadPatternData } from "@/lib/trend-data";
import { buildPatterns } from "@/lib/trend-patterns";

const n = (label: string, where: SQL) => sql<number>`count(*) filter (where ${where})::int`.as(label);

/**
 * Everything the Trend dashboard shows, for one person's scope and one window. Shared by the
 * dashboard route, the AI briefing and the weekly report, so all three read the same numbers.
 */
export async function computeAnalytics(user: Identity, params: URLSearchParams) {
    const cfg = await getConfig();
    const tz = cfg.timezone;
    const nowMs = Date.now(), now = new Date(nowMs);
    // The same window rule the drill-down uses, so a drilled list matches the number it came from.
    const { range, from, to, studio, department } = reportWindow(params, tz, nowMs, zonedDayStart, zonedDayEnd);
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

    // What keeps coming back, and everything that reads it, start now and run alongside the
    // breakdowns below rather than after them: same window, same scope.
    const recurrenceP = findRecurrence(from ? new Date(from) : null, new Date(to), where, now);
    const intelP = analyticsIntel({ scope: allTimeWhere, from, to, tz, now, recurrence: recurrenceP });
    // Neither is awaited until the breakdowns are in; keep a rejection from going unhandled meanwhile.
    const patternDataP = loadPatternData({ scope: allTimeWhere, from, to });
    recurrenceP.catch(() => {}); intelP.catch(() => {}); patternDataP.catch(() => {});
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
    const [recurrence, intel, patternData] = await Promise.all([recurrenceP, intelP, patternDataP]);
    const medianResolutionHours = round1(t.median === null ? null : Number(t.median));
    const breached = t.breachedOpen + t.breachedResolved;
    // Patterns read a nine-week baseline and the shape of the data, not just this period
    // against the last; see lib/trend-patterns for what each detector means.
    const patterns = buildPatterns({
      ...patternData,
      breakdowns: intel.breakdowns,
      categoryRows: intel.breakdowns.category,
      totals: { open: t.open, slaCompliance: slaCompliance(t.tracked, breached), medianResolutionHours },
      previous: intel.previous,
      weekly: intel.weekly,
      heatmap: intel.heatmap,
      recurrence,
      toMs: to,
    });
    const createdBy = new Map(createdTrend.map((r) => [r.day, r.count]));
    const resolvedBy = new Map(resolvedTrend.map((r) => [r.day, r.count]));
    return {
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
        medianResolutionHours,
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
      // What keeps coming back: the same unit, member, trainer, room or theme. Computed over
      // the same window and scope as everything else on the page.
      recurrence,
      ...intel,
      patterns,
      ownerLeaderboard: ownerLifetime.map(o => ({...o, name: o.name || 'Unassigned', medianHours: round1(o.medianHours === null ? null : Number(o.medianHours))})).sort((a, b) => b.closed - a.closed || b.assigned - a.assigned),
      scope: {
        from: from ? new Date(from).toISOString() : null,
        to: new Date(to).toISOString(),
        studio,
        department,
      },
      computedAt: now.toISOString(),
    };
}

export type AnalyticsReport = Awaited<ReturnType<typeof computeAnalytics>>;
