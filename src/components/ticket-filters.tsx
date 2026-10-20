"use client";

import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlarmClock, Bookmark, CalendarClock, Check, CheckCircle2, ChevronDown, CircleDot, Clock3, Filter,
  Flame, Hourglass, RotateCcw, Save, SlidersHorizontal, UserCheck, UserX, X,
} from 'lucide-react';
import {Field, SearchField} from './ui';
import {applyFilters} from '@/lib/ticket-filtering';
import {
  COLUMN_META, GROUP_BY, GROUP_LABELS, TICKET_COLUMNS,
  type FilterState, type GroupBy, type TicketColumn, type SavedView,
} from '@/lib/dashboard-contract';
import {STATUS_LABELS} from '@/lib/constants';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The filter and grouping panel.
 *
 * Search and quick presets are always on screen; the full panel is collapsed by default
 * because a wall of controls in front of "show me what is open" is noise. Every active filter
 * stays visible as a removable token so a filtered board never looks like an empty
 * one — the commonest way to lose half an hour is not noticing a filter is still applied.
 */

const cap = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
const SOURCE_NAMES: Record<string, string> = {iris: 'IRIS', fillout: 'Form', history: 'Imported'};
const PRIORITIES = ['critical', 'high', 'medium', 'low'];
const KINDS = ['issue', 'request', 'compliment', 'feedback', 'assessment'];
const SOURCES = ['iris', 'manual', 'template', 'voice', 'fillout', 'history', 'system'];
const SLA_STATES: {id: FilterState['slaStates'][number]; label: string}[] = [
  {id: 'breached', label: 'Overdue'},
  {id: 'due', label: 'Due soon'},
  {id: 'ok', label: 'On track'},
  {id: 'none', label: 'No target'},
];
const AGE_BUCKETS: {id: FilterState['ageBucket']; label: string}[] = [
  {id: 'any', label: 'Any age'},
  {id: 'today', label: 'Logged today'},
  {id: 'week', label: 'This week'},
  {id: 'stale', label: 'Older than 3 days'},
  {id: 'ancient', label: 'Older than 30 days'},
];

/** A compact dropdown multi-select: a trigger that reads like a select, a checkbox list inside. */
function MultiSelect({label, options, value, onChange, allLabel}: {
  label: string;
  options: {id: string; label: string}[];
  value: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const shown = query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const summary = !value.length ? allLabel
    : value.length === 1 ? options.find((o) => o.id === value[0])?.label ?? value[0]
    : `${value.length} selected`;
  return (
    <div className="field tfx-ms" ref={ref}>
      <label>{label}</label>
      <button
        type="button"
        className={'tfx-control tfx-ms-trigger' + (value.length ? ' has-value' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tfx-ms-value">{summary}</span>
        <ChevronDown size={13} className="tfx-ms-caret"/>
      </button>
      {open && (
        <div className="tfx-ms-pop" role="listbox" aria-multiselectable="true" aria-label={label}>
          {options.length > 8 && (
            <input className="tfx-ms-search" autoFocus placeholder={`Search ${label.toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)}/>
          )}
          <div className="tfx-ms-list">
            {shown.map((o) => {
              const on = value.includes(o.id);
              return (
                <button type="button" role="option" aria-selected={on} key={o.id} className={'tfx-ms-opt' + (on ? ' on' : '')} onClick={() => toggle(o.id)}>
                  <span className="tfx-ms-box">{on && <Check size={11}/>}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
            {!shown.length && <span className="tfx-ms-empty">No matches</span>}
          </div>
          <div className="tfx-ms-foot">
            <button type="button" onClick={() => onChange([])} disabled={!value.length}>Clear</button>
            <button type="button" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** How many non-default choices are active — the number on the collapsed header. */
export function activeFilterCount(f: FilterState): number {
  let n = 0;
  if (f.q.trim()) n++;
  if (f.studio) n++;
  if (f.category) n++;
  if (f.subcategory) n++;
  n += f.statuses.length ? 1 : 0;
  n += f.priorities.length ? 1 : 0;
  n += f.kinds.length ? 1 : 0;
  n += f.sources.length ? 1 : 0;
  n += f.owners.length ? 1 : 0;
  n += f.departments.length ? 1 : 0;
  n += f.slaStates.length ? 1 : 0;
  if (f.state !== 'any') n++;
  if (f.ageBucket !== 'any') n++;
  if (f.range !== 'all') n++;
  if (f.from || f.to) n++;
  return n;
}

export interface TicketFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: FilterState;
  onChange: (patch: Partial<FilterState>) => void;
  onReset: () => void;
  tickets: TicketListRecord[];
  matched: number;
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  columns: TicketColumn[];
  onColumns: (c: TicketColumn[]) => void;
  density: 'comfortable' | 'compact';
  onDensity: (d: 'comfortable' | 'compact') => void;
  pageSize: number;
  onPageSize: (n: number) => void;
  views: SavedView[];
  onApplyView: (v: SavedView) => void;
  onSaveView: () => void;
  onDeleteView: (name: string) => void;
  taxonomy: Record<string, string[]>;
  studios: string[];
  /** The signed-in staff member's name as it appears on tickets; omit to hide "Assigned to me". */
  myName?: string;
}

/**
 * One-click presets. Each one is a patch onto the same filter state the panel edits, so a
 * preset and the matching manual choice are indistinguishable — and they compose.
 */
interface QuickFilter {
  id: string;
  label: string;
  icon: typeof Filter;
  tone?: string;
  patch: Partial<FilterState>;
  off: Partial<FilterState>;
  active: (f: FilterState) => boolean;
}

function quickFilters(myName?: string): QuickFilter[] {
  const list: QuickFilter[] = [
    {id: 'open', label: 'Open', icon: CircleDot, patch: {state: 'open'}, off: {state: 'any'}, active: (f) => f.state === 'open'},
  ];
  if (myName) list.push({
    id: 'mine', label: 'Assigned to me', icon: UserCheck, patch: {owners: [myName]}, off: {owners: []},
    active: (f) => f.owners.length === 1 && f.owners[0] === myName,
  });
  list.push(
    {id: 'unassigned', label: 'Unassigned', icon: UserX, patch: {owners: ['']}, off: {owners: []},
      active: (f) => f.owners.length === 1 && f.owners[0] === ''},
    {id: 'urgent', label: 'High priority', icon: Flame, tone: 'red', patch: {priorities: ['critical', 'high']}, off: {priorities: []},
      active: (f) => f.priorities.length === 2 && f.priorities.includes('critical') && f.priorities.includes('high')},
    {id: 'overdue', label: 'Overdue', icon: AlarmClock, tone: 'red', patch: {slaStates: ['breached']}, off: {slaStates: []},
      active: (f) => f.slaStates.length === 1 && f.slaStates[0] === 'breached'},
    {id: 'due', label: 'Due soon', icon: Hourglass, tone: 'amber', patch: {slaStates: ['due']}, off: {slaStates: []},
      active: (f) => f.slaStates.length === 1 && f.slaStates[0] === 'due'},
    {id: 'today', label: 'Logged today', icon: CalendarClock, patch: {ageBucket: 'today'}, off: {ageBucket: 'any'},
      active: (f) => f.ageBucket === 'today'},
    {id: 'stale', label: 'Ageing', icon: Clock3, tone: 'amber', patch: {ageBucket: 'stale', state: 'open'}, off: {ageBucket: 'any'},
      active: (f) => f.ageBucket === 'stale'},
    {id: 'closed', label: 'Closed', icon: CheckCircle2, tone: 'green', patch: {state: 'closed'}, off: {state: 'any'},
      active: (f) => f.state === 'closed'},
  );
  return list;
}

/** Removable tokens for every active filter, so each one can be dropped on its own. */
function activeTokens(f: FilterState): {key: string; label: string; clear: Partial<FilterState>}[] {
  const t: {key: string; label: string; clear: Partial<FilterState>}[] = [];
  if (f.q.trim()) t.push({key: 'q', label: `“${f.q.trim()}”`, clear: {q: ''}});
  if (f.state !== 'any') t.push({key: 'state', label: f.state === 'open' ? 'Open only' : 'Closed only', clear: {state: 'any'}});
  if (f.studio) t.push({key: 'studio', label: f.studio.split(',')[0], clear: {studio: ''}});
  if (f.category) t.push({key: 'category', label: f.category, clear: {category: '', subcategory: ''}});
  if (f.subcategory) t.push({key: 'subcategory', label: f.subcategory, clear: {subcategory: ''}});
  if (f.statuses.length) t.push({key: 'statuses', label: 'Status: ' + f.statuses.map((s) => String(STATUS_LABELS[s as keyof typeof STATUS_LABELS] || s)).join(', '), clear: {statuses: []}});
  if (f.priorities.length) t.push({key: 'priorities', label: 'Priority: ' + f.priorities.map(cap).join(', '), clear: {priorities: []}});
  if (f.kinds.length) t.push({key: 'kinds', label: 'Type: ' + f.kinds.map(cap).join(', '), clear: {kinds: []}});
  if (f.slaStates.length) t.push({key: 'sla', label: 'Follow-up: ' + f.slaStates.map((s) => SLA_STATES.find((x) => x.id === s)?.label || s).join(', '), clear: {slaStates: []}});
  if (f.sources.length) t.push({key: 'sources', label: 'Via: ' + f.sources.join(', '), clear: {sources: []}});
  if (f.owners.length) t.push({key: 'owners', label: 'Owner: ' + f.owners.map((o) => o || 'Unassigned').join(', '), clear: {owners: []}});
  if (f.departments.length) t.push({key: 'departments', label: 'Dept: ' + f.departments.join(', '), clear: {departments: []}});
  if (f.ageBucket !== 'any') t.push({key: 'age', label: AGE_BUCKETS.find((a) => a.id === f.ageBucket)?.label || '', clear: {ageBucket: 'any'}});
  if (f.from || f.to) t.push({key: 'dates', label: `${f.from || 'Start'} → ${f.to || 'Now'}`, clear: {from: '', to: '', range: 'all'}});
  else if (f.range !== 'all' && f.range !== 'custom') t.push({key: 'range', label: `Last ${f.range} day${f.range === '1' ? '' : 's'}`, clear: {range: 'all'}});
  return t;
}

export function TicketFilters(props: TicketFiltersProps) {
  const {
    open, onOpenChange, filters: f, onChange, onReset, tickets, matched, groupBy, onGroupBy,
    columns, onColumns, density, onDensity, pageSize, onPageSize, views, onApplyView,
    onSaveView, onDeleteView, taxonomy, studios, myName,
  } = props;

  // The pickers offer what is actually in the data, not every value that could exist.
  const owners = useMemo(
    () => [...new Set(tickets.map((t) => t.assignedStaffName).filter(Boolean) as string[])].sort(),
    [tickets],
  );
  const departments = useMemo(
    () => [...new Set(tickets.map((t) => t.departmentName).filter(Boolean) as string[])].sort(),
    [tickets],
  );
  const subcategories = useMemo(
    () => (f.category ? taxonomy[f.category] || [] : []),
    [taxonomy, f.category],
  );

  const quick = useMemo(() => quickFilters(myName), [myName]);
  // What each preset would leave on screen if switched on now, on top of everything else.
  const quickCounts = useMemo(
    () => Object.fromEntries(quick.map((q) => [q.id, applyFilters(tickets, {...f, ...q.patch}).length])),
    [quick, tickets, f],
  );

  const count = activeFilterCount(f);
  const tokens = activeTokens(f);

  return (
    <section className={'tfx' + (open ? ' tfx-open' : '')}>
      <div className="tfx-bar">
        <div className="tfx-search">
          <SearchField value={f.q} onChange={(q) => onChange({q})} placeholder="Search tickets, members, numbers…"/>
        </div>
        <div className="tfx-bar-right">
          <span className="tfx-matched"><strong>{matched}</strong> of {tickets.length}</span>
          <button
            className={'tfx-toggle' + (open ? ' on' : '')}
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
          >
            <SlidersHorizontal size={13}/>
            <span>Filters</span>
            {count > 0 && <span className="tfx-count">{count}</span>}
            <ChevronDown size={13} className="tfx-caret"/>
          </button>
        </div>
      </div>

      <div className="tfx-quick" role="group" aria-label="Quick filters">
        {quick.map((q) => {
          const on = q.active(f);
          const Icon = q.icon;
          return (
            <button
              key={q.id}
              type="button"
              className={'tfx-pill' + (on ? ' on' : '')}
              data-tone={q.tone || ''}
              aria-pressed={on}
              onClick={() => onChange(on ? q.off : q.patch)}
            >
              <Icon size={12}/>
              {q.label}
              <span className="tfx-pill-n">{quickCounts[q.id]}</span>
            </button>
          );
        })}
      </div>

      {(tokens.length > 0 || groupBy !== 'none') && (
        <div className="tfx-tokens">
          {tokens.map((t) => (
            <span className="tfx-token" key={t.key}>
              {t.label}
              <button aria-label={`Remove ${t.label}`} onClick={() => onChange(t.clear)}><X size={10}/></button>
            </span>
          ))}
          {groupBy !== 'none' && (
            <span className="tfx-token tfx-token-group">
              Grouped by {GROUP_LABELS[groupBy].toLowerCase()}
              <button aria-label="Remove grouping" onClick={() => onGroupBy('none')}><X size={10}/></button>
            </span>
          )}
          {count > 0 && (
            <button className="tfx-clear" onClick={onReset}><RotateCcw size={11}/>Clear all</button>
          )}
        </div>
      )}

      {open && (
        <div className="tfx-panel">
          <div className="tfx-section">
            <div className="tfx-fields">
              <Field label="State">
                <select className="tfx-control" value={f.state} onChange={(e) => onChange({state: e.target.value as FilterState['state']})}>
                  <option value="any">Open &amp; closed</option>
                  <option value="open">Open only</option>
                  <option value="closed">Closed only</option>
                </select>
              </Field>
              <Field label="Studio">
                <select className="tfx-control" value={f.studio} onChange={(e) => onChange({studio: e.target.value})}>
                  <option value="">All studios</option>
                  {studios.map((s) => <option key={s} value={s}>{s.split(',')[0]}</option>)}
                </select>
              </Field>
              <Field label="Category">
                <select className="tfx-control" value={f.category} onChange={(e) => onChange({category: e.target.value, subcategory: ''})}>
                  <option value="">All categories</option>
                  {Object.keys(taxonomy).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <select className="tfx-control" value={f.subcategory} disabled={!f.category} onChange={(e) => onChange({subcategory: e.target.value})}>
                  <option value="">{f.category ? 'All subcategories' : 'Pick a category first'}</option>
                  {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <MultiSelect label="Status" allLabel="Any status" value={f.statuses} onChange={(statuses) => onChange({statuses})}
                options={Object.entries(STATUS_LABELS).map(([id, label]) => ({id, label: String(label)}))}/>
              <MultiSelect label="Priority" allLabel="Any priority" value={f.priorities} onChange={(priorities) => onChange({priorities})}
                options={PRIORITIES.map((p) => ({id: p, label: cap(p)}))}/>
              <MultiSelect label="Type" allLabel="Any type" value={f.kinds} onChange={(kinds) => onChange({kinds})}
                options={KINDS.map((k) => ({id: k, label: cap(k)}))}/>
              <MultiSelect label="Follow-up" allLabel="Any follow-up" value={f.slaStates} onChange={(v) => onChange({slaStates: v as FilterState['slaStates']})}
                options={SLA_STATES.map((s) => ({id: s.id, label: s.label}))}/>
              <MultiSelect label="Owner" allLabel="Anyone" value={f.owners} onChange={(o) => onChange({owners: o})}
                options={[{id: '', label: 'Unassigned'}, ...owners.map((o) => ({id: o, label: o}))]}/>
              {departments.length > 0 && (
                <MultiSelect label="Department" allLabel="All departments" value={f.departments} onChange={(d) => onChange({departments: d})}
                  options={departments.map((d) => ({id: d, label: d}))}/>
              )}
              <MultiSelect label="Logged via" allLabel="Any source" value={f.sources} onChange={(sources) => onChange({sources})}
                options={SOURCES.map((s) => ({id: s, label: SOURCE_NAMES[s] || cap(s)}))}/>
              <Field label="Logged within">
                <select className="tfx-control" value={f.from || f.to ? 'custom' : f.range} onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom') onChange({range: 'custom'});
                  else onChange({range: v, from: '', to: ''});
                }}>
                  <option value="all">All time</option>
                  <option value="1">Last 24 hours</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                  <option value="custom">Custom range…</option>
                </select>
              </Field>
              {(f.range === 'custom' || f.from || f.to) && (
                <>
                  <Field label="From"><input className="tfx-control" type="date" value={f.from} onChange={(e) => onChange({from: e.target.value, range: 'custom'})}/></Field>
                  <Field label="To"><input className="tfx-control" type="date" value={f.to} onChange={(e) => onChange({to: e.target.value, range: 'custom'})}/></Field>
                </>
              )}
              <Field label="Age">
                <select className="tfx-control" value={f.ageBucket} onChange={(e) => onChange({ageBucket: e.target.value as FilterState['ageBucket']})}>
                  {AGE_BUCKETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="tfx-section tfx-section-display">
            <h4 className="tfx-section-title">Display</h4>
            <div className="tfx-display">
              <Field label="Group rows by">
                <select className="tfx-control" value={groupBy} onChange={(e) => onGroupBy(e.target.value as GroupBy)}>
                  {GROUP_BY.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
                </select>
              </Field>
              <Field label="Rows per page">
                <select className="tfx-control" value={String(pageSize)} onChange={(e) => onPageSize(Number(e.target.value))}>
                  {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Density">
                <select className="tfx-control" value={density} onChange={(e) => onDensity(e.target.value as 'comfortable' | 'compact')}>
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </Field>
              <MultiSelect label="Columns" allLabel="None" value={columns}
                onChange={(next) => onColumns(TICKET_COLUMNS.filter((c) => COLUMN_META[c].always || next.includes(c)))}
                options={TICKET_COLUMNS.filter((c) => !COLUMN_META[c].always).map((c) => ({id: c, label: COLUMN_META[c].label}))}/>
            </div>
          </div>

          <footer className="tfx-foot">
            <div className="tfx-views">
              <span className="tfx-section-title"><Bookmark size={11}/>Saved views</span>
              {views.length === 0 && <span className="tfx-muted">None yet</span>}
              {views.map((v) => (
                <span className="tfx-view" key={v.name}>
                  <button onClick={() => onApplyView(v)}>{v.name}</button>
                  <button className="tfx-view-x" aria-label={`Delete ${v.name}`} onClick={() => onDeleteView(v.name)}><X size={10}/></button>
                </span>
              ))}
            </div>
            <div className="tfx-foot-actions">
              {count > 0 && <button className="btn btn-sm" onClick={onReset}><RotateCcw size={12}/>Reset</button>}
              <button className="btn btn-sm btn-primary" onClick={onSaveView}><Save size={12}/>Save view</button>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
}
