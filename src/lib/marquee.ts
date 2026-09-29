/**
 * What the ticker says, per page.
 *
 * The strip used to recite fixed copy — studio room lists and SLA targets that were true
 * whatever was happening. A ticker that never changes is furniture: people stop reading it
 * within a week. Everything below is computed from the workspace's own rows at request time,
 * and each page gets the handful of facts that bear on the work being done there.
 *
 * Deliberately cheap: one pass over the open tickets plus a couple of aggregates, so the
 * strip never becomes the reason a page is slow. Nothing here is user-specific, so the result
 * is safe to cache briefly at the edge if it ever needs to be.
 */
import {and, desc, eq, gte, inArray, isNull, lt, ne, sql} from 'drizzle-orm';
import {db} from '@/db';
import {assets, tickets} from '@/db/schema';
import {CLOSED_STATUSES} from './metrics';

export type MarqueeItem = {
  label: string;
  value: string;
  tone?: 'green' | 'amber' | 'red' | 'blue' | 'accent';
  badge?: string;
  icon?: string;
};

export type MarqueePage = 'overview' | 'tickets' | 'radar' | 'iris' | 'equipment' | 'analytics' | 'trainers';

const OPEN = sql`${tickets.status} not in ('resolved','closed','recorded')`;
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
/** "3h", "2d" — a duration a person reads at a glance, not a precise interval. */
function ago(from: Date | string | null | undefined) {
  if (!from) return null;
  const ms = Date.now() - new Date(from).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'under an hour';
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export async function marqueeFor(page: MarqueePage): Promise<MarqueeItem[]> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [counts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${OPEN})::int`,
      critical: sql<number>`count(*) filter (where ${OPEN} and ${tickets.priority} = 'critical')::int`,
      high: sql<number>`count(*) filter (where ${OPEN} and ${tickets.priority} = 'high')::int`,
      unassigned: sql<number>`count(*) filter (where ${OPEN} and ${tickets.assignedStaffId} is null)::int`,
      breaching: sql<number>`count(*) filter (where ${OPEN} and ${tickets.slaDueAt} is not null and ${tickets.slaDueAt} < now() + interval '3 hours')::int`,
      overdue: sql<number>`count(*) filter (where ${OPEN} and ${tickets.slaDueAt} is not null and ${tickets.slaDueAt} < now())::int`,
      resolvedToday: sql<number>`count(*) filter (where ${tickets.resolvedAt} >= ${dayAgo})::int`,
      loggedToday: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${dayAgo})::int`,
      loggedWeek: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${weekAgo})::int`,
    })
    .from(tickets);

  const base: MarqueeItem[] = [
    {label: 'OPEN NOW', value: plural(counts.open, 'ticket'), tone: counts.open ? 'accent' : 'green', badge: 'LIVE'},
  ];
  if (counts.critical) base.push({label: 'CRITICAL', value: plural(counts.critical, 'ticket') + ' needing attention now', tone: 'red', badge: 'URGENT'});
  if (counts.overdue) base.push({label: 'PAST TARGET', value: plural(counts.overdue, 'ticket') + ' past the follow-up target', tone: 'red'});
  else if (counts.breaching) base.push({label: 'DUE SOON', value: plural(counts.breaching, 'ticket') + ' due within 3 hours', tone: 'amber'});
  if (counts.unassigned) base.push({label: 'UNASSIGNED', value: plural(counts.unassigned, 'ticket') + ' waiting for an owner', tone: 'amber'});

  const byStudio = async () => {
    const rows = await db.select({studio: tickets.studio, n: sql<number>`count(*)::int`}).from(tickets)
      .where(OPEN).groupBy(tickets.studio).orderBy(desc(sql`count(*)`)).limit(4);
    return rows.filter(r => r.studio).map(r => ({label: (r.studio as string).split(',')[0].toUpperCase(), value: plural(Number(r.n), 'open ticket'), tone: 'blue' as const}));
  };
  const topCategories = async (since: Date) => {
    const rows = await db.select({category: tickets.category, sub: tickets.subcategory, n: sql<number>`count(*)::int`}).from(tickets)
      .where(gte(tickets.createdAt, since)).groupBy(tickets.category, tickets.subcategory).orderBy(desc(sql`count(*)`)).limit(3);
    return rows.map(r => ({label: 'RECURRING', value: `${r.category} · ${r.sub} — ${plural(Number(r.n), 'report')} this week`, tone: 'amber' as const}));
  };
  const oldestOpen = async () => {
    const [row] = await db.select({num: tickets.ticketNumber, title: tickets.title, at: tickets.createdAt}).from(tickets)
      .where(OPEN).orderBy(tickets.createdAt).limit(1);
    return row ? [{label: 'LONGEST OPEN', value: `${row.num} — ${ago(row.at)} · ${row.title}`, tone: 'amber' as const}] : [];
  };

  switch (page) {
    case 'overview':
      return [...base,
        {label: 'LAST 24 HOURS', value: `${plural(counts.loggedToday, 'ticket')} logged · ${counts.resolvedToday} resolved`, tone: 'green'},
        ...(await byStudio()), ...(await oldestOpen())];

    case 'tickets':
      return [...base, ...(await oldestOpen()), ...(await topCategories(weekAgo)), ...(await byStudio())];

    case 'radar': {
      const faulty = await db.select({n: sql<number>`count(*)::int`}).from(assets).where(ne(assets.status, 'operational'));
      const out = Number(faulty[0]?.n || 0);
      return [...base, ...(await byStudio()),
        {label: 'EQUIPMENT', value: out ? plural(out, 'unit') + ' not in normal service' : 'every registered unit operational', tone: out ? 'red' : 'green'},
        ...(await topCategories(weekAgo))];
    }

    case 'equipment': {
      const rows = await db.select({type: assets.type, n: sql<number>`count(*)::int`}).from(assets)
        .where(ne(assets.status, 'operational')).groupBy(assets.type).orderBy(desc(sql`count(*)`)).limit(4);
      const [total] = await db.select({n: sql<number>`count(*)::int`}).from(assets);
      return [
        {label: 'REGISTER', value: plural(Number(total?.n || 0), 'unit') + ' tracked', tone: 'blue', badge: 'LIVE'},
        ...(rows.length
          ? rows.map(r => ({label: String(r.type).toUpperCase(), value: plural(Number(r.n), 'unit') + ' needing attention', tone: 'red' as const}))
          : [{label: 'CONDITION', value: 'every registered unit is operational', tone: 'green' as const}]),
        ...base.slice(0, 3)];
    }

    case 'iris':
      return [
        {label: 'LOGGED TODAY', value: plural(counts.loggedToday, 'ticket'), tone: 'accent', badge: 'LIVE'},
        {label: 'IRIS DRAFTS', value: 'describe it in your own words — member, studio and priority are filled in for you', tone: 'blue'},
        ...base.slice(0, 3), ...(await topCategories(weekAgo))];

    case 'analytics': {
      const [prev] = await db.select({n: sql<number>`count(*)::int`}).from(tickets)
        .where(and(gte(tickets.createdAt, new Date(now.getTime() - 14 * 86400000)), lt(tickets.createdAt, weekAgo)));
      const before = Number(prev?.n || 0);
      const delta = before ? Math.round(((counts.loggedWeek - before) / before) * 100) : null;
      return [
        {label: 'THIS WEEK', value: plural(counts.loggedWeek, 'ticket') + ' logged' + (delta === null ? '' : ` · ${delta >= 0 ? '+' : ''}${delta}% on the week before`), tone: delta !== null && delta > 15 ? 'amber' : 'blue', badge: 'LIVE'},
        {label: 'CLEARED', value: plural(counts.resolvedToday, 'ticket') + ' resolved in the last 24 hours', tone: 'green'},
        ...(await topCategories(weekAgo)), ...base.slice(0, 3)];
    }

    case 'trainers': {
      const rows = await db.select({trainer: tickets.trainer, n: sql<number>`count(*)::int`}).from(tickets)
        .where(and(gte(tickets.createdAt, weekAgo), sql`${tickets.trainer} is not null and ${tickets.trainer} <> ''`))
        .groupBy(tickets.trainer).orderBy(desc(sql`count(*)`)).limit(3);
      return [
        {label: 'THIS WEEK', value: plural(counts.loggedWeek, 'ticket') + ' across the studios', tone: 'blue', badge: 'LIVE'},
        ...rows.map(r => ({label: String(r.trainer).toUpperCase(), value: plural(Number(r.n), 'mention') + ' this week', tone: 'accent' as const})),
        ...base.slice(0, 2)];
    }
    default:
      return base;
  }
}
