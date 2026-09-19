"use client";

import {useEffect, useMemo, useState} from 'react';
import {Activity, Database, GitCommitHorizontal, Radio, Timer} from 'lucide-react';
import {isClosed, slaBucketOf} from '@/lib/ticket-filtering';
import type {TicketListRecord} from '@/lib/ticket-contract';

/**
 * The readout strip above the cards.
 *
 * The cards answer "how many"; this answers "what is the state of the system right now" —
 * throughput, the backlog's oldest item, load spread across studios, and whether the board
 * in front of you is the whole log or a filtered slice of it. It is deliberately dense and
 * monospaced: this is the row you scan, not the row you read.
 */

const DAY = 86400000;

/** Seven bars of daily volume — a shape, not a chart, so it fits on one line. */
function VolumeBars({tickets, nowMs}: {tickets: TicketListRecord[]; nowMs: number}) {
  const counts = useMemo(() => Array.from({length: 14}, (_, i) =>
    tickets.filter((t) => Math.floor((nowMs - new Date(t.createdAt).getTime()) / DAY) === 13 - i).length),
  [tickets, nowMs]);
  const max = Math.max(1, ...counts);
  return (
    <span className="bt-bars" aria-hidden="true">
      {counts.map((n, i) => (
        <span key={i} className="bt-bar" style={{height: `${Math.max(8, (n / max) * 100)}%`, opacity: 0.35 + (i / 13) * 0.65}}/>
      ))}
    </span>
  );
}

function Readout({icon: Icon, label, value, sub}: {icon: typeof Activity; label: string; value: string; sub?: string}) {
  return (
    <div className="bt-readout">
      <span className="bt-icon"><Icon size={12}/></span>
      <span className="bt-text">
        <span className="bt-label">{label}</span>
        <strong className="bt-value">{value}</strong>
        {sub && <span className="bt-sub">{sub}</span>}
      </span>
    </div>
  );
}

export function BoardTelemetry({tickets, total, staleDays = 3}: {
  tickets: TicketListRecord[]; total: number; staleDays?: number;
}) {
  // A live clock is the cheapest honest signal that the panel is reading current data.
  // It doubles as the clock the age calculations below read, so "now" is a value that
  // changes between renders rather than a call made during one.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const now = nowMs ? new Date(nowMs).toLocaleTimeString('en-GB', {hour12: false}) : '';

  const stats = useMemo(() => {
    // Falls back to the render-time clock only until the first tick lands.
    const ref = nowMs || Date.parse(tickets[0]?.createdAt ?? '') || 0;
    const open = tickets.filter((t) => !isClosed(t));
    const last7 = tickets.filter((t) => ref - new Date(t.createdAt).getTime() < 7 * DAY);
    const closedLast7 = tickets.filter((t) => t.resolvedAt && ref - new Date(t.resolvedAt).getTime() < 7 * DAY);
    const oldestOpen = open.reduce<TicketListRecord | null>(
      (acc, t) => (!acc || new Date(t.createdAt) < new Date(acc.createdAt) ? t : acc), null);
    const oldestDays = oldestOpen ? Math.floor((ref - new Date(oldestOpen.createdAt).getTime()) / DAY) : 0;
    const studios = new Set(tickets.map((t) => t.studio).filter(Boolean)).size;
    const owners = new Set(open.map((t) => t.assignedStaffName).filter(Boolean)).size;
    const stale = open.filter((t) => ref - new Date(t.createdAt).getTime() > staleDays * DAY).length;
    const overdue = tickets.filter((t) => slaBucketOf(t) === 'breached').length;
    // Net flow: more closed than opened in the last week is a backlog going down.
    const net = closedLast7.length - last7.length;
    return {open, last7, closedLast7, oldestOpen, oldestDays, studios, owners, stale, overdue, net};
  }, [tickets, staleDays, nowMs]);

  const filtered = tickets.length !== total;
  const clearance = stats.last7.length ? Math.round((stats.closedLast7.length / stats.last7.length) * 100) : 100;

  return (
    <section className="board-telemetry" aria-label="Board telemetry">
      <div className="bt-head">
        <span className="bt-live">
          <Radio size={11}/>
          <span className="bt-pulse" aria-hidden="true"/>
          LIVE
        </span>
        <span className="bt-scope">
          {filtered
            ? <>SCOPE <strong>{tickets.length}</strong> / {total} records</>
            : <>SCOPE <strong>{total}</strong> records</>}
        </span>
        <span className="bt-clock mono">{now}</span>
      </div>

      <div className="bt-readouts">
        <Readout icon={Activity} label="INTAKE · 7D" value={String(stats.last7.length)} sub={`${stats.closedLast7.length} closed`}/>
        <Readout
          icon={GitCommitHorizontal}
          label="NET FLOW"
          value={`${stats.net > 0 ? '−' : stats.net < 0 ? '+' : '±'}${Math.abs(stats.net)}`}
          sub={stats.net > 0 ? 'backlog falling' : stats.net < 0 ? 'backlog rising' : 'steady'}
        />
        <Readout icon={Timer} label="OLDEST OPEN" value={stats.oldestOpen ? `${stats.oldestDays}d` : '—'} sub={stats.oldestOpen ? stats.oldestOpen.ticketNumber : 'queue empty'}/>
        <Readout icon={Database} label="CLEARANCE" value={`${clearance}%`} sub="closed vs logged, 7d"/>

        <div className="bt-volume">
          <span className="bt-label">VOLUME · 14D</span>
          <VolumeBars tickets={tickets} nowMs={nowMs}/>
        </div>

        <div className="bt-chips">
          <span className={'bt-chip' + (stats.overdue ? ' bt-chip-alert' : '')}>{stats.overdue} overdue</span>
          <span className={'bt-chip' + (stats.stale ? ' bt-chip-warn' : '')}>{stats.stale} ageing</span>
          <span className="bt-chip">{stats.owners} owners</span>
          <span className="bt-chip">{stats.studios} studios</span>
        </div>
      </div>
    </section>
  );
}
