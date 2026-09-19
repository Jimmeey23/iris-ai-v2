"use client";

import {useMemo, useState} from 'react';
import {
  ArrowUpRight, CheckCircle2, Clock3, Ticket, TriangleAlert, Sparkles, Gauge, Filter,
} from 'lucide-react';
import {CountUp, Empty, Modal, Priority, Status} from './ui';
import {indiaDate} from '@/lib/display';
import {relativeTime} from '@/lib/utils';
import {isClosed, slaBucketOf} from '@/lib/ticket-filtering';
import type {FilterState} from '@/lib/dashboard-contract';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The numbers at the top of the board, and what is behind them.
 *
 * A metric that cannot be opened is a number you have to take on trust: "14 need attention"
 * prompts "which fourteen?", and the only way to answer used to be to go and rebuild the
 * filter by hand. Every card here opens onto the rows it counted, with the breakdown that
 * explains the number, and can hand that selection straight to the table.
 */

export interface MetricDefinition {
  id: string;
  label: string;
  note: string;
  value: number;
  display?: string;
  rows: TicketListRecord[];
  tone: '' | 'purple' | 'amber' | 'green' | 'red';
  color: string;
  icon: typeof Ticket;
  /** The filter that reproduces this card's rows in the table. */
  filter?: Partial<FilterState>;
  /** Formats the headline number; defaults to a zero-padded integer. */
  format?: (n: number) => string;
}

/** Seven-day shape of the rows behind a card. Drawn as a filled area so a flat line still
 *  reads as "nothing happened" rather than as a missing chart. */
function Sparkline({tickets, color}: {tickets: TicketListRecord[]; color: string}) {
  const counts = Array.from({length: 7}, (_, i) =>
    tickets.filter((t) => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / 86400000) === 6 - i).length);
  const max = Math.max(1, ...counts);
  const points = counts.map((n, i) => `${i * 12},${26 - (n / max) * 23}`);
  return (
    <svg viewBox="0 0 74 30" className="metric-spark" aria-hidden="true">
      <polygon points={`0,30 ${points.join(' ')} 72,30`} fill={color} opacity="0.12"/>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/** A small ranked breakdown — the "why" behind the headline number. */
function Breakdown({title, rows, pick}: {title: string; rows: TicketListRecord[]; pick: (t: TicketListRecord) => string}) {
  const tally = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of rows) {
      const key = pick(t) || 'Unassigned';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [rows, pick]);
  if (!tally.length) return null;
  const max = Math.max(...tally.map(([, n]) => n));
  return (
    <div className="mc-breakdown">
      <span className="eyebrow">{title}</span>
      {tally.map(([name, n]) => (
        <div className="mc-breakdown-row" key={name}>
          <span className="mc-breakdown-name" title={name}>{name}</span>
          <span className="mc-breakdown-track"><span className="mc-breakdown-fill" style={{width: `${(n / max) * 100}%`}}/></span>
          <strong>{n}</strong>
        </div>
      ))}
    </div>
  );
}

export function MetricCards({metrics, onApplyFilter, onOpenTicket}: {
  metrics: MetricDefinition[];
  onApplyFilter?: (filter: Partial<FilterState>, label: string) => void;
  onOpenTicket?: (id: number) => void;
}) {
  const [drill, setDrill] = useState<MetricDefinition | null>(null);

  return (
    <>
      <div className="metric-grid rise-stagger">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <button
              type="button"
              className="card metric metric-clickable"
              data-tone={m.tone || 'accent'}
              key={m.id}
              onClick={() => setDrill(m)}
              aria-label={`${m.label}: ${m.display ?? m.value}. Show the tickets behind this number.`}
            >
              <span className="metric-sheen" aria-hidden="true"/>
              <div className="between">
                <span className="metric-name">{m.label}</span>
                <span className={'metric-icon ' + m.tone}><Icon size={14}/></span>
              </div>
              <div className="between">
                <strong className="metric-number">
                  {m.display !== undefined
                    ? m.display
                    : <CountUp value={m.value} format={m.format ?? ((n) => Math.round(n).toString().padStart(2, '0'))}/>}
                </strong>
                <Sparkline tickets={m.rows} color={m.color}/>
              </div>
              <div className="metric-note">
                {m.tone === 'green' && <CheckCircle2 size={10}/>} {m.note}
                <span className="metric-drill">Open <ArrowUpRight size={10}/></span>
              </div>
            </button>
          );
        })}
      </div>

      <Modal
        open={Boolean(drill)}
        onClose={() => setDrill(null)}
        size="wide"
        title={drill ? `${drill.label} · ${drill.rows.length} ticket${drill.rows.length === 1 ? '' : 's'}` : ''}
        description={drill?.note}
        resetKey={drill?.id}
        footer={
          <>
            <button className="btn" onClick={() => setDrill(null)}>Close</button>
            {drill?.filter && onApplyFilter && (
              <button className="btn btn-primary" onClick={() => { onApplyFilter(drill.filter!, drill.label); setDrill(null); }}>
                <Filter size={13}/>Show these in the table
              </button>
            )}
          </>
        }
      >
        {!drill ? null : !drill.rows.length ? (
          <Empty art="chart" title="Nothing behind this number yet" detail="When tickets match, they will be listed here."/>
        ) : (
          <div className="stack">
            <div className="mc-breakdowns">
              <Breakdown title="BY CATEGORY" rows={drill.rows} pick={(t) => t.category}/>
              <Breakdown title="BY STUDIO" rows={drill.rows} pick={(t) => (t.studio || '').split(',')[0]}/>
              <Breakdown title="BY OWNER" rows={drill.rows} pick={(t) => t.assignedStaffName || 'Unassigned'}/>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Ticket</th><th>Status</th><th>Priority</th><th>Owner</th><th>Logged</th></tr></thead>
                <tbody>
                  {drill.rows.slice(0, 100).map((t) => (
                    <tr key={t.id} onClick={() => { if (onOpenTicket) { onOpenTicket(t.id); setDrill(null); } }} className={onOpenTicket ? 'mc-row-clickable' : ''}>
                      <td>
                        <p className="ticket-name">{t.title}</p>
                        <div className="ticket-meta"><span className="ticket-id">{t.ticketNumber}</span><span>·</span><span>{t.memberName}</span></div>
                      </td>
                      <td><Status status={t.status}/></td>
                      <td><Priority priority={t.priority}/></td>
                      <td>{t.assignedStaffName || <span className="muted">Unassigned</span>}</td>
                      <td title={indiaDate(t.createdAt)}>{relativeTime(t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {drill.rows.length > 100 && (
              <p className="muted" style={{fontSize: 11}}>Showing the first 100 of {drill.rows.length}. Use “Show these in the table” for the full list.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** The headline cards. Each one carries the filter that reproduces it in the table. */
export function headlineMetrics(tickets: TicketListRecord[]): MetricDefinition[] {
  const open = tickets.filter((t) => !isClosed(t));
  const urgent = open.filter((t) => ['high', 'critical'].includes(t.priority));
  const closed = tickets.filter((t) => ['resolved', 'closed'].includes(t.status));
  const overdue = tickets.filter((t) => slaBucketOf(t) === 'breached');
  return [
    {id: 'total', label: 'Total tickets', value: tickets.length, note: 'Every conversation, accounted for', rows: tickets, tone: '', color: 'var(--accent)', icon: Ticket, filter: {state: 'any', statuses: [], priorities: [], slaStates: []}},
    {id: 'open', label: 'Active conversations', value: open.length, note: 'In the hands of your team', rows: open, tone: 'purple', color: 'var(--purple)', icon: Clock3, filter: {state: 'open', statuses: [], priorities: [], slaStates: []}},
    {id: 'urgent', label: 'Needs attention', value: urgent.length, note: 'High & critical priority', rows: urgent, tone: 'amber', color: 'var(--amber)', icon: TriangleAlert, filter: {state: 'open', priorities: ['critical', 'high'], statuses: [], slaStates: []}},
    {id: 'overdue', label: 'Past their target', value: overdue.length, note: 'Follow-up target already missed', rows: overdue, tone: 'red', color: 'var(--red)', icon: Gauge, filter: {state: 'any', slaStates: ['breached'], statuses: [], priorities: []}},
    {id: 'closed', label: 'Resolved with care', value: closed.length, note: 'A better member experience', rows: closed, tone: 'green', color: 'var(--green)', icon: CheckCircle2, filter: {state: 'closed', statuses: [], priorities: [], slaStates: []}},
  ];
}

/** The second row: rates and shapes rather than counts. */
export function pulseMetrics(tickets: TicketListRecord[]): MetricDefinition[] {
  const timed = tickets.filter((t) => t.resolutionRequired && t.slaDueAt);
  const breached = timed.filter((t) => new Date(t.slaDueAt as string).getTime() < (t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now()));
  const compliance = timed.length ? Math.round(((timed.length - breached.length) / timed.length) * 100) : 100;

  const resolved = tickets.filter((t) => t.resolvedAt);
  const durations = resolved.map((t) => Math.max(0, (new Date(t.resolvedAt as string).getTime() - new Date(t.createdAt).getTime()) / 3600000)).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  const byCategory = new Map<string, TicketListRecord[]>();
  for (const t of tickets) {
    if (!byCategory.has(t.category)) byCategory.set(t.category, []);
    byCategory.get(t.category)!.push(t);
  }
  const top = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const viaIris = tickets.filter((t) => t.source === 'iris');
  const irisShare = tickets.length ? Math.round((viaIris.length / tickets.length) * 100) : 0;

  return [
    {id: 'compliance', label: 'SLA compliance', value: compliance, note: 'Met their follow-up target', rows: timed, tone: compliance >= 85 ? 'green' : compliance >= 60 ? 'amber' : 'red', color: 'var(--green)', icon: CheckCircle2, format: (n) => Math.round(n) + '%', filter: {state: 'any', slaStates: ['ok', 'due', 'breached']}},
    {id: 'median', label: 'Median resolution', value: median, display: median ? median.toFixed(1) + 'h' : '—', note: 'Half are closed faster than this', rows: resolved, tone: 'purple', color: 'var(--purple)', icon: Clock3, filter: {state: 'closed'}},
    {id: 'topCategory', label: 'Top category', value: top?.[1].length || 0, display: top?.[0] || '—', note: `${top?.[1].length || 0} tickets in this category`, rows: top?.[1] || [], tone: '', color: 'var(--accent)', icon: TriangleAlert, filter: top ? {category: top[0]} : undefined},
    {id: 'iris', label: 'Logged via Iris', value: irisShare, note: 'Share of tickets raised in chat', rows: viaIris, tone: 'amber', color: 'var(--amber)', icon: Sparkles, format: (n) => Math.round(n) + '%', filter: {sources: ['iris']}},
  ];
}
