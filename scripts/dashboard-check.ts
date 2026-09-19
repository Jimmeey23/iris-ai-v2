/**
 * The rules the board runs on: what a filter selects, how rows group, how columns sort.
 * Pure logic only — the API side is covered by dashboard-api-check.mjs.
 */
import {applyFilters, slaBucketOf, isClosed} from '../src/lib/ticket-filtering';
import {groupTickets, groupNamesFor, groupValue, sortTickets} from '../src/lib/ticket-grouping';
import {EMPTY_FILTERS, dashboardPrefsSchema, filterStateSchema, DEFAULT_COLUMNS, COLUMN_META, TICKET_COLUMNS} from '../src/lib/dashboard-contract';
import type {TicketListRecord} from '../src/lib/ticket-contract';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day).toISOString();
const ahead = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

let seq = 0;
// `over` is loosely typed so a fixture can set a nullable column (an unassigned owner)
// without fighting the record type, which models those as optional rather than nullable.
function ticket(over: Record<string, unknown> = {}): TicketListRecord {
  seq++;
  return {
    id: seq, ticketNumber: `P57-${String(seq).padStart(5, '0')}`, title: 'A thing happened',
    status: 'new', priority: 'medium', category: 'Tech Issues', subcategory: 'Mic Not Working',
    studio: 'Kwality House, Kemps Corner', memberName: 'A Member', assignedStaffId: 1,
    assignedStaffName: 'Shifa Ali', departmentName: 'Operations', kind: 'issue', source: 'manual',
    resolutionRequired: true, slaDueAt: ahead(24), resolvedAt: null,
    createdAt: ago(1), updatedAt: ago(1), version: 1,
    ...over,
  } as TicketListRecord;
}

const rows: TicketListRecord[] = [
  ticket({priority: 'critical', status: 'new', slaDueAt: ago(2), createdAt: ago(10)}),          // overdue, ancient
  ticket({priority: 'high', status: 'in_progress', studio: 'Supreme HQ, Bandra'}),
  ticket({priority: 'low', status: 'resolved', resolvedAt: ago(1), createdAt: ago(4)}),
  ticket({kind: 'compliment', resolutionRequired: false, slaDueAt: null, status: 'recorded', source: 'iris'}),
  ticket({assignedStaffName: null, departmentName: null, createdAt: ago(0.2)}),
  ticket({category: 'Scheduling', subcategory: 'Waitlist Concerns', priority: 'high', createdAt: ago(45)}),
];

section('The filter state has safe defaults');
check('an empty filter selects everything', applyFilters(rows, EMPTY_FILTERS).length === rows.length);
check('an unknown stored filter still parses', filterStateSchema.parse({q: 'x'}).statuses.length === 0);
check('preferences parse to a usable default', dashboardPrefsSchema.parse({}).columns.length === DEFAULT_COLUMNS.length);

section('Each filter selects what it says');
check('open only excludes resolved and recorded', applyFilters(rows, {...EMPTY_FILTERS, state: 'open'}).every((t) => !isClosed(t)));
check('closed only is the complement', applyFilters(rows, {...EMPTY_FILTERS, state: 'closed'}).every(isClosed));
check('open and closed together are everything',
  applyFilters(rows, {...EMPTY_FILTERS, state: 'open'}).length + applyFilters(rows, {...EMPTY_FILTERS, state: 'closed'}).length === rows.length);
check('studio filters by exact studio', applyFilters(rows, {...EMPTY_FILTERS, studio: 'Supreme HQ, Bandra'}).length === 1);
check('priority accepts several at once', applyFilters(rows, {...EMPTY_FILTERS, priorities: ['critical', 'high']}).length === 3);
check('category and subcategory stack', applyFilters(rows, {...EMPTY_FILTERS, category: 'Scheduling', subcategory: 'Waitlist Concerns'}).length === 1);
check('a subcategory from another category selects nothing', applyFilters(rows, {...EMPTY_FILTERS, category: 'Tech Issues', subcategory: 'Waitlist Concerns'}).length === 0);
check('overdue is its own selection', applyFilters(rows, {...EMPTY_FILTERS, slaStates: ['breached']}).length === 1);
check('no-target tickets are selectable', applyFilters(rows, {...EMPTY_FILTERS, slaStates: ['none']}).length === 1);
check('source filters', applyFilters(rows, {...EMPTY_FILTERS, sources: ['iris']}).length === 1);
check('search matches the label', applyFilters(rows, {...EMPTY_FILTERS, q: 'a thing'}).length === rows.length);
check('search matches a ticket number', applyFilters(rows, {...EMPTY_FILTERS, q: rows[1].ticketNumber}).length === 1);
check('search is case-insensitive', applyFilters(rows, {...EMPTY_FILTERS, q: 'SHIFA'}).length === applyFilters(rows, {...EMPTY_FILTERS, q: 'shifa'}).length);
check('a search that matches nothing returns nothing', applyFilters(rows, {...EMPTY_FILTERS, q: 'zzzznope'}).length === 0);

section('Dates and ages');
check('a rolling range excludes older rows', applyFilters(rows, {...EMPTY_FILTERS, range: '7'}).every((t) => Date.now() - new Date(t.createdAt).getTime() <= 7 * day));
check('all time includes the 45-day-old row', applyFilters(rows, {...EMPTY_FILTERS, range: 'all'}).length === rows.length);
check('logged today is only the newest', applyFilters(rows, {...EMPTY_FILTERS, ageBucket: 'today'}).length === 1);
check('older than 30 days is only the oldest', applyFilters(rows, {...EMPTY_FILTERS, ageBucket: 'ancient'}).length === 1);
check('a custom from-date excludes earlier rows',
  applyFilters(rows, {...EMPTY_FILTERS, from: new Date(Date.now() - 3 * day).toISOString().slice(0, 10)}).every((t) => Date.now() - new Date(t.createdAt).getTime() < 4 * day));
check('filters combine as AND, not OR',
  applyFilters(rows, {...EMPTY_FILTERS, state: 'open', priorities: ['critical']}).length === 1);

section('Grouping');
check('grouping by status covers every row', groupTickets(rows, 'status').reduce((n, [, r]) => n + r.length, 0) === rows.length);
check('no row appears in two groups', new Set(groupTickets(rows, 'studio').flatMap(([, r]) => r.map((t) => t.id))).size === rows.length);
check('the biggest group is first', groupTickets(rows, 'category')[0][1].length >= groupTickets(rows, 'category').slice(-1)[0][1].length);
check('an unassigned owner still gets a group', groupValue(rows[4], 'owner') === 'Unassigned');
check('a ticket with no department still groups', groupValue(rows[4], 'department') === 'No department');
check('SLA grouping reads in English', groupValue(rows[0], 'slaState') === 'Overdue');
check('a record-only ticket groups as having no target', groupValue(rows[3], 'slaState') === 'No follow-up target');
check('group names are unique', new Set(groupNamesFor(rows, 'priority')).size === groupNamesFor(rows, 'priority').length);
check('no grouping yields no groups', groupTickets(rows, 'none').length === 0 && groupNamesFor(rows, 'none').length === 0);

section('Sorting');
check('priority sorts critical first', sortTickets(rows, 'priority', 'asc')[0].priority === 'critical');
check('reversing priority puts low first', sortTickets(rows, 'priority', 'desc')[0].priority === 'low');
check('newest first by logged date', sortTickets(rows, 'created', 'desc')[0].id === rows[4].id);
check('oldest first is the exact reverse', sortTickets(rows, 'created', 'asc')[0].id === rows[5].id);
check('unassigned sorts last by owner', sortTickets(rows, 'owner', 'asc').slice(-1)[0].assignedStaffName === null);
check('overdue sorts to the top by SLA', sortTickets(rows, 'sla', 'asc')[0].id === rows[0].id);
check('tickets with no target sort last by due date', sortTickets(rows, 'slaDue', 'asc').slice(-1)[0].slaDueAt === null);
check('sorting never loses or duplicates a row', sortTickets(rows, 'label', 'asc').length === rows.length && new Set(sortTickets(rows, 'label', 'asc').map((t) => t.id)).size === rows.length);
check('sorting does not mutate the input', (() => { const before = rows.map((t) => t.id).join(); sortTickets(rows, 'priority', 'asc'); return rows.map((t) => t.id).join() === before; })());
check('every column has a sort value', TICKET_COLUMNS.every((c) => {
  const v = sortTickets(rows, c, 'asc');
  return v.length === rows.length;
}));

section('Columns');
check('the ticket label column cannot be switched off', COLUMN_META.label.always === true);
check('every column has a heading', TICKET_COLUMNS.every((c) => Boolean(COLUMN_META[c]?.label)));
check('the defaults are all real columns', DEFAULT_COLUMNS.every((c) => TICKET_COLUMNS.includes(c)));
check('an invalid column is rejected', !dashboardPrefsSchema.safeParse({columns: ['nonsense']}).success);
check('an out-of-range page size is rejected', !dashboardPrefsSchema.safeParse({pageSize: 5000}).success);

section('SLA buckets');
check('a past target is overdue', slaBucketOf(rows[0]) === 'breached');
check('a record-only ticket has no target', slaBucketOf(rows[3]) === 'none');
check('a resolved ticket is not overdue', slaBucketOf(ticket({status: 'resolved', slaDueAt: ago(5)})) === 'ok');

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
