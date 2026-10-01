import {and, eq, inArray} from 'drizzle-orm';
import {db, type Tx} from '@/db';
import {appUsers, userNotifications} from '@/db/schema';
import {ApiError} from '@/lib/auth';

/**
 * Tagging a teammate from any internal writing surface — a ticket note, a resolution step.
 *
 * Anyone with an active workspace account can be tagged: internal communication is not
 * limited to the people a ticket happens to be routed to. The name must still be present in
 * the text that is being saved, so a client cannot notify somebody who was never written
 * about, and a mention of yourself is dropped rather than rejected.
 */
export async function resolveMentions(body: string, mentionUserIds: number[], actorId?: number | null) {
  const ids = [...new Set(mentionUserIds)].filter((userId) => userId !== actorId);
  if (!ids.length) return [];
  const people = await db.select({id: appUsers.id, name: appUsers.name}).from(appUsers)
    .where(and(inArray(appUsers.id, ids), eq(appUsers.active, true)));
  if (people.length !== ids.length || people.some((person) => !body.includes('@' + person.name)))
    throw new ApiError('Select a valid teammate from the mention list.');
  return people;
}

/** Queues one in-app notification per tagged teammate, inside the caller's transaction. */
export async function notifyMentions(tx: Tx, args: {
  people: {id: number; name: string}[];
  ticketId: number;
  ticketNumber: string;
  actorName: string;
  body: string;
  context: string;
}) {
  if (!args.people.length) return;
  await tx.insert(userNotifications).values(args.people.map((person) => ({
    userId: person.id,
    ticketId: args.ticketId,
    kind: 'mention',
    title: `${args.actorName} mentioned you ${args.context} on ${args.ticketNumber}`,
    body: args.body.slice(0, 240),
    fromName: args.actorName,
  })));
}
