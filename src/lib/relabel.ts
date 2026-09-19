import {eq} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {describeTicket, isGenericLabel} from './ticket-label';

/**
 * Re-labelling tickets that were filed before descriptive labels existed.
 *
 * New tickets get their label at creation. Everything already in the database carries the
 * old taxonomy-joined title, so a board of historical records reads as rows of near-identical
 * strings. This rewrites those, and only those: a title somebody typed by hand is left alone
 * unless `force` is set, because a human-written title is better than a generated one.
 *
 * The original title is kept in `customFields._originalTitle` so nothing is destroyed.
 */
export interface RelabelOutcome {
  scanned: number;
  changed: number;
  skipped: number;
  samples: {id: number; ticketNumber: string; from: string; to: string}[];
}

export async function relabelTickets(options: {dryRun?: boolean; force?: boolean; limit?: number} = {}): Promise<RelabelOutcome> {
  const rows = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      title: tickets.title,
      description: tickets.description,
      category: tickets.category,
      subcategory: tickets.subcategory,
      kind: tickets.kind,
      studio: tickets.studio,
      classFormat: tickets.classFormat,
      trainer: tickets.trainer,
      sentiment: tickets.sentiment,
      memberName: tickets.memberName,
      customFields: tickets.customFields,
    })
    .from(tickets)
    .limit(options.limit ?? 100000);

  const outcome: RelabelOutcome = {scanned: rows.length, changed: 0, skipped: 0, samples: []};

  for (const row of rows) {
    if (!options.force && !isGenericLabel(row.title, row.subcategory, row.category)) {
      outcome.skipped++;
      continue;
    }
    const next = describeTicket({
      description: row.description,
      subcategory: row.subcategory,
      category: row.category,
      kind: row.kind,
      studio: row.studio,
      classFormat: row.classFormat,
      trainer: row.trainer,
      sentiment: row.sentiment,
      memberName: row.memberName,
    });
    // A generated label that matches what is already stored, or that came out empty, is not
    // a change worth writing.
    if (!next || next === row.title) {
      outcome.skipped++;
      continue;
    }
    outcome.changed++;
    if (outcome.samples.length < 25) {
      outcome.samples.push({id: row.id, ticketNumber: row.ticketNumber, from: row.title, to: next});
    }
    if (!options.dryRun) {
      const custom = (row.customFields || {}) as Record<string, unknown>;
      await db
        .update(tickets)
        .set({
          title: next,
          // Written once: a second run must not overwrite the true original with a generated one.
          customFields: custom._originalTitle === undefined ? {...custom, _originalTitle: row.title} : custom,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, row.id));
    }
  }
  return outcome;
}
