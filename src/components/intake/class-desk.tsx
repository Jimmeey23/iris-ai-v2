"use client";
import {useEffect, useMemo, useState} from 'react';
import {AlertTriangle, ArrowLeft, CalendarDays, Check, ChevronDown, Ghost, Loader2, LockKeyhole, Search, Sparkles, Zap} from 'lucide-react';
import {Avatar, Badge, useApp} from '../ui';
import {object} from '@/lib/display';
import {decodeLookups, fieldOptions, type IntakeData, type IntakeValue} from '@/lib/intake/plan';
import {ATT_ACTION, ATT_STATUS, CLASS_CAPTURE, CLASS_SUB_CANDIDATES, classDeskAnswers, flaggedEntry, rosterRows, sessionSnapshot, sessionStats, type RosterEntry, type SessionDetail} from '@/lib/intake/class-desk';
import {LookupField} from './lookup-field';
import {OptionSelect} from './option-select';
import type {IntakeTaxonomy} from './types';

export type ClassDeskResult = {category: string; sub: string; answers: IntakeData; detail: SessionDetail; entries: Record<string, RosterEntry>};

const FILTERS: [string, string][] = [['all', 'everyone'], ['attended', 'attended'], ['no-show', 'no-shows'], ['waitlist', 'waitlist'], ['cancelled', 'cancelled'], ['first-timer', 'first-timers'], ['incompatible', 'not compatible'], ['guest', 'guests']];
const fmtWhen = (iso?: string) => iso ? new Date(iso).toLocaleString('en-IN', {weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'}) : '';

export function ClassDesk({taxonomy, onBack, onBuild}: {taxonomy: IntakeTaxonomy; onBack: () => void; onBuild: (r: ClassDeskResult) => void}) {
  const {openAuth} = useApp();
  const [ref, setRef] = useState('');
  // What was read for which session; anything for a different id is stale and treated as loading.
  const [read, setRead] = useState<{id: string; detail: SessionDetail | null; state: 'auth' | 'error' | 'ready'}>();
  const [captured, setCaptured] = useState<IntakeData>({});
  const [entries, setEntries] = useState<Record<string, RosterEntry>>({});
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const sessionId = decodeLookups(ref).find(r => !r.manual)?.id;
  const subOptions = useMemo(() => CLASS_SUB_CANDIDATES.filter(([c, s]) => taxonomy.categories.find(x => x.name === c)?.subs.some(y => y.name === s)), [taxonomy]);
  const [chosenSub, setSubKey] = useState('');
  const subKey = chosenSub || (subOptions[0]?.join('|||') ?? '');

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    fetch(`/api/momence?module=sessions&id=${encodeURIComponent(sessionId)}`, {cache: 'no-store'}).then(async res => {
      if (cancelled) return;
      if (res.status === 401 || res.status === 403) { setRead({id: sessionId, detail: null, state: 'auth'}); return; }
      if (!res.ok) { setRead({id: sessionId, detail: null, state: 'error'}); return; }
      const d = await res.json() as SessionDetail;
      if (cancelled) return;
      setRead({id: sessionId, detail: d, state: 'ready'}); setEntries({});
    }).catch(() => { if (!cancelled) setRead({id: sessionId, detail: null, state: 'error'}); });
    return () => { cancelled = true; };
  }, [sessionId]);
  const current = sessionId && read?.id === sessionId ? read : undefined;
  const detail = current?.detail ?? null;
  const state: 'idle' | 'loading' | 'auth' | 'error' | 'ready' = !sessionId ? 'idle' : !current ? 'loading' : current.state;

  const rows = useMemo(() => detail ? rosterRows(detail) : [], [detail]);
  const stats = useMemo(() => detail ? sessionStats(detail, rows) : null, [detail, rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'attended') return r.checkedIn && !r.cancelled;
      if (filter === 'no-show') return !r.checkedIn && !r.cancelled && !r.waitlist && stats?.started;
      if (filter === 'waitlist') return r.waitlist;
      if (filter === 'cancelled') return r.cancelled;
      if (filter === 'first-timer') return r.firstTimer;
      if (filter === 'incompatible') return r.compatible === false;
      if (filter === 'guest') return r.guest;
      return true;
    }).filter(r => !s || `${r.name} ${r.memberId || ''} ${r.email || ''}`.toLowerCase().includes(s));
  }, [rows, filter, q, stats]);
  const flagged = rows.filter(r => flaggedEntry(entries[r.bookingId]));
  const setRow = (id: string, patch: RosterEntry) => setEntries(e => ({...e, [id]: {...(e[id] || {}), ...patch}}));
  const toggleAction = (id: string, a: string) => setEntries(e => { const cur = e[id]?.actions || []; return {...e, [id]: {...(e[id] || {}), actions: cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]}}; });
  const set = (k: string, v: IntakeValue) => setCaptured(c => ({...c, [k]: v}));
  const raw = detail ? detail.item.raw : {};
  const teacher = object(raw.teacher);
  const teacherName = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || String(teacher.name || '') || '—';
  const location = object(raw.inPersonLocation);

  const build = () => {
    if (!detail || !subKey) return;
    const [category, sub] = subKey.split('|||');
    onBuild({category, sub, answers: classDeskAnswers(detail, captured, entries, taxonomy.studios, rows), detail, entries});
  };

  return (
    <div className="intake-step rise classdesk">
      <div className="intake-step-head">
        <div>
          <div className="intake-back-row"><button type="button" className="text-btn intake-back" onClick={onBack}><ArrowLeft size={13} /> Back to categories</button></div>
          <div className="eyebrow">Class desk</div>
          <h2>Start from the class</h2>
          <p>Hosted-class tickets begin with the session, never with a blank form. Pick it out of Momence; the roll, capacity, waitlist and coach come with it.</p>
        </div>
      </div>

      <section className="intake-section">
        <div className="intake-section-head static"><span className="step-number">01</span><span className="intake-section-title"><h3>Which class</h3><small>Search by class name, coach or studio · recent by default, or switch to upcoming</small></span></div>
        <div className="intake-section-body">
          <LookupField module="session" value={ref} onChange={setRef} allowManual={false} placeholder="Search a class by name, coach, studio or Momence id…" />
          {state === 'auth' && <div className="info-box warning" style={{marginTop: 12}}><LockKeyhole size={14} /><span>Sign in to your workspace account to read the roll from Momence. <button type="button" className="text-btn" onClick={openAuth}>Sign in</button></span></div>}
          {state === 'error' && <div className="error-box" style={{marginTop: 12}}>Momence did not return that session. Try again, or file the ticket from the form and type the class in.</div>}
          {state === 'idle' && <p className="muted" style={{fontSize: 12, marginTop: 12}}>Everything below fills itself from the session: nothing here is typed twice.</p>}
          {state === 'loading' && <p className="muted flex-row" style={{fontSize: 12, marginTop: 12}}><Loader2 size={13} className="animate-spin" /> Reading the session and its bookings…</p>}
        </div>
      </section>

      {detail && stats && (
        <>
          <section className="intake-section">
            <div className="intake-section-head static"><span className="step-number">02</span><span className="intake-section-title"><h3>The class as Momence sees it</h3><small>{detail.source === 'demo' ? 'Demo session · connect Momence for the live roll' : 'Live Momence record'}</small></span>
              <Badge tone={raw.isCancelled ? 'red' : 'green'}>{raw.isCancelled ? 'Cancelled in Momence' : 'Scheduled'}</Badge><span className="tag">session #{detail.item.id}</span></div>
            <div className="intake-section-body">
              <div className="cd-head">
                <div><h3 style={{fontSize: 18}}>{detail.item.name}</h3><p className="secondary" style={{fontSize: 12}}>{fmtWhen(String(raw.startsAt || '')) || 'time not recorded'}{raw.durationInMinutes ? ` · ${String(raw.durationInMinutes)} min` : ''}{location.name ? ` · ${String(location.name)}` : ''}</p></div>
                <div className="cd-coach"><Avatar name={teacherName} tone="purple" /><span><small>coached by</small><b>{teacherName}</b></span>{raw.originalTeacher ? <Badge tone="amber">guest stand-in</Badge> : null}</div>
              </div>
              <div className="cd-stats">
                {([['capacity', stats.capacity], ['booked', stats.booked], ['attended', stats.attended], ['no-shows', stats.absent == null ? (stats.started ? 0 : 'pending') : stats.absent], ['cancelled', stats.cancelled], ['waitlist', stats.waitlist], ['guests', stats.guests], ['first-timers', stats.firstTimers], ['not compatible', stats.incompatible], ['fill', stats.fillPct != null ? stats.fillPct + '%' : null], ['over book', stats.overbook]] as [string, unknown][])
                  .filter(([, v]) => v != null).map(([k, v]) => <div key={k} className={'cd-stat' + (/not compatible|over book|no-shows/.test(k) && Number(v) > 0 ? ' warn' : '')}><b className="mono">{String(v)}</b><span>{k}</span></div>)}
              </div>
              {stats.incompatible > 0 && <div className="info-box warning" style={{marginTop: 12}}><AlertTriangle size={14} /><span>{stats.incompatible} attendee{stats.incompatible > 1 ? 's were' : ' was'} flagged by Momence as unable to pay with an active membership — see the roll below.</span></div>}
              <div className="cd-grid">
                {CLASS_CAPTURE.map(c => <div className="field" key={c.id}><label><span>{c.label}</span></label><OptionSelect options={fieldOptions(c.id)} value={captured[c.id]} onChange={v => set(c.id, v)} multi={c.multi} /></div>)}
                <div className="field wide"><label><span>Notes on the host / coach</span><textarea rows={2} value={String(captured.class_host_notes || '')} placeholder="Held the stretch block, explained the corrections, kept the pace for the beginners…" onChange={e => set('class_host_notes', e.target.value)} /></label></div>
                <div className="field"><label><span>Notes on the audience</span><textarea rows={2} value={String(captured.class_audience_notes || '')} placeholder="Six first-timers; two were standing because the mats ran out…" onChange={e => set('class_audience_notes', e.target.value)} /></label></div>
                <div className="field"><label><span>Notes on membership compatibility</span><textarea rows={2} value={String(captured.class_compatibility_notes || '')} placeholder="Three class-pack members were blocked by the usage limit…" onChange={e => set('class_compatibility_notes', e.target.value)} /></label></div>
              </div>
            </div>
          </section>

          <section className="intake-section">
            <div className="intake-section-head static"><span className="step-number">03</span><span className="intake-section-title"><h3>The roll — status, note and what was offered, per attendee</h3><small>{rows.length} bookings read from Momence{flagged.length ? ` · ${flagged.length} flagged` : ''}</small></span>{flagged.length > 0 && <Badge tone="amber">{flagged.length} will ride along</Badge>}</div>
            <div className="intake-section-body">
              <div className="cd-roster-bar">
                <div className="cd-filters">{FILTERS.map(([k, lab]) => <button type="button" key={k} className={'intake-chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)}>{lab}</button>)}</div>
                <div className="search-input intake-search"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an attendee by name, ID, email…" aria-label="Find an attendee" /></div>
              </div>
              <div className="cd-rows">
                {!shown.length && <p className="muted" style={{fontSize: 12}}>No attendee on this filter.</p>}
                {shown.map(r => {
                  const e = entries[r.bookingId] || {};
                  const open = expanded === r.bookingId;
                  return (
                    <div className={'cd-row' + (flaggedEntry(e) ? ' flagged' : '')} key={r.bookingId}>
                      <div className="cd-row-main">
                        <Avatar name={r.name} />
                        <span className="cd-row-name"><b>{r.name}</b><em className="mono">{r.guest ? 'walk-in guest' : `#${r.memberId}`}{r.credits != null ? ` · ${r.credits} credit${r.credits === 1 ? '' : 's'}` : ''}{r.firstTimer ? ' · first-timer' : ''}</em></span>
                        <span className={'badge ' + (r.cancelled ? 'red' : r.waitlist ? '' : r.compatible === false ? 'amber' : r.checkedIn ? 'green' : 'blue')}>{r.cancelled ? 'cancelled' : r.waitlist ? 'waitlist' : r.compatible === false ? 'not compatible' : r.checkedIn ? 'checked in' : 'booked'}</span>
                        <select value={e.status || ''} onChange={ev => setRow(r.bookingId, {status: ev.target.value})} aria-label={'Status for ' + r.name}><option value="">status…</option>{ATT_STATUS.map(o => <option key={o}>{o}</option>)}</select>
                        <button type="button" className={'icon-btn' + (open ? ' active' : '')} aria-label="Note and actions" aria-expanded={open} onClick={() => setExpanded(open ? null : r.bookingId)}><ChevronDown size={14} /></button>
                      </div>
                      {open && (
                        <div className="cd-row-extra">
                          <div className="intake-chips">{ATT_ACTION.map(a => <button type="button" key={a} className={'intake-chip' + ((e.actions || []).includes(a) ? ' on' : '')} onClick={() => toggleAction(r.bookingId, a)}>{(e.actions || []).includes(a) && <Check size={10} />}{a}</button>)}</div>
                          <textarea rows={2} value={e.note || ''} placeholder={`What ${r.name.split(' ')[0]} said, what the desk promised…`} onChange={ev => setRow(r.bookingId, {note: ev.target.value})} />
                          {!r.guest && <div className="flex-row wrap" style={{gap: 6}}>
                            <button type="button" className="btn btn-sm" onClick={() => setRow(r.bookingId, {status: 'Attended', actions: [...new Set([...(e.actions || []), 'Manual check-in in Momence'])]})}><Check size={12} /> checked in — stamp it</button>
                            <button type="button" className="btn btn-sm" onClick={() => setRow(r.bookingId, {status: 'No-show', actions: [...new Set([...(e.actions || []), 'Class credit granted'])]})}><Ghost size={12} /> no-show → grant a credit</button>
                          </div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="cd-foot">
            <label className="cd-route"><span className="muted" style={{fontSize: 11}}>route this to</span>
              <select value={subKey} onChange={e => setSubKey(e.target.value)}>{subOptions.map(([c, s]) => <option key={c + s} value={`${c}|||${s}`}>{c} › {s}</option>)}</select></label>
            <button type="button" className="btn btn-primary" onClick={build} disabled={!subKey}><Zap size={14} /> Build the ticket from this class</button>
            <span className="muted" style={{fontSize: 11}}>{flagged.length ? `${flagged.length} attendee note${flagged.length > 1 ? 's' : ''} will ride along` : 'no attendee notes yet — the class-level answers are enough'}</span>
          </div>
          {sessionSnapshot(detail, entries, rows).attendees?.length ? <p className="muted flex-row" style={{fontSize: 11}}><Sparkles size={11} /> The first flagged member becomes the ticket’s member; change it on the form if it should be someone else.</p> : null}
        </>
      )}
      {!detail && state === 'idle' && <div className="cd-empty"><CalendarDays size={22} /><p>Pick a session above to see its roll and build a ticket around it.</p></div>}
    </div>
  );
}
