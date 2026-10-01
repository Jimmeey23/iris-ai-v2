import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { appUsers, ticketComments, ticketActivities, tickets, userNotifications } from "@/db/schema";
import { ApiError, requireAgent, requireTicketAccess, errorResponse, sameOrigin } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
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
    const ids = [...new Set(b.mentionUserIds)].filter((userId) => userId !== actor.id);
    if (ids.length && !b.isInternal) throw new ApiError('Mentions are available in internal notes only.');
    const people = ids.length ? await db.select({id: appUsers.id, name: appUsers.name}).from(appUsers)
      .where(and(inArray(appUsers.id, ids), eq(appUsers.active, true))) : [];
    if (people.length !== ids.length || people.some((person) => !b.body.includes('@' + person.name)))
      throw new ApiError('Select a valid teammate from the mention list.');
    const comment = await db.transaction(async (tx) => {
      const [saved] = await tx.insert(ticketComments).values({
        ticketId: id, authorName: actor.name, authorRole: actor.role,
        body: b.body, isInternal: b.isInternal,
      }).returning();
      await tx.insert(ticketActivities).values({
        ticketId: id, actorName: actor.name, action: 'commented', detail: 'Internal note added',
      });
      if (people.length) await tx.insert(userNotifications).values(people.map((person) => ({
        userId: person.id, ticketId: id, kind: 'mention',
        title: `${actor.name} mentioned you on ${t.ticketNumber}`,
        body: b.body.slice(0, 240), fromName: actor.name,
      })));
      return saved;
    });
    return Response.json({ comment });
  } catch (e) {
    return errorResponse(e);
  }
}
