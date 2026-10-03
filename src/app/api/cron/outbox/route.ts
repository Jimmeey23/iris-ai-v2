import {timingSafeEqual} from 'node:crypto';
import {deliverPending} from '@/lib/integrations';
import {applyEscalations,emitOverdueEvents,queueSlaReminderEmails} from '@/lib/tickets';
import {sweepRateLimits} from '@/lib/rate-limit';
import {reportError} from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Vercel caps the function at this; the loop below stops well before it.
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
const BATCH = 10;

/** Constant-time bearer check. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
 *  automatically when CRON_SECRET is set on the project. With no secret configured the
 *  route refuses everything rather than running open. */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Scheduled worker (vercel.json → crons, every five minutes). Queues SLA reminders, emits
 * overdue events, drains the integration outbox in batches until it is empty or the time
 * budget is spent, runs the escalation sweep, then sweeps expired rate-limit windows.
 *
 * This is the only thing that drives any of that work. Nothing rides on a user request, so a
 * board nobody is looking at is still swept.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ok: false, error: 'Unauthorized'}, {status: 401});
  const started = Date.now();
  const totals = {batches: 0, processed: 0, succeeded: 0, retrying: 0, failed: 0, reset: 0, reminders: 0, overdue: 0};
  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      if(totals.batches===0){
        totals.reminders=await queueSlaReminderEmails();
        // Queued before the drain below, so a breach found now goes out on this run.
        // A failure here must not cost us the outbox drain or the escalation sweep.
        try{totals.overdue=await emitOverdueEvents();}
        catch(error){await reportError(error,{source:'cron.overdue'});}
      }
      const r = await deliverPending({limit: BATCH});
      totals.batches++;
      totals.processed += r.processed;
      totals.succeeded += r.succeeded;
      totals.retrying += r.retrying;
      totals.failed += r.failed;
      totals.reset += r.reset;
      if (r.processed < BATCH) break;
    }
    let escalated = 0;
    try {
      escalated = await applyEscalations();
    } catch (error) {
      await reportError(error, {source: 'cron.escalations'});
    }
    // Housekeeping, last: a failure here is not worth a non-200 that makes Vercel retry the
    // whole run, so it only ever logs.
    let sweptRateLimits = 0;
    try {
      sweptRateLimits = await sweepRateLimits();
    } catch (error) {
      await reportError(error, {source: 'cron.sweep'});
    }
    const result = {ok: true, ...totals, escalated, sweptRateLimits, ms: Date.now() - started};
    console.log(JSON.stringify({level: 'info', source: 'cron.outbox', ...result}));
    return Response.json(result);
  } catch (error) {
    await reportError(error, {source: 'cron.outbox', severity: 'fatal', extra: {...totals}});
    return Response.json({ok: false, ...totals}, {status: 500});
  }
}
