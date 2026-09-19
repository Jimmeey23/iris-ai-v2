#!/usr/bin/env node
/**
 * Marks every ticket logged before today as resolved and closed.
 *
 * Dry run by default; pass --apply to write.
 *
 * Two deliberate exclusions:
 *   - anything already resolved or closed, which needs no second closing;
 *   - `recorded` tickets, which are record-only feedback and assessments. Recorded is
 *     already a terminal state that carries no follow-up target, and rewriting it to
 *     closed would lose the distinction between "nothing to do" and "done". Pass
 *     --include-recorded to close those too.
 *
 * The original status and the fact of this bulk close are kept on each record, so the
 * change can be read back and reversed.
 *
 *   node scripts/close-past-tickets.mjs                     # preview
 *   node scripts/close-past-tickets.mjs --apply             # write
 *   node scripts/close-past-tickets.mjs --apply --include-recorded
 */
import 'dotenv/config';
import {and, inArray, lt, notInArray, sql} from 'drizzle-orm';
import {db, pool} from '../src/db/index.ts';
import {tickets, ticketActivities} from '../src/db/schema.ts';

const apply = process.argv.includes('--apply');
const includeRecorded = process.argv.includes('--include-recorded');

// Local midnight today: "past" means logged on an earlier day, not in the last 24 hours.
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const terminal = includeRecorded ? ['resolved', 'closed'] : ['resolved', 'closed', 'recorded'];

try {
  const rows = await db
    .select({
      id: tickets.id, ticketNumber: tickets.ticketNumber, title: tickets.title,
      status: tickets.status, createdAt: tickets.createdAt, resolvedAt: tickets.resolvedAt,
      customFields: tickets.customFields,
    })
    .from(tickets)
    .where(and(lt(tickets.createdAt, startOfToday), notInArray(tickets.status, terminal)));

  console.log(`${rows.length} ticket${rows.length === 1 ? '' : 's'} logged before ${startOfToday.toDateString()} ${apply ? 'will be' : 'would be'} marked resolved and closed.`);
  if (!includeRecorded) {
    const [{n}] = await db.select({n: sql`count(*)::int`}).from(tickets).where(and(lt(tickets.createdAt, startOfToday), inArray(tickets.status, ['recorded'])));
    console.log(`${n} record-only entries left as "recorded" — pass --include-recorded to close those too.\n`);
  }

  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.table(Object.entries(byStatus).map(([status, count]) => ({status, count})));

  for (const r of rows.slice(0, 5)) console.log(`  e.g. ${r.ticketNumber} · ${r.status} · ${r.title.slice(0, 60)}`);

  const now = new Date();
  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply to close them.');
  } else {
    let done = 0;
    // One statement per ticket: each needs its own previous status recorded, and its own
    // resolvedAt preserved where the ticket already had one.
    for (const r of rows) {
      const custom = (r.customFields || {});
      await db.update(tickets).set({
        status: 'closed',
        // Closed today, not back-dated to when it was logged. Back-dating would record a
        // resolution time of zero for every one of them, which is both untrue and enough
        // to flatten the median-resolution figure the board reports.
        resolvedAt: r.resolvedAt ?? now,
        closedAt: now,
        updatedAt: now,
        customFields: custom._closedFromStatus === undefined
          ? {...custom, _closedFromStatus: r.status, _bulkClosedAt: now.toISOString()}
          : custom,
      }).where(sql`${tickets.id} = ${r.id}`);
      await db.insert(ticketActivities).values({
        ticketId: r.id,
        actorName: 'Workspace maintenance',
        action: 'closed',
        detail: `Bulk-closed as historical work. Previous status: ${r.status}.`,
        createdAt: now,
      });
      done++;
    }
    console.log(`\n${done} tickets marked resolved and closed. Their previous status is kept on each record as _closedFromStatus.`);
  }
} finally {
  await pool.end();
}
