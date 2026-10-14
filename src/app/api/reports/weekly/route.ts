import {NextRequest} from 'next/server';
import {z} from 'zod';
import {ApiError, errorResponse, requireManager, sameOrigin} from '@/lib/auth';
import {getConfig} from '@/lib/config';
import {enforceRateLimit} from '@/lib/rate-limit';
import {buildWeeklyModel, sendWeeklyReportTo, type WeeklyRecipient} from '@/lib/weekly-report';
import {previousWeek, weekStartingOn, type ReportWeek} from '@/lib/week';
import {weeklyReportEmail} from '@/lib/weekly-report-email';
import {dayKey} from '@/lib/metrics';
import {emailSendingEnabled} from '@/lib/tickets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const weekParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The week to report on: `?week=YYYY-MM-DD` (a Monday) or, by default, the last complete one. */
async function pickWeek(raw: string | null): Promise<ReportWeek> {
  const cfg = await getConfig();
  if (!raw) return previousWeek(Date.now(), ms => dayKey(ms, cfg.timezone));
  const from = weekParam.parse(raw);
  if (new Date(from + 'T00:00:00Z').getUTCDay() !== 1) throw new ApiError('`week` must be the Monday a week starts on.');
  return weekStartingOn(from);
}

/**
 * `GET /api/reports/weekly` — the weekly trend report exactly as the caller would receive it.
 *
 * `?format=html` (default) renders the email, `?format=text` its plain-text part, `?format=json`
 * the underlying report. Administrators preview the whole workspace; managers preview their own
 * scope. Nothing is sent.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireManager();
    await enforceRateLimit('weeklyPreview', `weekly-preview:${user.id}`);
    const q = req.nextUrl.searchParams;
    const week = await pickWeek(q.get('week'));
    const recipient: WeeklyRecipient = {identity: user, scope: user.role === 'admin' ? 'workspace' : 'own'};
    const model = await buildWeeklyModel(recipient, week);
    if (!model) return Response.json({error: `Nothing to report for ${week.label}: no tickets were raised or are open in your scope.`}, {status: 404});
    const format = q.get('format') || 'html';
    if (format === 'json') return Response.json(model);
    const mail = weeklyReportEmail(model, user.name);
    if (format === 'text') return new Response(mail.text, {headers: {'content-type': 'text/plain; charset=utf-8'}});
    return new Response(mail.html, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store'}});
  } catch (e) {
    return errorResponse(e);
  }
}

/** `POST /api/reports/weekly` `{week?}` — queues a copy of the report to the caller's own address. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireManager();
    await enforceRateLimit('weeklyPreview', `weekly-preview:${user.id}`);
    if (!emailSendingEnabled()) throw new ApiError('Email sending is switched off for this deployment.', 409);
    const body = z.object({week: weekParam.optional()}).parse(await req.json().catch(() => ({})));
    const week = await pickWeek(body.week ?? null);
    const sent = await sendWeeklyReportTo({identity: user, scope: user.role === 'admin' ? 'workspace' : 'own'}, week);
    if (!sent) throw new ApiError(`Nothing to report for ${week.label}.`, 404);
    return Response.json({ok: true, week: week.label, to: user.email});
  } catch (e) {
    return errorResponse(e);
  }
}
