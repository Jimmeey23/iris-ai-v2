import {timingSafeEqual} from 'node:crypto';
import {deliverPending} from '@/lib/integrations';
import {applyEscalations,queueSlaReminderEmails} from '@/lib/tickets';

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
 * Scheduled worker (vercel.json → crons). Drains the integration outbox in batches
 * until it is empty or the time budget is spent, then runs the SLA escalation sweep
 * (which rate-limits itself to once every few minutes).
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ok: false, error: 'Unauthorized'}, {status: 401});
  const started = Date.now();
  const totals = {batches: 0, processed: 0, succeeded: 0, retrying: 0, failed: 0, reset: 0, reminders: 0};
  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      if(totals.batches===0)totals.reminders=await queueSlaReminderEmails();
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
      console.error(JSON.stringify({level: 'error', source: 'cron.escalations', message: error instanceof Error ? error.message : String(error)}));
    }
    const result = {ok: true, ...totals, escalated, ms: Date.now() - started};
    console.log(JSON.stringify({level: 'info', source: 'cron.outbox', ...result}));
    return Response.json(result);
  } catch (error) {
    console.error(JSON.stringify({level: 'error', source: 'cron.outbox', message: error instanceof Error ? error.message : String(error), ...totals}));
    return Response.json({ok: false, ...totals}, {status: 500});
  }
}
