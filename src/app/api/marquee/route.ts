import {NextRequest} from 'next/server';
import {z} from 'zod';
import {errorResponse, requireWorkspace} from '@/lib/auth';
import {marqueeFor, type MarqueePage} from '@/lib/marquee';

export const dynamic = 'force-dynamic';

const pageSchema = z.enum(['overview', 'tickets', 'radar', 'iris', 'equipment', 'analytics', 'trainers']);

/** Live ticker content for one page. Counts only — no ticket a caller could not already
 *  list — but it still requires a session, because the volume of open work is not public. */
export async function GET(req: NextRequest) {
  try {
    await requireWorkspace();
    const parsed = pageSchema.safeParse(req.nextUrl.searchParams.get('page'));
    const page: MarqueePage = parsed.success ? parsed.data : 'overview';
    return Response.json({page, items: await marqueeFor(page)}, {headers: {'Cache-Control': 'no-store'}});
  } catch (e) {
    return errorResponse(e);
  }
}
