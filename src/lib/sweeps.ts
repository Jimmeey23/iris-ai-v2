/**
 * The work nobody asks for: SLA reminders, overdue events, escalation, the outbox drain and
 * the morning digest.
 *
 * On a paid plan this would all be a five-minute cron and nothing else. The Vercel **Hobby**
 * plan allows two cron jobs, each invoked once a day, and does not promise the minute — only
 * the hour. A once-a-day sweep is not good enough for an outbox that holds somebody's
 * escalation email, so on this plan the work is *also* driven opportunistically by ordinary
 * requests, and the daily crons are the backstop for a day when nobody signs in.
 *
 * Two things make that safe rather than wasteful:
 *
 *  - **One claim per window.** Each job records its last run in `app_settings` and is claimed
 *    with a conditional upsert, so of a hundred requests arriving together exactly one does
 *    the work and the other ninety-nine do a single cheap write that changes nothing.
 *  - **Never in front of the response.** Every caller invokes this from `after()`, so a
 *    person waiting for the board never waits for an email to be delivered.
 *
 * The cadence is deliberately coarser than a cron would be: the point is that the gap between
 * sweeps is minutes while anyone is using the app, rather than a day.
 */
import {sql} from 'drizzle-orm';
import {db} from '@/db';
import {appSettings} from '@/db/schema';
import {reportError} from './observability';

/** How often each job may run, in seconds. */
const EVERY = {
  /** The outbox holds mail and webhooks that are already late by definition. */
  outbox: 120,
  /** Escalation and the SLA warning read the clock; a two-minute resolution on an hours-long
   *  target is far more precision than the target itself has. */
  sla: 300,
  /** The digest is claimed by the IST day it covers (see maybeSendDigest), so this only
   *  decides how often we bother checking whether today's has gone out. */
  digest: 900,
} satisfies Record<string, number>;

export type SweepJob = keyof typeof EVERY;

/**
 * Takes the claim for `job` when its window has elapsed. Returns false when somebody else
 * holds it — including another instance, since the claim is a row in the database rather than
 * a flag in this process's memory.
 */
async function claim(job: SweepJob): Promise<boolean> {
  const at = new Date();
  const key = `sweep:${job}`;
  const rows = await db
    .insert(appSettings)
    .values({key, value: {at: at.toISOString()}, updatedAt: at})
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {value: {at: at.toISOString()}, updatedAt: at},
      setWhere: sql`${appSettings.updatedAt} < now() - (${EVERY[job]} * interval '1 second')`,
    })
    .returning({key: appSettings.key});
  return rows.length > 0;
}

/** Runs `work` if the claim is free. A failure is reported and swallowed: this is background
 *  work hanging off somebody else's request, and it must never turn their 200 into a 500. */
async function run(job: SweepJob, work: () => Promise<unknown>): Promise<boolean> {
  try {
    if (!(await claim(job))) return false;
    await work();
    return true;
  } catch (error) {
    await reportError(error, {source: `sweep.${job}`});
    return false;
  }
}

/** When this process last asked the database for a claim. See runDueWorkThrottled. */
let lastAttempt = 0;
/** Shorter than every window above, so this gate only ever delays a sweep by under a minute. */
const LOCAL_GATE_MS = 60_000;

/**
 * runDueWork for the polled routes. Every open tab hits those every minute or so, and each
 * call used to cost three conditional upserts that almost always changed nothing. A warm
 * instance now asks at most once a minute; the database claim still arbitrates between
 * instances. The crons call runDueWork directly and are never gated.
 */
export async function runDueWorkThrottled(): Promise<{ran: SweepJob[]}> {
  const now = Date.now();
  if (now - lastAttempt < LOCAL_GATE_MS) return {ran: []};
  lastAttempt = now;
  return runDueWork();
}

/**
 * Everything that is due, as far as its own window allows. Safe to call from any request.
 *
 * Imports are deferred so that a route which only ever reads tickets does not pull the email
 * templates, the integration clients and the digest renderer into its module graph.
 */
export async function runDueWork(): Promise<{ran: SweepJob[]}> {
  const ran: SweepJob[] = [];
  if (
    await run('sla', async () => {
      const {applyEscalations, emitOverdueEvents, queueSlaReminderEmails} = await import('./tickets');
      // Ordered so that anything a sweep queues is in the outbox before the drain below runs.
      await queueSlaReminderEmails();
      await emitOverdueEvents();
      // An escalation reassigns tickets and drops a note in the new owner's bell; push both so
      // open tabs do not wait for their (slow) fallback poll.
      if ((await applyEscalations()) > 0) {
        const {signalChanged} = await import('./realtime');
        await Promise.all([signalChanged('tickets'), signalChanged('notifications')]);
      }
    })
  )
    ran.push('sla');
  if (
    await run('outbox', async () => {
      const {deliverPending} = await import('./integrations');
      // A small batch: this is riding on a user's request, and the daily cron is what clears
      // a genuine backlog with a time budget to spend.
      await deliverPending({limit: 10});
    })
  )
    ran.push('outbox');
  if (
    await run('digest', async () => {
      const {maybeSendDigest} = await import('./ticket-digest');
      await maybeSendDigest();
    })
  )
    ran.push('digest');
  return {ran};
}
