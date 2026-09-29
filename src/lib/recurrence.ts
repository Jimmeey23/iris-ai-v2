/**
 * The same thing, happening again.
 *
 * A queue of individually-reasonable tickets hides the pattern that matters: bike 6 has been
 * fixed four times this month, the same member has raised three billing problems, one
 * trainer draws the same feedback week after week. Each ticket was handled; the underlying
 * cause never was.
 *
 * This groups closed and open work along the dimensions a studio actually acts on, and
 * reports only clusters worth a human look. The thresholds are deliberately conservative —
 * a "pattern" that fires on every pair of coincidental tickets trains people to ignore it.
 */
import {and, gte, isNotNull, lte, ne, sql, type SQL} from 'drizzle-orm';
import {db} from '@/db';
import {assets, tickets} from '@/db/schema';

export type RecurrenceKind = 'equipment' | 'member' | 'trainer' | 'location' | 'theme' | 'owner';

export type Cluster = {
  kind: RecurrenceKind;
  /** What is repeating — "Bike 6", "Priya Mehta", "Studio 2 · Audio Issues". */
  subject: string;
  count: number;
  open: number;
  /** Distinct days it was reported on: four reports on one morning is one event, not four. */
  days: number;
  firstSeen: string;
  lastSeen: string;
  examples: string[];
  /** Plain sentence for a list; the UI does not have to compose one. */
  note: string;
};

/** Reported on at least this many separate days inside the window before it counts. */
const MIN_DAYS = 2;
/** And at least this many tickets in total. */
const MIN_COUNT = 3;
/** Equipment is held to a lower bar: a machine failing twice is already a pattern. */
const MIN_COUNT_EQUIPMENT = 2;

type Row = {subject: string | null; count: number; open: number; days: number; first: string; last: string; examples: string[]};

async function cluster(keyExpr: SQL, where: SQL | undefined, limit: number): Promise<Row[]> {
  const rows = await db
    .select({
      subject: sql<string>`${keyExpr}`,
      count: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${tickets.status} not in ('resolved','closed','recorded'))::int`,
      days: sql<number>`count(distinct date_trunc('day', ${tickets.createdAt}))::int`,
      first: sql<string>`min(${tickets.createdAt})`,
      last: sql<string>`max(${tickets.createdAt})`,
      examples: sql<string[]>`(array_agg(${tickets.ticketNumber} order by ${tickets.createdAt} desc))[1:4]`,
    })
    .from(tickets)
    .where(where)
    .groupBy(keyExpr)
    .having(sql`count(*) >= ${MIN_COUNT_EQUIPMENT} and count(distinct date_trunc('day', ${tickets.createdAt})) >= ${MIN_DAYS}`)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows.filter(r => r.subject !== null && String(r.subject).trim() !== '');
}

const when = (from: Date | null, to: Date) =>
  from ? and(gte(tickets.createdAt, from), lte(tickets.createdAt, to)) : lte(tickets.createdAt, to);

export async function findRecurrence(from: Date | null, to: Date, scope?: SQL): Promise<Cluster[]> {
  // `scope` from the analytics route already carries the range, the studio/department filter
  // and the caller's access scope, so it is used as-is rather than re-ranged here.
  const window = scope ?? when(from, to);
  const out: Cluster[] = [];
  const push = (kind: RecurrenceKind, rows: Row[], min: number, phrase: (r: Row) => string) => {
    for (const r of rows) {
      if (r.count < min) continue;
      out.push({
        kind, subject: String(r.subject), count: Number(r.count), open: Number(r.open), days: Number(r.days),
        firstSeen: new Date(r.first).toISOString(), lastSeen: new Date(r.last).toISOString(),
        examples: r.examples || [], note: phrase(r),
      });
    }
  };

  // Five independent aggregates. Issued together they cost one round trip of wall-clock
  // instead of five — which is most of the time when the database is a network away.
  const [equipment, member, trainer, location, theme] = await Promise.all([
    // Equipment uses the register's own label when the ticket is linked, so "Bike 6" reads
    // as itself rather than as an id.
    db
      .select({
        subject: sql<string>`coalesce(${assets.name}, ${assets.type} || ' ' || ${assets.assetTag})`,
        count: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${tickets.status} not in ('resolved','closed','recorded'))::int`,
        days: sql<number>`count(distinct date_trunc('day', ${tickets.createdAt}))::int`,
        first: sql<string>`min(${tickets.createdAt})`,
        last: sql<string>`max(${tickets.createdAt})`,
        examples: sql<string[]>`(array_agg(${tickets.ticketNumber} order by ${tickets.createdAt} desc))[1:4]`,
      })
      .from(tickets)
      .innerJoin(assets, sql`${assets.id} = ${tickets.assetId}`)
      .where(and(window, isNotNull(tickets.assetId)))
      .groupBy(sql`coalesce(${assets.name}, ${assets.type} || ' ' || ${assets.assetTag})`)
      .having(sql`count(*) >= ${MIN_COUNT_EQUIPMENT} and count(distinct date_trunc('day', ${tickets.createdAt})) >= ${MIN_DAYS}`)
      .orderBy(sql`count(*) desc`)
      .limit(8),
    cluster(sql`${tickets.memberName}`, and(window, ne(tickets.memberName, '')), 8),
    cluster(sql`${tickets.trainer}`, and(window, isNotNull(tickets.trainer), ne(tickets.trainer, '')), 8),
    cluster(sql`${tickets.studio} || ' · ' || coalesce(${tickets.area}, 'studio-wide') || ' · ' || ${tickets.subcategory}`, window, 8),
    cluster(sql`${tickets.category} || ' · ' || ${tickets.subcategory}`, window, 6),
  ]);

  push('equipment', equipment, MIN_COUNT_EQUIPMENT, r => `${r.count} faults on ${r.days} separate days — this unit is not staying fixed.`);
  push('member', member, MIN_COUNT, r => `${r.count} tickets from the same member across ${r.days} days — worth one conversation rather than ${r.count}.`);
  push('trainer', trainer, MIN_COUNT, r => `${r.count} tickets naming this trainer on ${r.days} days.`);
  push('location', location, MIN_COUNT, r => `the same issue in the same room ${r.count} times across ${r.days} days.`);
  push('theme', theme, MIN_COUNT + 2, r => `${r.count} reports of the same kind — a theme rather than a one-off.`);

  // Ranked by weight rather than raw count: something still open, recurring over many days,
  // deserves attention ahead of a bigger but settled cluster.
  return out.sort((a, b) => (b.open * 3 + b.days * 2 + b.count) - (a.open * 3 + a.days * 2 + a.count)).slice(0, 24);
}
