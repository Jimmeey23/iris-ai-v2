/**
 * The weekly trend report: who gets it, what each person sees, and when it goes.
 *
 * Every Monday morning (IST) each administrator and manager is mailed the week that just
 * ended — Monday to Sunday in the workspace timezone — with that week's patterns, a written
 * briefing and recommended actions (see lib/weekly-report-email for the layout).
 *
 * **Each person sees only their own scope.** An administrator gets the whole workspace; a
 * manager gets what `ticketScope` lets them see on the dashboard — their studios, department
 * and reports' tickets — computed through the same `computeAnalytics` the dashboard uses, so a
 * figure in the mail is the figure on their screen.
 *
 * Sending follows the morning digest: claimed once per covered week with a conditional upsert
 * (so the cron, a request-driven sweep and a manual retry cannot send two), queued into the same
 * outbox as the other mail (so a provider outage delays it rather than losing it), and released
 * if anything fails before the mail is queued so the next sweep tries again.
 */
import {and, eq, inArray, ne, sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings, appUsers, deliveryLogs, staff} from '@/db/schema';
import type {Identity} from './auth';
import {computeAnalytics} from './analytics-report';
import {directReportIds} from './reporting-line';
import {zonedDayEnd} from './metrics';
import {factsFrom, generateNarrative, ruleNarrative} from './trend-narrative';
import {weeklyReportEmail, type WeeklyReportModel} from './weekly-report-email';
import {parseKey, previousWeek, DAY_MS, type ReportWeek} from './week';

const WEEK_KEY = 'weekly-report:lastWeek';
/** Hours after the week closes (Monday 00:00) before it may go out, and how long it stays sendable. */
const SEND_FROM_HOURS = 8;
const SEND_UNTIL_HOURS = 80;
/** Past this, remaining recipients get the rule-based briefing rather than another model call. */
const MODEL_BUDGET_MS = 40_000;
const CONCURRENCY = 3;

export type WeeklyRecipient = {identity: Identity; scope: 'workspace' | 'own'};

/** Administrators and managers with an address, each as the identity the dashboard would build for them. */
export async function weeklyRecipients(): Promise<WeeklyRecipient[]> {
  const [users, directory] = await Promise.all([
    db.select({
      id: appUsers.id, name: appUsers.name, email: appUsers.email, role: appUsers.role, staffId: appUsers.staffId,
      department: appUsers.department, studio: appUsers.studio, studios: appUsers.studios, avatarUrl: appUsers.avatarUrl, mustChangePassword: appUsers.mustChangePassword,
    }).from(appUsers).where(and(eq(appUsers.active, true), ne(appUsers.email, ''), inArray(appUsers.role, ['admin', 'manager']))),
    db.select({id: staff.id, externalId: staff.externalId, name: staff.name, manager: staff.manager, isActive: staff.isActive}).from(staff),
  ]);
  const out: WeeklyRecipient[] = [];
  for (const u of users) {
    const managedStaffIds = u.staffId === null ? [] : directReportIds(u.staffId, directory);
    const identity: Identity = {...u, role: u.role as Identity['role'], studios: u.studios ?? [], managedStaffIds};
    if (identity.role === 'admin') { out.push({identity, scope: 'workspace'}); continue; }
    // A manager with no department, studio, own queue or reports would see nothing: skip, rather than mail an empty page.
    const covers = identity.department || identity.studio || identity.studios.length || identity.staffId !== null || managedStaffIds.length;
    if (covers) out.push({identity, scope: 'own'});
  }
  return out;
}

const appBase = () => {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return base.replace(/\/$/, '');
};

const scopeLabel = (r: WeeklyRecipient) => {
  if (r.scope === 'workspace') return 'All studios and departments';
  const i = r.identity;
  const studios = i.studios.length ? i.studios : i.studio ? [i.studio] : [];
  const parts = [i.department, studios.map(s => s.split(',')[0]).join(', ')].filter(Boolean);
  return parts.length ? `Your scope: ${parts.join(' · ')}` : 'Your tickets and your team\'s';
};

/** One person's report for `week`, or null when there is nothing in it worth a mail. */
export async function buildWeeklyModel(r: WeeklyRecipient, week: ReportWeek, opts: {useModel?: boolean} = {}): Promise<WeeklyReportModel | null> {
  const report = await computeAnalytics(r.identity, new URLSearchParams({range: 'custom', from: week.from, to: week.to}));
  // Nothing raised, nothing open, nothing before: a manager whose scope is quiet gets no empty mail.
  if (report.totals.all === 0 && report.totals.open === 0 && !(report.previous?.all)) return null;
  const facts = factsFrom(report, `the week ${week.label}`, scopeLabel(r));
  const narrative = opts.useModel === false ? ruleNarrative(facts) : await generateNarrative(facts);
  return {
    periodLabel: week.label, scopeLabel: scopeLabel(r), report, narrative,
    dashboardUrl: appBase() ? `${appBase()}/analytics?range=7` : '',
  };
}

export type WeeklyOutcome =
  | {sent: true; week: string; recipients: number; skipped: number}
  | {sent: false; reason: 'too-early' | 'too-late' | 'already-sent' | 'emails-off' | 'no-recipients'};

type Queued = {email: string; name: string; subject: string; text: string; html: string};

async function queue(items: Queued[], now: Date) {
  if (!items.length) return;
  const {ticketBcc} = await import('./ticket-emails');
  const bcc = ticketBcc();
  await db.insert(deliveryLogs).values(items.map((m, i) => ({
    integrationId: 'mailtrap', action: 'send', nextAttemptAt: now,
    // The archive address rides on the first message only, as with the other mail.
    payload: {to: [{email: m.email}], ...(i === 0 && bcc.length ? {bcc} : {}), subject: m.subject, text: m.text, html: m.html},
  })));
}

/** Runs `fn` over `items` with at most `n` in flight; results keep their order. */
async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(n, items.length)}, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/**
 * Sends last week's report if it is due and has not gone already. Safe to call from any
 * request or cron: the claim, keyed by the week it covers, makes a second send impossible.
 */
export async function maybeSendWeeklyReport(now = new Date()): Promise<WeeklyOutcome> {
  const [{emailSendingEnabled}, {getConfig}] = await Promise.all([import('./tickets'), import('./config')]);
  if (!emailSendingEnabled()) return {sent: false, reason: 'emails-off'};
  const cfg = await getConfig();
  // The report is ticket mail: automatic email off switches it off too, and it has its own switch.
  if (!cfg.assignmentEmail || !cfg.weeklyReportEmail) return {sent: false, reason: 'emails-off'};

  const dayKeyOf = (ms: number) => new Intl.DateTimeFormat('en-CA', {timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(ms);
  const week = previousWeek(now.getTime(), dayKeyOf);
  const closedAt = (zonedDayEnd(week.to, cfg.timezone) ?? parseKey(week.to) + DAY_MS - 1) + 1;
  const hoursSince = (now.getTime() - closedAt) / 3_600_000;
  if (hoursSince < SEND_FROM_HOURS) return {sent: false, reason: 'too-early'};
  if (hoursSince > SEND_UNTIL_HOURS) return {sent: false, reason: 'too-late'};

  const claimed = await db.insert(appSettings)
    .values({key: WEEK_KEY, value: {week: week.from}, updatedAt: now})
    .onConflictDoUpdate({target: appSettings.key, set: {value: {week: week.from}, updatedAt: now}, setWhere: sql`${appSettings.value} ->> 'week' is distinct from ${week.from}`})
    .returning({key: appSettings.key});
  if (!claimed.length) return {sent: false, reason: 'already-sent'};

  const release = () => db.delete(appSettings).where(eq(appSettings.key, WEEK_KEY));
  try {
    const recipients = await weeklyRecipients();
    if (!recipients.length) { await release(); return {sent: false, reason: 'no-recipients'}; }
    const started = Date.now();
    const built = await pool(recipients, CONCURRENCY, async r => {
      const model = await buildWeeklyModel(r, week, {useModel: Date.now() - started < MODEL_BUDGET_MS});
      if (!model) return null;
      // Rendered per person, so each is greeted by their own first name.
      return {email: r.identity.email, name: r.identity.name, ...weeklyReportEmail(model, r.identity.name)};
    });
    const items = built.filter((x): x is Queued => x !== null);
    await queue(items, now);
    return {sent: true, week: week.from, recipients: items.length, skipped: recipients.length - items.length};
  } catch (error) {
    // Nothing was queued (the insert is the last step): let the next sweep try again.
    await release().catch(() => {});
    throw error;
  }
}

/** Queues one report to one person now, outside the weekly claim — for "send me a copy". */
export async function sendWeeklyReportTo(r: WeeklyRecipient, week: ReportWeek, now = new Date()): Promise<boolean> {
  const model = await buildWeeklyModel(r, week);
  if (!model) return false;
  await queue([{email: r.identity.email, name: r.identity.name, ...weeklyReportEmail(model, r.identity.name)}], now);
  return true;
}
