import {NextRequest} from 'next/server';
import {z} from 'zod';
import {errorResponse, requireWorkspace} from '@/lib/auth';
import {marqueeFor, type MarqueePage} from '@/lib/marquee';

export const dynamic = 'force-dynamic';

const pageSchema = z.enum(['overview', 'tickets', 'radar', 'iris', 'equipment', 'analytics', 'trainers']);

/** Live ticker content for one page, counted over the tickets the caller can list. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    const parsed = pageSchema.safeParse(req.nextUrl.searchParams.get('page'));
    const page: MarqueePage = parsed.success ? parsed.data : 'overview';
    return Response.json({page, items: await marqueeFor(page, user)}, {headers: {'Cache-Control': 'no-store'}});
  } catch (e) {
    return errorResponse(e);
  }
}
