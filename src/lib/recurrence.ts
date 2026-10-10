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
 *
 * Every cluster carries the ticket ids behind it, so a screen can drill from the pattern to
 * the tickets without re-deriving the grouping.
 */
import {and, gte, isNotNull, lte, ne, notInArray, sql, type SQL} from 'drizzle-orm';
import {db} from '@/db';
import {assets, staff, tickets} from '@/db/schema';
import {DURATION_EXCLUDED_SOURCES} from './metrics';

export type RecurrenceKind = 'equipment' | 'member' | 'trainer' | 'location' | 'theme' | 'owner' | 'format' | 'department';

export type ClusterExample = {id: number; ticketNumber: string; title: string; status: string; createdAt: string};

export type Cluster = {
  /** Stable key for the UI: kind plus subject. */
  id: string;
  kind: RecurrenceKind;
  /** What is repeating — "Bike #6 · Supreme HQ", "Priya Mehta", "Supreme HQ · Audio Issues". */
  subject: string;
  count: number;
  open: number;
  /** Open and past the follow-up target. */
  overdue: number;
  /** Distinct days it was reported on: four reports on one morning is one event, not four. */
  days: number;
  firstSeen: string;
  lastSeen: string;
  /** Average days between one report day and the next — how often it comes back. */
  everyDays: number | null;
  /** Reports in the latest third of the window against the earlier two thirds, scaled. */
  trend: 'rising' | 'steady' | 'easing' | 'new';
  /** Median hours from report to resolution for the resolved ones, live tickets only. */
  medianResolutionHours: number | null;
  studios: string[];
  owners: string[];
  subcategories: string[];
  /** Ticket numbers, newest first — kept for the digest and older readers. */
  examples: string[];
  /** The newest few, with enough to render a row. */
  recent: ClusterExample[];
  /** Every ticket in the cluster (capped), for drill-down. */
  ticketIds: number[];
  score: number;
  severity: 'critical' | 'high' | 'watch';
  /** Plain sentence for a list; the UI does not have to compose one. */
  note: string;
  /** The one thing to do about it. */
  action: string;
};

/** Reported on at least this many separate days inside the window before it counts. */
const MIN_DAYS = 2;
/** And at least this many tickets in total. */
const MIN_COUNT = 3;
/** Equipment is held to a lower bar: a machine failing twice is already a pattern. */
const MIN_COUNT_EQUIPMENT = 2;
const MAX_IDS = 200;

const open = sql`${tickets.status} not in ('resolved','closed','recorded')`;
const studioShort = sql`split_part(coalesce(${tickets.studio}, ''), ',', 1)`;
/** Title and description, lowercased once, for the unit detection below. */
const text = sql`lower(${tickets.title} || ' ' || coalesce(${tickets.description}, ''))`;

/**
 * The unit a ticket is about, read from what was written when the ticket is not linked to the
 * equipment register — which, in practice, is nearly always. Bikes and mics carry a number;
 * everything else is the system at that studio. Grouped per studio: bike 8 at Supreme HQ and
 * bike 8 at Kwality House are different machines.
 */
const unitFromText = sql`case
  when ${text} ~ 'bike\\s*(no\\.?|number|#)?\\s*\\d{1,3}\\M' then 'PowerCycle bike #' || substring(${text} from 'bike\\s*(?:no\\.?|number|#)?\\s*(\\d{1,3})')
  when ${text} ~ '\\m(mic|mics|microphone|microphones)\\M' then 'Microphone' || coalesce(' #' || substring(${text} from '\\mmic(?:rophone)?\\s*(?:no\\.?|number|#)?\\s*(\\d{1,2})\\M'), 's')
  when ${text} ~ '\\m(a\\.c\\.?|ac|air ?con\\w*|hvac|aircon)\\M' then 'Air-conditioning'
  when ${text} ~ '\\m(speaker|speakers|sound system|music system|amplifier|amp|bluetooth)\\M' then 'Sound system'
  when ${text} ~ '\\m(shower|showers|geyser|hot water|water pressure|flush|toilet|washroom)\\M' then 'Showers & washrooms'
  when ${text} ~ '\\m(wifi|wi-fi|internet|router)\\M' then 'Wi-Fi'
  when ${text} ~ '\\m(locker|lockers)\\M' then 'Lockers'
  when ${text} ~ '\\m(light|lights|lighting|bulb|tube ?light)\\M' then 'Lighting'
  when ${text} ~ '\\m(laptop|ipad|tablet|printer|pos|card machine|edc)\\M' then 'Front-desk devices'
  when ${text} ~ '\\m(barre|reformer|mat|mats|weights|dumbbells?|ball|balls|bands?)\\M' and ${tickets.category} in ('Repair and Maintenance','Studio Amenities and Facilities') then 'Class equipment'
end`;
const EQUIPMENT_CATEGORIES = ['Repair and Maintenance', 'Tech Issues', 'Studio Amenities and Facilities', 'Operating Systems', 'Class Experience', 'Miscellaneous'];
const equipmentKey = sql`coalesce(${assets.name}, ${assets.type} || ' ' || ${assets.assetTag}, (${unitFromText}) || ' · ' || nullif(${studioShort}, ''))`;

const PLACEHOLDER_MEMBER = `^(studio team|automated follow-up|member|client|n/?a|none|unknown|internal|staff|-)`;
/** Issue work only: an assessment or a compliment naming a trainer is not a recurring problem. */
const issueWork = and(notInArray(tickets.kind, ['assessment', 'compliment']), sql`coalesce(${tickets.sentiment}, '') <> 'positive'`) as SQL;

type Row = {
  subject: string | null; count: number; open: number; overdue: number; days: number; first: string; last: string;
  dayList: string[]; recentHits: number; median: number | null;
  studios: string[] | null; owners: string[] | null; subs: string[] | null; ids: number[];
  recent: ClusterExample[] | null;
};

function columns(keyExpr: SQL, now: Date, recentFrom: Date) {
  return {
    subject: sql<string>`${keyExpr}`,
    count: sql<number>`count(*)::int`,
    open: sql<number>`count(*) filter (where ${open})::int`,
    overdue: sql<number>`count(*) filter (where ${open} and ${tickets.resolutionRequired} and ${tickets.slaDueAt} < ${now})::int`,
    days: sql<number>`count(distinct date_trunc('day', ${tickets.createdAt}))::int`,
    first: sql<string>`min(${tickets.createdAt})`,
    last: sql<string>`max(${tickets.createdAt})`,
    dayList: sql<string[]>`array_agg(distinct to_char(${tickets.createdAt}, 'YYYY-MM-DD'))`,
    recentHits: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${recentFrom})::int`,
    median: sql<number | null>`percentile_cont(0.5) within group (order by extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt})) / 3600) filter (where ${tickets.resolvedAt} is not null and ${tickets.source} not in (${sql.join(DURATION_EXCLUDED_SOURCES.map(s => sql`${s}`), sql`, `)}))`,
    studios: sql<string[]>`array_remove(array_agg(distinct nullif(${studioShort}, '')), null)`,
    owners: sql<string[]>`array_remove(array_agg(distinct ${tickets.assignedStaffName}), null)`,
    subs: sql<string[]>`array_agg(distinct ${tickets.subcategory})`,
    ids: sql<number[]>`(array_agg(${tickets.id} order by ${tickets.createdAt} desc))[1:${sql.raw(String(MAX_IDS))}]`,
    recent: sql<ClusterExample[]>`(array_agg(json_build_object('id', ${tickets.id}, 'ticketNumber', ${tickets.ticketNumber}, 'title', ${tickets.title}, 'status', ${tickets.status}, 'createdAt', ${tickets.createdAt}) order by ${tickets.createdAt} desc))[1:5]`,
  };
}

async function cluster(keyExpr: SQL, where: SQL | undefined, limit: number, minCount: number, now: Date, recentFrom: Date): Promise<Row[]> {
  // The register join costs nothing on rows with no asset, so every cluster takes it.
  const rows = await db.select(columns(keyExpr, now, recentFrom)).from(tickets)
    .leftJoin(assets, sql`${assets.id} = ${tickets.assetId}`)
    .where(and(where, sql`(${keyExpr}) is not null`, sql`trim(${keyExpr}) <> ''`))
    .groupBy(keyExpr)
    .having(sql`count(*) >= ${minCount} and count(distinct date_trunc('day', ${tickets.createdAt})) >= ${MIN_DAYS}`)
    .orderBy(sql`count(*) desc`)
    .limit(limit);
  return rows as unknown as Row[];
}

const when = (from: Date | null, to: Date) =>
  from ? and(gte(tickets.createdAt, from), lte(tickets.createdAt, to)) : lte(tickets.createdAt, to);

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** How often it comes back: the mean gap between distinct report days. */
function everyDays(dayList: string[]): number | null {
  const sorted = [...new Set(dayList)].sort();
  if (sorted.length < 2) return null;
  const span = (new Date(sorted[sorted.length - 1]).getTime() - new Date(sorted[0]).getTime()) / 864e5;
  return Math.round((span / (sorted.length - 1)) * 10) / 10;
}

const PHRASE: Record<RecurrenceKind, {note: (r: Row) => string; action: (r: Row) => string}> = {
  equipment: {
    note: r => `${plural(r.count, 'fault')} reported on ${plural(r.days, 'separate day')} — this unit is not staying fixed.`,
    action: r => r.count >= 3 ? 'Escalate to the vendor for a root-cause repair or replacement quote rather than another patch.' : 'Ask the repair owner what was done last time and confirm the fix held.',
  },
  member: {
    note: r => `${plural(r.count, 'ticket')} from the same member across ${plural(r.days, 'day')} — worth one conversation rather than ${r.count}.`,
    action: () => 'Have the studio manager call the member once, covering every open point, and agree a single outcome.',
  },
  trainer: {
    note: r => `${plural(r.count, 'issue')} naming this trainer on ${plural(r.days, 'day')}.`,
    action: () => 'Share the pattern with the training lead for a coaching conversation and a follow-up class observation.',
  },
  location: {
    note: r => `The same issue at the same studio ${plural(r.count, 'time')} across ${plural(r.days, 'day')}.`,
    action: () => 'Treat it as a studio process gap: assign one owner to fix the cause, not each instance.',
  },
  theme: {
    note: r => `${plural(r.count, 'report')} of the same kind — a theme rather than a one-off.`,
    action: () => 'Review the policy or SOP behind this subcategory and brief the front desk on the standard answer.',
  },
  format: {
    note: r => `${plural(r.count, 'issue')} raised about this class format across ${plural(r.days, 'day')}.`,
    action: () => 'Review the format with the training team: music, choreography, difficulty and how it is set up.',
  },
  department: {
    note: r => `${plural(r.overdue, 'ticket')} past the follow-up target in this team, ${plural(r.open, 'open')} in total.`,
    action: () => 'Rebalance the queue or have the department head clear the overdue list this week.',
  },
  owner: {
    note: r => `${plural(r.overdue, 'ticket')} past target with one owner.`,
    action: () => 'Check workload with the owner and reassign what they cannot reach.',
  },
};

export async function findRecurrence(from: Date | null, to: Date, scope?: SQL, now = new Date()): Promise<Cluster[]> {
  // `scope` from the analytics route already carries the range, the studio/department filter
  // and the caller's access scope, so it is used as-is rather than re-ranged here.
  const window = scope ?? when(from, to);
  // "Recent" is the latest third of the window; an open-ended window looks at the last 30 days.
  const start = from?.getTime() ?? to.getTime() - 90 * 864e5;
  const recentFrom = new Date(to.getTime() - Math.max(7 * 864e5, (to.getTime() - start) / 3));
  const live = and(window, notInArray(tickets.source, ['system'])) as SQL;

  // Independent aggregates, issued together: one round trip of wall-clock instead of seven.
  const [equipment, member, trainer, location, theme, format, department] = await Promise.all([
    cluster(equipmentKey, and(live, sql`(${tickets.assetId} is not null or ${tickets.category} in (${sql.join(EQUIPMENT_CATEGORIES.map(c => sql`${c}`), sql`, `)}))`), 12, MIN_COUNT_EQUIPMENT, now, recentFrom),
    // A colleague's name in the member field is the person who filed it, not a client.
    cluster(sql`${tickets.memberName}`, and(live, issueWork, sql`${tickets.memberName} !~* ${PLACEHOLDER_MEMBER}`, sql`not exists (select 1 from ${staff} where lower(${staff.name}) = lower(${tickets.memberName}))`), 10, MIN_COUNT, now, recentFrom),
    cluster(sql`${tickets.trainer}`, and(live, issueWork, isNotNull(tickets.trainer), ne(tickets.trainer, '')), 10, MIN_COUNT, now, recentFrom),
    cluster(sql`${studioShort} || ' · ' || coalesce(${tickets.area} || ' · ', '') || ${tickets.subcategory}`, and(live, issueWork, sql`${tickets.studio} is not null`), 10, MIN_COUNT, now, recentFrom),
    cluster(sql`${tickets.category} || ' · ' || ${tickets.subcategory}`, and(live, issueWork), 8, MIN_COUNT + 2, now, recentFrom),
    cluster(sql`regexp_replace(trim(split_part(${tickets.classFormat}, '+', 1)), '^studio\\s+', '', 'i')`, and(live, issueWork, isNotNull(tickets.classFormat), ne(tickets.classFormat, '')), 6, MIN_COUNT, now, recentFrom),
    cluster(sql`${tickets.departmentName}`, and(live, isNotNull(tickets.departmentName), sql`${open} and ${tickets.resolutionRequired} and ${tickets.slaDueAt} < ${now}`), 6, 2, now, recentFrom),
  ]);

  const windowDays = Math.max(1, (to.getTime() - start) / 864e5);
  const recentShare = Math.min(1, Math.max(7, windowDays / 3) / windowDays);
  const out: Cluster[] = [];
  const push = (kind: RecurrenceKind, rows: Row[]) => {
    for (const r of rows) {
      const count = Number(r.count), openN = Number(r.open), overdue = Number(r.overdue), days = Number(r.days), recentHits = Number(r.recentHits);
      // Rising when the recent slice holds clearly more than its fair share of the reports.
      const expected = count * recentShare;
      const firstSeen = new Date(r.first);
      const trend: Cluster['trend'] = firstSeen.getTime() >= recentFrom.getTime() ? 'new'
        : recentHits >= Math.max(2, expected * 1.5) ? 'rising'
        : recentHits === 0 || recentHits < expected * 0.5 ? 'easing' : 'steady';
      // Live work and momentum outweigh history: a settled cluster of twenty ranks below an
      // open one of four that is still arriving.
      const momentum = trend === 'rising' ? 8 : trend === 'new' ? 5 : trend === 'easing' ? -4 : 0;
      const score = openN * 6 + overdue * 8 + recentHits * 3 + Math.min(days, 8) + Math.min(count, 10) + momentum + (kind === 'equipment' ? 3 : 0);
      const severity: Cluster['severity'] = openN > 0 && (overdue > 0 || trend === 'rising' || openN >= 3) ? 'critical'
        : openN > 0 || trend === 'rising' || trend === 'new' ? 'high' : 'watch';
      const row = {...r, count, open: openN, overdue, days};
      out.push({
        id: `${kind}:${r.subject}`, kind, subject: String(r.subject), count, open: openN, overdue, days,
        firstSeen: firstSeen.toISOString(), lastSeen: new Date(r.last).toISOString(),
        everyDays: everyDays(r.dayList || []), trend,
        medianResolutionHours: r.median === null ? null : Math.round(Number(r.median) * 10) / 10,
        studios: r.studios || [], owners: r.owners || [], subcategories: (r.subs || []).slice(0, 6),
        examples: (r.recent || []).map(e => e.ticketNumber), recent: r.recent || [], ticketIds: r.ids || [],
        score, severity, note: PHRASE[kind].note(row), action: PHRASE[kind].action(row),
      });
    }
  };
  push('equipment', equipment);
  push('member', member);
  push('trainer', trainer);
  push('location', location);
  push('theme', theme);
  push('format', format);
  push('department', department);

  // Ranked by weight rather than raw count: something still open, recurring over many days,
  // deserves attention ahead of a bigger but settled cluster.
  return out.sort((a, b) => b.score - a.score).slice(0, 40);
}

