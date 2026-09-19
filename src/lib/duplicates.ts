import {and,desc,gte,eq,notInArray} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';

/**
 * Catches a report about something that is already logged.
 *
 * Without this, four people reporting the same broken aircon produce four tickets, nobody
 * can tell a chronic fault from a first occurrence, and "this keeps happening" stays an
 * anecdote. The match runs against tickets that are still open at the same site — the only
 * ones where adding to it helps.
 */

export type DuplicateCandidate = {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
  ageLabel: string;
  assignedStaffName: string | null;
  /** How many times this has now been reported, including this one. */
  recurrence: number;
  reasons: string[];
  score: number;
};

const OPEN_STATUSES = ['new', 'open', 'assigned', 'in-progress', 'pending', 'escalated', 'on-hold'];
const LOOKBACK_DAYS = 45;
/** A score at or above this is shown to the reporter as a possible duplicate. Anything
 *  lower is library noise: the same subcategory happens legitimately, ten times a week. */
const DUPLICATE_THRESHOLD = 6;

function ageLabel(createdAt: string): string {
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return 'recently';
  const hours = (Date.now() - then) / 3600000;
  if (hours < 1) return 'moments ago';
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const field = (c: Record<string, unknown>, key: string): string => {
  const value = c[key];
  return value === undefined || value === null ? '' : String(value).trim();
};

/**
 * The strongest open ticket that looks like the same fault, or null.
 *
 * Scored rather than matched on equality because the reporter's wording never matches:
 * what identifies a repeat is the asset, the room and the subcategory lining up, not the
 * words. An asset match alone is enough — two open faults on bike 6 are one fault twice.
 */
/** How strongly one open ticket looks like the fault being reported right now. */
export type DuplicateScore = {score: number; reasons: string[]};

/**
 * Scores a single open ticket against the report in progress.
 *
 * Split out from the database read so the weights are testable: the product decisions all
 * live here, and they are the part worth arguing about.
 */
export function scoreDuplicate(c: Record<string, unknown>, row: Record<string, unknown>): DuplicateScore {
  const cf = (row.customFields || {}) as Record<string, unknown>;
  const reasons: string[] = [];
  let score = 0;

  const assetId = Number(c.assetId || 0);
  const bikeNumber = field(c, 'bikeNumber');
  const theirAsset = Number(cf.assetId || 0);
  const theirBike = String(cf.bikeNumber || '');
  // Which piece of equipment is a gate, not a weight. Bike 9 with a broken pedal and bike 6
  // with a broken pedal are two faults on two bikes; no amount of matching room, fault and
  // date makes them one ticket. Without an asset on either side — the aircon, the sound
  // system — the room and the fault carry the match instead.
  const reportHasAsset = Boolean(assetId || bikeNumber);
  const rowHasAsset = Boolean(theirAsset || theirBike);
  if (reportHasAsset && rowHasAsset) {
    const same = (assetId && theirAsset && assetId === theirAsset) || (bikeNumber && theirBike && bikeNumber === theirBike);
    if (!same) return {score: 0, reasons: []};
  }

  if (assetId && theirAsset === assetId) {
    score += 7;
    reasons.push('the same bike');
  } else if (bikeNumber && theirBike === bikeNumber) {
    score += 5;
    reasons.push(`bike #${bikeNumber}`);
  }

  const subcategory = field(c, 'subcategory').toLowerCase();
  if (subcategory && String(row.subcategory || '').toLowerCase() === subcategory) {
    score += 3;
    reasons.push(String(row.subcategory));
  }

  const area = field(c, 'area').toLowerCase();
  if (area && String(cf.area || '').toLowerCase() === area) {
    score += 2;
    reasons.push(field(c, 'area'));
  }

  const created = new Date(String(row.createdAt || '')).getTime();
  if (Number.isFinite(created)) {
    const ageDays = (Date.now() - created) / 86400000;
    if (ageDays <= 7) score += 2;
    else if (ageDays <= 21) score += 1;
  }

  return {score, reasons: [...new Set(reasons)]};
}

/** True once a score is worth interrupting the reporter with. */
export function isDuplicate(score: number): boolean {
  return score >= DUPLICATE_THRESHOLD;
}

export async function findDuplicate(c: Record<string, unknown>): Promise<DuplicateCandidate | null> {
  const studio = field(c, 'studio');
  const category = field(c, 'category');
  if (!studio || !category) return null;

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const rows = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      title: tickets.title,
      status: tickets.status,
      priority: tickets.priority,
      subcategory: tickets.subcategory,
      studio: tickets.studio,
      assignedStaffName: tickets.assignedStaffName,
      customFields: tickets.customFields,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(and(eq(tickets.studio, studio), notInArray(tickets.status, ['resolved', 'closed']), gte(tickets.createdAt, since)))
    .orderBy(desc(tickets.createdAt))
    .limit(200);

  let best: DuplicateCandidate | null = null;
  for (const row of rows) {
    const cf = (row.customFields || {}) as Record<string, unknown>;
    const {score, reasons} = scoreDuplicate(c, row);
    if (!isDuplicate(score)) continue;
    const candidate: DuplicateCandidate = {
      id: Number(row.id),
      ticketNumber: String(row.ticketNumber),
      title: String(row.title),
      status: String(row.status),
      priority: String(row.priority),
      createdAt: new Date(String(row.createdAt)).toISOString(),
      ageLabel: ageLabel(String(row.createdAt)),
      assignedStaffName: (row.assignedStaffName as string) ?? null,
      recurrence: (Number(cf.recurrenceCount) || 1) + 1,
      reasons: reasons.slice(0, 3),
      score,
    };
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}
