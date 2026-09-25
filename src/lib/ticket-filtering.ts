import type {TicketListRecord} from './ticket-contract';
import type {FilterState} from './dashboard-contract';
import {isBreachedOpen, isDueSoon, isOpen, isSlaTracked, zonedDayEnd, zonedDayStart} from './metrics';

/**
 * One place where a filter state becomes a set of tickets.
 *
 * The dashboard, the metric drill-downs and the CSV export all have to agree on what "the
 * current selection" means. When each computed it for itself they drifted, and an export
 * quietly contained rows the table on screen did not.
 */

// Open / closed, overdue and due-soon are defined once, in lib/metrics.ts.
export const isClosed = (t: TicketListRecord) => !isOpen(t);

/** 'breached' is breachedOpen (still open, past target) — the "Overdue" count everywhere. */
export function slaBucketOf(t: TicketListRecord, now = Date.now()): 'ok' | 'due' | 'breached' | 'none' {
  if (!isSlaTracked(t)) return 'none';
  return isBreachedOpen(t, now) ? 'breached' : isDueSoon(t, now) ? 'due' : 'ok';
}

const AGE_LIMITS: Record<string, number> = {today: 1, week: 7, stale: 3, ancient: 30};

export function applyFilters(tickets: TicketListRecord[], f: FilterState, staleDays = 3): TicketListRecord[] {
  const q = f.q.trim().toLowerCase();
  // Dates are resolved once rather than per row, as workspace-timezone days (not the
  // browser's local midnight) so the board agrees with the analytics and reports ranges.
  const fromMs = f.from ? zonedDayStart(f.from) : null;
  const toMs = f.to ? zonedDayEnd(f.to) : null;
  const rangeMs = f.range !== 'all' && f.range !== 'custom' && Number(f.range) > 0
    ? Date.now() - Number(f.range) * 86400000
    : null;

  const now = Date.now();
  return tickets.filter((t) => {
    const created = new Date(t.createdAt).getTime();
    if (fromMs !== null && created < fromMs) return false;
    if (toMs !== null && created > toMs) return false;
    if (rangeMs !== null && created < rangeMs) return false;

    if (f.state === 'open' && isClosed(t)) return false;
    if (f.state === 'closed' && !isClosed(t)) return false;

    if (f.studio && t.studio !== f.studio) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.subcategory && t.subcategory !== f.subcategory) return false;
    if (f.statuses.length && !f.statuses.includes(t.status)) return false;
    if (f.priorities.length && !f.priorities.includes(t.priority)) return false;
    if (f.kinds.length && !f.kinds.includes(t.kind)) return false;
    if (f.sources.length && !f.sources.includes(t.source)) return false;
    if (f.owners.length && !f.owners.includes(t.assignedStaffName || '')) return false;
    if (f.departments.length && !f.departments.includes(t.departmentName || '')) return false;
    if (f.slaStates.length && !f.slaStates.includes(slaBucketOf(t, now))) return false;

    if (f.ageBucket !== 'any') {
      const ageDays = (now - created) / 86400000;
      const limit = f.ageBucket === 'stale' ? staleDays : AGE_LIMITS[f.ageBucket];
      // "today" and "week" mean newer than the limit; "stale" and "ancient" mean older.
      const wantsNewer = f.ageBucket === 'today' || f.ageBucket === 'week';
      if (wantsNewer ? ageDays > limit : ageDays <= limit) return false;
    }

    if (q) {
      const haystack = `${t.title} ${t.memberName} ${t.ticketNumber} ${t.category} ${t.subcategory} ${t.assignedStaffName || ''} ${t.studio || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
