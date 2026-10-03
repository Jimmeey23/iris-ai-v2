/**
 * `POST /api/tickets/:id/extend` — the owner buying themselves more time, once.
 *
 * Escalation (lib/tickets → applyEscalations) measures from `slaDueAt`, so an extension that
 * moves that column defers the escalation by exactly the hours granted with no second clock
 * to keep in step. The columns beside it are the record of who moved it and why.
 *
 * One extension per ticket. An owner who can defer indefinitely has no follow-up target at
 * all, which is the thing the target exists to prevent; a second extension is a conversation
 * with the manager, not a button. The reason is mandatory and ends up in the activity log,
 * because "needs more time" with no reason is what the breach already said.
 */
import {eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {after} from 'next/server';
import {db} from '@/db';
import {ticketActivities, tickets} from '@/db/schema';
import {ApiError, errorResponse, requireAgent, requireTicketAccess, sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {canResolveTicket, getTicketBundle} from '@/lib/tickets';
import {signalChanged} from '@/lib/realtime';

export const dynamic = 'force-dynamic';
type Ctx = {params: Promise<{id: string}>};

/** Long enough that the clock moves meaningfully, short enough that it is still a follow-up
 *  target: three days is the outer edge of "I am on it and it is taking longer". */
const MAX_HOURS = 72;

const body = z.object({
  hours: z.coerce.number().int().min(1).max(MAX_HOURS),
  reason: z
    .string()
    .trim()
    .min(10, 'Say in a sentence what is holding this up.')
    .max(600),
});

export async function POST(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    await enforceRateLimit('ticketWrite');
    const id = z.coerce.number().int().positive().parse((await ctx.params).id);
    const input = body.parse(await req.json());
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!ticket) throw new ApiError('Ticket not found', 404);
    requireTicketAccess(actor, ticket);
    // The same test the resolution workspace uses: the assigned owner, or that owner's
    // reporting manager. Nobody else gets to move somebody else's follow-up target.
    if (!(await canResolveTicket(actor, ticket.assignedStaffId, ticket.resolutionRequired)))
      throw new ApiError('Only the assigned owner or their reporting manager can extend this.', 403);
    if (!ticket.resolutionRequired || !ticket.slaDueAt)
      throw new ApiError('This ticket has no follow-up target to extend.');
    if (['resolved', 'closed', 'recorded'].includes(ticket.status))
      throw new ApiError('This ticket is already settled — there is nothing to extend.');
    if (ticket.slaExtendedAt)
      throw new ApiError(
        `This ticket has already been extended once, by ${ticket.slaExtendedByName || 'its owner'}. ` +
          `A further extension needs a manager to reassign or re-prioritise it.`,
        409,
      );
    const now = new Date();
    // Measured from the existing target, not from now: extending at the eleventh hour and
    // extending early should both buy the same number of hours.
    const due = new Date(ticket.slaDueAt.getTime() + input.hours * 3600_000);
    await db.transaction(async tx => {
      await tx
        .update(tickets)
        .set({
          slaDueAt: due,
          slaHours: sql`${tickets.slaHours} + ${input.hours}`,
          slaExtendedHours: input.hours,
          slaExtendedAt: now,
          slaExtendedByName: actor.name,
          slaExtensionReason: input.reason,
          version: sql`${tickets.version} + 1`,
          updatedAt: now,
        })
        .where(eq(tickets.id, id));
      await tx.insert(ticketActivities).values({
        ticketId: id,
        actorName: actor.name,
        action: 'sla.extended',
        detail: `Follow-up target moved out by ${input.hours}h — ${input.reason}`.slice(0, 500),
      });
    });
    after(() => signalChanged('tickets'));
    return Response.json(await getTicketBundle(id, actor));
  } catch (e) {
    return errorResponse(e);
  }
}
