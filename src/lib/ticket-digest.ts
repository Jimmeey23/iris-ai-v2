/**
 * The morning digest: the whole active board in one mail, to every administrator.
 *
 * An administrator who has to open the app to find out whether anything broke overnight
 * mostly does not open the app. This is the same board, pushed, at the hour the studios open
 * — arranged by what it would cost to ignore rather than by when it arrived, because a list
 * sorted newest-first buries the ticket that has been sitting overdue for two days.
 *
 * Four buckets, in the order somebody should read them: overdue, due today, raised
 * overnight, unassigned. A ticket appears in exactly one — the first it qualifies for — so
 * the counts add up and nothing is read twice. Record-only rows (feedback, compliments,
 * assessments) are left out entirely: they have no follow-up target and nothing to chase.
 */
import {and, asc, desc, eq, gte, isNotNull, isNull, lt, ne, or, sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings, appUsers, deliveryLogs, tickets} from '@/db/schema';
import {indiaDate} from './display';
import {BRAND, FONT, MONO, bar, button, emailDocument, esc, firstName, grid, label, priorityPill, section} from './email-layout';
import {findRecurrence} from './recurrence';

export type DigestRow = {
  id: number;
  ticketNumber: string;
  title: string;
  priority: string;
  status: string;
  studio: string | null;
  assignedStaffName: string | null;
  slaDueAt: Date | null;
  createdAt: Date;
  slaExtendedByName: string | null;
  escalatedToName: string | null;
};

export type DigestBucket = {key: 'overdue' | 'today' | 'overnight' | 'unassigned'; label: string; blurb: string; rows: DigestRow[]};

export type Digest = {
  /** Start of the IST day this digest describes. */
  asOf: Date;
  buckets: DigestBucket[];
  totals: {open: number; overdue: number; dueToday: number; overnight: number; unassigned: number; escalated: number; extended: number};
  byStudio: {studio: string; open: number; overdue: number}[];
  byOwner: {owner: string; open: number; overdue: number}[];
  /** The trend and shape of the work behind the lists. Optional so a digest built by an older
   *  caller (or a test) without it still renders — just without the analysis sections. */
  pulse?: DigestPulse;
};

export type DigestPulse = {
  /** Rolling 24 hours to the moment the digest is built. */
  last24h: {raised: number; resolved: number; escalated: number};
  /** Rolling seven days, against the seven before. */
  week: {raised: number; raisedPrev: number; resolved: number; onTime: number; withTarget: number; medianHours: number | null};
  /** How long the open tickets have been open. */
  aging: {under1d: number; d1to3: number; d3to7: number; over7d: number};
  priorities: {critical: number; high: number; medium: number; low: number};
  categories: {category: string; open: number; overdue: number}[];
  /** Themes raised more this week than last, biggest jump first. */
  rising: {theme: string; now: number; before: number}[];
  oldest: DigestRow | null;
  /** Equipment, rooms and themes that keep coming back over the last fortnight. */
  recurring: {subject: string; note: string; open: number}[];
};

const COLUMNS = {
  id: tickets.id, ticketNumber: tickets.ticketNumber, title: tickets.title, priority: tickets.priority,
  status: tickets.status, studio: tickets.studio, assignedStaffName: tickets.assignedStaffName,
  slaDueAt: tickets.slaDueAt, createdAt: tickets.createdAt,
  slaExtendedByName: tickets.slaExtendedByName, escalatedToName: tickets.escalatedToName,
};

/** Still being worked: not settled, and not a record-only row. */
const live = sql`${tickets.status} not in ('resolved','closed','recorded') and ${tickets.resolutionRequired} = true`;

/** IST, because that is the working day the studios keep and the hour this mail is sent in.
 *  Expressed as a fixed +05:30 offset: India has no daylight saving, so there is nothing for
 *  a timezone database to know that this does not. */
const IST_OFFSET_MS = 5.5 * 3600_000;
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** The IST calendar date, as `YYYY-MM-DD`.
 *
 *  Not `istDayStart().toISOString()`: that instant is 18:30 UTC on the *previous* day, so the
 *  marker read a day behind the mail it described — harmless to the claim, which only needs to
 *  change once a day, but misleading in the health endpoint that prints it. */
export function istDayKey(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function buildDigest(now = new Date()): Promise<Digest> {
  const dayStart = istDayStart(now);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const h24 = new Date(now.getTime() - 86_400_000);
  const d7 = new Date(now.getTime() - 7 * 86_400_000);
  const d14 = new Date(now.getTime() - 14 * 86_400_000);
  const ageOver = (days: number) => sql`${tickets.createdAt} < ${new Date(now.getTime() - days * 86_400_000)}`;
  const theme = sql<string>`${tickets.category} || ' · ' || ${tickets.subcategory}`;
  const [overdue, dueToday, overnight, unassigned, studioRows, ownerRows, counts, flow, categoryRows, risingRows, oldestRows, clusters] = await Promise.all([
    db.select(COLUMNS).from(tickets)
      .where(and(live, isNotNull(tickets.slaDueAt), lt(tickets.slaDueAt, now)))
      .orderBy(asc(tickets.slaDueAt)).limit(40),
    db.select(COLUMNS).from(tickets)
      .where(and(live, isNotNull(tickets.slaDueAt), gte(tickets.slaDueAt, now), lt(tickets.slaDueAt, dayEnd)))
      .orderBy(asc(tickets.slaDueAt)).limit(40),
    // Raised since the start of the IST day and not already counted as due or overdue.
    db.select(COLUMNS).from(tickets)
      .where(and(live, gte(tickets.createdAt, dayStart), or(isNull(tickets.slaDueAt), gte(tickets.slaDueAt, dayEnd))))
      .orderBy(desc(tickets.createdAt)).limit(40),
    db.select(COLUMNS).from(tickets)
      .where(and(live, isNull(tickets.assignedStaffId), or(isNull(tickets.slaDueAt), gte(tickets.slaDueAt, dayEnd)), lt(tickets.createdAt, dayStart)))
      .orderBy(desc(tickets.createdAt)).limit(40),
    db.select({
      studio: sql<string>`coalesce(${tickets.studio}, 'Unassigned studio')`,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${tickets.slaDueAt} < ${now})::int`,
    }).from(tickets).where(live).groupBy(sql`coalesce(${tickets.studio}, 'Unassigned studio')`).orderBy(sql`count(*) desc`),
    db.select({
      owner: sql<string>`coalesce(${tickets.assignedStaffName}, 'Unassigned')`,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${tickets.slaDueAt} < ${now})::int`,
    }).from(tickets).where(live).groupBy(sql`coalesce(${tickets.assignedStaffName}, 'Unassigned')`).orderBy(sql`count(*) desc`).limit(12),
    // The open board's shape, in one pass: totals, age bands and priority mix.
    db.select({
      open: sql<number>`count(*)::int`,
      escalated: sql<number>`count(*) filter (where ${tickets.isEscalated} = true)::int`,
      extended: sql<number>`count(*) filter (where ${tickets.slaExtendedAt} is not null)::int`,
      d1: sql<number>`count(*) filter (where ${ageOver(1)})::int`,
      d3: sql<number>`count(*) filter (where ${ageOver(3)})::int`,
      d7: sql<number>`count(*) filter (where ${ageOver(7)})::int`,
      critical: sql<number>`count(*) filter (where ${tickets.priority} = 'critical')::int`,
      high: sql<number>`count(*) filter (where ${tickets.priority} = 'high')::int`,
      medium: sql<number>`count(*) filter (where ${tickets.priority} = 'medium')::int`,
      low: sql<number>`count(*) filter (where ${tickets.priority} = 'low')::int`,
    }).from(tickets).where(live),
    // Flow in and out over the last day and week. Only work that carries a target counts —
    // the same rule as the board — so a burst of compliments does not read as a backlog.
    db.select({
      raised24: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${h24})::int`,
      resolved24: sql<number>`count(*) filter (where ${tickets.resolvedAt} >= ${h24})::int`,
      escalated24: sql<number>`count(*) filter (where ${tickets.escalatedAt} >= ${h24})::int`,
      raised7: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${d7})::int`,
      raisedPrev7: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${d14} and ${tickets.createdAt} < ${d7})::int`,
      resolved7: sql<number>`count(*) filter (where ${tickets.resolvedAt} >= ${d7})::int`,
      withTarget7: sql<number>`count(*) filter (where ${tickets.resolvedAt} >= ${d7} and ${tickets.slaDueAt} is not null)::int`,
      onTime7: sql<number>`count(*) filter (where ${tickets.resolvedAt} >= ${d7} and ${tickets.slaDueAt} is not null and ${tickets.resolvedAt} <= ${tickets.slaDueAt})::int`,
      median7: sql<number | null>`(percentile_cont(0.5) within group (order by extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt})) / 3600) filter (where ${tickets.resolvedAt} >= ${d7}))::float`,
    }).from(tickets).where(eq(tickets.resolutionRequired, true)),
    db.select({
      category: tickets.category,
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`count(*) filter (where ${tickets.slaDueAt} < ${now})::int`,
    }).from(tickets).where(live).groupBy(tickets.category).orderBy(sql`count(*) desc`).limit(5),
    db.select({
      theme,
      now: sql<number>`count(*) filter (where ${tickets.createdAt} >= ${d7})::int`,
      before: sql<number>`count(*) filter (where ${tickets.createdAt} < ${d7})::int`,
    }).from(tickets)
      .where(and(eq(tickets.resolutionRequired, true), gte(tickets.createdAt, d14)))
      .groupBy(theme)
      .having(sql`count(*) filter (where ${tickets.createdAt} >= ${d7}) >= 3 and count(*) filter (where ${tickets.createdAt} >= ${d7}) > count(*) filter (where ${tickets.createdAt} < ${d7})`)
      .orderBy(sql`count(*) filter (where ${tickets.createdAt} >= ${d7}) - count(*) filter (where ${tickets.createdAt} < ${d7}) desc`)
      .limit(3),
    db.select(COLUMNS).from(tickets).where(live).orderBy(asc(tickets.createdAt)).limit(1),
    // Patterns are a nice-to-have in a morning mail: a failure here must not cost the digest.
    findRecurrence(d14, now).catch(() => []),
  ]);

  // The four queries are mutually exclusive by construction, but a ticket can still land in
  // two if its row changes between them — the board is live while this runs. Dedupe in bucket
  // order so the earlier, more urgent bucket keeps it.
  const seen = new Set<number>();
  const take = (rows: DigestRow[]) => rows.filter(row => !seen.has(row.id) && (seen.add(row.id), true));

  const buckets: DigestBucket[] = [
    {key: 'overdue', label: 'Overdue', blurb: 'Past the follow-up target and still open.', rows: take(overdue)},
    {key: 'today', label: 'Due today', blurb: 'The target falls before midnight tonight.', rows: take(dueToday)},
    {key: 'overnight', label: 'Raised overnight', blurb: 'Filed since midnight, target still ahead.', rows: take(overnight)},
    {key: 'unassigned', label: 'Waiting for an owner', blurb: 'Nobody has picked these up.', rows: take(unassigned)},
  ];

  const c = counts[0];
  const f = flow[0];
  const open = c?.open ?? 0;
  return {
    asOf: dayStart,
    buckets,
    totals: {
      open,
      overdue: buckets[0].rows.length,
      dueToday: buckets[1].rows.length,
      overnight: buckets[2].rows.length,
      unassigned: buckets[3].rows.length,
      escalated: c?.escalated ?? 0,
      extended: c?.extended ?? 0,
    },
    byStudio: studioRows,
    byOwner: ownerRows,
    pulse: {
      last24h: {raised: f?.raised24 ?? 0, resolved: f?.resolved24 ?? 0, escalated: f?.escalated24 ?? 0},
      week: {
        raised: f?.raised7 ?? 0, raisedPrev: f?.raisedPrev7 ?? 0, resolved: f?.resolved7 ?? 0,
        onTime: f?.onTime7 ?? 0, withTarget: f?.withTarget7 ?? 0,
        medianHours: f?.median7 == null ? null : Number(f.median7),
      },
      aging: {
        under1d: open - (c?.d1 ?? 0),
        d1to3: (c?.d1 ?? 0) - (c?.d3 ?? 0),
        d3to7: (c?.d3 ?? 0) - (c?.d7 ?? 0),
        over7d: c?.d7 ?? 0,
      },
      priorities: {critical: c?.critical ?? 0, high: c?.high ?? 0, medium: c?.medium ?? 0, low: c?.low ?? 0},
      categories: categoryRows,
      rising: risingRows,
      oldest: oldestRows[0] ?? null,
      // Members are left out: the digest goes to a mailbox, and a member's name in a
      // "keeps coming back" list is a judgement the app makes on screen, not in email.
      recurring: clusters
        .filter(cl => cl.kind === 'equipment' || cl.kind === 'location' || cl.kind === 'theme')
        .sort((a, b) => b.open - a.open || b.count - a.count)
        .slice(0, 4)
        .map(cl => ({subject: cl.subject, note: cl.note, open: cl.open})),
    },
  };
}

/** Everyone who should get it: active administrators with an address. */
export async function digestRecipients(): Promise<{email: string; name: string}[]> {
  return db
    .select({email: appUsers.email, name: appUsers.name})
    .from(appUsers)
    .where(and(eq(appUsers.role, 'admin'), eq(appUsers.active, true), ne(appUsers.email, '')));
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const hoursLabel = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.round(h)}h` : `${Math.max(1, Math.round(h * 60))}m`);

/**
 * The few things worth saying about this morning's board, as sentences, most important first.
 *
 * Numbers in tiles are easy to skim past; "Kwality House holds 5 of the 8 overdue tickets" is
 * not. Each rule only speaks when it has something to say — a quiet board gets a short list.
 */
export function digestInsights(digest: Digest, now = new Date()): string[] {
  const {totals, pulse} = digest;
  const out: string[] = [];
  const overdueTotal = digest.byStudio.reduce((sum, row) => sum + row.overdue, 0);

  if (pulse) {
    const {raised, resolved} = pulse.last24h;
    if (raised > resolved) out.push(`The backlog grew by ${raised - resolved} in the last 24 hours — ${raised} raised, ${resolved} resolved.`);
    else if (resolved > raised) out.push(`The backlog shrank by ${resolved - raised} in the last 24 hours — ${resolved} resolved against ${raised} raised.`);
    else if (raised) out.push(`The backlog held steady in the last 24 hours — ${raised} raised and ${resolved} resolved.`);
  }

  if (overdueTotal >= 3) {
    const top = [...digest.byStudio].sort((a, b) => b.overdue - a.overdue)[0];
    if (top && top.overdue / overdueTotal >= 0.4)
      out.push(`${top.studio} holds ${top.overdue} of the ${overdueTotal} overdue tickets — the place to start.`);
  }

  const busiest = digest.byOwner.filter(o => o.owner !== 'Unassigned').sort((a, b) => b.overdue - a.overdue)[0];
  if (busiest && busiest.overdue >= 3)
    out.push(`${busiest.owner} has ${busiest.overdue} overdue of ${busiest.open} open — the heaviest backlog on the team; worth a check-in or a hand-off.`);

  if (pulse) {
    const {onTime, withTarget, medianHours} = pulse.week;
    if (withTarget >= 3) {
      const pct = Math.round((onTime / withTarget) * 100);
      const verdict = pct >= 90 ? 'strong' : pct >= 75 ? 'holding up' : 'below where it should be';
      out.push(`${pct}% of tickets resolved this week met their follow-up target (${onTime} of ${withTarget}) — ${verdict}.${medianHours !== null ? ` Typical time to resolve: ${hoursLabel(medianHours)}.` : ''}`);
    }

    const {raised, raisedPrev} = pulse.week;
    if (raisedPrev >= 5) {
      const change = Math.round(((raised - raisedPrev) / raisedPrev) * 100);
      if (Math.abs(change) >= 25)
        out.push(`Ticket volume is ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% week on week (${raised} against ${raisedPrev}).`);
    }

    const rising = pulse.rising[0];
    if (rising) out.push(`${rising.theme} is rising: ${rising.now} this week against ${rising.before} the week before.`);

    if (pulse.aging.over7d > 0) {
      const oldest = pulse.oldest;
      const days = oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 86_400_000) : 0;
      out.push(`${plural(pulse.aging.over7d, 'ticket has', 'tickets have')} been open for more than a week${oldest ? `; the oldest is ${oldest.ticketNumber} at ${days} days` : ''}.`);
    }

    const pattern = pulse.recurring.find(r => r.open > 0) ?? pulse.recurring[0];
    if (pattern) out.push(`Recurring: ${pattern.subject} — ${pattern.note}`);

    if (pulse.last24h.escalated) out.push(`${plural(pulse.last24h.escalated, 'ticket was', 'tickets were')} escalated to a reporting manager in the last 24 hours.`);
  }

  if (totals.unassigned >= 3) out.push(`${totals.unassigned} tickets from before today still have no owner.`);
  return out.slice(0, 6);
}

const TONE: Record<DigestBucket['key'], {accent: string; soft: string}> = {
  overdue: {accent: BRAND.red, soft: BRAND.redSoft},
  today: {accent: BRAND.gold, soft: BRAND.goldSoft},
  overnight: {accent: BRAND.blue, soft: BRAND.blueSoft},
  unassigned: {accent: BRAND.muted, soft: BRAND.soft},
};

const appBase = () => {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return base.replace(/\/$/, '');
};

const heading = (text: string, sub?: string) =>
  `<h2 style="margin:0 0 ${sub ? 4 : 12}px;font-family:${FONT};font-size:17px;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:${BRAND.ink};">${esc(text)}</h2>${sub ? `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${esc(sub)}</p>` : ''}`;

const divider = () => `<tr><td class="e-pad" style="padding:4px 36px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:${BRAND.line};">&nbsp;</td></tr></table></td></tr>`;

function statTile(name: string, value: number | string, tone: string, note?: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.soft};border-radius:12px;"><tr><td style="padding:14px 14px 13px;">
    <p style="margin:0;font-family:${FONT};font-size:28px;line-height:1;font-weight:800;letter-spacing:-.03em;color:${tone};">${esc(value)}</p>
    <p style="margin:7px 0 0;font-family:${FONT};font-size:10.5px;line-height:1.3;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;">${esc(name)}</p>
    ${note ? `<p style="margin:3px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.3;color:${BRAND.faint};">${esc(note)}</p>` : ''}
  </td></tr></table>`;
}

/** Four tiles: one row on a desktop, two by two on a phone. */
const tileRow = (tiles: string[]) => grid([grid(tiles.slice(0, 2), 2, 10, false), grid(tiles.slice(2, 4), 2, 10, false)], 2, 10);

/** A small two-column list of label → value lines inside a soft card. */
function statCard(title: string, lines: [string, string, string?][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;"><tr><td style="padding:16px 18px 8px;">
    ${label(title)}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${lines.map(([name, value, color]) => `<tr>
        <td style="padding:6px 0;font-family:${FONT};font-size:13.5px;line-height:1.4;color:${BRAND.body};border-bottom:1px solid ${BRAND.line};">${esc(name)}</td>
        <td align="right" style="padding:6px 0;font-family:${FONT};font-size:14px;line-height:1.4;font-weight:700;color:${color || BRAND.ink};border-bottom:1px solid ${BRAND.line};white-space:nowrap;">${esc(value)}</td>
      </tr>`).join('')}
    </table>
  </td></tr></table>`;
}

function ticketLine(row: DigestRow, now: Date) {
  const base = appBase();
  const link = base ? `${base}/tickets/${row.id}` : '';
  const late = row.slaDueAt ? row.slaDueAt.getTime() < now.getTime() : false;
  // Floored magnitude, in both directions: "14h late" for fourteen and a half, and "in 14h"
  // for fourteen and a half remaining. Rounding would variously overstate how late a ticket
  // is and how much time is left on it, and the second of those is the dangerous one.
  const hours = row.slaDueAt ? Math.floor(Math.abs(row.slaDueAt.getTime() - now.getTime()) / 3600_000) : null;
  // "14h late" is read at a glance; a timestamp has to be subtracted from the current time in
  // the reader's head before it means anything.
  const clock = hours === null ? '' : late ? `${hours}h late` : `in ${hours}h`;
  const name = esc(row.title.length > 92 ? row.title.slice(0, 92) + '…' : row.title);
  const notes = [
    row.escalatedToName ? `escalated to ${row.escalatedToName}` : '',
    row.slaExtendedByName ? `extended by ${row.slaExtendedByName}` : '',
  ].filter(Boolean).join(' · ');
  return `<tr><td style="padding:12px 0;border-bottom:1px solid ${BRAND.line};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td valign="top" style="vertical-align:top;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:14.5px;line-height:1.4;font-weight:600;color:${BRAND.ink};">${link ? `<a href="${esc(link)}" style="color:${BRAND.ink};text-decoration:none;">${name}</a>` : name}</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.muted};">
          <span style="font-family:${MONO};color:${BRAND.faint};">${esc(row.ticketNumber)}</span> · ${esc(row.assignedStaffName || 'Unassigned')}${row.studio ? ' · ' + esc(row.studio) : ''}${notes ? ' · ' + esc(notes) : ''}
        </p>
      </td>
      <td align="right" valign="top" style="vertical-align:top;white-space:nowrap;padding-left:12px;">
        ${clock ? `<p style="margin:0 0 6px;"><span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${late ? BRAND.redSoft : BRAND.soft};color:${late ? BRAND.red : BRAND.muted};font-family:${FONT};font-size:11px;line-height:1.2;font-weight:700;">${esc(clock)}</span></p>` : ''}
        ${priorityPill(row.priority)}
      </td>
    </tr></table>
  </td></tr>`;
}

function bucketBlock(bucket: DigestBucket, now: Date) {
  const tone = TONE[bucket.key];
  if (!bucket.rows.length) return '';
  return section(`
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${tone.soft};border-radius:10px;"><tr><td style="padding:10px 14px;">
      <span style="font-family:${FONT};font-size:12px;line-height:1.4;letter-spacing:.1em;text-transform:uppercase;color:${tone.accent};font-weight:800;">${esc(bucket.label)} · ${bucket.rows.length}</span>
      <span class="e-hide" style="font-family:${FONT};font-size:12.5px;line-height:1.4;color:${BRAND.muted};"> — ${esc(bucket.blurb)}</span>
    </td></tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bucket.rows.map(row => ticketLine(row, now)).join('')}</table>
  `);
}

/** Rows of label, bar and counts — the email stand-in for a horizontal bar chart. */
function barList(rows: {label: string; value: number; extra?: string; extraColor?: string}[], color: string) {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows.map(row => `<tr><td style="padding:0 0 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="padding:0 0 5px;font-family:${FONT};font-size:13.5px;line-height:1.35;color:${BRAND.ink};font-weight:600;">${esc(row.label)}</td>
      <td align="right" style="padding:0 0 5px 10px;font-family:${FONT};font-size:13px;line-height:1.35;white-space:nowrap;color:${BRAND.muted};">
        <strong style="color:${BRAND.ink};">${row.value}</strong>${row.extra ? ` <span style="color:${row.extraColor || BRAND.faint};font-weight:600;">· ${esc(row.extra)}</span>` : ''}
      </td>
    </tr></table>
    ${bar(row.value / max, color)}
  </td></tr>`).join('')}</table>`;
}

function insightList(items: string[]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.ink};border-radius:14px;"><tr><td style="padding:22px 22px 10px;">
    <p style="margin:0 0 14px;font-family:${FONT};font-size:10.5px;line-height:1.3;letter-spacing:.14em;text-transform:uppercase;color:#d9b45a;font-weight:800;">What stands out</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${items.map(item => `<tr>
        <td width="18" valign="top" style="width:18px;padding:0 0 12px;vertical-align:top;font-family:${FONT};font-size:14px;line-height:1.55;color:#d9b45a;">&#9679;</td>
        <td valign="top" style="padding:0 0 12px;font-family:${FONT};font-size:14.5px;line-height:1.55;color:#f3f2f7;">${esc(item)}</td>
      </tr>`).join('')}
    </table>
  </td></tr></table>`;
}

function trendCards(pulse: DigestPulse) {
  const {last24h, week} = pulse;
  const net = last24h.raised - last24h.resolved;
  const onTimePct = week.withTarget ? Math.round((week.onTime / week.withTarget) * 100) : null;
  const change = week.raisedPrev ? Math.round(((week.raised - week.raisedPrev) / week.raisedPrev) * 100) : null;
  return grid([
    statCard('Last 24 hours', [
      ['Raised', String(last24h.raised)],
      ['Resolved', String(last24h.resolved), last24h.resolved ? BRAND.green : undefined],
      ['Escalated', String(last24h.escalated), last24h.escalated ? BRAND.red : undefined],
      ['Net change in backlog', `${net > 0 ? '+' : ''}${net}`, net > 0 ? BRAND.red : net < 0 ? BRAND.green : undefined],
    ]),
    statCard('Last 7 days', [
      ['Raised', `${week.raised}${change !== null ? ` (${change > 0 ? '+' : ''}${change}%)` : ''}`],
      ['Resolved', String(week.resolved)],
      ['Met follow-up target', onTimePct === null ? '—' : `${onTimePct}%`, onTimePct === null ? undefined : onTimePct >= 90 ? BRAND.green : onTimePct >= 75 ? BRAND.gold : BRAND.red],
      ['Typical time to resolve', week.medianHours === null ? '—' : hoursLabel(week.medianHours)],
    ]),
  ]);
}

function shapeBlock(pulse: DigestPulse, open: number) {
  const {aging, priorities} = pulse;
  if (!open) return '';
  const ages = barList([
    {label: 'Under a day', value: aging.under1d},
    {label: '1–3 days', value: aging.d1to3},
    {label: '3–7 days', value: aging.d3to7},
    {label: 'Over a week', value: aging.over7d, extra: aging.over7d ? 'stale' : undefined, extraColor: BRAND.red},
  ], BRAND.blue);
  const mix = barList([
    {label: 'Critical', value: priorities.critical},
    {label: 'High', value: priorities.high},
    {label: 'Medium', value: priorities.medium},
    {label: 'Low', value: priorities.low},
  ], BRAND.gold);
  return section(heading('Shape of the open board', `${plural(open, 'open ticket')}, by how long they have waited and how urgent they are.`) +
    grid([`${label('Waiting for')}${ages}`, `${label('Priority')}${mix}`], 2, 24));
}

function hotspotBlock(digest: Digest) {
  const studios = barList(digest.byStudio.slice(0, 6).map(r => ({label: r.studio, value: r.open, extra: r.overdue ? `${r.overdue} overdue` : undefined, extraColor: BRAND.red})), BRAND.ink);
  const owners = barList(digest.byOwner.slice(0, 6).map(r => ({label: r.owner, value: r.open, extra: r.overdue ? `${r.overdue} overdue` : undefined, extraColor: BRAND.red})), BRAND.ink);
  const categories = digest.pulse?.categories.length
    ? barList(digest.pulse.categories.map(r => ({label: r.category, value: r.open, extra: r.overdue ? `${r.overdue} overdue` : undefined, extraColor: BRAND.red})), BRAND.ink)
    : '';
  if (!studios && !owners) return '';
  return section(heading('Where the work is', 'Open tickets, with what is already overdue.') +
    grid([studios ? `${label('By studio')}${studios}` : '', owners ? `${label('By owner')}${owners}` : ''], 2, 24) +
    (categories ? `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>${label('By category')}${categories}` : ''));
}

function patternBlock(pulse: DigestPulse) {
  const items = [
    ...pulse.rising.map(r => ({title: r.theme, note: `${r.now} raised this week, up from ${r.before} the week before.`, tag: 'Rising', color: BRAND.gold, soft: BRAND.goldSoft})),
    ...pulse.recurring.map(r => ({title: r.subject, note: r.note + (r.open ? ` ${r.open} still open.` : ''), tag: 'Recurring', color: BRAND.red, soft: BRAND.redSoft})),
  ];
  if (!items.length) return '';
  return section(heading('Patterns to fix at the source', 'The same problem, coming back — worth a root-cause conversation rather than another ticket.') +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${items.map(item => `<tr><td style="padding:12px 0;border-bottom:1px solid ${BRAND.line};">
      <p style="margin:0 0 4px;"><span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${item.soft};color:${item.color};font-family:${FONT};font-size:10px;line-height:1.2;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${esc(item.tag)}</span></p>
      <p style="margin:0 0 2px;font-family:${FONT};font-size:14.5px;line-height:1.4;font-weight:700;color:${BRAND.ink};">${esc(item.title)}</p>
      <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${esc(item.note)}</p>
    </td></tr>`).join('')}</table>`);
}

/** Subject, text and HTML for one digest. Rendered per administrator so the greeting can use
 *  their first name; everything else is the same for each of them. */
export function digestEmail(digest: Digest, now = new Date(), recipientName?: string | null) {
  const {totals, pulse} = digest;
  const date = indiaDate(digest.asOf, true);
  const base = appBase();
  const insights = digestInsights(digest, now);
  const first = firstName(recipientName);
  const hello = first ? `Good morning, ${first}.` : 'Good morning.';
  const headline = totals.overdue
    ? `${totals.overdue} overdue`
    : totals.dueToday
      ? `${totals.dueToday} due today`
      : 'Nothing overdue';
  const lede = totals.open === 0
    ? 'The board is clear. Nothing is open across any studio.'
    : `${plural(totals.open, 'ticket')} open across the studios${totals.escalated ? `, ${totals.escalated} already escalated` : ''}${totals.extended ? `, ${totals.extended} running on an extension` : ''}. Here is what needs attention first.`;

  const text = [
    `IRIS morning board — ${date}`,
    '',
    first ? hello : '',
    `${totals.open} open · ${totals.overdue} overdue · ${totals.dueToday} due today · ${totals.unassigned} unassigned`,
    totals.escalated || totals.extended ? `${totals.escalated} escalated · ${totals.extended} extended` : '',
    '',
    ...(insights.length ? ['WHAT STANDS OUT', ...insights.map(i => `  • ${i}`), ''] : []),
    ...(pulse ? [
      `LAST 24 HOURS: ${pulse.last24h.raised} raised · ${pulse.last24h.resolved} resolved · ${pulse.last24h.escalated} escalated`,
      `LAST 7 DAYS: ${pulse.week.raised} raised (${pulse.week.raisedPrev} the week before) · ${pulse.week.resolved} resolved${pulse.week.withTarget ? ` · ${Math.round((pulse.week.onTime / pulse.week.withTarget) * 100)}% met target` : ''}${pulse.week.medianHours !== null ? ` · typical resolve ${hoursLabel(pulse.week.medianHours)}` : ''}`,
      '',
    ] : []),
    ...digest.buckets.filter(b => b.rows.length).flatMap(bucket => [
      `${bucket.label.toUpperCase()} (${bucket.rows.length})`,
      ...bucket.rows.map(row => {
        const ms = row.slaDueAt ? row.slaDueAt.getTime() - now.getTime() : null;
        const hours = ms === null ? null : Math.floor(Math.abs(ms) / 3600_000);
        const clock = hours === null ? '' : ms! < 0 ? ` — ${hours}h late` : ` — in ${hours}h`;
        return `  ${row.ticketNumber} · ${row.title} · ${row.assignedStaffName || 'Unassigned'}${clock}`;
      }),
      '',
    ]),
    digest.byStudio.length ? `BY STUDIO\n${digest.byStudio.map(r => `  ${r.studio}: ${r.open} open${r.overdue ? `, ${r.overdue} overdue` : ''}`).join('\n')}\n` : '',
    digest.byOwner.length ? `BY OWNER\n${digest.byOwner.map(r => `  ${r.owner}: ${r.open} open${r.overdue ? `, ${r.overdue} overdue` : ''}`).join('\n')}\n` : '',
    base ? `Open the board: ${base}/tickets` : '',
  ].filter(line => line !== '').join('\n');

  const body = [
    section(`
      <p style="margin:0 0 12px;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${totals.overdue ? BRAND.redSoft : BRAND.greenSoft};color:${totals.overdue ? BRAND.red : BRAND.green};font-family:${FONT};font-size:11px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${totals.overdue ? 'Action needed' : totals.open ? 'On track' : 'All clear'}</span></p>
      <h1 class="e-h1" style="margin:0 0 12px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.025em;color:${BRAND.ink};">${esc(headline)}</h1>
      <p style="margin:0 0 8px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${BRAND.ink};font-weight:600;">${esc(hello)}</p>
      <p style="margin:0;font-family:${FONT};font-size:15.5px;line-height:1.65;color:${BRAND.body};">${esc(lede)}</p>
    `),
    section(tileRow([
      statTile('Open', totals.open, BRAND.ink),
      statTile('Overdue', totals.overdue, totals.overdue ? BRAND.red : BRAND.ink),
      statTile('Due today', totals.dueToday, totals.dueToday ? BRAND.gold : BRAND.ink),
      statTile('No owner', totals.unassigned, totals.unassigned ? BRAND.gold : BRAND.ink),
    ]), '0 36px 14px'),
    insights.length ? section(insightList(insights)) : '',
    pulse ? section(trendCards(pulse), '0 36px 12px') : '',
    digest.buckets.some(b => b.rows.length) ? divider() + section(heading('Needs attention', 'In the order to work through them: overdue first, then today, then new, then unowned.'), '0 36px 4px') : '',
    digest.buckets.map(bucket => bucketBlock(bucket, now)).join(''),
    pulse && totals.open ? divider() + shapeBlock(pulse, totals.open) : '',
    digest.byStudio.length || digest.byOwner.length ? divider() + hotspotBlock(digest) : '',
    pulse ? patternBlock(pulse) : '',
    base ? section(button(`${base}/tickets`, 'Open the board'), '8px 36px 34px') : section('', '0 0 8px'),
  ].join('');

  const html = emailDocument({
    title: `IRIS morning board — ${date}`,
    preheader: `${totals.open} open · ${totals.overdue} overdue · ${totals.unassigned} waiting for an owner${insights[0] ? ` · ${insights[0]}` : ''}`,
    context: `Morning board · ${date}`,
    accent: totals.overdue ? BRAND.red : BRAND.gold,
    body,
    width: 680,
    footer: 'Sent each morning to IRIS administrators. Counts cover tickets that carry a follow-up target — feedback, compliments and trainer assessments are recorded rather than chased, so they are not listed here.',
  });

  return {
    subject: `IRIS board ${date} — ${totals.open} open, ${totals.overdue} overdue`,
    text,
    html,
  };
}

/** The hour (IST) from which the morning digest may go out. Before this the board has not
 *  had its night yet; after it, the first sweep or cron of the day sends it. */
const SEND_FROM_IST_HOUR = 8;
const DAY_KEY = 'digest:lastSentDay';

export type DigestOutcome =
  | {sent: true; day: string; recipients: number; totals: Digest['totals']}
  | {sent: false; reason: 'too-early' | 'already-sent' | 'emails-off' | 'no-recipients'};

/**
 * Sends today's digest if it is due and has not gone already.
 *
 * Idempotent by the IST day it covers, claimed with a conditional upsert, so the daily cron,
 * a request-driven sweep and a hand-run retry cannot between them send two copies. Queued
 * into the same outbox as the ticket notifications: a mail provider outage delays the digest
 * rather than losing it.
 */
export async function maybeSendDigest(now = new Date()): Promise<DigestOutcome> {
  const {emailSendingEnabled} = await import('./tickets');
  const {getConfig} = await import('./config');
  const {ticketBcc} = await import('./ticket-emails');
  if (!emailSendingEnabled()) return {sent: false, reason: 'emails-off'};
  const cfg = await getConfig();
  // The digest is ticket mail: a workspace that has switched automatic email off has switched
  // this off too, and that setting is the one place to say so.
  if (!cfg.assignmentEmail) return {sent: false, reason: 'emails-off'};

  const dayStart = istDayStart(now);
  const hoursIn = (now.getTime() - dayStart.getTime()) / 3600_000;
  if (hoursIn < SEND_FROM_IST_HOUR) return {sent: false, reason: 'too-early'};
  const day = istDayKey(now);

  // Claim the day before doing the work: `setWhere` makes this a no-op once the stored day
  // matches, so a second caller writes nothing and sends nothing.
  const claimed = await db
    .insert(appSettings)
    .values({key: DAY_KEY, value: {day}, updatedAt: now})
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {value: {day}, updatedAt: now},
      setWhere: sql`${appSettings.value} ->> 'day' is distinct from ${day}`,
    })
    .returning({key: appSettings.key});
  if (!claimed.length) return {sent: false, reason: 'already-sent'};

  const [digest, recipients] = await Promise.all([buildDigest(now), digestRecipients()]);
  if (!recipients.length) {
    // Release the claim: there was nobody to send to, and tomorrow must not inherit a "sent"
    // marker for a mail that never existed.
    await db.delete(appSettings).where(eq(appSettings.key, DAY_KEY));
    return {sent: false, reason: 'no-recipients'};
  }
  const bcc = ticketBcc();
  await db.insert(deliveryLogs).values(
    recipients.map((person, index) => {
      // Rendered per person, so each administrator is greeted by their own first name.
      const {subject, text, html} = digestEmail(digest, now, person.name);
      return {
        integrationId: 'mailtrap',
        action: 'send',
        nextAttemptAt: now,
        // As with the ticket notifications, the archive address rides on the first message only,
        // so one morning puts one copy in that mailbox rather than one per administrator.
        payload: {to: [{email: person.email}], ...(index === 0 && bcc.length ? {bcc} : {}), subject, text, html},
      };
    }),
  );
  return {sent: true, day, recipients: recipients.length, totals: digest.totals};
}
