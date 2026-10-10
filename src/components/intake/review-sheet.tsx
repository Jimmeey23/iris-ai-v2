"use client";
import {useMemo, useState} from 'react';
import {AlertTriangle, ArrowRight, Check, Clock3, Loader2, Zap} from 'lucide-react';
import {Avatar, Badge, Modal, Priority} from '../ui';
import {decodeLookups, orderSections, filled, visibleFields, type ClassSnapshot, type Gate, type IntakeData, type IntakeField} from '@/lib/intake/plan';
import {LookupChip} from './lookup-field';
import type {IntakePlan} from './types';
import {hostedRowMissing, hostedSummary, type HostedRow} from './hosted-roster';
import {indiaDate} from '@/lib/display';

const display = (f: IntakeField, v: unknown) => {
  if (f.type === 'lookup') return decodeLookups(v).map(r => r.label).join(', ') || '—';
  if (Array.isArray(v)) return v.join(' · ');
  if (f.type === 'datetime' && typeof v === 'string' && v) { const d = new Date(v); return Number.isFinite(d.getTime()) ? indiaDate(v) : v; }
  return v == null || v === '' ? '—' : String(v);
};

export function ReviewSheet({open, onClose, plan, data, kind, priority, slaHours, recordOnly, missing, gating, onFix, onFile, busy, error, classSnapshot, titlePreview = '', involvedTeams = [], hostedRows}: {
  open: boolean; onClose: () => void; plan: IntakePlan; data: IntakeData; kind: string; priority: string; slaHours: number; recordOnly: boolean;
  missing: IntakeField[]; gating: Gate[]; onFix: (id: string) => void; onFile: () => void; busy: boolean; error: string; classSnapshot?: ClassSnapshot | null;
  /** What the server's labeller is likely to write when no title was typed. */
  titlePreview?: string;
  /** Names of the teams that will co-own the ticket beside the lead owner. */
  involvedTeams?: string[];
  /** The hosted-class roster, on hosted-class tickets. */
  hostedRows?: HostedRow[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => visibleFields(plan.fields, data), [plan.fields, data]);
  const answered = visible.filter(f => filled(data[f.id]));
  const shown = showAll ? answered : answered.filter(f => !['title', 'summary', 'requested_outcome'].includes(f.id));
  const groups = orderSections(shown.map(f => f.section)).map(s => ({name: s, fields: shown.filter(f => f.section === s)}));
  const blockers = [...missing.map(f => ({id: f.id, label: f.label, reason: 'required for this sub-category'})), ...gating];
  const lookups = answered.filter(f => f.type === 'lookup');
  const owner = plan.routing?.owner;
  const studio = String(data.studio || '').split(',')[0];
  return (
    <Modal open={open} onClose={onClose} size="wide" title="Read it back before it routes" resetKey={String(open)}
      description={`${plan.sub.category} › ${plan.sub.name} · once filed, ${owner ? owner.name : (plan.routing?.departmentName || 'the department')} owns the clock${recordOnly ? '' : ' and the SLA starts'}.`}
      footer={<>
        <span className="muted" style={{fontSize: 11.5}}>{blockers.length ? <span className="intake-blocker-count"><AlertTriangle size={12} /> {blockers.length} blocker{blockers.length > 1 ? 's' : ''} to clear</span> : <span className="flex-row" style={{gap: 6}}><Check size={13} className="accent" /> Nothing missing — ready for the desk</span>}</span>
        <div className="flex-row" style={{gap: 8}}>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Keep editing</button>
          <button type="button" className="btn btn-primary" onClick={onFile} disabled={busy || blockers.length > 0}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}{recordOnly ? 'File as a record' : 'File & start SLA'}</button>
        </div>
      </>}>
      <div className="review">
        <div className="rv-head">
          <div>
            <div className="eyebrow">{plan.sub.category}</div>
            {String(data.title || '').trim()
              ? <h3>{String(data.title)}</h3>
              : <h3 title="No title typed: Iris writes a descriptive one from the description when it files">{titlePreview || 'Title will be generated from the description'}<small className="muted" style={{display: 'block', fontSize: 10.5, fontWeight: 500, marginTop: 2}}>Title generated on filing{titlePreview ? ' · preview' : ''}</small></h3>}
            <p className="secondary">{String(data.summary || '') || 'No summary written.'}</p>
          </div>
          <div className="rv-prio">
            <Badge tone="blue">{kind}</Badge>
            <Priority priority={priority} />
            <Badge tone={recordOnly ? 'green' : 'amber'}><Clock3 size={10} />{recordOnly ? 'Record only · no SLA' : `${slaHours}h follow-up target`}</Badge>
          </div>
        </div>
        <div className="rv-route">
          <div className="rv-step"><Avatar name={plan.routing?.departmentName || 'Ops'} tone="blue" /><div><b>{plan.routing?.departmentName || 'Department queue'}</b><span>department</span></div></div>
          <ArrowRight size={14} className="muted" />
          <div className="rv-step">{owner ? <Avatar name={owner.name} tone="purple" /> : <Avatar name="" emptyDark />}<div><b>{owner ? owner.name : 'Department queue'}</b><span>{owner ? owner.role : 'picked up on arrival'}</span></div></div>
          <div className="rv-dest"><span className="muted" style={{fontSize: 10}}>goes to</span><b>{studio || 'studio not chosen'}</b>{filled(data.area) && <span> · {String(data.area)}</span>}</div>
          {involvedTeams.length > 0 && <div className="rv-teams"><span>Also involves</span>{involvedTeams.map(t => <b key={t}>{t}</b>)}<span>· each team gets a co-owner</span></div>}
        </div>
        {hostedRows && (() => {
          const s = hostedSummary(hostedRows);
          return (
            <div className="rv-class rv-hosted">
              <div className="between"><h4>Attendees · {hostedRows.length} row{hostedRows.length === 1 ? '' : 's'}</h4><span className="tag">{s.attended} attended · {s.walkIns} walk-in{s.walkIns === 1 ? '' : 's'} · {s.warm} warm lead{s.warm === 1 ? '' : 's'}</span></div>
              {hostedRows.length ? <div className="rv-att">{hostedRows.map(r => {
                const needs = hostedRowMissing(r);
                return <div className="rv-att-row" key={r.key}><b>{r.name || 'Unnamed attendee'}</b><span>{r.attendance || '—'}</span><span>{r.outcome || '—'}</span>{r.followUp && <em>{r.followUp}</em>}{needs.length > 0 && <span className="need">needs {needs.join(', ')}</span>}{r.note.trim() && <small>{r.note}</small>}</div>;
              })}</div> : <p className="muted" style={{fontSize: 11.5}}>No attendees recorded yet. At least one row is required.</p>}
            </div>
          );
        })()}
        {classSnapshot && (
          <div className="rv-class">
            <div className="between"><h4>Class & roll call · read back from Momence</h4><span className="tag">session #{classSnapshot.sessionId}</span></div>
            <div className="cd-stats sm">
              {([['capacity', classSnapshot.capacity], ['booked', classSnapshot.booked], ['attended', classSnapshot.attended], ['absent', classSnapshot.absent], ['waitlist', classSnapshot.waitlist], ['guests', classSnapshot.guests], ['first-timers', classSnapshot.firstTimers], ['over book', classSnapshot.overbook]] as [string, unknown][])
                .filter(([, v]) => v != null && v !== 0).map(([k, v]) => <div key={k} className={'cd-stat' + (/over book/.test(k) && Number(v) > 0 ? ' warn' : '')}><b className="mono">{String(v)}</b><span>{k}</span></div>)}
            </div>
            <p className="muted" style={{fontSize: 11}}>{classSnapshot.name}{classSnapshot.studio ? ` · ${classSnapshot.studio}` : ''} · coached by {classSnapshot.trainer || '—'}{classSnapshot.fillPct != null ? ` · ${classSnapshot.fillPct}% full` : ''}{classSnapshot.attendees?.length ? ` · ${classSnapshot.attendees.length} attendee note${classSnapshot.attendees.length > 1 ? 's' : ''} attached` : ''}</p>
            {(classSnapshot.attendees || []).length > 0 && <div className="rv-att">{classSnapshot.attendees!.map(a => <div className="rv-att-row" key={a.id}><b>{a.name}</b><span>{a.status || 'no status'}</span>{(a.actions || []).length > 0 && <em>{a.actions!.join(', ')}</em>}{a.note && <small>{a.note}</small>}</div>)}</div>}
          </div>
        )}
        {lookups.length > 0 && <div className="rv-links"><span className="eyebrow">Linked records</span>{lookups.map(f => <LookupChip key={f.id} module={f.module || 'member'} value={data[f.id]} />)}</div>}
        <div className="rv-cols">
          {groups.map(g => <div className="rv-sec" key={g.name}><h5>{g.name}</h5>{g.fields.map(f => <div className="rv-row" key={f.id}><span>{f.label}</span><b>{display(f, data[f.id])}</b></div>)}</div>)}
        </div>
        <div className="rv-foot">
          <button type="button" className="btn btn-sm" onClick={() => setShowAll(s => !s)}>{showAll ? 'Hide the write-up' : `Show all ${answered.length} answered fields`}</button>
          <span className="muted mono" style={{fontSize: 10}}>{answered.length} answers · {lookups.length} linked record{lookups.length === 1 ? '' : 's'}</span>
        </div>
        {blockers.length > 0 && (
          <div className="rv-block">
            <b><AlertTriangle size={13} /> Still needed</b>
            {blockers.map(b => <button type="button" key={b.id} onClick={() => onFix(b.id)}><span>{b.label}</span><em>{b.reason}</em></button>)}
          </div>
        )}
        {error && <div className="error-box" style={{marginTop: 14}}>{error}</div>}
      </div>
    </Modal>
  );
}
