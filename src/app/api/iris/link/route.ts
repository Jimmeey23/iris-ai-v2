import {z} from 'zod';
import {and,eq} from 'drizzle-orm';
import {db} from '@/db';
import {chatSessions,tickets} from '@/db/schema';
import {browserKey,requireAgent,requireTicketAccess,errorResponse,ApiError,sameOrigin} from '@/lib/auth';
import {appendRepeatReport} from '@/lib/tickets';
import {registerAssetFault} from '@/lib/assets';
import {obj} from '@/lib/momence';

export const dynamic = 'force-dynamic';

/**
 * Folds a report into a ticket that is already open.
 *
 * This is the path taken when the reporter says "yes, that's the same one". Nothing is
 * created: the report lands on the existing ticket as a dated note, the count goes up, and a
 * fault reported three times escalates on its own.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireAgent();
    const owner = await browserKey();
    const {sessionId} = z.object({sessionId: z.string()}).parse(await req.json());
    const [s] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.ownerKey, owner)));
    if (!s) throw new ApiError('Conversation not found', 404);
    if (s.ticketId) return Response.json({ticket: {id: s.ticketId, ticketNumber: s.ticketNumber}});

    const c = (s.collected || {}) as Record<string, unknown>;
    const target = Number(c._linkTo || 0);
    if (!Number.isInteger(target) || target <= 0) throw new ApiError('No ticket to add this report to.');
    // `_linkTo` comes from a "__link__:<id>" chat message, which a caller can type with any id.
    // Folding into the duplicate the server itself offered (found by findDuplicate) is allowed;
    // any other ticket needs ordinary ticket access, or this is a write to someone else's ticket.
    const [ticket] = await db
      .select({id: tickets.id, assignedStaffId: tickets.assignedStaffId, createdByUserId: tickets.createdByUserId, departmentName: tickets.departmentName, studio: tickets.studio})
      .from(tickets)
      .where(eq(tickets.id, target));
    if (!ticket) throw new ApiError('That ticket no longer exists.', 404);
    if (Number(obj(c._duplicate).id || 0) !== target) requireTicketAccess(user, ticket);

    const reporter = String(c.memberName || '').trim();
    const reporterName = reporter && !/studio team observation/i.test(reporter) ? reporter : 'Studio team';
    const result = await appendRepeatReport({
      ticketId: target,
      description: String(c.description || ''),
      reporterName,
      collected: c,
      recurrence: Number(obj(c._duplicate).recurrence || 2),
    });

    // "Took it out of rotation" has to change the floor, not just the ticket.
    const assetId = Number(c.assetId || 0);
    if (assetId > 0) {
      await registerAssetFault({
        assetId,
        takenOutOfRotation: String(c.cycleReporterAction || '') === 'Took bike out of rotation',
        note: `Reported again on ${result.ticketNumber}`,
      });
    }

    await db
      .update(chatSessions)
      .set({phase: 'complete', ticketId: result.id, ticketNumber: result.ticketNumber, updatedAt: new Date()})
      .where(eq(chatSessions.id, s.id));

    return Response.json({
      ticket: {id: result.id, ticketNumber: result.ticketNumber},
      recurrence: result.recurrence,
      escalated: result.escalated,
      priority: result.priority,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
