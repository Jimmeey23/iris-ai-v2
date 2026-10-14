/**
 * The database reads behind lib/trend-patterns: nine weekly counts per category,
 * sub-category and studio, and a studio × sub-category cross-tab for the reporting window.
 *
 * Weeks here are seven-day blocks counted back from the end of the window, not calendar
 * weeks. Block 0 is always the seven days up to `to`, so "this week" is a full week even when
 * the dashboard is opened on a Tuesday, and the weekly report's block 0 is exactly the week it
 * describes. Four grouped queries, all index-backed on created_at, no ticket rows read.
 */
import {and, gte, lte, sql, type SQL} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {DIM_SQL} from './analytics-intel';
import {toSeries, type Cell, type WeeklySeries} from './trend-patterns';

export const PATTERN_WEEKS = 9;
const WEEK_MS = 7 * 864e5;

export type PatternData = {categorySeries: WeeklySeries; subcategorySeries: WeeklySeries; studioSeries: WeeklySeries; cells: Cell[]};

export async function loadPatternData(args: {scope: SQL | undefined; from: number; to: number}): Promise<PatternData> {
  const {scope, from, to} = args;
  const toDate = new Date(to);
  const floor = new Date(to - PATTERN_WEEKS * WEEK_MS);
  // The same "issue" rule the breakdowns use: assessments are scored forms and compliments
  // are praise, and neither is a problem to detect a trend in.
  const issues = sql`${tickets.kind} not in ('assessment', 'compliment') and coalesce(${tickets.sentiment}, '') <> 'positive'`;
  const bucket = sql<number>`floor(extract(epoch from (${toDate}::timestamptz - ${tickets.createdAt})) / ${WEEK_MS / 1000})::int`;
  const weekly = (dim: 'category' | 'subcategory' | 'studio') =>
    db.select({key: sql<string>`${DIM_SQL[dim]}`, bucket, count: sql<number>`count(*)::int`})
      .from(tickets)
      .where(and(scope, gte(tickets.createdAt, floor), lte(tickets.createdAt, toDate), issues))
      .groupBy(sql`1`, sql`2`);
  const [category, subcategory, studio, cells] = await Promise.all([
    weekly('category'), weekly('subcategory'), weekly('studio'),
    db.select({studio: sql<string>`${DIM_SQL.studio}`, subcategory: tickets.subcategory, category: tickets.category, count: sql<number>`count(*)::int`})
      .from(tickets)
      .where(and(scope, gte(tickets.createdAt, new Date(Math.max(from, to - 90 * 864e5))), lte(tickets.createdAt, toDate), issues))
      .groupBy(sql`1`, tickets.subcategory, tickets.category)
      .limit(500),
  ]);
  const rows = (r: {key: string; bucket: number; count: number}[]) => r.map(x => ({key: String(x.key ?? '—'), bucket: Number(x.bucket), count: Number(x.count)}));
  return {
    categorySeries: toSeries(rows(category), PATTERN_WEEKS),
    subcategorySeries: toSeries(rows(subcategory), PATTERN_WEEKS),
    studioSeries: toSeries(rows(studio), PATTERN_WEEKS),
    cells: cells.map(c => ({studio: String(c.studio), subcategory: c.subcategory, category: c.category, count: Number(c.count)})),
  };
}
