"use client";

import {useMemo, useState} from 'react';
import {
  ArrowUpRight, CheckCircle2, Clock3, Ticket, TriangleAlert, Sparkles, Gauge, Filter,
  ArrowDown, ArrowUp, Minus,
} from 'lucide-react';
import {CountUp, Empty, Modal, Priority, Status} from './ui';
import {indiaDate} from '@/lib/display';
import {relativeTime} from '@/lib/utils';
import {isClosed, slaBucketOf} from '@/lib/ticket-filtering';
import type {FilterState} from '@/lib/dashboard-contract';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The instrument panel at the top of the board.
 *
 * Each card carries three layers of answer. The number is the headline. Its face also
 * shows the seven-day shape and the change against the week before, which is what turns
 * "14 open" into "14 open, and rising". Turning the card over gives the breakdown that
 * explains it, and clicking it opens the rows themselves — a metric that cannot be opened
 * is a number you have to take on trust.
 *
 * Eight cards, deliberately. A ninth pushed the ticket table below the fold.
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
  /** Which graphic the face carries. */
  chart: 'spark' | 'gauge';
  /** 0–100 for the gauge. */
  gauge?: number;
  /** Change against the previous comparable period, as a percentage. */
  delta?: number | null;
  /** Lower is better — inverts the colour of the delta chip. */
  inverse?: boolean;
  /** How the back of the card groups its breakdown. */
  breakdown?: (t: TicketListRecord) => string;
  breakdownLabel?: string;
  /** The filter that reproduces this card's rows in the table. */
  filter?: Partial<FilterState>;
  format?: (n: number) => string;
}

const DAY = 86400000;

/** Seven-day shape, drawn as a filled area so a flat line still reads as "nothing
 *  happened" rather than as a missing chart. */
function Sparkline({tickets, color}: {tickets: TicketListRecord[]; color: string}) {
  const counts = Array.from({length: 7}, (_, i) =>
    tickets.filter((t) => Math.floor((Date.now() - new Date(t.createdAt).getTime()) / DAY) === 6 - i).length);
  const max = Math.max(1, ...counts);
  const points = counts.map((n, i) => `${i * 12},${26 - (n / max) * 22}`);
  return (
    <svg viewBox="0 0 74 30" className="metric-spark" aria-hidden="true">
      <defs>
        <linearGradient id={`mcg-${color.replace(/[^a-z]/gi, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.26"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,30 ${points.join(' ')} 72,30`} fill={`url(#mcg-${color.replace(/[^a-z]/gi, '')})`}/>
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={72} cy={26 - (counts[6] / max) * 22} r="2" fill={color}/>
    </svg>
  );
}

/** A 270° arc for the rate metrics, where a trend line says less than a dial. */
function GaugeArc({value, color}: {value: number; color: string}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 13, circumference = 2 * Math.PI * r * 0.75;
  return (
    <svg viewBox="0 0 34 34" className="metric-gauge" aria-hidden="true">
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--surface-4)" strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={`${circumference} 999`} transform="rotate(135 17 17)"/>
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="3.5"
        strokeLinecap="round" strokeDasharray={`${(circumference * pct) / 100} 999`}
        transform="rotate(135 17 17)" className="metric-gauge-fill"/>
    </svg>
  );
}

function DeltaChip({delta, inverse}: {delta: number | null | undefined; inverse?: boolean}) {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return <span className="metric-delta metric-delta-flat"><Minus size={9}/>no prior data</span>;
  }
  const rounded = Math.round(delta);
  if (rounded === 0) return <span className="metric-delta metric-delta-flat"><Minus size={9}/>level</span>;
  const rising = rounded > 0;
  const good = inverse ? !rising : rising;
  return (
    <span className={'metric-delta ' + (good ? 'metric-delta-good' : 'metric-delta-bad')}>
      {rising ? <ArrowUp size={9}/> : <ArrowDown size={9}/>}{Math.abs(rounded)}% vs prev 7d
    </span>
  );
}

/** A small ranked breakdown — the "why" behind the headline number. */
function Breakdown({title, rows, pick, limit = 6}: {
  title: string; rows: TicketListRecord[]; pick: (t: TicketListRecord) => string; limit?: number;
}) {
  const tally = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of rows) {
      const key = pick(t) || 'Unassigned';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  }, [rows, pick, limit]);
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
      <div className="metric-grid metric-grid-8">
        {metrics.slice(0, 8).map((m, i) => {
          const Icon = m.icon;
          const shown = m.display !== undefined
            ? m.display
            : <CountUp value={m.value} format={m.format ?? ((n) => Math.round(n).toString().padStart(2, '0'))}/>;
          return (
            <button
              type="button"
              className="mc-card"
              data-tone={m.tone || 'accent'}
              key={m.id}
              style={{animationDelay: `${i * 45}ms`}}
              onClick={() => setDrill(m)}
              aria-label={`${m.label}: ${m.display ?? m.value}. Open the tickets behind this number.`}
            >
              <span className="mc-inner">
                <span className="mc-face mc-front">
                  <span className="mc-grid-lines" aria-hidden="true"/>
                  <span className="mc-top">
                    <span className="mc-label">{m.label}</span>
                    <span className="mc-icon"><Icon size={13}/></span>
                  </span>
                  <span className="mc-value-row">
                    <strong className="mc-value">{shown}</strong>
                    {m.chart === 'gauge'
                      ? <GaugeArc value={m.gauge ?? m.value} color={m.color}/>
                      : <Sparkline tickets={m.rows} color={m.color}/>}
                  </span>
                  <span className="mc-foot">
                    <DeltaChip delta={m.delta} inverse={m.inverse}/>
                    <span className="mc-count">n={m.rows.length}</span>
                  </span>
                </span>
                <span className="mc-face mc-back">
                  <span className="mc-grid-lines" aria-hidden="true"/>
                  <span className="mc-back-head">
                    <span className="mc-label">{m.breakdownLabel || 'Breakdown'}</span>
                    <span className="mc-icon"><Icon size={13}/></span>
                  </span>
                  {m.rows.length
                    ? <Breakdown title="" rows={m.rows} pick={m.breakdown || ((t) => t.category)} limit={4}/>
                    : <span className="mc-empty">Nothing in this measure yet.</span>}
                  <span className="mc-open">Open details <ArrowUpRight size={11}/></span>
                </span>
              </span>
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

/** Week-on-week change in how many of these rows were logged. Null when the earlier week
 *  had none, because a rise from zero is not a percentage. */
function weekDelta(rows: TicketListRecord[]): number | null {
  const now = Date.now();
  const recent = rows.filter((t) => now - new Date(t.createdAt).getTime() < 7 * DAY).length;
  const prior = rows.filter((t) => {
    const age = now - new Date(t.createdAt).getTime();
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;
  if (!prior) return null;
  return ((recent - prior) / prior) * 100;
}

/**
 * The eight cards. Counts first, then the rates that describe how the work is going.
 * Each carries the filter that reproduces it in the table below.
 */
export function boardMetrics(tickets: TicketListRecord[]): MetricDefinition[] {
  const open = tickets.filter((t) => !isClosed(t));
  const urgent = open.filter((t) => ['high', 'critical'].includes(t.priority));
  const closed = tickets.filter((t) => ['resolved', 'closed'].includes(t.status));
  const overdue = tickets.filter((t) => slaBucketOf(t) === 'breached');

  const timed = tickets.filter((t) => t.resolutionRequired && t.slaDueAt);
  const breached = timed.filter((t) => new Date(t.slaDueAt as string).getTime() < (t.resolvedAt ? new Date(t.resolvedAt).getTime() : Date.now()));
  const compliance = timed.length ? Math.round(((timed.length - breached.length) / timed.length) * 100) : 100;

  const resolved = tickets.filter((t) => t.resolvedAt);
  const durations = resolved
    .map((t) => Math.max(0, (new Date(t.resolvedAt as string).getTime() - new Date(t.createdAt).getTime()) / 3600000))
    .sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : 0;

  const viaIris = tickets.filter((t) => t.source === 'iris');
  const irisShare = tickets.length ? Math.round((viaIris.length / tickets.length) * 100) : 0;

  const byOwner = (t: TicketListRecord) => t.assignedStaffName || 'Unassigned';
  const byStudio = (t: TicketListRecord) => (t.studio || 'No studio').split(',')[0];
  const byCategory = (t: TicketListRecord) => t.category;

  return [
    {
      id: 'total', label: 'Total logged', value: tickets.length, note: 'Every conversation, accounted for',
      rows: tickets, tone: '', color: 'var(--accent)', icon: Ticket, chart: 'spark',
      delta: weekDelta(tickets), breakdown: byCategory, breakdownLabel: 'By category',
      filter: {state: 'any', statuses: [], priorities: [], slaStates: []},
    },
    {
      id: 'open', label: 'Active now', value: open.length, note: 'In the hands of your team',
      rows: open, tone: 'purple', color: 'var(--purple)', icon: Clock3, chart: 'spark',
      delta: weekDelta(open), inverse: true, breakdown: byOwner, breakdownLabel: 'By owner',
      filter: {state: 'open', statuses: [], priorities: [], slaStates: []},
    },
    {
      id: 'urgent', label: 'Needs attention', value: urgent.length, note: 'High & critical priority, still open',
      rows: urgent, tone: 'amber', color: 'var(--amber)', icon: TriangleAlert, chart: 'spark',
      delta: weekDelta(urgent), inverse: true, breakdown: byStudio, breakdownLabel: 'By studio',
      filter: {state: 'open', priorities: ['critical', 'high'], statuses: [], slaStates: []},
    },
    {
      id: 'overdue', label: 'Past target', value: overdue.length, note: 'Follow-up target already missed',
      rows: overdue, tone: 'red', color: 'var(--red)', icon: Gauge, chart: 'spark',
      delta: weekDelta(overdue), inverse: true, breakdown: byOwner, breakdownLabel: 'By owner',
      filter: {state: 'any', slaStates: ['breached'], statuses: [], priorities: []},
    },
    {
      id: 'closed', label: 'Resolved', value: closed.length, note: 'Closed with an outcome recorded',
      rows: closed, tone: 'green', color: 'var(--green)', icon: CheckCircle2, chart: 'spark',
      delta: weekDelta(closed), breakdown: byCategory, breakdownLabel: 'By category',
      filter: {state: 'closed', statuses: [], priorities: [], slaStates: []},
    },
    {
      id: 'compliance', label: 'SLA compliance', value: compliance, gauge: compliance, format: (n) => Math.round(n) + '%',
      note: 'Share that met their follow-up target', rows: timed,
      tone: compliance >= 85 ? 'green' : compliance >= 60 ? 'amber' : 'red',
      color: compliance >= 85 ? 'var(--green)' : compliance >= 60 ? 'var(--amber)' : 'var(--red)',
      icon: CheckCircle2, chart: 'gauge', delta: null, breakdown: byOwner, breakdownLabel: 'Targets by owner',
      filter: {state: 'any', slaStates: ['ok', 'due', 'breached']},
    },
    {
      id: 'median', label: 'Median resolution', value: median, display: median ? median.toFixed(1) + 'h' : '—',
      note: 'Half are closed faster than this', rows: resolved, tone: 'purple', color: 'var(--purple)',
      icon: Clock3, chart: 'spark', delta: weekDelta(resolved), breakdown: byCategory, breakdownLabel: 'Closed by category',
      filter: {state: 'closed'},
    },
    {
      id: 'iris', label: 'Logged via Iris', value: irisShare, gauge: irisShare, format: (n) => Math.round(n) + '%',
      note: 'Share of tickets raised in chat', rows: viaIris, tone: 'amber', color: 'var(--amber)',
      icon: Sparkles, chart: 'gauge', delta: weekDelta(viaIris), breakdown: byStudio, breakdownLabel: 'Chat intake by studio',
      filter: {sources: ['iris']},
    },
  ];
}
