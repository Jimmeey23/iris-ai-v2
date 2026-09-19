import type {TicketListRecord} from './ticket-contract';
import type {GroupBy, TicketColumn} from './dashboard-contract';
import {slaBucketOf} from './ticket-filtering';

/**
 * Grouping and sorting, kept out of the component that renders them so both can be checked
 * without a browser — and so the CSV export sorts and groups by exactly the same rules the
 * table on screen used.
 */

const SOURCE_LABEL: Record<string, string> = {
  iris: 'Iris', template: 'Template', manual: 'Manual', voice: 'Voice',
  fillout: 'Form', history: 'Imported', system: 'System',
};

const monthKey = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric'});

/** Which group a ticket belongs to, for every grouping the UI offers. */
export function groupValue(t: TicketListRecord, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'status': return t.status;
    case 'priority': return t.priority;
    case 'category': return t.category || 'Uncategorised';
    case 'subcategory': return t.subcategory || 'None';
    case 'studio': return t.studio || 'No studio';
    case 'owner': return t.assignedStaffName || 'Unassigned';
    case 'department': return t.departmentName || 'No department';
    case 'kind': return t.kind;
    case 'source': return SOURCE_LABEL[t.source] || t.source;
    case 'slaState': return ({ok: 'On track', due: 'Due soon', breached: 'Overdue', none: 'No follow-up target'})[slaBucketOf(t)];
    case 'month': return monthKey(t.createdAt);
    default: return '';
  }
}

export function groupNamesFor(tickets: TicketListRecord[], groupBy: GroupBy): string[] {
  if (groupBy === 'none') return [];
  return [...new Set(tickets.map((t) => groupValue(t, groupBy)))];
}

/** Groups in the order they are rendered: biggest first, because that is where the eye goes. */
export function groupTickets(tickets: TicketListRecord[], groupBy: GroupBy): [string, TicketListRecord[]][] {
  if (groupBy === 'none') return [];
  const map = new Map<string, TicketListRecord[]>();
  for (const t of tickets) {
    const key = groupValue(t, groupBy);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

const PRIORITY_ORDER: Record<string, number> = {critical: 0, high: 1, medium: 2, low: 3};

/** Returns a number for dates and durations and a string otherwise, so one comparator
 *  covers every column. */
export function sortValue(t: TicketListRecord, key: TicketColumn): string | number {
  switch (key) {
    case 'label': return t.title.toLowerCase();
    case 'ticketNumber': return t.ticketNumber;
    case 'member': return (t.memberName || '').toLowerCase();
    case 'kind': return t.kind;
    case 'category': return t.category || '';
    case 'subcategory': return t.subcategory || '';
    case 'studio': return t.studio || '';
    case 'status': return t.status;
    case 'priority': return PRIORITY_ORDER[t.priority] ?? 9;
    // Unassigned sorts last rather than under "U".
    case 'owner': return (t.assignedStaffName || '￿').toLowerCase();
    case 'department': return (t.departmentName || '￿').toLowerCase();
    case 'source': return t.source;
    case 'created': return new Date(t.createdAt).getTime();
    case 'updated': return new Date(t.updatedAt || t.createdAt).getTime();
    case 'age': return new Date(t.createdAt).getTime();
    // No target sorts last in either direction's natural reading.
    case 'slaDue': return t.slaDueAt ? new Date(t.slaDueAt).getTime() : Number.MAX_SAFE_INTEGER;
    case 'sla': return ({breached: 0, due: 1, ok: 2, none: 3})[slaBucketOf(t)];
    case 'resolved': return t.resolvedAt ? new Date(t.resolvedAt).getTime() : -1;
    case 'timeToResolve': return t.resolvedAt ? new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    default: return '';
  }
}

export function sortTickets(rows: TicketListRecord[], key: TicketColumn, dir: 'asc' | 'desc'): TicketListRecord[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key), bv = sortValue(b, key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), undefined, {numeric: true}) * factor;
  });
}
