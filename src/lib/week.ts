/** Calendar-week arithmetic for the weekly report: pure, on `YYYY-MM-DD` keys, no timezone database. */

export type ReportWeek = {from: string; to: string; label: string};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_MS = 86_400_000;
export const parseKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const keyOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (key: string, days: number) => keyOf(parseKey(key) + days * DAY_MS);

/** "6 – 12 Oct 2026", "29 Sep – 5 Oct 2026" or "29 Dec 2026 – 4 Jan 2027". */
export function weekLabel(from: string, to: string): string {
  const a = new Date(parseKey(from)), b = new Date(parseKey(to));
  const [ay, by] = [a.getUTCFullYear(), b.getUTCFullYear()];
  const left = `${a.getUTCDate()}${a.getUTCMonth() === b.getUTCMonth() && ay === by ? '' : ` ${MONTHS[a.getUTCMonth()]}${ay === by ? '' : ` ${ay}`}`}`;
  return `${left} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${by}`;
}

/** The Monday–Sunday week starting on `from` (a `YYYY-MM-DD` Monday). */
export function weekStartingOn(from: string): ReportWeek {
  const to = addDays(from, 6);
  return {from, to, label: weekLabel(from, to)};
}

/** The last complete Monday–Sunday week, in the workspace timezone, as of `nowMs`. */
export function previousWeek(nowMs: number, dayKeyOf: (ms: number) => string): ReportWeek {
  const today = dayKeyOf(nowMs);
  const sinceMonday = (new Date(parseKey(today)).getUTCDay() + 6) % 7;
  return weekStartingOn(addDays(addDays(today, -sinceMonday), -7));
}

