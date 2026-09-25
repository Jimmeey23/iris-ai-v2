/**
 * The one definition of every ticket metric the workspace reports.
 *
 * The board cards, the telemetry strip, the analytics page, the report catalogue and the
 * exports each used to compute "open", "breached", "SLA compliance" and "median" for
 * themselves, and they disagreed — the same ticket was overdue on one screen and fine on
 * another. Everything here is pure (no DB, no DOM) so the server routes and the client
 * components read the same rules. Server SQL that mirrors these rules builds its fragments
 * from the constants below (see `metricSql` in lib/reports.ts).
 *
 * Definitions:
 * - open            status is not resolved / closed / recorded.
 * - record-only     logged for the record, no resolution work: status `recorded` or
 *                   `resolutionRequired === false`.
 * - resolved        has a `resolvedAt` timestamp (reopening clears it).
 * - SLA-tracked     `resolutionRequired`, has a `slaDueAt`, and is not record-only.
 * - breached        SLA-tracked and either
 *                     · breachedResolved — resolved after the target (resolvedAt > slaDueAt), or
 *                     · breachedOpen     — still open and now > slaDueAt ("Overdue").
 * - SLA compliance  (tracked − breached) / tracked, as a whole percentage; null when nothing
 *                   is tracked, which the UI shows as "—".
 * - due soon        open, tracked, not yet breached, with less than `slaWarningPercent` of
 *                   the created→due window left.
 * - median          the true median (mean of the two middle values for an even count).
 * - resolution time created→resolved hours, excluding imported history, system-raised
 *                   tickets and automatic recurrence checks, which would skew it.
 */

export const CLOSED_STATUSES = ['resolved', 'closed', 'recorded'] as const;
export const DONE_STATUSES = ['resolved', 'closed'] as const;
/** Sources whose created→resolved gap says nothing about how fast the team works. */
export const DURATION_EXCLUDED_SOURCES = ['history', 'system'] as const;
/** Tags carried by automatically raised check tickets (see maybeCreateRecurrenceChecks). */
export const AUTO_CHECK_TAGS = ['auto-follow-up', 'recurrence-check'] as const;
/** The tag a PowerCycle bike recurrence check carries (`${kind}-recheck` in lib/tickets.ts). */
export const BIKE_RECHECK_TAG = 'bike-recheck';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_SLA_WARNING_PERCENT = 20;
const HOUR = 3600000;
export const DAY_MS = 86400000;

/** Workspace settings the client learns after load. Server code passes the config explicitly. */
const settings = {timezone: DEFAULT_TIMEZONE, slaWarningPercent: DEFAULT_SLA_WARNING_PERCENT};
export function configureMetrics(next: {timezone?: string | null; slaWarningPercent?: number | null}) {
  if (next.timezone && isValidTimezone(next.timezone)) settings.timezone = next.timezone;
  if (typeof next.slaWarningPercent === 'number' && next.slaWarningPercent > 0 && next.slaWarningPercent < 100) settings.slaWarningPercent = next.slaWarningPercent;
}
export const metricsTimezone = () => settings.timezone;
export const metricsWarningPercent = () => settings.slaWarningPercent;

type When = string | Date | null | undefined;
export type MetricTicket = {
  status: string;
  createdAt: string | Date;
  resolvedAt?: When;
  slaDueAt?: When;
  resolutionRequired?: boolean | null;
  source?: string | null;
  tags?: string[] | null;
};

const ms = (v: When): number | null => {
  if (!v) return null;
  const n = typeof v === 'string' ? Date.parse(v) : v.getTime();
  return Number.isNaN(n) ? null : n;
};

export const isOpen = (t: Pick<MetricTicket, 'status'>) => !(CLOSED_STATUSES as readonly string[]).includes(t.status);
export const isDone = (t: Pick<MetricTicket, 'status'>) => (DONE_STATUSES as readonly string[]).includes(t.status);
export const isRecordOnly = (t: Pick<MetricTicket, 'status' | 'resolutionRequired'>) => t.status === 'recorded' || t.resolutionRequired === false;
export const isResolved = (t: Pick<MetricTicket, 'resolvedAt'>) => ms(t.resolvedAt) !== null;
export const isSlaTracked = (t: Pick<MetricTicket, 'status' | 'resolutionRequired' | 'slaDueAt'>) =>
  Boolean(t.resolutionRequired) && ms(t.slaDueAt) !== null && !isRecordOnly(t);

/** Tracked, resolved, and resolved after its target. */
export function isBreachedResolved(t: MetricTicket): boolean {
  if (!isSlaTracked(t)) return false;
  const done = ms(t.resolvedAt);
  return done !== null && done > (ms(t.slaDueAt) as number);
}
/** Tracked, still open, and past its target — "Overdue". */
export function isBreachedOpen(t: MetricTicket, now = Date.now()): boolean {
  return isSlaTracked(t) && isOpen(t) && ms(t.resolvedAt) === null && now > (ms(t.slaDueAt) as number);
}
export const isBreached = (t: MetricTicket, now = Date.now()) => isBreachedResolved(t) || isBreachedOpen(t, now);

/** Open and tracked, not yet breached, with under `warningPercent` of its SLA window left. */
export function isDueSoon(t: MetricTicket, now = Date.now(), warningPercent = settings.slaWarningPercent): boolean {
  if (!isSlaTracked(t) || !isOpen(t)) return false;
  return slaWindowState(ms(t.slaDueAt), ms(t.createdAt), now, warningPercent) === 'soon';
}

/** The raw clock rule behind `isBreachedOpen` / `isDueSoon`, for callers holding only dates. */
export function slaWindowState(due: number | null, start: number | null, now = Date.now(), warningPercent = settings.slaWarningPercent): 'ok' | 'soon' | 'breached' {
  if (due === null) return 'ok';
  const left = due - now;
  if (left < 0) return 'breached';
  // Without a start the window is unknown; a medium (24h) target is the conservative stand-in.
  const window = start !== null && due > start ? due - start : 24 * HOUR;
  return left <= window * (warningPercent / 100) ? 'soon' : 'ok';
}

export const slaCompliance = (tracked: number, breached: number): number | null =>
  tracked ? Math.round(((tracked - breached) / tracked) * 100) : null;

/** True median of an unsorted list; null for an empty one. */
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
/** Nearest-rank percentile (0–1) of an unsorted list; null for an empty one. */
export function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
export const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

/** Whether this ticket's created→resolved gap belongs in resolution-time statistics. */
export function countsForResolutionTime(t: MetricTicket): boolean {
  if (!isResolved(t)) return false;
  if (t.source && (DURATION_EXCLUDED_SOURCES as readonly string[]).includes(t.source)) return false;
  return !(t.tags || []).some((tag) => (AUTO_CHECK_TAGS as readonly string[]).includes(tag));
}
/** Created→resolved hours, or null when the ticket is excluded or unresolved. */
export function resolutionHours(t: MetricTicket): number | null {
  if (!countsForResolutionTime(t)) return null;
  return Math.max(0, ((ms(t.resolvedAt) as number) - (ms(t.createdAt) as number)) / HOUR);
}

/** Every headline metric in one pass. */
export function summarize(tickets: MetricTicket[], now = Date.now()) {
  let open = 0, resolved = 0, recordOnly = 0, tracked = 0, breachedOpen = 0, breachedResolved = 0, dueSoon = 0;
  const durations: number[] = [];
  for (const t of tickets) {
    if (isOpen(t)) open++;
    if (isResolved(t)) resolved++;
    if (isRecordOnly(t)) recordOnly++;
    if (isSlaTracked(t)) {
      tracked++;
      if (isBreachedResolved(t)) breachedResolved++;
      else if (isBreachedOpen(t, now)) breachedOpen++;
      else if (isDueSoon(t, now)) dueSoon++;
    }
    const h = resolutionHours(t);
    if (h !== null) durations.push(h);
  }
  const breached = breachedOpen + breachedResolved;
  return {
    total: tickets.length, open, resolved, recordOnly, tracked, breachedOpen, breachedResolved, breached, dueSoon,
    slaCompliance: slaCompliance(tracked, breached), medianResolutionHours: round1(median(durations)), durations,
  };
}

/* ------------------------------------------------------------------------------------ *
 * Workspace-timezone day bucketing. Days are the workspace's calendar days (IST by
 * default), never the server's UTC day or the browser's local one.
 * ------------------------------------------------------------------------------------ */

export function isValidTimezone(tz: string) {
  try { new Intl.DateTimeFormat('en', {timeZone: tz}); return true; } catch { return false; }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(key: string, make: () => Intl.DateTimeFormat) {
  let f = formatters.get(key);
  if (!f) { f = make(); formatters.set(key, f); }
  return f;
}
const dayFmt = (tz: string) => formatter('day:' + tz, () => new Intl.DateTimeFormat('en-CA', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'}));
const labelFmt = (tz: string) => formatter('label:' + tz, () => new Intl.DateTimeFormat('en-IN', {timeZone: tz, day: 'numeric', month: 'short'}));
const partsFmt = (tz: string) => formatter('parts:' + tz, () => new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}));

/** `YYYY-MM-DD` of the workspace calendar day an instant falls on. */
export function dayKey(v: string | Date | number, tz = settings.timezone): string {
  return dayFmt(tz).format(typeof v === 'number' ? v : new Date(v));
}
/** Short "25 Sept" style label for a day bucket. */
export function dayLabel(v: string | Date | number, tz = settings.timezone): string {
  return labelFmt(tz).format(typeof v === 'number' ? v : new Date(v));
}
/** Offset of `tz` from UTC at an instant, in ms. */
function tzOffset(at: number, tz: string): number {
  const p = Object.fromEntries(partsFmt(tz).formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}
/** Epoch ms of 00:00 on a `YYYY-MM-DD` workspace day; null for an unparseable key. */
export function zonedDayStart(key: string, tz = settings.timezone): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const first = guess - tzOffset(guess, tz);
  // A DST change between the guess and the answer shifts the offset; one correction settles it.
  return guess - tzOffset(first, tz);
}
/** Epoch ms of the last millisecond of a `YYYY-MM-DD` workspace day. */
export function zonedDayEnd(key: string, tz = settings.timezone): number | null {
  const start = zonedDayStart(key, tz);
  if (start === null) return null;
  const next = zonedDayStart(dayKey(start + 36 * HOUR, tz), tz);
  return (next ?? start + DAY_MS) - 1;
}
/** The last `days` workspace days ending on the day containing `end`, oldest first. */
export function dayBuckets(days: number, end = Date.now(), tz = settings.timezone) {
  // Stepping from noon keeps each step inside the intended day across DST shifts.
  const endKey = dayKey(end, tz);
  const noon = (zonedDayStart(endKey, tz) ?? end) + 12 * HOUR;
  return Array.from({length: days}, (_, i) => {
    const at = noon - (days - 1 - i) * DAY_MS;
    return {date: dayKey(at, tz), label: dayLabel(at, tz)};
  });
}
