import {z} from 'zod';
import {and, desc, eq, inArray, isNull} from 'drizzle-orm';
import {db} from '@/db';
import {tickets, userNotifications} from '@/db/schema';
import {after} from 'next/server';
import {errorResponse, requireWorkspace, sameOrigin} from '@/lib/auth';
import {runDueWork} from '@/lib/sweeps';

export const dynamic = 'force-dynamic';

/** The signed-in person's own in-app notifications. There is no way to read anyone else's:
 *  the recipient is taken from the session, never from the request. */
export async function GET() {
  try {
    const user = await requireWorkspace();
    // The bell is polled by every open tab on the workspace's poll interval, which makes it
    // the most reliable heartbeat in the app — so the background sweeps hang off it as well as
    // off the ticket list. Claimed and throttled in lib/sweeps; runs after the response.
    after(() => runDueWork().catch(() => {}));
    const rows = await db
      .select({
        id: userNotifications.id, kind: userNotifications.kind, title: userNotifications.title,
        body: userNotifications.body, fromName: userNotifications.fromName, readAt: userNotifications.readAt,
        createdAt: userNotifications.createdAt, ticketId: userNotifications.ticketId,
        ticketNumber: tickets.ticketNumber,
      })
      .from(userNotifications)
      .leftJoin(tickets, eq(tickets.id, userNotifications.ticketId))
      .where(eq(userNotifications.userId, user.id))
      .orderBy(desc(userNotifications.createdAt))
      .limit(50);
    return Response.json({notifications: rows, unread: rows.filter(r => !r.readAt).length});
  } catch (e) {
    return errorResponse(e);
  }
}

/** Mark some, or all, as read. */
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireWorkspace();
    const body = z.object({ids: z.array(z.number().int().positive()).max(100).optional(), all: z.boolean().optional()}).parse(await req.json().catch(() => ({})));
    const mine = eq(userNotifications.userId, user.id);
    if (body.all) await db.update(userNotifications).set({readAt: new Date()}).where(and(mine, isNull(userNotifications.readAt)));
    else if (body.ids?.length) await db.update(userNotifications).set({readAt: new Date()}).where(and(mine, inArray(userNotifications.id, body.ids)));
    return Response.json({ok: true});
  } catch (e) {
    return errorResponse(e);
  }
}
