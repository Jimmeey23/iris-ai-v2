import {and, eq, isNull} from 'drizzle-orm';
import {db, type Tx} from '@/db';
import {appUsers, userNotifications} from '@/db/schema';
import {ApiError} from '@/lib/auth';
import {mentionsIn, pickUsername} from '@/lib/usernames';

/**
 * Tagging a teammate from any internal writing surface — a ticket note, a resolution step.
 *
 * Anyone with an active workspace account can be tagged: internal communication is not
 * limited to the people a ticket happens to be routed to. The handle must still be present in
 * the text that is being saved, so a client cannot notify somebody who was never written
 * about, and a mention of yourself is dropped rather than rejected.
 */

/**
 * Gives every active account a username, once.
 *
 * Handles are needed by the mention picker, which means they have to exist before anybody
 * types `@` — and the accounts that predate the column have none. This fills the gaps in one
 * statement per person, skipping anyone who already has one so an existing handle never
 * moves. Cheap enough to sit in front of the directory read, which is where the picker gets
 * its list from.
 */
export async function ensureUsernames(): Promise<number> {
  const missing = await db
    .select({id: appUsers.id, name: appUsers.name, email: appUsers.email})
    .from(appUsers)
    .where(and(isNull(appUsers.username), eq(appUsers.active, true)));
  if (!missing.length) return 0;
  const existing = await db.select({username: appUsers.username}).from(appUsers);
  const taken = new Set(existing.map(row => row.username).filter((u): u is string => !!u));
  let filled = 0;
  for (const person of missing) {
    const username = pickUsername(person, taken);
    if (!username) continue;
    taken.add(username);
    // `onConflictDoNothing` on the unique index: two requests racing to backfill the same
    // workspace must not turn into a 500 on whichever one loses.
    const [row] = await db
      .update(appUsers)
      .set({username})
      .where(and(eq(appUsers.id, person.id), isNull(appUsers.username)))
      .returning({id: appUsers.id});
    if (row) filled++;
  }
  return filled;
}

/**
 * The people a body text actually tags.
 *
 * `mentionUserIds` is what the picker collected; the text is the authority. A tag is accepted
 * only when the person's `@handle` is still in the body, so deleting the handle after picking
 * it un-tags them, and a hand-written handle that was never picked still works — somebody who
 * knows a colleague's handle should not have to use the menu.
 */
export async function resolveMentions(body: string, mentionUserIds: number[], actorId?: number | null) {
  const handles = mentionsIn(body);
  const picked = [...new Set(mentionUserIds)];
  if (!handles.length && !picked.length) return [];
  const candidates = await db
    .select({id: appUsers.id, name: appUsers.name, username: appUsers.username})
    .from(appUsers)
    .where(eq(appUsers.active, true));
  const people = candidates.filter(person => {
    if (person.id === actorId) return false;
    // Either form counts: the handle, or the full display name that older clients (and the
    // notes already saved before handles existed) write out.
    const byHandle = !!person.username && handles.includes(person.username);
    const byName = body.includes('@' + person.name);
    return byHandle || byName;
  });
  // A picked id that the text does not carry is a client that has drifted from what the person
  // actually wrote — worth refusing, because the alternative is notifying somebody who was
  // never mentioned.
  const resolved = new Set(people.map(person => person.id));
  if (picked.some(id => id !== actorId && !resolved.has(id)))
    throw new ApiError('Select a valid teammate from the mention list.');
  return people.map(({id, name}) => ({id, name}));
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
