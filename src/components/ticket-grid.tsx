"use client";

import {useEffect, useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, ArrowDown, ArrowUp, ChevronsUpDown, TriangleAlert, ArrowUpFromLine, Hourglass} from 'lucide-react';
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
 * maintenance lead cares about age and the follow-up target, and neither should have to
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

function Cell({column, ticket, staleDays, nowMs}: {column: TicketColumn; ticket: TicketListRecord; staleDays: number; nowMs: number}) {
  const t = ticket;
  const stale = nowMs > 0 && nowMs - new Date(t.createdAt).getTime() > staleDays * 86400000 && isOpen(t);
  switch (column) {
    case 'label':
      return (
        <td className="tg-label-cell">
          <p className="ticket-name" title={t.title}>{recurrenceInfo(t).title}</p>
          <RecurrenceBadges ticket={t}/>
          <div className="ticket-meta">
            <span className="ticket-id">{t.ticketNumber}</span>
            {t.memberName && <><span>·</span><span className="ticket-member">{t.memberName}</span></>}
            {t.studio && <><span>·</span><span>{t.studio.split(',')[0]}</span></>}
          </div>
        </td>
      );
    case 'ticketNumber': return <td><span className="ticket-id mono">{t.ticketNumber}</span></td>;
    case 'member': return <td>{t.memberName || <span className="muted">—</span>}</td>;
    case 'kind': return <td><span className="chip chip-kind" data-tone={KIND_TONE[t.kind] || ''}>{t.kind}</span></td>;
    case 'category': return <td>{t.category}</td>;
    case 'subcategory': return <td><span className="category-sub">{t.subcategory || '—'}</span></td>;
    case 'studio': return <td>{t.studio ? t.studio.split(',')[0] : <span className="muted">—</span>}</td>;
    case 'status':
      return <td><StatusPill status={t.status}/>{!t.resolutionRequired && <span className="category-sub">record only</span>}</td>;
    case 'priority': return <td><Priority priority={t.priority}/></td>;
    case 'owner': {
      // An unassigned ticket is styled as absent rather than as a person whose initials
      // happen to be "UN".
      const unassigned = !t.assignedStaffName;
      const co = t.additionalOwners ?? [];
      const title = (t.assignedStaffName || 'Not yet assigned') + (co.length ? ' (lead) · with ' + co.map((o) => o.name).join(', ') : '');
      return (
        <td>
          <div className={'mini-owner' + (unassigned ? ' mini-owner-empty' : '')} title={title}>
            <Avatar name={unassigned ? 'Unassigned owner' : t.assignedStaffName} tone="purple" emptyDark={unassigned} owner={!unassigned}/>
            <span>
              <strong>
                {unassigned ? 'Unassigned' : t.assignedStaffName.split(' ')[0]}
                {co.length > 0 && <em className="tg-co-count" aria-label={`plus ${co.length} co-owner${co.length === 1 ? '' : 's'}`}>+{co.length}</em>}
              </strong>
              <small>{t.departmentName || 'No desk'}</small>
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
    case 'created': return <td><span title={indiaDate(t.createdAt)}>{indiaDate(t.createdAt, true)}</span></td>;
    case 'updated': return <td><span title={indiaDate(t.updatedAt)}>{t.updatedAt ? relativeTime(t.updatedAt) : '—'}</span></td>;
    case 'age': return <td className="tg-right"><span className={stale ? 'ticket-stale' : ''}>{relativeTime(t.createdAt)}</span></td>;
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

export interface TicketGridProps {
  tickets: TicketListRecord[];
  columns: TicketColumn[];
  groupBy: GroupBy;
  sortKey: TicketColumn;
  sortDir: 'asc' | 'desc';
  density: 'comfortable' | 'compact';
  expandedGroups: string[];
  staleDays?: number;
  onSort: (key: TicketColumn) => void;
  onToggleGroup: (name: string) => void;
  onSetGroups: (names: string[]) => void;
  onSelect: (id: number) => void;
  selected?: number[];
  onToggleSelect?: (id: number) => void;
}

export function TicketGrid({
  tickets, columns, groupBy, sortKey, sortDir, density, expandedGroups, staleDays = 3,
  onSort, onToggleGroup, onSetGroups, onSelect, selected, onToggleSelect,
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

  const span = columns.length + (onToggleSelect ? 1 : 0);
  const allGroupNames = groups?.map(([name]) => name) ?? [];
  const allExpanded = allGroupNames.length > 0 && allGroupNames.every((n) => expandedGroups.includes(n));

  const header = (
    <thead>
      <tr>
        {onToggleSelect && <th className="tg-check"/>}
        {columns.map((c) => {
          const meta = COLUMN_META[c];
          const active = sortKey === c;
          return (
            <th
              key={c}
              className={'tg-sortable' + (active ? ' tg-sorted' : '') + (meta.align === 'right' ? ' tg-right' : '')}
              onClick={() => onSort(c)}
              aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              title={`Sort by ${meta.label}`}
            >
              <span className="tg-th">
                {meta.label}
                {active
                  ? (sortDir === 'asc' ? <ArrowUp size={11}/> : <ArrowDown size={11}/>)
                  : <ChevronsUpDown size={11} className="tg-sort-idle"/>}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );

  const row = (t: TicketListRecord, nested: boolean) => (
    <tr
      key={t.id}
      className={'priority-row priority-row-' + t.priority + ' tg-row-' + statusPhase(t.status) + (recurrenceInfo(t).check ? ' tg-row-recur' : '') + (nested ? ' tg-child' : '')}
      onClick={() => onSelect(t.id)}
    >
      {onToggleSelect && (
        <td className="tg-check" onClick={(e) => e.stopPropagation()}>
          <input
            aria-label={'Select ' + t.ticketNumber}
            type="checkbox"
            checked={selected?.includes(t.id) || false}
            onChange={() => onToggleSelect(t.id)}
          />
        </td>
      )}
      {columns.map((c) => <Cell key={c} column={c} ticket={t} staleDays={staleDays} nowMs={nowMs}/>)}
    </tr>
  );

  return (
    <div className="table-wrap">
      {groups && (
        <div className="tg-group-bar">
          <span className="eyebrow">GROUPED BY {GROUP_LABELS[groupBy].toUpperCase()}</span>
          <span className="muted">{groups.length} group{groups.length === 1 ? '' : 's'}</span>
          <button className="text-btn" onClick={() => onSetGroups(allExpanded ? [] : allGroupNames)}>
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      <table className={'data-table data-table-rich ticket-grid tg-' + density}>
        {header}
        {groups
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
  );
}
