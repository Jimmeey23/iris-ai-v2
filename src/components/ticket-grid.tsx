"use client";
import {entryTypeLabel} from "@/lib/display";

import {cloneElement, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement} from 'react';
import {ChevronDown, ChevronRight, ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert, ArrowUpFromLine, Hourglass, Columns3, Rows3, Rows4, Link2, UserPlus, ExternalLink, Check} from 'lucide-react';
import {Avatar, Badge, Priority} from './ui';
import {RecurrenceBadges, SlaCountdown, StatusPill} from './tickets-board';
import {relativeTime} from '@/lib/utils';
import {indiaDate} from '@/lib/display';
import {
  COLUMN_META, GROUP_LABELS, accountabilitySortValue, commitmentMissed, originalSlaDueAt,
  recurrenceInfo, statusPhase, type GroupBy, type TicketColumn,
} from '@/lib/dashboard-contract';
import {groupTickets, sortTickets} from '@/lib/ticket-grouping';
import {slaBucketOf} from '@/lib/ticket-filtering';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The ticket table.
 *
 * Two things it has to do that a plain list cannot. First, sort and show the columns each
 * desk actually works from — the front desk cares about the member and the studio, the
 * maintenance lead cares about age and the resolution target, and neither should have to
 * read past the other's columns. Second, group: twenty tickets across five studios is a
 * different question from twenty tickets in one, and that only becomes visible when the
 * rows fold up into their groups with the totals on the header.
 *
 * Groups are collapsible and their open/closed state is saved per person, so the board
 * opens the way you left it.
 */

const SOURCE_LABEL: Record<string, string> = {
  iris: 'IRIS', template: 'Template', manual: 'Manual', voice: 'Voice',
  fillout: 'Form', history: 'Imported', system: 'System',
};

const KIND_TONE: Record<string, string> = {
  issue: '', request: 'blue', compliment: 'green', feedback: 'purple', assessment: 'amber',
};

const OPEN_STATES = ['resolved', 'closed', 'recorded'];
export const isOpen = (t: TicketListRecord) => !OPEN_STATES.includes(t.status);

function durationLabel(ms: number): string {
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

type CellProps = {column: TicketColumn; ticket: TicketListRecord; staleDays: number; nowMs: number; onOpen?: () => void};

/** Tags every cell with its column so the stylesheet can drop the lower-value columns on narrow screens
 *  (CellBody holds no hooks and always returns a <td>, which makes the clone safe). */
function Cell(props: CellProps) {
  return cloneElement(CellBody(props) as ReactElement<Record<string, unknown>>, {'data-col': props.column,'data-label':COLUMN_META[props.column].label});
}

function CellBody({column, ticket, staleDays, nowMs, onOpen}: CellProps) {
  const t = ticket;
  const stale = nowMs > 0 && nowMs - new Date(t.createdAt).getTime() > staleDays * 86400000 && isOpen(t);
  switch (column) {
    case 'label':
      return (
        <td className="tg-label-cell">
          {/* One line, so every row is the same height: the number, the title, then any
              recurrence badge. Studio and member have their own columns. */}
          <div className="tgx-label-line">
            <span className="ticket-id mono">{t.ticketNumber}</span>
            <button type="button" tabIndex={-1} className="tg-open-ticket ticket-name" onClick={(e) => { e.stopPropagation(); onOpen?.(); }} title={[t.title, t.memberName, t.studio?.split(',')[0]].filter(Boolean).join(' · ')}>{recurrenceInfo(t).title}</button>
            <RecurrenceBadges ticket={t}/>
          </div>
        </td>
      );
    case 'ticketNumber': return <td><span className="ticket-id mono">{t.ticketNumber}</span></td>;
    case 'member': return <td>{t.memberName || <span className="muted">—</span>}</td>;
    case 'kind': return <td><span className="chip chip-kind" data-tone={KIND_TONE[t.kind] || ''}>{entryTypeLabel(t)}</span></td>;
    case 'category': return <td><span className="tgx-category" title={t.category}>{t.category || <span className="muted">—</span>}</span></td>;
    case 'subcategory': return <td><span className="category-sub">{t.subcategory || '—'}</span></td>;
    case 'studio': return <td>{t.studio ? t.studio.split(',')[0] : <span className="muted">—</span>}</td>;
    case 'status':
      return <td title={t.resolutionRequired ? undefined : 'Record only — no resolution needed'}><StatusPill status={t.status}/></td>;
    case 'priority': return <td><Priority priority={t.priority}/></td>;
    case 'owner': {
      // An unassigned ticket is styled as absent rather than as a person whose initials
      // happen to be "UN".
      const unassigned = !t.assignedStaffName;
      const co = t.additionalOwners ?? [];
      const title = (t.assignedStaffName || 'Not yet assigned') + (t.departmentName ? ` · ${t.departmentName}` : '') + (co.length ? ' (lead) · with ' + co.map((o) => o.name).join(', ') : '');
      return (
        <td>
          <div className={'mini-owner' + (unassigned ? ' mini-owner-empty' : '')} title={title}>
            <Avatar name={unassigned ? 'Unassigned owner' : t.assignedStaffName} tone="purple" emptyDark={unassigned} owner={!unassigned}/>
            <span>
              <strong>
                {unassigned ? 'Unassigned' : t.assignedStaffName}
                {co.length > 0 && <em className="tg-co-count" aria-label={`plus ${co.length} co-owner${co.length === 1 ? '' : 's'}`}>+{co.length}</em>}
              </strong>
            </span>
          </div>
        </td>
      );
    }
    case 'coOwners': {
      const co = t.additionalOwners ?? [];
      if (!co.length) return <td><span className="muted">—</span></td>;
      return (
        <td>
          <span className="tg-co-owners" title={co.map((o) => o.name + (o.departmentName ? ` (${o.departmentName})` : '')).join('\n')}>
            {co.slice(0, 2).map((o) => o.name.split(' ')[0]).join(', ')}
            {co.length > 2 && <em className="tg-co-count">+{co.length - 2}</em>}
          </span>
        </td>
      );
    }
    case 'reporter': return <td>{t.createdByName || <span className="muted">—</span>}</td>;
    case 'escalation': {
      if (!t.isEscalated && !t.escalatedToName) return <td><span className="muted">—</span></td>;
      return (
        <td>
          <span className="tg-flag tg-flag-escalated" title={t.escalatedAt ? indiaDate(t.escalatedAt) : 'Escalated'}>
            <ArrowUpFromLine size={10} aria-hidden="true"/>
            Escalated to {t.escalatedToName || 'manager'}{t.escalatedAt ? ' · ' + indiaDate(t.escalatedAt, true) : ''}
          </span>
        </td>
      );
    }
    case 'extension': {
      if (!(t.slaExtendedHours > 0)) return <td><span className="muted">—</span></td>;
      const tip = [t.slaExtensionReason ? 'Reason: ' + t.slaExtensionReason : 'No reason recorded', t.slaExtendedAt ? 'Requested ' + indiaDate(t.slaExtendedAt) : ''].filter(Boolean).join('\n');
      return (
        <td>
          <span className="tg-flag tg-flag-extension" title={tip}>
            <Hourglass size={10} aria-hidden="true"/>
            +{t.slaExtendedHours}h{t.slaExtendedByName ? ' by ' + t.slaExtendedByName.split(' ')[0] : ''}
          </span>
        </td>
      );
    }
    case 'revisedSla': {
      const original = originalSlaDueAt(t);
      if (!original || !t.slaDueAt) return <td><span className="muted">—</span></td>;
      return <td><span className="tg-revised" title={`Original target ${indiaDate(original)} · moved +${t.slaExtendedHours}h to ${indiaDate(t.slaDueAt)}`}>{indiaDate(t.slaDueAt, true)}</span></td>;
    }
    case 'committedResolution': {
      if (!t.committedResolutionAt) return <td><span className="muted">—</span></td>;
      const missed = commitmentMissed(t, nowMs);
      return (
        <td>
          <span className={missed ? 'tg-commit-missed' : ''} title={(missed ? 'Commitment passed — ' : 'Owner committed to resolve by ') + indiaDate(t.committedResolutionAt)}>
            {missed && <TriangleAlert size={10} role="img" aria-label="Commitment missed"/>}
            {indiaDate(t.committedResolutionAt, true)}
          </span>
        </td>
      );
    }
    case 'department': return <td>{t.departmentName || <span className="muted">—</span>}</td>;
    case 'source': return <td><span className="chip chip-quiet">{SOURCE_LABEL[t.source] || t.source}</span></td>;
    case 'created': return <td><time dateTime={t.createdAt} title={indiaDate(t.createdAt)}>{relativeTime(t.createdAt)}</time></td>;
    case 'updated': return <td><span title={t.updatedAt ? indiaDate(t.updatedAt) : undefined}>{t.updatedAt ? relativeTime(t.updatedAt) : '—'}</span></td>;
    case 'age': return <td className="tg-right"><span title={indiaDate(t.createdAt)} className={stale ? 'ticket-stale' : ''}>{relativeTime(t.createdAt)}</span></td>;
    case 'slaDue': return <td>{t.slaDueAt ? <span title={indiaDate(t.slaDueAt)}>{indiaDate(t.slaDueAt, true)}</span> : <span className="muted">—</span>}</td>;
    case 'sla': return <td className="tg-right"><SlaCountdown ticket={t}/></td>;
    case 'resolved': return <td>{t.resolvedAt ? indiaDate(t.resolvedAt, true) : <span className="muted">—</span>}</td>;
    case 'closed': return <td>{t.closedAt ? <span title={indiaDate(t.closedAt)}>{indiaDate(t.closedAt, true)}</span> : <span className="muted">—</span>}</td>;
    case 'timeToResolve':
      return (
        <td className="tg-right">
          {t.resolvedAt
            ? durationLabel(new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime())
            : <span className="muted">—</span>}
        </td>
      );
    default: return <td/>;
  }
}

/** The numbers on a group header. They are what makes a collapsed group still useful. */
function groupStats(rows: TicketListRecord[]) {
  const open = rows.filter(isOpen).length;
  const urgent = rows.filter((t) => isOpen(t) && ['critical', 'high'].includes(t.priority)).length;
  const overdue = rows.filter((t) => slaBucketOf(t) === 'breached').length;
  return {open, urgent, overdue, total: rows.length};
}

/** `sortTickets` predates the v2 columns and ranks them all as equal; those are sorted here
 *  with the same tie-break (newest first), everything else goes through the shared rules. */
function sortRows(rows: TicketListRecord[], key: TicketColumn, dir: 'asc' | 'desc') {
  if (!rows.length || accountabilitySortValue(rows[0], key) === undefined) return sortTickets(rows, key, dir);
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = accountabilitySortValue(a, key)!, bv = accountabilitySortValue(b, key)!;
    const primary = typeof av === 'number' && typeof bv === 'number' ? (av - bv) * factor : String(av).localeCompare(String(bv)) * factor;
    return primary || b.id - a.id;
  });
}

/** Every column a person can switch on, in the order the column menu lists them. */
const ALL_COLUMNS = Object.keys(COLUMN_META) as TicketColumn[];

export interface TicketGridProps {
  tickets: TicketListRecord[];
  columns: TicketColumn[];
  groupBy: GroupBy;
  sortKey: TicketColumn;
  sortDir: 'asc' | 'desc';
  density: 'comfortable' | 'compact';
  expandedGroups: string[];
  staleDays?: number;
  /** Skeleton rows instead of data while the list is first fetched. */
  loading?: boolean;
  onSort: (key: TicketColumn) => void;
  onToggleGroup: (name: string) => void;
  onSetGroups: (names: string[]) => void;
  onSelect: (id: number) => void;
  selected?: number[];
  onToggleSelect?: (id: number) => void;
  /** Select or clear every row on screen at once. */
  onSelectMany?: (ids: number[], on: boolean) => void;
  /** Column visibility and density, saved with the rest of the board preferences. */
  onColumns?: (columns: TicketColumn[]) => void;
  onDensity?: (density: 'comfortable' | 'compact') => void;
  /** Row quick action; only passed when the signed-in person has a staff profile. */
  onAssignToMe?: (id: number) => void;
  myStaffId?: number | null;
  /** Lets the table say why a header click does nothing (the All tab keeps newest first). */
  sortLocked?: boolean;
}

function ColumnMenu({columns, onColumns}: {columns: TicketColumn[]; onColumns: (c: TicketColumn[]) => void}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const toggle = (c: TicketColumn) => {
    // Keep the saved order for columns already on, append new ones at the end.
    onColumns(columns.includes(c) ? columns.filter((x) => x !== c) : [...columns, c]);
  };
  return (
    <div className="tgx-menu-wrap" ref={ref}>
      <button type="button" className="tgx-tool" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Columns3 size={13} aria-hidden="true"/>Columns<span className="tgx-tool-n">{columns.length}</span>
      </button>
      {open && (
        <div className="tgx-menu" role="group" aria-label="Show or hide columns">
          {ALL_COLUMNS.map((c) => {
            const on = columns.includes(c);
            const locked = COLUMN_META[c].always;
            return (
              <label key={c} className={'tgx-menu-item' + (locked ? ' is-locked' : '')}>
                <input type="checkbox" checked={on || !!locked} disabled={locked} onChange={() => toggle(c)}/>
                <span className="tgx-menu-check" aria-hidden="true">{(on || locked) && <Check size={11}/>}</span>
                {COLUMN_META[c].label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SkeletonRows({count, span}: {count: number; span: number}) {
  return (
    <tbody aria-hidden="true">
      {Array.from({length: count}, (_, i) => (
        <tr key={i} className="tgx-skeleton-row">
          {Array.from({length: span}, (_, j) => (
            <td key={j}><span className="skeleton tgx-sk" style={{width: j === 0 ? 16 : j === 1 ? '70%' : `${40 + ((i * 7 + j * 13) % 40)}%`}}/></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function TicketGrid({
  tickets, columns, groupBy, sortKey, sortDir, density, expandedGroups, staleDays = 3, loading = false,
  onSort, onToggleGroup, onSetGroups, onSelect, selected, onToggleSelect, onSelectMany,
  onColumns, onDensity, onAssignToMe, myStaffId, sortLocked = false,
}: TicketGridProps) {
  const sorted = useMemo(() => sortRows(tickets, sortKey, sortDir), [tickets, sortKey, sortDir]);

  // A slow clock so the ageing flag keeps up with a board left open, without reading the
  // wall clock during render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => (groupBy === 'none' ? null : groupTickets(sorted, groupBy)), [sorted, groupBy]);

  // The rows actually on screen, in screen order — what j/k walks and select-all covers.
  const visibleIds = useMemo(
    () => (groups ? groups.flatMap(([name, rows]) => (expandedGroups.includes(name) ? rows.map((t) => t.id) : [])) : sorted.map((t) => t.id)),
    [groups, sorted, expandedGroups],
  );
  const [focusId, setFocusId] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const activeId = focusId != null && visibleIds.includes(focusId) ? focusId : visibleIds[0];

  const span = columns.length + (onToggleSelect ? 1 : 0) + (columns.includes("label") ? 0 : 1) + 1;
  const allGroupNames = groups?.map(([name]) => name) ?? [];
  const allExpanded = allGroupNames.length > 0 && allGroupNames.every((n) => expandedGroups.includes(n));
  const selectedOnScreen = visibleIds.filter((id) => selected?.includes(id)).length;
  const allSelected = visibleIds.length > 0 && selectedOnScreen === visibleIds.length;
  const someSelected = selectedOnScreen > 0 && !allSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected; }, [someSelected]);

  function focusRow(id: number) {
    setFocusId(id);
    tableRef.current?.querySelector<HTMLTableRowElement>(`tr[data-row-id="${id}"]`)?.focus();
  }

  function onRowKey(e: KeyboardEvent<HTMLTableRowElement>, id: number) {
    if (e.target !== e.currentTarget) return; // let buttons and checkboxes inside the row behave normally
    const i = visibleIds.indexOf(id);
    if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); if (i < visibleIds.length - 1) focusRow(visibleIds[i + 1]); }
    else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); if (i > 0) focusRow(visibleIds[i - 1]); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(visibleIds[0]); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(visibleIds[visibleIds.length - 1]); }
    else if (e.key === 'Enter' || e.key === 'o') { e.preventDefault(); onSelect(id); }
    else if ((e.key === 'x' || e.key === ' ') && onToggleSelect) { e.preventDefault(); onToggleSelect(id); }
  }

  async function copyLink(id: number) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tickets/${id}`);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
    } catch { /* clipboard blocked: nothing useful to do */ }
  }

  const header = (
    <thead>
      <tr>
        {onToggleSelect && (
          <th className="tg-check tgx-sticky-check" scope="col">
            <input
              ref={selectAllRef}
              type="checkbox"
              aria-label={allSelected ? 'Clear selection on this page' : 'Select all tickets on this page'}
              checked={allSelected}
              disabled={!visibleIds.length || !onSelectMany}
              onChange={() => onSelectMany?.(visibleIds, !allSelected)}
            />
          </th>
        )}
        {!columns.includes("label") && <th scope="col" className="tgx-sticky-first">Open ticket</th>}
        {columns.map((c) => {
          const meta = COLUMN_META[c];
          const active = sortKey === c;
          return (
            <th
              key={c}
              data-col={c}
              scope="col"
              className={'tg-sortable' + (active ? ' tg-sorted' : '') + (meta.align === 'right' ? ' tg-right' : '') + (c === 'label' ? ' tgx-sticky-first' : '')}
              aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <button type="button" className="tg-th" onClick={() => onSort(c)} title={sortLocked ? 'The All tickets tab always lists newest first' : `Sort by ${meta.label}`}>
                {meta.label}
                {active
                  ? (sortDir === 'asc' ? <ArrowUp size={11} aria-hidden="true"/> : <ArrowDown size={11} aria-hidden="true"/>)
                  : <ChevronsUpDown size={11} className="tg-sort-idle" aria-hidden="true"/>}
              </button>
            </th>
          );
        })}
        <th scope="col" className="tgx-actions-th"><span className="sr-only">Quick actions</span></th>
      </tr>
    </thead>
  );

  const row = (t: TicketListRecord, nested: boolean) => {
    const isSelected = selected?.includes(t.id) || false;
    return (
      <tr
        key={t.id}
        data-row-id={t.id}
        tabIndex={t.id === activeId ? 0 : -1}
        aria-selected={onToggleSelect ? isSelected : undefined}
        aria-label={`${t.ticketNumber} ${t.title}`}
        className={'priority-row priority-row-' + t.priority + ' tg-row-' + statusPhase(t.status) + (recurrenceInfo(t).check ? ' tg-row-recur' : '') + (nested ? ' tg-child' : '') + (isSelected ? ' tgx-selected' : '')}
        onClick={() => { setFocusId(t.id); onSelect(t.id); }}
        onFocus={(e) => { if (e.target === e.currentTarget) setFocusId(t.id); }}
        onKeyDown={(e) => onRowKey(e, t.id)}
      >
        {onToggleSelect && (
          <td className="tg-check tgx-sticky-check" onClick={(e) => e.stopPropagation()}>
            <input
              aria-label={'Select ' + t.ticketNumber}
              type="checkbox"
              tabIndex={-1}
              checked={isSelected}
              onChange={() => onToggleSelect(t.id)}
            />
          </td>
        )}
        {!columns.includes("label") && <td className="tgx-sticky-first"><button type="button" tabIndex={-1} className="tg-open-ticket ticket-id mono" onClick={(e) => { e.stopPropagation(); onSelect(t.id); }}>{t.ticketNumber}</button></td>}
        {columns.map((c) => <Cell key={c} column={c} ticket={t} staleDays={staleDays} nowMs={nowMs} onOpen={() => onSelect(t.id)}/>)}
        <td className="tgx-actions" onClick={(e) => e.stopPropagation()}>
          <div className="tgx-actions-inner">
            <button type="button" tabIndex={-1} className="tgx-act" aria-label={'Open ' + t.ticketNumber} title="Open" onClick={() => onSelect(t.id)}><ExternalLink size={13}/></button>
            <button type="button" tabIndex={-1} className="tgx-act" aria-label={'Copy link to ' + t.ticketNumber} title={copied === t.id ? 'Link copied' : 'Copy link'} onClick={() => void copyLink(t.id)}>
              {copied === t.id ? <Check size={13}/> : <Link2 size={13}/>}
            </button>
            {onAssignToMe && isOpen(t) && t.assignedStaffId !== myStaffId && (
              <button type="button" tabIndex={-1} className="tgx-act" aria-label={'Assign ' + t.ticketNumber + ' to me'} title="Assign to me" onClick={() => onAssignToMe(t.id)}><UserPlus size={13}/></button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="tgx">
      {(onColumns || onDensity || groups) && (
        <div className="tgx-bar">
          {groups && (
            <div className="tg-group-bar tgx-groupinfo">
              <span className="tgx-groupinfo-label">Grouped by {GROUP_LABELS[groupBy].toLowerCase()}</span>
              <span className="muted">{groups.length} group{groups.length === 1 ? '' : 's'}</span>
              <button className="text-btn" onClick={() => onSetGroups(allExpanded ? [] : allGroupNames)}>
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
          <span className="tgx-keys" aria-hidden="true"><kbd>j</kbd><kbd>k</kbd> move · <kbd>Enter</kbd> open{onToggleSelect ? <> · <kbd>x</kbd> select</> : null}</span>
          <div className="tgx-bar-tools">
            {onDensity && (
              <div className="tgx-seg" role="group" aria-label="Row density">
                <button type="button" aria-pressed={density === 'comfortable'} title="Comfortable rows" onClick={() => onDensity('comfortable')}><Rows3 size={13} aria-hidden="true"/><span className="sr-only">Comfortable</span></button>
                <button type="button" aria-pressed={density === 'compact'} title="Compact rows" onClick={() => onDensity('compact')}><Rows4 size={13} aria-hidden="true"/><span className="sr-only">Compact</span></button>
              </div>
            )}
            {onColumns && <ColumnMenu columns={columns} onColumns={onColumns}/>}
          </div>
        </div>
      )}
      <div className="table-wrap tgx-scroll">
        <table
          ref={tableRef}
          className={'data-table data-table-rich ticket-grid tgx-table tg-' + density + (onToggleSelect ? ' tgx-has-check' : '')}
          aria-label="Tickets"
          aria-busy={loading || undefined}
          aria-multiselectable={onToggleSelect ? true : undefined}
        >
          {header}
          {loading
            ? <SkeletonRows count={8} span={span}/>
            : groups
              ? groups.map(([name, rows]) => {
                  const open = expandedGroups.includes(name);
                  const stats = groupStats(rows);
                  return (
                    <tbody key={name} className={'tg-group' + (open ? ' tg-group-open' : '')}>
                      <tr
                        className="tg-group-row"
                        role="button"
                        tabIndex={0}
                        aria-expanded={open}
                        aria-label={(open ? 'Collapse ' : 'Expand ') + name}
                        onClick={() => onToggleGroup(name)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup(name); }
                        }}
                      >
                        <td colSpan={span}>
                          <div className="tg-group-head">
                            <span className="tg-group-chevron">{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>
                            <strong className="tg-group-name">{name}</strong>
                            <span className="tg-group-count">{stats.total}</span>
                            <span className="tg-group-spacer"/>
                            {stats.overdue > 0 && <Badge tone="red"><TriangleAlert size={10}/>{stats.overdue} overdue</Badge>}
                            {stats.urgent > 0 && <Badge tone="amber">{stats.urgent} urgent</Badge>}
                            <Badge tone={stats.open ? 'blue' : 'green'}>{stats.open} open</Badge>
                            <span className="tg-group-bar-track" aria-hidden="true">
                              <span className="tg-group-bar-fill" style={{width: `${Math.round((stats.open / Math.max(1, stats.total)) * 100)}%`}}/>
                            </span>
                          </div>
                        </td>
                      </tr>
                      {open && rows.map((t) => row(t, true))}
                    </tbody>
                  );
                })
              : <tbody>{sorted.map((t) => row(t, false))}</tbody>}
        </table>
      </div>
    </div>
  );
}
