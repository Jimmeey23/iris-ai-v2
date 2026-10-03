import {gte, sql} from 'drizzle-orm';
import {db} from '@/db';
import {appUsers, staff, userPresence} from '@/db/schema';
import {errorResponse, requireWorkspace} from '@/lib/auth';
import {ensureUsernames} from '@/lib/mentions';

export const dynamic = 'force-dynamic';

/** Matches ONLINE_SECONDS in the presence route: one missed heartbeat is forgiven. */
const ONLINE_SECONDS = 50;

/**
 * Faces and presence for everyone in the workspace, in one small payload.
 *
 * Avatars are looked up by name because that is what a ticket, a session and a trainer
 * review all carry — `assignedStaffName`, `trainer`, a reviewer's name — rather than a
 * foreign key. One directory fetched once and shared through context therefore puts the
 * right face on every surface without changing a single call site.
 *
 * Presence rides along: it changes on the same timescale as nothing else here, and a second
 * poll for a handful of user ids would cost more than it saves.
 */
export async function GET() {
  try {
    await requireWorkspace();
    // The mention picker takes its handles from this payload, so an account that has never
    // had one gets it here, before anybody can type `@`. A no-op once every account is filled.
    await ensureUsernames();
    const since = new Date(Date.now() - ONLINE_SECONDS * 1000);
    const [accounts, directory, present] = await Promise.all([
      db.select({id: appUsers.id, name: appUsers.name, username: appUsers.username, avatarUrl: appUsers.avatarUrl, staffId: appUsers.staffId, role: appUsers.role}).from(appUsers),
      db.select({id: staff.id, name: staff.name, role: staff.role, colour: staff.avatarColor}).from(staff),
      db.select({userId: userPresence.userId, path: userPresence.path, label: userPresence.label}).from(userPresence).where(gte(userPresence.seenAt, since)),
    ]);
    const onlineIds = new Set(present.map(p => p.userId));
    const byStaffId = new Map(accounts.filter(a => a.staffId).map(a => [a.staffId as number, a]));

    const people = [
      // Every staff member, carrying the photo of their workspace account when they have one.
      ...directory.map(s => {
        const account = byStaffId.get(s.id);
        return {
          name: s.name,
          username: account?.username ?? null,
          role: s.role,
          avatarUrl: account?.avatarUrl ?? null,
          colour: s.colour,
          userId: account?.id ?? null,
          online: account ? onlineIds.has(account.id) : false,
          viewing: account ? present.find(p => p.userId === account.id)?.label ?? null : null,
        };
      }),
      // Accounts with no directory row of their own still get a face and a dot.
      ...accounts.filter(a => !a.staffId).map(a => ({
        name: a.name, username: a.username, role: a.role, avatarUrl: a.avatarUrl, colour: null,
        userId: a.id, online: onlineIds.has(a.id),
        viewing: present.find(p => p.userId === a.id)?.label ?? null,
      })),
    ];
    return Response.json(
      {people, online: people.filter(p => p.online).length, asOf: new Date().toISOString()},
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (e) {
    return errorResponse(e);
  }
}
