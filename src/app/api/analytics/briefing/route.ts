import {createHash} from 'node:crypto';
import {NextRequest} from 'next/server';
import {requireWorkspace, errorResponse} from '@/lib/auth';
import {computeAnalytics} from '@/lib/analytics-report';
import {enforceRateLimit} from '@/lib/rate-limit';
import {factsFrom, generateNarrative} from '@/lib/trend-narrative';
import {queryKey, shortCache} from '@/lib/short-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * `GET /api/analytics/briefing` — the written briefing for the Trend dashboard's current view.
 *
 * Takes the dashboard's own query string. The figures come from the same computeAnalytics the
 * dashboard calls (and share its one-minute cache, so this is normally free), and the model
 * sees only the resulting fact sheet. The narrative is cached for fifteen minutes by the
 * content of that sheet, so reloading or switching back to a view costs no further model call,
 * while a change in the numbers produces a fresh one.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    await enforceRateLimit('trend-briefing', `trend-briefing:${user.id}`);
    const params = req.nextUrl.searchParams;
    const report = await shortCache(`analytics:${user.id}:${queryKey(params)}`, 60_000, () => computeAnalytics(user, params), {fresh: params.has('fresh')});
    const range = params.get('range') || '30';
    const period = params.get('from') || params.get('to')
      ? `${params.get('from') || 'the start'} to ${params.get('to') || 'today'}`
      : range === 'all' ? 'all time' : `the last ${range} days`;
    const scope = report.scope.studio || report.scope.department || 'all studios in your access';
    const facts = factsFrom(report, period, scope);
    const key = createHash('sha1').update(JSON.stringify(facts)).digest('hex');
    const narrative = await shortCache(`briefing:${user.id}:${key}`, 15 * 60_000, () => generateNarrative(facts), {fresh: params.has('fresh')});
    return Response.json({narrative, findings: report.patterns.length});
  } catch (e) {
    return errorResponse(e);
  }
}
