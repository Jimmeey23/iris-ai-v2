/**
 * The intelligence layer behind the Trend dashboard: what moved against the previous period,
 * where the load and the lateness sit, when work arrives, how old the open queue is, and the
 * handful of sentences a manager would want read out to them.
 *
 * Every figure is an aggregate in SQL over the caller's scope — no ticket rows are read into
 * the route — and every breakdown row names the filter that reproduces it, so the screen can
 * drill from a number to the tickets behind it.
 */
import {and, gte, lt, lte, sql, type SQL} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {metricSql} from './reports';
import {round1} from './metrics';
import type {Cluster} from './recurrence';

/** Dimensions a breakdown (and a drill-down) can be cut by. */
export const DRILL_DIMS = ['category', 'subcategory', 'studio', 'department', 'owner', 'trainer', 'format', 'source', 'priority', 'status', 'member', 'kind'] as const;
export type DrillDim = (typeof DRILL_DIMS)[number];

const studioShort = sql`split_part(coalesce(${tickets.studio}, ''), ',', 1)`;
/** The SQL each dimension groups and filters on — one definition for both, so a drilled list
 *  always holds exactly the tickets its row counted. */
export const DIM_SQL: Record<DrillDim, SQL> = {
  category: sql`${tickets.category}`,
  subcategory: sql`${tickets.subcategory}`,
  studio: sql`coalesce(nullif(${studioShort}, ''), 'No studio')`,
  department: sql`coalesce(${tickets.departmentName}, 'Unrouted')`,
  owner: sql`coalesce(${tickets.assignedStaffName}, 'Unassigned')`,
  trainer: sql`coalesce(nullif(trim(${tickets.trainer}), ''), 'No trainer')`,
  format: sql`coalesce(nullif(regexp_replace(trim(split_part(${tickets.classFormat}, '+', 1)), '^studio\\s+', '', 'i'), ''), 'No class')`,
  source: sql`${tickets.source}`,
  priority: sql`${tickets.priority}`,
  status: sql`${tickets.status}`,
  member: sql`${tickets.memberName}`,
  kind: sql`${tickets.kind}`,
};

export type BreakdownRow = {
  key: string; total: number; open: number; resolved: number; overdue: number; breached: number; critical: number;
  slaCompliance: number | null; medianHours: number | null;
  /** Tickets in the previous period of the same length, and the change against it. */
  previous: number; change: number | null;
  share: number;
};

const n = (where: SQL) => sql<number>`count(*) filter (where ${where})::int`;

/**
 * One dimension, current window against the previous one. `scope` is access plus studio and
 * department filters, without the date range; `cur` and `prev` are the two windows.
 */
async function breakdown(dim: DrillDim, scope: SQL | undefined, cur: SQL, prev: SQL | null, now: Date, limit: number, extra?: SQL): Promise<BreakdownRow[]> {
  const key = DIM_SQL[dim];
  const inCur = (w: SQL) => and(cur, w) as SQL;
  const rows = await db.select({
    key: sql<string>`${key}`,
    total: n(cur),
    open: n(inCur(metricSql.open)),
    resolved: n(inCur(metricSql.resolved)),
    overdue: n(inCur(metricSql.breachedOpen(now))),
    breached: sql<number>`(count(*) filter (where ${inCur(metricSql.breachedOpen(now))}) + count(*) filter (where ${inCur(metricSql.breachedResolved())}))::int`,
    tracked: n(inCur(metricSql.tracked)),
    critical: n(inCur(sql`${tickets.priority} = 'critical'`)),
    median: sql<number | null>`percentile_cont(0.5) within group (order by ${metricSql.resolutionHours}) filter (where ${inCur(metricSql.durationEligible)})`,
    previous: prev ? n(prev) : sql<number>`0`,
  }).from(tickets)
    .where(and(scope, extra, prev ? sql`(${cur}) or (${prev})` : cur))
    .groupBy(sql`1`)
    .having(sql`count(*) filter (where ${cur}) > 0`)
    .orderBy(sql`2 desc`)
    .limit(limit);
  const sum = rows.reduce((a, r) => a + Number(r.total), 0) || 1;
  return rows.map(r => {
    const total = Number(r.total), previous = Number(r.previous), tracked = Number(r.tracked), breached = Number(r.breached);
    return {
      key: String(r.key ?? '—'), total, open: Number(r.open), resolved: Number(r.resolved), overdue: Number(r.overdue), breached,
      critical: Number(r.critical),
      slaCompliance: tracked ? Math.round(((tracked - breached) / tracked) * 1000) / 10 : null,
      medianHours: round1(r.median === null ? null : Number(r.median)),
      previous, change: prev && previous ? Math.round(((total - previous) / previous) * 100) : null,
      share: Math.round((total / sum) * 1000) / 10,
    };
  });
}

export type Intel = {
  previous: {all: number; open: number; resolved: number; breached: number; tracked: number; slaCompliance: number | null; medianResolutionHours: number | null} | null;
  breakdowns: Record<'category' | 'subcategory' | 'studio' | 'department' | 'owner' | 'trainer' | 'format' | 'source', BreakdownRow[]>;
  /** Tickets by weekday (0 = Monday) and hour, in the workspace timezone. */
  heatmap: {dow: number; hour: number; count: number}[];
  /** The open queue by age. */
  ageing: {bucket: string; from: number; to: number | null; count: number; overdue: number}[];
  /** Weekly created / resolved / breached across the window (capped at 26 weeks). */
  weekly: {week: string; created: number; resolved: number; breached: number}[];
  insights: {tone: 'red' | 'amber' | 'green' | 'blue'; title: string; detail: string; drill?: {dim: DrillDim; value: string} | {ids: number[]}}[];
};

export const AGE_BUCKETS = [
  {bucket: 'Under 1 day', from: 0, to: 1},
  {bucket: '1–3 days', from: 1, to: 3},
  {bucket: '3–7 days', from: 3, to: 7},
  {bucket: '1–2 weeks', from: 7, to: 14},
  {bucket: '2–4 weeks', from: 14, to: 30},
  {bucket: 'Over a month', from: 30, to: null},
] as const;

/** `recurrence` may still be in flight: only the insights read it, so the breakdowns run
 *  alongside it rather than after it. */
export async function analyticsIntel(args: {scope: SQL | undefined; from: number; to: number; tz: string; now: Date; recurrence: Cluster[] | Promise<Cluster[]>}): Promise<Intel> {
  const {scope, from, to, tz, now} = args;
  const span = to - from;
  // Only a bounded window has a "previous period"; all-time has nothing to compare against.
  const hasPrev = from > 0 && span > 0;
  const cur = and(gte(tickets.createdAt, new Date(from)), lte(tickets.createdAt, new Date(to))) as SQL;
  const prev = hasPrev ? and(gte(tickets.createdAt, new Date(from - span)), lt(tickets.createdAt, new Date(from))) as SQL : null;
  const live = sql`${tickets.source} <> 'system'`;
  // Imports carry the day a thread or form arrived, not the hour, so they would pile into
  // midnight; the heatmap reads only tickets filed live in the app.
  const timed = sql`${tickets.source} in ('iris','manual','template','voice')`;
  // Trainer assessments are scored forms with their own page; counted here they swamp every
  // category trend the week a batch is imported.
  const notAssessment = sql`${tickets.kind} <> 'assessment'`;
  const issues = sql`${tickets.kind} not in ('assessment', 'compliment') and coalesce(${tickets.sentiment}, '') <> 'positive'`;
  const weekStart = sql<string>`to_char(date_trunc('week', ${tickets.createdAt} at time zone ${tz}), 'YYYY-MM-DD')`;
  const resolvedWeek = sql<string>`to_char(date_trunc('week', ${tickets.resolvedAt} at time zone ${tz}), 'YYYY-MM-DD')`;
  const weeklyFrom = new Date(Math.max(from, to - 26 * 7 * 864e5));

  const [prevTotals, category, subcategory, studio, department, owner, trainer, format, source, heat, ageing, createdWeekly, resolvedWeekly] = await Promise.all([
    prev ? db.select({
      all: sql<number>`count(*)::int`,
      open: n(metricSql.open), resolved: n(metricSql.resolved),
      breached: sql<number>`(count(*) filter (where ${metricSql.breachedResolved()}) + count(*) filter (where ${metricSql.breachedOpen(now)}))::int`,
      tracked: n(metricSql.tracked),
      median: sql<number | null>`percentile_cont(0.5) within group (order by ${metricSql.resolutionHours}) filter (where ${metricSql.durationEligible})`,
    }).from(tickets).where(and(scope, prev)) : Promise.resolve([]),
    breakdown('category', scope, cur, prev, now, 20, notAssessment),
    breakdown('subcategory', scope, cur, prev, now, 25, notAssessment),
    breakdown('studio', scope, cur, prev, now, 20),
    breakdown('department', scope, cur, prev, now, 12),
    breakdown('owner', scope, cur, prev, now, 30),
    breakdown('trainer', scope, cur, prev, now, 25, and(sql`nullif(trim(${tickets.trainer}), '') is not null`, sql`${issues}`) as SQL),
    breakdown('format', scope, cur, prev, now, 15, and(sql`nullif(trim(${tickets.classFormat}), '') is not null`, sql`${issues}`) as SQL),
    breakdown('source', scope, cur, prev, now, 10),
    db.select({
      dow: sql<number>`(extract(isodow from ${tickets.createdAt} at time zone ${tz})::int - 1)`,
      hour: sql<number>`extract(hour from ${tickets.createdAt} at time zone ${tz})::int`,
      count: sql<number>`count(*)::int`,
    }).from(tickets).where(and(scope, cur, timed)).groupBy(sql`1`, sql`2`),
    db.select({
      age: sql<number>`floor(extract(epoch from (${now}::timestamptz - ${tickets.createdAt})) / 86400)::int`,
      count: sql<number>`count(*)::int`,
      overdue: n(metricSql.breachedOpen(now)),
    }).from(tickets).where(and(scope, metricSql.open, live)).groupBy(sql`1`),
    db.select({week: weekStart, count: sql<number>`count(*)::int`, breached: n(sql`(${metricSql.breachedResolved()}) or (${metricSql.breachedOpen(now)})`)})
      .from(tickets).where(and(scope, gte(tickets.createdAt, weeklyFrom), lte(tickets.createdAt, new Date(to)))).groupBy(sql`1`),
    db.select({week: resolvedWeek, count: sql<number>`count(*)::int`})
      .from(tickets).where(and(scope, gte(tickets.resolvedAt, weeklyFrom), lte(tickets.resolvedAt, new Date(to)))).groupBy(sql`1`),
  ]);

  const recurrence = await args.recurrence;
  const p = prevTotals[0];
  const previous = p ? {
    all: Number(p.all), open: Number(p.open), resolved: Number(p.resolved), breached: Number(p.breached), tracked: Number(p.tracked),
    slaCompliance: Number(p.tracked) ? Math.round(((Number(p.tracked) - Number(p.breached)) / Number(p.tracked)) * 1000) / 10 : null,
    medianResolutionHours: round1(p.median === null ? null : Number(p.median)),
  } : null;

  const ageingOut = AGE_BUCKETS.map(b => {
    const rows = ageing.filter(r => Number(r.age) >= b.from && (b.to === null || Number(r.age) < b.to));
    return {...b, count: rows.reduce((a, r) => a + Number(r.count), 0), overdue: rows.reduce((a, r) => a + Number(r.overdue), 0)};
  });

  const weeks = new Map<string, {week: string; created: number; resolved: number; breached: number}>();
  const ensure = (w: string) => { if (!weeks.has(w)) weeks.set(w, {week: w, created: 0, resolved: 0, breached: 0}); return weeks.get(w)!; };
  for (const r of createdWeekly) if (r.week) { const w = ensure(r.week); w.created = Number(r.count); w.breached = Number(r.breached); }
  for (const r of resolvedWeekly) if (r.week) ensure(r.week).resolved = Number(r.count);
  const weekly = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));

  const breakdowns = {category, subcategory, studio, department, owner, trainer, format, source};
  return {
    previous, breakdowns,
    heatmap: heat.map(h => ({dow: Number(h.dow), hour: Number(h.hour), count: Number(h.count)})),
    ageing: ageingOut, weekly,
    insights: buildInsights({breakdowns, recurrence, ageing: ageingOut, heatmap: heat.map(h => ({dow: Number(h.dow), hour: Number(h.hour), count: Number(h.count)})), hasPrev}),
  };
}

const DOW = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** The sentences a manager would want read out: each one specific, and each one drillable. */
function buildInsights(d: {breakdowns: Intel['breakdowns']; recurrence: Cluster[]; ageing: Intel['ageing']; heatmap: Intel['heatmap']; hasPrev: boolean}): Intel['insights'] {
  const out: Intel['insights'] = [];
  const {breakdowns: b} = d;

  const hot = d.recurrence.find(c => c.severity === 'critical') || d.recurrence.find(c => c.open > 0);
  if (hot) out.push({tone: 'red', title: `${hot.subject} keeps coming back`, detail: `${hot.note} ${hot.open ? `${hot.open} still open${hot.overdue ? `, ${hot.overdue} overdue` : ''}.` : ''} ${hot.action}`, drill: {ids: hot.ticketIds}});

  if (d.hasPrev) {
    const rising = b.subcategory.filter(r => r.total >= 3 && r.change !== null && r.change >= 50).sort((x, y) => (y.total - y.previous) - (x.total - x.previous))[0];
    if (rising) out.push({tone: 'amber', title: `${rising.key} is up ${rising.change}%`, detail: `${rising.total} tickets this period against ${rising.previous} in the one before.`, drill: {dim: 'subcategory', value: rising.key}});
    const newSub = b.subcategory.find(r => r.total >= 2 && r.previous === 0);
    if (newSub) out.push({tone: 'amber', title: `New this period: ${newSub.key}`, detail: `${newSub.total} tickets in a subcategory that had none in the previous period.`, drill: {dim: 'subcategory', value: newSub.key}});
    const easing = b.category.filter(r => r.previous >= 5 && r.change !== null && r.change <= -30).sort((x, y) => (x.change ?? 0) - (y.change ?? 0))[0];
    if (easing) out.push({tone: 'green', title: `${easing.key} is down ${Math.abs(easing.change!)}%`, detail: `${easing.total} tickets against ${easing.previous} the period before.`, drill: {dim: 'category', value: easing.key}});
  }

  const lateDept = b.department.filter(r => r.overdue > 0).sort((x, y) => y.overdue - x.overdue)[0];
  if (lateDept) out.push({tone: 'red', title: `${lateDept.key} has ${lateDept.overdue} overdue`, detail: `${lateDept.open} open in total${lateDept.slaCompliance !== null ? `, ${lateDept.slaCompliance}% SLA compliance this period` : ''}.`, drill: {dim: 'department', value: lateDept.key}});

  const loaded = b.owner.filter(r => r.key !== 'Unassigned' && r.open >= 3).sort((x, y) => y.open - x.open)[0];
  if (loaded) out.push({tone: 'amber', title: `${loaded.key} is carrying ${loaded.open} open tickets`, detail: `${loaded.overdue ? `${loaded.overdue} of them overdue. ` : ''}Worth a workload check before more is routed there.`, drill: {dim: 'owner', value: loaded.key}});
  const unassigned = b.owner.find(r => r.key === 'Unassigned' && r.open > 0);
  if (unassigned) out.push({tone: 'red', title: `${unassigned.open} open tickets have no owner`, detail: 'They are sitting in a department queue with nobody named against them.', drill: {dim: 'owner', value: 'Unassigned'}});

  const trainer = b.trainer.filter(r => r.key !== 'No trainer' && r.total >= 3).sort((x, y) => y.total - x.total)[0];
  if (trainer) out.push({tone: 'blue', title: `${trainer.key} is named in ${trainer.total} issues`, detail: `${trainer.share}% of trainer-related issues this period${trainer.change !== null ? `, ${trainer.change >= 0 ? 'up' : 'down'} ${Math.abs(trainer.change)}% on the previous period` : ''}.`, drill: {dim: 'trainer', value: trainer.key}});

  const studio = b.studio.filter(r => r.total >= 3).sort((x, y) => (y.overdue - x.overdue) || (y.open - x.open))[0];
  if (studio && studio.open) out.push({tone: 'blue', title: `${studio.key} holds the most open work`, detail: `${studio.open} open, ${studio.overdue} overdue, ${studio.total} raised this period.`, drill: {dim: 'studio', value: studio.key}});

  const stale = d.ageing.filter(a => a.from >= 14).reduce((s, a) => s + a.count, 0);
  if (stale) out.push({tone: 'amber', title: `${stale} open tickets are over two weeks old`, detail: 'Close what is done, or escalate what is stuck — an old open ticket is usually one of the two.'});

  const peak = [...d.heatmap].sort((x, y) => y.count - x.count)[0];
  if (peak && peak.count >= 3) out.push({tone: 'blue', title: `Busiest slot: ${DOW[peak.dow]} around ${hourLabel(peak.hour)}`, detail: `${peak.count} tickets filed in the app fell in that hour this period — staff the desk accordingly.`});

  const sla = b.department.filter(r => r.slaCompliance !== null && r.total >= 3).sort((x, y) => (y.slaCompliance ?? 0) - (x.slaCompliance ?? 0))[0];
  if (sla && (sla.slaCompliance ?? 0) >= 90) out.push({tone: 'green', title: `${sla.key} is keeping its targets`, detail: `${sla.slaCompliance}% SLA compliance across ${sla.total} tickets.`, drill: {dim: 'department', value: sla.key}});

  return out.slice(0, 9);
}

/** The reporting window from the dashboard's query string — the same rule for the dashboard
 *  and every drill-down from it, so a drilled list holds exactly the tickets that were counted. */
export function reportWindow(params: URLSearchParams, tz: string, nowMs: number, dayStart: (d: string, tz: string) => number | null, dayEnd: (d: string, tz: string) => number | null) {
  const range = params.get('range') || '30';
  const fromParam = params.get('from'), toParam = params.get('to');
  const from = (fromParam ? dayStart(fromParam, tz) : null) ?? (range === 'all' ? 0 : nowMs - Math.min(Number(range) || 30, 730) * 86400000);
  const to = (toParam ? dayEnd(toParam, tz) : null) ?? nowMs;
  return {range, from, to, studio: params.get('studio') || '', department: params.get('department') || ''};
}
