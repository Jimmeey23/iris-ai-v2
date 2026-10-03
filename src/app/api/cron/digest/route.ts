/**
 * `GET /api/cron/digest` — the daily backstop for the morning board.
 *
 * The send itself lives in `lib/ticket-digest → maybeSendDigest`, because on the Vercel Hobby
 * plan a cron fires once a day and only within the hour it names. The request-driven sweep
 * (lib/sweeps) checks the same thing every fifteen minutes while anybody is using the app, so
 * whichever of the two gets there first sends it — the day claim makes a second send
 * impossible either way.
 */
import {timingSafeEqual} from 'node:crypto';
import {maybeSendDigest} from '@/lib/ticket-digest';
import {reportError} from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ok: false, error: 'Unauthorized'}, {status: 401});
  try {
    const outcome = await maybeSendDigest();
    console.log(JSON.stringify({level: 'info', source: 'cron.digest', ...outcome}));
    return Response.json({ok: true, ...outcome});
  } catch (error) {
    await reportError(error, {source: 'cron.digest', severity: 'fatal'});
    return Response.json({ok: false}, {status: 500});
  }
}
