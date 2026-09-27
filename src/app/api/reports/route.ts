import { NextRequest } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { departments, tickets } from "@/db/schema";
import { requireWorkspace, errorResponse, ApiError } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { buildReportCatalogue, metricSql, orderedGroups, type TicketLike } from "@/lib/reports";
import { ticketScope } from "@/lib/tickets";
import { dayBuckets, round1, slaCompliance, zonedDayEnd, zonedDayStart } from "@/lib/metrics";
export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const n = (label: string, where: SQL) => sql<number>`count(*) filter (where ${where})::int`.as(label);

export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    const p = req.nextUrl.searchParams;
    const [cfg, depts] = await Promise.all([
      getConfig(),
      db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.active, true)).orderBy(asc(departments.name)),
    ]);
    const now = new Date();
    const tz = cfg.timezone;
    // The catalogue follows the workspace's configured taxonomy, studios and departments.
    const catalogue = buildReportCatalogue({
      categories: Object.keys(cfg.taxonomy), studios: cfg.studios, departments: depts,
      now, slaWarningPercent: cfg.slaWarningPercent,
    });
    if (p.get("list") === "true")
      return Response.json({
        reports: catalogue.map((r) => ({ id: r.id, name: r.name, description: r.description, group: r.group, columns: r.columns })),
        groups: orderedGroups(catalogue),
      });
    const def = catalogue.find((r) => r.id === p.get("type"));
    if (!def) throw new ApiError("Unknown report type", 404);
    const search = (p.get("search") || "").trim().toLowerCase();
    const studio = p.get("studio") || "";
    const priority = p.get("priority") || "";
    const status = p.get("status") || "";
    // Custom dates are whole workspace-timezone days.
    const fromMs = p.get("from") ? zonedDayStart(p.get("from")!, tz) : null;
    const toMs = p.get("to") ? zonedDayEnd(p.get("to")!, tz) : null;
    const page = Math.max(0, Number(p.get("page")) || 0);
    const pageSize = Math.min(200, Math.max(5, Number(p.get("pageSize")) || 25));
    const exportAll = p.get("all") === "true";

    // Access, the report's own selection and every filter run in SQL, so only the requested
    // page of rows ever leaves the database.
    const clauses: (SQL | undefined)[] = [ticketScope(user), def.where];
    if (fromMs !== null) clauses.push(sql`${tickets.createdAt} >= ${new Date(fromMs)}`);
    if (toMs !== null) clauses.push(sql`${tickets.createdAt} <= ${new Date(toMs)}`);
    if (studio) clauses.push(eq(tickets.studio, studio));
    if (priority) clauses.push(eq(tickets.priority, priority));
    if (status) clauses.push(eq(tickets.status, status));
    if (search) {
      const like = "%" + search.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
      clauses.push(or(ilike(tickets.title, like), ilike(tickets.ticketNumber, like), ilike(tickets.memberName, like), ilike(tickets.subcategory, like)));
    }
    const where = and(...clauses.filter((c): c is SQL => Boolean(c)));

    const rowColumns = {
      id: tickets.id, ticketNumber: tickets.ticketNumber, title: tickets.title, category: tickets.category,
      subcategory: tickets.subcategory, status: tickets.status, priority: tickets.priority, studio: tickets.studio,
      classFormat: tickets.classFormat, trainer: tickets.trainer, assignedStaffName: tickets.assignedStaffName,
      memberName: tickets.memberName, source: tickets.source, departmentName: tickets.departmentName,
      kind: tickets.kind, sentiment: tickets.sentiment,
      slaDueAt: tickets.slaDueAt, resolvedAt: tickets.resolvedAt, createdAt: tickets.createdAt,
      ...(def.needsCustomFields ? { customFields: tickets.customFields } : {}),
    };
    const rowQuery = db.select(rowColumns).from(tickets).where(where).orderBy(desc(tickets.createdAt));
    const weekAgo = new Date(now.getTime() - 7 * 864e5), twoWeeksAgo = new Date(now.getTime() - 14 * 864e5);
    const trendDays = dayBuckets(14, now.getTime(), tz);
    const trendFrom = new Date(zonedDayStart(trendDays[0].date, tz) ?? now.getTime() - 14 * 864e5);
    const hours = metricSql.resolutionHours;
    const eligible = metricSql.durationEligible;
    const createdDay = sql<string>`to_char(${tickets.createdAt} at time zone ${tz}, 'YYYY-MM-DD')`;
    const resolvedDay = sql<string>`to_char(${tickets.resolvedAt} at time zone ${tz}, 'YYYY-MM-DD')`;
    const dims = {
      status: tickets.status, priority: tickets.priority, studio: tickets.studio, category: tickets.category,
      subcategory: tickets.subcategory, department: tickets.departmentName, source: tickets.source,
      sentiment: tickets.sentiment, kind: tickets.kind, owner: tickets.assignedStaffName,
    };
    const dimNames = Object.keys(dims) as (keyof typeof dims)[];
    const dimCols = Object.values(dims);

    const [pageRows, [m], groups, createdTrend, resolvedTrend] = await Promise.all([
      exportAll ? rowQuery : rowQuery.limit(pageSize).offset(page * pageSize),
      db.select({
        total: sql<number>`count(*)::int`,
        open: n("open", metricSql.open),
        resolved: n("resolved", metricSql.resolved),
        recorded: n("recorded", metricSql.recordOnly),
        critical: n("critical", eq(tickets.priority, "critical")),
        high: n("high", eq(tickets.priority, "high")),
        escalated: n("escalated", eq(tickets.isEscalated, true)),
        tracked: n("tracked", metricSql.tracked),
        breachedOpen: n("breached_open", metricSql.breachedOpen(now)),
        breachedResolved: n("breached_resolved", metricSql.breachedResolved()),
        avg: sql<number | null>`avg(${hours}) filter (where ${eligible})::float8`,
        median: sql<number | null>`percentile_cont(0.5) within group (order by ${hours}) filter (where ${eligible})`,
        p90: sql<number | null>`percentile_disc(0.9) within group (order by ${hours}) filter (where ${eligible})`,
        oldestOpen: sql<string | null>`min(${tickets.createdAt}) filter (where ${metricSql.open})`,
        last7: n("last7", sql`${tickets.createdAt} > ${weekAgo}`),
        prev7: n("prev7", sql`${tickets.createdAt} <= ${weekAgo} and ${tickets.createdAt} > ${twoWeeksAgo}`),
      }).from(tickets).where(where),
      // Every breakdown and the owner table from one GROUPING SETS pass.
      db.select({
        ...Object.fromEntries(dimNames.map((k) => [k, dims[k]])),
        rolled: sql<string>`(${sql.join(dimNames.map((_, i) => sql`grouping(${dimCols[i]})::text`), sql` || `)})`,
        total: sql<number>`count(*)::int`,
        open: n("open", metricSql.open),
        resolved: n("resolved", metricSql.resolved),
        overdue: n("overdue", metricSql.breachedOpen(now)),
      }).from(tickets).where(where)
        .groupBy(sql`grouping sets (${sql.join(dimCols.map((c) => sql`(${c})`), sql`, `)})`),
      // Grouped by ordinal: the timezone is a bind parameter, so repeating the expression in
      // GROUP BY would be a different parameter and Postgres would reject it.
      db.select({ day: createdDay, count: sql<number>`count(*)::int` }).from(tickets)
        .where(and(where, sql`${tickets.createdAt} >= ${trendFrom}`)).groupBy(sql`1`),
      db.select({ day: resolvedDay, count: sql<number>`count(*)::int` }).from(tickets)
        .where(and(where, sql`${tickets.resolvedAt} >= ${trendFrom}`)).groupBy(sql`1`),
    ]);

    const breakdown: Record<string, Record<string, number>> = Object.fromEntries(dimNames.map((k) => [k, {}]));
    const ownerAgg: Record<string, { name: string; total: number; open: number; resolved: number; overdue: number }> = {};
    for (const g of groups as unknown as (Record<string, string | null> & { rolled: string; total: number; open: number; resolved: number; overdue: number })[]) {
      const i = g.rolled.indexOf("0");
      if (i < 0) continue;
      const dim = dimNames[i], key = String(g[dim] ?? "") || "Unassigned";
      breakdown[dim][key] = (breakdown[dim][key] || 0) + g.total;
      if (dim === "owner") ownerAgg[key] = { name: key, total: g.total, open: g.open, resolved: g.resolved, overdue: g.overdue };
    }
    const sorted = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).sort((a, b) => b[1] - a[1]));
    const createdBy = new Map(createdTrend.map((r) => [r.day, r.count]));
    const resolvedBy = new Map(resolvedTrend.map((r) => [r.day, r.count]));
    const trend = trendDays.map((d) => ({ ...d, created: createdBy.get(d.date) || 0, resolved: resolvedBy.get(d.date) || 0 }));

    const total = m.total;
    const breached = m.breachedOpen + m.breachedResolved;
    const metrics = {
      total,
      open: m.open,
      resolved: m.resolved,
      recorded: m.recorded,
      critical: m.critical,
      high: m.high,
      escalated: m.escalated,
      avgResolutionHours: round1(m.avg === null ? null : Number(m.avg)),
      medianResolutionHours: round1(m.median === null ? null : Number(m.median)),
      p90ResolutionHours: round1(m.p90 === null ? null : Number(m.p90)),
      slaCompliance: slaCompliance(m.tracked, breached),
      slaBreached: breached,
      slaOverdue: m.breachedOpen,
      slaResolvedLate: m.breachedResolved,
      oldestOpenAgeHours: m.oldestOpen ? Math.round((now.getTime() - new Date(m.oldestOpen).getTime()) / 3600000) : null,
      last7: m.last7,
      prev7: m.prev7,
      resolutionRate: total ? Math.round((m.resolved / total) * 100) : 0,
    };
    const rows = (pageRows as (Omit<TicketLike, "slaDueAt" | "resolvedAt" | "createdAt"> & { slaDueAt: Date | null; resolvedAt: Date | null; createdAt: Date })[])
      .map((t) => def.row({ ...t, slaDueAt: iso(t.slaDueAt), resolvedAt: iso(t.resolvedAt), createdAt: t.createdAt.toISOString() }));
    return Response.json({
      id: def.id,
      name: def.name,
      description: def.description,
      group: def.group,
      columns: def.columns,
      rows,
      total,
      page,
      pageSize,
      hasMore: !exportAll && (page + 1) * pageSize < total,
      metrics,
      breakdowns: {
        byStatus: sorted(breakdown.status),
        byPriority: sorted(breakdown.priority),
        byStudio: sorted(breakdown.studio),
        byCategory: sorted(breakdown.category),
        bySubcategory: sorted(breakdown.subcategory),
        byDepartment: sorted(breakdown.department),
        bySource: sorted(breakdown.source),
        bySentiment: sorted(breakdown.sentiment),
        byKind: sorted(breakdown.kind),
      },
      trend,
      owners: Object.values(ownerAgg).sort((a, b) => b.total - a.total),
      generatedAt: now.toISOString(),
      filters: { search, studio, priority, status, from: p.get("from") || "", to: p.get("to") || "" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
