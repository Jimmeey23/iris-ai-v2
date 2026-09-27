import { NextRequest } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, isPreviewDb } from "@/db";
import { departments, tickets } from "@/db/schema";
import { requireWorkspace, errorResponse, ApiError } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { buildReportCatalogue, metricSql, type TicketLike } from "@/lib/reports";
import { ticketScope } from "@/lib/tickets";
import {
  dayBuckets, dayKey, isBreachedOpen, isOpen, isRecordOnly, isResolved, isSlaTracked,
  median, percentile, resolutionHours, round1, slaCompliance, zonedDayEnd, zonedDayStart,
} from "@/lib/metrics";
export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const n = (label: string, where: SQL) => sql<number>`count(*) filter (where ${where})::int`.as(label);

/* ── Preview (pg-mem) computation ──────────────────────────────────────────
 * The in-memory preview database cannot execute the report's aggregate SQL —
 * no ordered-set percentiles, no GROUPING SETS, no timestamptz arithmetic, no
 * AT TIME ZONE. Rather than fork the numbers, the preview derives every figure
 * from the full matching row set using the shared JS definitions in
 * lib/metrics — the exact rules the production SQL mirrors — and returns them
 * in the same shapes the route's downstream code expects. */
type PreviewRow = {
  id: number; ticketNumber: string; title: string; category: string; subcategory: string;
  status: string; priority: string; studio: string | null; classFormat: string | null;
  trainer: string | null; assignedStaffName: string | null; slaDueAt: Date | null;
  resolvedAt: Date | null; createdAt: Date; resolutionRequired: boolean | null;
  source: string | null; tags: string[] | null; isEscalated: boolean | null;
  sentiment: string | null; kind: string | null; departmentName: string | null;
};
type PreviewMetrics = {
  total: number; open: number; resolved: number; recorded: number; critical: number;
  high: number; escalated: number; tracked: number; breachedOpen: number;
  breachedResolved: number; avg: number | null; median: number | null; p90: number | null;
  oldestOpen: Date | null; last7: number; prev7: number;
};
type PreviewGroup = { rolled: string; total: number; open: number; resolved: number; overdue: number; [dim: string]: string | number | null };
type DayCount = { day: string; count: number };
type ReportFetch = [PreviewRow[], [PreviewMetrics], PreviewGroup[], DayCount[], DayCount[]];

/** Which row field each breakdown dimension reads (mirrors `dims` below). */
const DIM_FIELD: Record<string, keyof PreviewRow> = {
  status: "status", priority: "priority", studio: "studio", category: "category",
  subcategory: "subcategory", department: "departmentName", source: "source",
  sentiment: "sentiment", kind: "kind", owner: "assignedStaffName",
};

async function computePreviewReport(opts: {
  where: SQL | undefined;
  dimNames: string[];
  now: Date;
  tz: string;
  trendFrom: Date;
  page: number;
  pageSize: number;
  exportAll: boolean;
}): Promise<ReportFetch> {
  const { where, dimNames, now, tz, trendFrom, page, pageSize, exportAll } = opts;
  const all = (await db.select({
    id: tickets.id, ticketNumber: tickets.ticketNumber, title: tickets.title,
    category: tickets.category, subcategory: tickets.subcategory, status: tickets.status,
    priority: tickets.priority, studio: tickets.studio, classFormat: tickets.classFormat,
    trainer: tickets.trainer, assignedStaffName: tickets.assignedStaffName,
    slaDueAt: tickets.slaDueAt, resolvedAt: tickets.resolvedAt, createdAt: tickets.createdAt,
    resolutionRequired: tickets.resolutionRequired, source: tickets.source, tags: tickets.tags,
    isEscalated: tickets.isEscalated, sentiment: tickets.sentiment, kind: tickets.kind,
    departmentName: tickets.departmentName,
  }).from(tickets).where(where).orderBy(desc(tickets.createdAt))) as unknown as PreviewRow[];

  const nowMs = now.getTime();
  let open = 0, resolved = 0, recordOnly = 0, tracked = 0, breachedOpen = 0, breachedResolved = 0;
  let critical = 0, high = 0, escalated = 0, last7 = 0, prev7 = 0;
  const durations: number[] = [];
  let oldestOpen: Date | null = null;
  const breakdown: Record<string, Record<string, { total: number; open: number; resolved: number; overdue: number }>> =
    Object.fromEntries(dimNames.map((k) => [k, {}]));
  const createdBy = new Map<string, number>();
  const resolvedBy = new Map<string, number>();
  const weekMs = 7 * 864e5;

  for (const t of all) {
    if (isOpen(t)) open++;
    if (isResolved(t)) resolved++;
    if (isRecordOnly(t)) recordOnly++;
    if (isSlaTracked(t)) {
      tracked++;
      if (t.resolvedAt && t.resolvedAt > (t.slaDueAt as Date)) breachedResolved++;
      else if (isBreachedOpen(t, nowMs)) breachedOpen++;
    }
    if (t.priority === "critical") critical++;
    if (t.priority === "high") high++;
    if (t.isEscalated) escalated++;
    const h = resolutionHours(t);
    if (h !== null) durations.push(h);
    if (isOpen(t) && (!oldestOpen || t.createdAt < oldestOpen)) oldestOpen = t.createdAt;
    const age = nowMs - t.createdAt.getTime();
    if (age < weekMs) last7++;
    else if (age < 2 * weekMs) prev7++;
    if (t.createdAt >= trendFrom) {
      const k = dayKey(t.createdAt, tz);
      createdBy.set(k, (createdBy.get(k) || 0) + 1);
    }
    if (t.resolvedAt && t.resolvedAt >= trendFrom) {
      const k = dayKey(t.resolvedAt, tz);
      resolvedBy.set(k, (resolvedBy.get(k) || 0) + 1);
    }
    // One bucket per (dimension, value), carrying the owner counts the
    // leaderboard needs; `rolled` places the "0" at this dimension's index
    // exactly as the production GROUPING SETS pass would.
    for (const dim of dimNames) {
      const key = String(t[DIM_FIELD[dim]] ?? "") || "Unassigned";
      const b = (breakdown[dim][key] ??= { total: 0, open: 0, resolved: 0, overdue: 0 });
      b.total++;
      if (isOpen(t)) b.open++;
      if (isResolved(t)) b.resolved++;
      if (isBreachedOpen(t, nowMs)) b.overdue++;
    }
  }

  const m: PreviewMetrics = {
    total: all.length, open, resolved, recorded: recordOnly, critical, high, escalated, tracked,
    breachedOpen, breachedResolved,
    avg: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    median: median(durations),
    p90: percentile(durations, 0.9),
    oldestOpen, last7, prev7,
  };

  const groups: PreviewGroup[] = [];
  for (const [dim, values] of Object.entries(breakdown)) {
    const i = dimNames.indexOf(dim);
    const rolled = dimNames.map((_, j) => (j === i ? "0" : "1")).join("");
    for (const [key, b] of Object.entries(values)) {
      const row: PreviewGroup = { rolled, total: b.total, open: b.open, resolved: b.resolved, overdue: b.overdue };
      for (const d of dimNames) row[d] = d === dim ? key : null;
      groups.push(row);
    }
  }

  const pageRows = exportAll ? all : all.slice(page * pageSize, page * pageSize + pageSize);
  return [
    pageRows,
    [m],
    groups,
    [...createdBy.entries()].map(([day, count]) => ({ day, count })),
    [...resolvedBy.entries()].map(([day, count]) => ({ day, count })),
  ];
}

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

    const [pageRows, [m], groups, createdTrend, resolvedTrend]: ReportFetch = isPreviewDb
      ? await computePreviewReport({ where, dimNames, now, tz, trendFrom, page, pageSize, exportAll })
      : (await Promise.all([
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
      ]) as unknown as ReportFetch);

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
