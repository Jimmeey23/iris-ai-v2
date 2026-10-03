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
import {BRAND, esc} from './ticket-emails';
import {indiaDate} from './display';

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
  const [overdue, dueToday, overnight, unassigned, studioRows, ownerRows, counts] = await Promise.all([
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
    db.select({
      open: sql<number>`count(*)::int`,
      escalated: sql<number>`count(*) filter (where ${tickets.isEscalated} = true)::int`,
      extended: sql<number>`count(*) filter (where ${tickets.slaExtendedAt} is not null)::int`,
    }).from(tickets).where(live),
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

  return {
    asOf: dayStart,
    buckets,
    totals: {
      open: counts[0]?.open ?? 0,
      overdue: buckets[0].rows.length,
      dueToday: buckets[1].rows.length,
      overnight: buckets[2].rows.length,
      unassigned: buckets[3].rows.length,
      escalated: counts[0]?.escalated ?? 0,
      extended: counts[0]?.extended ?? 0,
    },
    byStudio: studioRows,
    byOwner: ownerRows,
  };
}

/** Everyone who should get it: active administrators with an address. */
export async function digestRecipients(): Promise<{email: string; name: string}[]> {
  return db
    .select({email: appUsers.email, name: appUsers.name})
    .from(appUsers)
    .where(and(eq(appUsers.role, 'admin'), eq(appUsers.active, true), ne(appUsers.email, '')));
}

const TONE: Record<DigestBucket['key'], {accent: string; soft: string}> = {
  overdue: {accent: BRAND.red, soft: BRAND.redSoft},
  today: {accent: BRAND.gold, soft: BRAND.goldSoft},
  overnight: {accent: '#2f6f9f', soft: '#eef4fa'},
  unassigned: {accent: BRAND.muted, soft: '#f4f5f8'},
};

const appBase = () => {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return base.replace(/\/$/, '');
};

function statTile(label: string, value: number, tone: string) {
  return `<td width="25%" align="center" style="padding:0 4px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;">
      <tr><td align="center" style="padding:13px 6px;">
        <p style="margin:0;font-size:27px;line-height:1;font-weight:700;color:${tone};letter-spacing:-.02em;">${value}</p>
        <p style="margin:5px 0 0;font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:${BRAND.faint};font-weight:700;">${esc(label)}</p>
      </td></tr>
    </table>
  </td>`;
}

function ticketLine(row: DigestRow, accent: string, now: Date) {
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
  return `<tr><td style="padding:9px 0;border-bottom:1px solid ${BRAND.line};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="vertical-align:top;">
        <p style="margin:0 0 3px;font-size:14px;line-height:1.4;font-weight:600;color:${BRAND.ink};">${link ? `<a href="${esc(link)}" style="color:${BRAND.ink};text-decoration:none;">${name}</a>` : name}</p>
        <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10.5px;color:${BRAND.faint};">
          ${esc(row.ticketNumber)} · ${esc(row.assignedStaffName || 'Unassigned')}${row.studio ? ' · ' + esc(row.studio) : ''}${notes ? ' · ' + esc(notes) : ''}
        </p>
      </td>
      <td align="right" style="vertical-align:top;white-space:nowrap;padding-left:10px;">
        ${clock ? `<span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${late ? BRAND.redSoft : '#f4f5f8'};color:${late ? BRAND.red : BRAND.muted};font-size:10px;font-weight:700;">${esc(clock)}</span>` : ''}
        <p style="margin:5px 0 0;font-size:10px;color:${BRAND.faint};text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${esc(row.priority)}</p>
      </td>
    </tr></table>
  </td></tr>`;
}

function bucketBlock(bucket: DigestBucket, now: Date) {
  const tone = TONE[bucket.key];
  if (!bucket.rows.length) return '';
  return `<tr><td style="padding:26px 32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${tone.soft};border-radius:10px;margin-bottom:6px;">
      <tr><td style="padding:9px 14px;">
        <span style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${tone.accent};font-weight:700;">${esc(bucket.label)} · ${bucket.rows.length}</span>
        <span style="font-size:11.5px;color:${BRAND.muted};"> — ${esc(bucket.blurb)}</span>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${bucket.rows.map(row => ticketLine(row, tone.accent, now)).join('')}</table>
  </td></tr>`;
}

function countTable(title: string, rows: {label: string; open: number; overdue: number}[]) {
  if (!rows.length) return '';
  return `<tr><td style="padding:26px 32px 0;">
    <p style="margin:0 0 8px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.faint};font-weight:700;">${esc(title)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${rows.map(row => `<tr>
        <td style="padding:6px 0;font-size:13px;color:${BRAND.ink};border-bottom:1px solid ${BRAND.line};">${esc(row.label)}</td>
        <td align="right" style="padding:6px 0;font-size:13px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.line};">${row.open} open</td>
        <td align="right" width="86" style="padding:6px 0;font-size:13px;font-weight:600;color:${row.overdue ? BRAND.red : BRAND.faint};border-bottom:1px solid ${BRAND.line};">${row.overdue ? row.overdue + ' overdue' : '—'}</td>
      </tr>`).join('')}
    </table>
  </td></tr>`;
}

/** Subject, text and HTML for one digest. Addressed to no one in particular, so the same
 *  rendered message can go to every administrator. */
export function digestEmail(digest: Digest, now = new Date()) {
  const {totals} = digest;
  const date = indiaDate(digest.asOf, true);
  const base = appBase();
  const headline = totals.overdue
    ? `${totals.overdue} overdue`
    : totals.dueToday
      ? `${totals.dueToday} due today`
      : 'Nothing overdue';
  const text = [
    `IRIS board — ${date}`,
    '',
    `${totals.open} open · ${totals.overdue} overdue · ${totals.dueToday} due today · ${totals.unassigned} unassigned`,
    totals.escalated || totals.extended ? `${totals.escalated} escalated · ${totals.extended} extended` : '',
    '',
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
    base ? `Open the board: ${base}/tickets` : '',
  ].filter(line => line !== '').join('\n');

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${totals.open} open · ${totals.overdue} overdue · ${totals.unassigned} waiting for an owner</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.page};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(22,22,28,.06),0 12px 32px -12px rgba(22,22,28,.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <tr><td style="padding:20px 32px;background:${BRAND.ink};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.14em;">IRIS</td>
      <td align="right" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:600;">Morning board · ${esc(date)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:30px 32px 0;">
    <h1 style="margin:0 0 8px;font-size:25px;line-height:1.25;color:${BRAND.ink};font-weight:700;letter-spacing:-.02em;">${esc(headline)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.muted};">
      ${totals.open === 0
        ? 'The board is clear. Nothing is open across any studio.'
        : `${totals.open} ticket${totals.open === 1 ? '' : 's'} open across the studios${totals.escalated ? `, ${totals.escalated} already escalated` : ''}${totals.extended ? `, ${totals.extended} running on an extension` : ''}.`}
    </p>
  </td></tr>

  <tr><td style="padding:0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      ${statTile('Overdue', totals.overdue, totals.overdue ? BRAND.red : BRAND.ink)}
      ${statTile('Due today', totals.dueToday, BRAND.ink)}
      ${statTile('Overnight', totals.overnight, BRAND.ink)}
      ${statTile('No owner', totals.unassigned, totals.unassigned ? BRAND.gold : BRAND.ink)}
    </tr></table>
  </td></tr>

  ${digest.buckets.map(bucket => bucketBlock(bucket, now)).join('')}

  ${countTable('By studio', digest.byStudio.map(row => ({label: row.studio, open: row.open, overdue: row.overdue})))}
  ${countTable('By owner', digest.byOwner.map(row => ({label: row.owner, open: row.open, overdue: row.overdue})))}

  <tr><td style="padding:28px 32px 30px;">
    ${base ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${BRAND.ink};">
      <a href="${esc(base)}/tickets" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:650;">Open the board &rarr;</a>
    </td></tr></table>` : ''}
  </td></tr>

  <tr><td style="padding:18px 32px 24px;border-top:1px solid ${BRAND.line};">
    <p style="margin:0;font-size:11.5px;line-height:1.6;color:${BRAND.faint};">Sent each morning to IRIS administrators. Counts cover tickets that carry a follow-up target — feedback, compliments and trainer assessments are recorded rather than chased, so they are not listed here.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

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
  const {subject, text, html} = digestEmail(digest, now);
  const bcc = ticketBcc();
  await db.insert(deliveryLogs).values(
    recipients.map((person, index) => ({
      integrationId: 'mailtrap',
      action: 'send',
      nextAttemptAt: now,
      // As with the ticket notifications, the archive address rides on the first message only,
      // so one morning puts one copy in that mailbox rather than one per administrator.
      payload: {to: [{email: person.email}], ...(index === 0 && bcc.length ? {bcc} : {}), subject, text, html},
    })),
  );
  return {sent: true, day, recipients: recipients.length, totals: digest.totals};
}
