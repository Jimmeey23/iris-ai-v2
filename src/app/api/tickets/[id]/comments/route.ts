import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ticketComments, ticketActivities, tickets } from "@/db/schema";
import { ApiError, requireAgent, requireTicketAccess, errorResponse, sameOrigin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notifyMentions, resolveMentions } from "@/lib/mentions";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    await enforceRateLimit("ticketWrite");
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((await ctx.params).id);
    const [t] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!t) throw new ApiError("Ticket not found", 404);
    requireTicketAccess(actor, t);
    const b = z
      .object({
        body: z.string().min(1).max(10000),
        isInternal: z.boolean().default(true),
        mentionUserIds: z.array(z.number().int().positive()).max(20).default([]),
      })
      .parse(await req.json());
    if (b.mentionUserIds.length && !b.isInternal) throw new ApiError('Mentions are available in internal notes only.');
    const people = await resolveMentions(b.body, b.mentionUserIds, actor.id);
    const comment = await db.transaction(async (tx) => {
      const [saved] = await tx.insert(ticketComments).values({
        ticketId: id, authorName: actor.name, authorRole: actor.role,
        body: b.body, isInternal: b.isInternal,
      }).returning();
      await tx.insert(ticketActivities).values({
        ticketId: id, actorName: actor.name, action: 'commented', detail: 'Internal note added',
      });
      await notifyMentions(tx, {people, ticketId: id, ticketNumber: t.ticketNumber, actorName: actor.name, body: b.body, context: 'in a note'});
      return saved;
    });
    return Response.json({ comment });
  } catch (e) {
    return errorResponse(e);
  }
}
