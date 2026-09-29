import {z} from 'zod';
import {and, eq} from 'drizzle-orm';
import {db} from '@/db';
import {appUsers, ticketActivities, tickets, userNotifications} from '@/db/schema';
import {ApiError, errorResponse, requireAgent, requireTicketAccess, sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/tickets/[id]/nudge` — a gentle reminder to the ticket's owner.
 *
 * It reaches that one person: no email, no broadcast, no copy to a manager. A nudge is a
 * tap on the shoulder, and it stops being one the moment it is visible to an audience.
 *
 * The rate limit is deliberately tight and keyed to the sender *and* the ticket, so the
 * feature cannot turn into a way of pestering a colleague — one nudge per ticket per hour,
 * which is also roughly how often a reminder could possibly be useful.
 */
export async function POST(req: Request, ctx: {params: Promise<{id: string}>}) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const id = z.coerce.number().int().positive().parse((await ctx.params).id);
    await enforceRateLimit('nudge', `nudge:${actor.id}:${id}`);

    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!ticket) throw new ApiError('Ticket not found', 404);
    requireTicketAccess(actor, ticket);
    if (!ticket.assignedStaffId) throw new ApiError('This ticket has no owner to nudge yet.');

    // The owner is a staff row; the notification belongs to their workspace account.
    const [owner] = await db.select().from(appUsers).where(and(eq(appUsers.staffId, ticket.assignedStaffId), eq(appUsers.active, true)));
    if (!owner) throw new ApiError('The owner does not have a workspace account to notify.', 409);
    if (owner.id === actor.id) throw new ApiError('This ticket is already yours — no nudge needed.');

    const note = z.object({message: z.string().trim().max(240).optional()}).parse(await req.json().catch(() => ({})));
    await db.insert(userNotifications).values({
      userId: owner.id,
      ticketId: ticket.id,
      kind: 'nudge',
      title: `${actor.name} nudged you about ${ticket.ticketNumber}`,
      body: note.message || ticket.title,
      fromName: actor.name,
    });
    // Recorded on the ticket too: a reminder nobody can see the history of invites a second one.
    await db.insert(ticketActivities).values({
      ticketId: ticket.id, actorName: actor.name, action: 'nudged',
      detail: `Nudged ${ticket.assignedStaffName || 'the owner'}${note.message ? `: "${note.message}"` : ''}.`,
    });
    return Response.json({ok: true, notified: owner.name});
  } catch (e) {
    return errorResponse(e);
  }
}
