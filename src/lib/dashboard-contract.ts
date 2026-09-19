import {z} from 'zod';

/**
 * Everything the ticket workspace remembers about how you like to look at it.
 *
 * All of it is stored server-side against your workspace identity (or this browser, if you
 * are not signed in) rather than in localStorage, so the view you set up on the studio iPad
 * is the view you get on your laptop. localStorage is used only as a first-paint cache for
 * the theme, where a round-trip would cause a visible flash.
 */

export const TICKET_COLUMNS = [
  'label', 'ticketNumber', 'member', 'kind', 'category', 'subcategory', 'studio',
  'status', 'priority', 'owner', 'department', 'source', 'created', 'updated',
  'age', 'slaDue', 'sla', 'resolved', 'timeToResolve',
] as const;
export type TicketColumn = (typeof TICKET_COLUMNS)[number];

/** What each column is called, and how it behaves. Single source for header, picker and CSV. */
export const COLUMN_META: Record<TicketColumn, {label: string; align?: 'right' | 'center'; numeric?: boolean; always?: boolean}> = {
  label: {label: 'Ticket', always: true},
  ticketNumber: {label: 'Number'},
  member: {label: 'Logged for'},
  kind: {label: 'Type'},
  category: {label: 'Category'},
  subcategory: {label: 'Subcategory'},
  studio: {label: 'Studio'},
  status: {label: 'Status'},
  priority: {label: 'Priority'},
  owner: {label: 'Owner'},
  department: {label: 'Department'},
  source: {label: 'Source'},
  created: {label: 'Logged', numeric: true},
  updated: {label: 'Updated', numeric: true},
  age: {label: 'Age', align: 'right', numeric: true},
  slaDue: {label: 'Due', numeric: true},
  sla: {label: 'SLA', align: 'right'},
  resolved: {label: 'Resolved', numeric: true},
  timeToResolve: {label: 'Time to resolve', align: 'right', numeric: true},
};

export const DEFAULT_COLUMNS: TicketColumn[] = ['label', 'kind', 'category', 'status', 'priority', 'owner', 'created', 'sla'];

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
  pageSize: z.number().int().min(5).max(200).default(25),
  filtersOpen: z.boolean().default(false),
  expandedGroups: z.array(z.string().max(160)).max(200).default([]),
  filters: filterStateSchema.default(EMPTY_FILTERS),
});
export type DashboardPrefs = z.infer<typeof dashboardPrefsSchema>;
export const DEFAULT_DASHBOARD: DashboardPrefs = dashboardPrefsSchema.parse({});

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
});
