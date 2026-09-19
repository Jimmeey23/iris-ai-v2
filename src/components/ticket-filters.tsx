"use client";

import {useMemo, useState} from 'react';
import {
  ChevronDown, ChevronRight, Columns3, Filter, LayoutList, RotateCcw, Rows3, Save, X,
} from 'lucide-react';
import {Badge, Field, SearchField} from './ui';
import {
  COLUMN_META, GROUP_BY, GROUP_LABELS, TICKET_COLUMNS,
  type FilterState, type GroupBy, type TicketColumn, type SavedView,
} from '@/lib/dashboard-contract';
import {STATUS_LABELS} from '@/lib/constants';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The filter and grouping panel.
 *
 * Collapsed by default: most visits are "show me what is open", and a wall of controls in
 * front of that is noise. When it is opened it offers every cut the data supports, and the
 * summary line stays visible while collapsed so a filtered board never looks like an empty
 * one — the commonest way to lose half an hour is not noticing a filter is still applied.
 */

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

/** A multi-select rendered as toggle chips — faster to read and to change than a listbox. */
function ChipSelect({label, options, value, onChange}: {
  label: string;
  options: {id: string; label: string}[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="tf-chipset">
      <span className="tf-chipset-label">{label}</span>
      <div className="tf-chips">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={'tf-chip' + (value.includes(o.id) ? ' tf-chip-on' : '')}
            aria-pressed={value.includes(o.id)}
            onClick={() => toggle(o.id)}
          >
            {o.label}
          </button>
        ))}
        {value.length > 0 && (
          <button type="button" className="tf-chip tf-chip-clear" onClick={() => onChange([])} aria-label={`Clear ${label}`}>
            <X size={10}/>
          </button>
        )}
      </div>
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

/** A short sentence describing the active filters, shown whether or not the panel is open. */
export function filterSummary(f: FilterState): string {
  const parts: string[] = [];
  if (f.state !== 'any') parts.push(f.state === 'open' ? 'open only' : 'closed only');
  if (f.q.trim()) parts.push(`matching “${f.q.trim()}”`);
  if (f.studio) parts.push(f.studio.split(',')[0]);
  if (f.category) parts.push(f.category);
  if (f.subcategory) parts.push(f.subcategory);
  if (f.statuses.length) parts.push(`${f.statuses.length} status${f.statuses.length === 1 ? '' : 'es'}`);
  if (f.priorities.length) parts.push(f.priorities.join('/') + ' priority');
  if (f.kinds.length) parts.push(f.kinds.join('/'));
  if (f.sources.length) parts.push('via ' + f.sources.join('/'));
  if (f.owners.length) parts.push(`${f.owners.length} owner${f.owners.length === 1 ? '' : 's'}`);
  if (f.departments.length) parts.push(`${f.departments.length} department${f.departments.length === 1 ? '' : 's'}`);
  if (f.slaStates.length) parts.push(f.slaStates.join('/'));
  if (f.ageBucket !== 'any') parts.push(AGE_BUCKETS.find((a) => a.id === f.ageBucket)?.label.toLowerCase() || '');
  if (f.from || f.to) parts.push(`${f.from || 'start'} → ${f.to || 'now'}`);
  else if (f.range !== 'all') parts.push(`last ${f.range} days`);
  return parts.filter(Boolean).join(' · ');
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
}

export function TicketFilters(props: TicketFiltersProps) {
  const {
    open, onOpenChange, filters: f, onChange, onReset, tickets, matched, groupBy, onGroupBy,
    columns, onColumns, density, onDensity, pageSize, onPageSize, views, onApplyView,
    onSaveView, onDeleteView, taxonomy, studios,
  } = props;
  const [showColumns, setShowColumns] = useState(false);

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

  const count = activeFilterCount(f);
  const summary = filterSummary(f);

  const toggleColumn = (c: TicketColumn) => {
    if (COLUMN_META[c].always) return;
    onColumns(columns.includes(c) ? columns.filter((x) => x !== c) : [...TICKET_COLUMNS].filter((x) => columns.includes(x) || x === c));
  };

  return (
    <section className={'ticket-filters' + (open ? ' tf-open' : '')}>
      <header className="tf-head">
        <button className="tf-toggle" onClick={() => onOpenChange(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
          <Filter size={13}/>
          <span>Filters &amp; grouping</span>
          {count > 0 && <Badge tone="blue">{count}</Badge>}
          {groupBy !== 'none' && <Badge tone="purple">by {GROUP_LABELS[groupBy].toLowerCase()}</Badge>}
        </button>
        <div className="tf-head-right">
          {count > 0 && <span className="tf-summary" title={summary}>{summary}</span>}
          <span className="tf-matched">{matched} of {tickets.length}</span>
          {count > 0 && (
            <button className="text-btn" onClick={onReset}><RotateCcw size={11}/>Reset</button>
          )}
        </div>
      </header>

      {open && (
        <div className="tf-body">
          <div className="tf-row tf-row-primary">
            <SearchField value={f.q} onChange={(q) => onChange({q})} placeholder="Search label, member, number…"/>
            <select className="filter-select" aria-label="Open or closed" value={f.state} onChange={(e) => onChange({state: e.target.value as FilterState['state']})}>
              <option value="any">Open &amp; closed</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </select>
            <select className="filter-select" aria-label="Studio" value={f.studio} onChange={(e) => onChange({studio: e.target.value})}>
              <option value="">All studios</option>
              {studios.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="filter-select" aria-label="Category" value={f.category} onChange={(e) => onChange({category: e.target.value, subcategory: ''})}>
              <option value="">All categories</option>
              {Object.keys(taxonomy).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="filter-select" aria-label="Subcategory" value={f.subcategory} disabled={!f.category} onChange={(e) => onChange({subcategory: e.target.value})}>
              <option value="">{f.category ? 'All subcategories' : 'Pick a category first'}</option>
              {subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="tf-grid">
            <ChipSelect label="Status" value={f.statuses} onChange={(statuses) => onChange({statuses})}
              options={Object.entries(STATUS_LABELS).map(([id, label]) => ({id, label: String(label)}))}/>
            <ChipSelect label="Priority" value={f.priorities} onChange={(priorities) => onChange({priorities})}
              options={PRIORITIES.map((p) => ({id: p, label: p}))}/>
            <ChipSelect label="Type" value={f.kinds} onChange={(kinds) => onChange({kinds})}
              options={KINDS.map((k) => ({id: k, label: k}))}/>
            <ChipSelect label="Follow-up" value={f.slaStates} onChange={(v) => onChange({slaStates: v as FilterState['slaStates']})}
              options={SLA_STATES.map((s) => ({id: s.id, label: s.label}))}/>
            <ChipSelect label="Logged via" value={f.sources} onChange={(sources) => onChange({sources})}
              options={SOURCES.map((s) => ({id: s, label: s}))}/>
            {owners.length > 1 && (
              <ChipSelect label="Owner" value={f.owners} onChange={(o) => onChange({owners: o})}
                options={owners.slice(0, 24).map((o) => ({id: o, label: o.split(' ')[0]}))}/>
            )}
            {departments.length > 1 && (
              <ChipSelect label="Department" value={f.departments} onChange={(d) => onChange({departments: d})}
                options={departments.map((d) => ({id: d, label: d}))}/>
            )}
          </div>

          <div className="tf-row">
            <Field label="Logged within">
              <select value={f.from || f.to ? 'custom' : f.range} onChange={(e) => {
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
                <Field label="From"><input type="date" value={f.from} onChange={(e) => onChange({from: e.target.value, range: 'custom'})}/></Field>
                <Field label="To"><input type="date" value={f.to} onChange={(e) => onChange({to: e.target.value, range: 'custom'})}/></Field>
              </>
            )}
            <Field label="Age">
              <select value={f.ageBucket} onChange={(e) => onChange({ageBucket: e.target.value as FilterState['ageBucket']})}>
                {AGE_BUCKETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </Field>
          </div>

          <div className="tf-row tf-row-layout">
            <Field label="Group rows by">
              <select value={groupBy} onChange={(e) => onGroupBy(e.target.value as GroupBy)}>
                {GROUP_BY.map((g) => <option key={g} value={g}>{GROUP_LABELS[g]}</option>)}
              </select>
            </Field>
            <Field label="Rows per page">
              <select value={String(pageSize)} onChange={(e) => onPageSize(Number(e.target.value))}>
                {[10, 25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <div className="tf-layout-buttons">
              <button className={'btn btn-sm' + (density === 'comfortable' ? ' btn-soft' : '')} onClick={() => onDensity('comfortable')} title="Comfortable rows">
                <Rows3 size={12}/>Comfortable
              </button>
              <button className={'btn btn-sm' + (density === 'compact' ? ' btn-soft' : '')} onClick={() => onDensity('compact')} title="Compact rows">
                <LayoutList size={12}/>Compact
              </button>
              <button className="btn btn-sm" onClick={() => setShowColumns((v) => !v)} aria-expanded={showColumns}>
                <Columns3 size={12}/>Columns ({columns.length})
              </button>
              <button className="btn btn-sm" onClick={onSaveView}><Save size={12}/>Save view</button>
            </div>
          </div>

          {showColumns && (
            <div className="tf-columns">
              {TICKET_COLUMNS.map((c) => {
                const meta = COLUMN_META[c];
                const on = columns.includes(c);
                return (
                  <label key={c} className={'tf-column' + (on ? ' tf-column-on' : '') + (meta.always ? ' tf-column-locked' : '')}>
                    <input type="checkbox" checked={on} disabled={meta.always} onChange={() => toggleColumn(c)}/>
                    <span>{meta.label}</span>
                  </label>
                );
              })}
            </div>
          )}

          {views.length > 0 && (
            <div className="tf-views">
              <span className="eyebrow">SAVED VIEWS</span>
              {views.map((v) => (
                <span className="tf-view" key={v.name}>
                  <button className="btn btn-sm" onClick={() => onApplyView(v)}>{v.name}</button>
                  <button className="tf-view-x" aria-label={`Delete ${v.name}`} onClick={() => onDeleteView(v.name)}><X size={10}/></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
