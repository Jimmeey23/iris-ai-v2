import {z} from 'zod';
import {desc, gte, sql} from 'drizzle-orm';
import {db} from '@/db';
import {appUsers, userPresence} from '@/db/schema';
import {errorResponse, requireWorkspace, sameOrigin} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** How long after their last heartbeat somebody still counts as here. The client beats every
 *  20s, so this tolerates one missed beat before the person drops off the list. */
const ONLINE_SECONDS = 50;

/**
 * Who is in the workspace, and which page they have open.
 *
 * Polled rather than pushed: a heartbeat on a 20-second interval costs one tiny upsert per
 * person and needs no socket, which matters on serverless where a long-lived connection has
 * nowhere to live. The trade is that "currently viewing" can be up to a beat stale — the
 * right trade for a presence strip, and the wrong one for anything transactional.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireWorkspace();
    const body = z.object({path: z.string().max(200), label: z.string().max(80).optional()}).parse(await req.json());
    await db
      .insert(userPresence)
      .values({userId: user.id, path: body.path, label: body.label, seenAt: new Date()})
      .onConflictDoUpdate({target: userPresence.userId, set: {path: body.path, label: body.label, seenAt: new Date()}});
    return Response.json({ok: true});
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET() {
  try {
    await requireWorkspace();
    const since = new Date(Date.now() - ONLINE_SECONDS * 1000);
    const rows = await db
      .select({
        userId: userPresence.userId, path: userPresence.path, label: userPresence.label,
        seenAt: userPresence.seenAt, name: appUsers.name, role: appUsers.role, avatarUrl: appUsers.avatarUrl,
      })
      .from(userPresence)
      .innerJoin(appUsers, sql`${appUsers.id} = ${userPresence.userId}`)
      .where(gte(userPresence.seenAt, since))
      .orderBy(desc(userPresence.seenAt));
    return Response.json({online: rows, asOf: new Date().toISOString()});
  } catch (e) {
    return errorResponse(e);
  }
}
