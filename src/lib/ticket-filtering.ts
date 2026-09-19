import type {TicketListRecord} from './ticket-contract';
import type {FilterState} from './dashboard-contract';
import {slaState} from './utils';

/**
 * One place where a filter state becomes a set of tickets.
 *
 * The dashboard, the metric drill-downs and the CSV export all have to agree on what "the
 * current selection" means. When each computed it for itself they drifted, and an export
 * quietly contained rows the table on screen did not.
 */

const CLOSED = ['resolved', 'closed', 'recorded'];
export const isClosed = (t: TicketListRecord) => CLOSED.includes(t.status);

export function slaBucketOf(t: TicketListRecord): 'ok' | 'due' | 'breached' | 'none' {
  if (!t.resolutionRequired || !t.slaDueAt) return 'none';
  const state = slaState(t.slaDueAt, t.status);
  return state === 'breached' ? 'breached' : state === 'soon' ? 'due' : 'ok';
}

const AGE_LIMITS: Record<string, number> = {today: 1, week: 7, stale: 3, ancient: 30};

export function applyFilters(tickets: TicketListRecord[], f: FilterState, staleDays = 3): TicketListRecord[] {
  const q = f.q.trim().toLowerCase();
  // Dates are resolved once rather than per row.
  const fromMs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toMs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  const rangeMs = f.range !== 'all' && f.range !== 'custom' && Number(f.range) > 0
    ? Date.now() - Number(f.range) * 86400000
    : null;

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
    if (f.slaStates.length && !f.slaStates.includes(slaBucketOf(t))) return false;

    if (f.ageBucket !== 'any') {
      const ageDays = (Date.now() - created) / 86400000;
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
