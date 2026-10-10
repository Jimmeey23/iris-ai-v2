import {z} from 'zod';
import type {TicketListRecord} from './ticket-contract';

/**
 * Everything the ticket workspace remembers about how you like to look at it.
 *
 * All of it is stored server-side against your workspace identity (or this browser, if you
 * are not signed in) rather than in localStorage, so the view you set up on the studio iPad
 * is the view you get on your laptop. localStorage is used only as a first-paint cache for
 * the theme, where a round-trip would cause a visible flash.
 */

// Order here is display order: the column picker always re-sorts a selection into it, so
// a saved list is canonical and new keys can be slotted in beside their neighbours.
export const TICKET_COLUMNS = [
  'label', 'ticketNumber', 'member', 'reporter', 'kind', 'category', 'subcategory', 'studio',
  'status', 'priority', 'owner', 'coOwners', 'department', 'source', 'created', 'updated',
  'age', 'slaDue', 'sla', 'revisedSla', 'extension', 'committedResolution', 'escalation',
  'resolved', 'closed', 'timeToResolve',
] as const;
export type TicketColumn = (typeof TICKET_COLUMNS)[number];

/** What each column is called, and how it behaves. Single source for header, picker and CSV. */
export const COLUMN_META: Record<TicketColumn, {label: string; align?: 'right' | 'center'; numeric?: boolean; always?: boolean}> = {
  label: {label: 'Ticket', always: true},
  ticketNumber: {label: 'Number'},
  member: {label: 'Logged for'},
  reporter: {label: 'Reported by'},
  kind: {label: 'Type'},
  category: {label: 'Category'},
  subcategory: {label: 'Subcategory'},
  studio: {label: 'Studio'},
  status: {label: 'Status'},
  priority: {label: 'Priority'},
  owner: {label: 'Owner'},
  coOwners: {label: 'Co-owners'},
  department: {label: 'Department'},
  source: {label: 'Source'},
  created: {label: 'Logged', numeric: true},
  updated: {label: 'Updated', numeric: true},
  age: {label: 'Age', align: 'right', numeric: true},
  slaDue: {label: 'Due', numeric: true},
  sla: {label: 'SLA', align: 'right'},
  revisedSla: {label: 'Revised SLA', numeric: true},
  extension: {label: 'Extra time requested', numeric: true},
  committedResolution: {label: 'Committed resolution', numeric: true},
  escalation: {label: 'Escalation', numeric: true},
  resolved: {label: 'Resolved', numeric: true},
  closed: {label: 'Closed', numeric: true},
  timeToResolve: {label: 'Time to resolve', align: 'right', numeric: true},
};

export const LEGACY_DEFAULT_COLUMNS: TicketColumn[] = ['label', 'kind', 'category', 'status', 'priority', 'owner', 'created', 'sla'];
export const DEFAULT_COLUMNS: TicketColumn[] = [
  'label', 'member', 'kind', 'category', 'studio', 'status', 'priority', 'owner', 'coOwners',
  'department', 'source', 'age', 'sla', 'revisedSla', 'extension', 'committedResolution', 'escalation',
];

/**
 * Bumped when a release wants existing people to see something their saved layout would
 * otherwise hide. A saved column list is a deliberate choice, so new columns are never
 * forced on every load — `migrateDashboardPrefs` adds them once, records the version, and
 * after that removing them sticks.
 *
 * v2: accountability columns (co-owners, escalation, extension, revised SLA, committed
 *     resolution) join the default set; the stock page size goes 25 → 50.
 */
export const DASHBOARD_PREFS_VERSION = 2;
export const V2_DEFAULT_COLUMNS: TicketColumn[] = ['coOwners', 'escalation', 'extension', 'revisedSla', 'committedResolution'];
const LEGACY_PAGE_SIZE = 25;
export const DEFAULT_PAGE_SIZE = 50;

export const GROUP_BY = [
  'none', 'status', 'priority', 'category', 'subcategory', 'studio', 'owner',
  'department', 'kind', 'source', 'slaState', 'month',
] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'No grouping',
  status: 'Status',
  priority: 'Priority',
  category: 'Category',
  subcategory: 'Subcategory',
  studio: 'Studio',
  owner: 'Owner',
  department: 'Department',
  kind: 'Type',
  source: 'Logged via',
  slaState: 'SLA state',
  month: 'Month logged',
};

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export const KANBAN_GROUP_BY = ['status', 'priority', 'category', 'owner', 'studio', 'department'] as const;
export type KanbanGroupBy = (typeof KANBAN_GROUP_BY)[number];
export const KANBAN_FIELDS = ['member', 'studio', 'department', 'owner', 'status', 'priority', 'category', 'source', 'age', 'sla'] as const;
export type KanbanField = (typeof KANBAN_FIELDS)[number];
export const DEFAULT_KANBAN_FIELDS: KanbanField[] = ['member', 'status', 'priority', 'category', 'owner', 'sla'];

/** The saved filter state. Every field is optional so an older saved view still loads. */
export const filterStateSchema = z.object({
  q: z.string().max(200).default(''),
  studio: z.string().max(120).default(''),
  category: z.string().max(120).default(''),
  subcategory: z.string().max(120).default(''),
  statuses: z.array(z.string().max(40)).max(20).default([]),
  priorities: z.array(z.string().max(20)).max(10).default([]),
  kinds: z.array(z.string().max(20)).max(10).default([]),
  sources: z.array(z.string().max(20)).max(12).default([]),
  owners: z.array(z.string().max(120)).max(50).default([]),
  departments: z.array(z.string().max(120)).max(30).default([]),
  slaStates: z.array(z.enum(['ok', 'due', 'breached', 'none'])).max(4).default([]),
  /** Rolling window in days, or 'all', or 'custom' when from/to are set. */
  range: z.string().max(12).default('all'),
  from: z.string().max(40).default(''),
  to: z.string().max(40).default(''),
  /** 'any' | 'open' | 'closed' — the single most-used cut, kept separate from statuses. */
  state: z.enum(['any', 'open', 'closed']).default('any'),
  ageBucket: z.enum(['any', 'today', 'week', 'stale', 'ancient']).default('any'),
  tab: z.string().max(20).default('all'),
});
export type FilterState = z.infer<typeof filterStateSchema>;
export const EMPTY_FILTERS: FilterState = filterStateSchema.parse({});

export const dashboardPrefsSchema = z.object({
  columns: z.array(z.enum(TICKET_COLUMNS)).max(TICKET_COLUMNS.length).default(DEFAULT_COLUMNS),
  groupBy: z.enum(GROUP_BY).default('none'),
  kanbanGroupBy: z.enum(KANBAN_GROUP_BY).default('status'),
  kanbanFields: z.array(z.enum(KANBAN_FIELDS)).min(1).max(KANBAN_FIELDS.length).default(DEFAULT_KANBAN_FIELDS),
  sortKey: z.enum(TICKET_COLUMNS).default('created'),
  sortDir: z.enum(SORT_DIRECTIONS).default('desc'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  pageSize: z.number().int().min(5).max(200).default(DEFAULT_PAGE_SIZE),
  filtersOpen: z.boolean().default(false),
  expandedGroups: z.array(z.string().max(160)).max(200).default([]),
  filters: filterStateSchema.default(EMPTY_FILTERS),
  /** Absent on anything saved before versioning, which is exactly what makes it read as 0. */
  prefsVersion: z.number().int().min(0).max(1000).default(0),
});
export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>;
// prefsVersion stays 0 here on purpose: the preferences route spreads these defaults under
// whatever is stored, so a current version in the default would mark every old layout as
// already migrated. A brand-new layout migrating is a no-op apart from the version stamp.
export const DEFAULT_DASHBOARD: DashboardPrefs = dashboardPrefsSchema.parse({});

/**
 * Brings a stored layout up to the current version. Returns the upgraded prefs plus the
 * patch to persist (null when nothing changed), so the caller saves only what moved.
 */
export function migrateDashboardPrefs(prefs: DashboardPrefs): {prefs: DashboardPrefs; patch: Partial<DashboardPrefs> | null} {
  if ((prefs.prefsVersion ?? 0) >= DASHBOARD_PREFS_VERSION) return {prefs, patch: null};
  const patch: Partial<DashboardPrefs> = {prefsVersion: DASHBOARD_PREFS_VERSION};
  const wanted = new Set<TicketColumn>([...prefs.columns, ...V2_DEFAULT_COLUMNS]);
  patch.columns = TICKET_COLUMNS.filter((c) => wanted.has(c));
  // 25 was the old stock value, not a choice anyone made — and the workspace default still
  // hands it out — so only that exact number is lifted; 10 or 100 were picked on purpose.
  if (prefs.pageSize === LEGACY_PAGE_SIZE) patch.pageSize = DEFAULT_PAGE_SIZE;
  return {prefs: {...prefs, ...patch}, patch};
}

/** A named view: the filters plus the layout they were designed for. */
export const savedViewSchema = z.object({
  name: z.string().min(1).max(60),
  filters: filterStateSchema.default(EMPTY_FILTERS),
  groupBy: z.enum(GROUP_BY).default('none'),
  columns: z.array(z.enum(TICKET_COLUMNS)).max(TICKET_COLUMNS.length).optional(),
  sortKey: z.enum(TICKET_COLUMNS).optional(),
  sortDir: z.enum(SORT_DIRECTIONS).optional(),
  view: z.string().max(20).default('list'),
});
export type SavedView = z.infer<typeof savedViewSchema>;

/**
 * Patch schemas for partial saves.
 *
 * `schema.partial()` is not enough: a field declared with `.default()` is still filled in
 * when it is absent, so parsing `{sortKey:'priority'}` against a partial of the full schema
 * returns every other field at its default. Saving that merged over the stored preferences
 * silently reset the grouping, page size and filters a moment after they were chosen.
 * These schemas have no defaults, so an absent key stays absent.
 */
export const filterPatchSchema = z.object({
  q: z.string().max(200).optional(),
  studio: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  subcategory: z.string().max(120).optional(),
  statuses: z.array(z.string().max(40)).max(20).optional(),
  priorities: z.array(z.string().max(20)).max(10).optional(),
  kinds: z.array(z.string().max(20)).max(10).optional(),
  sources: z.array(z.string().max(20)).max(12).optional(),
  owners: z.array(z.string().max(120)).max(50).optional(),
  departments: z.array(z.string().max(120)).max(30).optional(),
  slaStates: z.array(z.enum(['ok', 'due', 'breached', 'none'])).max(4).optional(),
  range: z.string().max(12).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
  state: z.enum(['any', 'open', 'closed']).optional(),
  ageBucket: z.enum(['any', 'today', 'week', 'stale', 'ancient']).optional(),
  tab: z.string().max(20).optional(),
});

export const dashboardPatchSchema = z.object({
  columns: z.array(z.enum(TICKET_COLUMNS)).max(TICKET_COLUMNS.length).optional(),
  groupBy: z.enum(GROUP_BY).optional(),
  kanbanGroupBy: z.enum(KANBAN_GROUP_BY).optional(),
  kanbanFields: z.array(z.enum(KANBAN_FIELDS)).min(1).max(KANBAN_FIELDS.length).optional(),
  sortKey: z.enum(TICKET_COLUMNS).optional(),
  sortDir: z.enum(SORT_DIRECTIONS).optional(),
  density: z.enum(['comfortable', 'compact']).optional(),
  pageSize: z.number().int().min(5).max(200).optional(),
  filtersOpen: z.boolean().optional(),
  expandedGroups: z.array(z.string().max(160)).max(200).optional(),
  filters: filterPatchSchema.optional(),
  prefsVersion: z.number().int().min(0).max(1000).optional(),
});

/* ── Row-level helpers shared by the table, the cards and the CSV export ─────────────── */

const CLOSED_STATES = ['resolved', 'closed', 'recorded'];
const ms = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

/** Which visual family a status belongs to. Open work should be loud; finished work quiet. */
export type StatusPhase = 'open' | 'resolved' | 'closed' | 'recorded';
export function statusPhase(status: string): StatusPhase {
  return status === 'resolved' || status === 'closed' || status === 'recorded' ? status : 'open';
}

/** The follow-up target as it stood before anyone asked for extra time. */
export function originalSlaDueAt(t: Pick<TicketListRecord, 'slaDueAt' | 'slaExtendedHours'>): string | null {
  if (!t.slaDueAt || !(t.slaExtendedHours > 0)) return null;
  return new Date(ms(t.slaDueAt) - t.slaExtendedHours * 3600000).toISOString();
}

/** A committed date that has slipped while the ticket is still open. */
export function commitmentMissed(t: Pick<TicketListRecord, 'committedResolutionAt' | 'status'>, nowMs: number): boolean {
  return Boolean(t.committedResolutionAt) && !CLOSED_STATES.includes(t.status) && nowMs > 0 && ms(t.committedResolutionAt) < nowMs;
}

/**
 * The automatic re-check tickets carry their schedule in the title as well as in the data
 * ("[Recurrence check 1 of 2 · day 5] …"). The board shows that as a badge, so the prefix is
 * stripped from the display title and the check index is read from it — the data only says
 * which day, not which of the checks this is.
 */
const RECHECK_PREFIX = /^\[Recurrence check (\d+) of (\d+) · day (\d+)\]\s*/i;
export interface RecurrenceInfo {check: boolean; index?: number; of?: number; day?: number; parent?: string; repeats: number; title: string}
export function recurrenceInfo(t: Pick<TicketListRecord, 'title' | 'recurrence'>): RecurrenceInfo {
  const r = t.recurrence || {};
  const m = RECHECK_PREFIX.exec(t.title || '');
  const check = Boolean(r.autoFollowUp) || Boolean(m);
  return {
    check,
    index: m ? Number(m[1]) : undefined,
    of: r.recheckOf ?? (m ? Number(m[2]) : undefined),
    day: r.recheckDay ?? (m ? Number(m[3]) : undefined),
    parent: r.parentTicketNumber || undefined,
    repeats: Number(r.recurrenceCount) || 0,
    title: check && m ? t.title.slice(m[0].length) || t.title : t.title,
  };
}

/** Plain-text cell values for the columns added in prefs v2, for CSV and tooltips. */
export function accountabilityColumnText(t: TicketListRecord, c: TicketColumn): string | undefined {
  switch (c) {
    case 'reporter': return t.createdByName || '';
    case 'coOwners': return (t.additionalOwners ?? []).map((o) => o.name).join(', ');
    case 'escalation': return t.isEscalated || t.escalatedToName ? `Escalated to ${t.escalatedToName || 'manager'}${t.escalatedAt ? ' · ' + t.escalatedAt : ''}` : '';
    case 'extension': return t.slaExtendedHours > 0 ? `+${t.slaExtendedHours}h${t.slaExtendedByName ? ' by ' + t.slaExtendedByName : ''}${t.slaExtensionReason ? ' — ' + t.slaExtensionReason : ''}` : '';
    case 'revisedSla': return t.slaExtendedHours > 0 && t.slaDueAt ? t.slaDueAt : '';
    case 'committedResolution': return t.committedResolutionAt || '';
    case 'closed': return t.closedAt || '';
    default: return undefined;
  }
}

/** Sort keys for the v2 columns. Empty values sink to the bottom in descending order. */
export function accountabilitySortValue(t: TicketListRecord, c: TicketColumn): number | string | undefined {
  const time = (v: string | null | undefined) => (v ? ms(v) : -1);
  switch (c) {
    case 'reporter': return (t.createdByName || '\uffff').toLowerCase();
    case 'coOwners': return (t.additionalOwners ?? []).length;
    case 'escalation': return t.isEscalated || t.escalatedToName ? (t.escalatedAt ? ms(t.escalatedAt) : 0) : -1;
    case 'extension': return t.slaExtendedHours || 0;
    case 'revisedSla': return t.slaExtendedHours > 0 ? time(t.slaDueAt) : -1;
    case 'committedResolution': return time(t.committedResolutionAt);
    case 'closed': return time(t.closedAt);
    default: return undefined;
  }
}
