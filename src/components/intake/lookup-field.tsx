"use client";
import {useEffect, useMemo, useRef, useState} from 'react';
import {CalendarDays, Link2, Loader2, LockKeyhole, Search, UserRound, X, PencilLine, ArrowUpRight} from 'lucide-react';
import {Avatar} from '../ui';
import {indiaDate} from '@/lib/display';
import {decodeLookups, encodeLookup, encodeLookups, type LookupModule, type LookupRef} from '@/lib/intake/plan';

type Row = {id: string; label: string; sublabel?: string; raw?: Record<string, unknown>};
export type LookupStatus = 'idle' | 'live' | 'demo' | 'workspace' | 'auth' | 'error' | 'board';

const META: Record<LookupModule, {title: string; placeholder: string; icon: typeof UserRound}> = {
  member: {title: 'Find the member', placeholder: 'Search by name, email, phone or Momence ID…', icon: UserRound},
  session: {title: 'Find the class', placeholder: 'Search a class by name, coach or studio…', icon: CalendarDays},
  ticket: {title: 'Link a ticket', placeholder: 'Search by ticket number or title…', icon: Link2},
};

/** Debounced text → the rows the desk can pick from, plus where they came from. Momence rows
 *  come through the same /api/momence gate the rest of the workspace uses; nothing is invented
 *  when it is disconnected — demo rows are labelled as demo, and a signed-out desk is told to
 *  sign in rather than shown an empty list it cannot explain. */
function useLookupRows(module: LookupModule, q: string, open: boolean, opts: {studio?: string; when?: 'recent' | 'upcoming'; sessionTypes?: string[]}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [widened, setWidened] = useState(false);
  const sessionTypesKey = (opts.sessionTypes || []).join(',');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        if (module === 'ticket') {
          // Search server-side (`?q=` matches number, id or title) instead of downloading the
          // board; with nothing typed, the newest page stands in for "what's open right now".
          const s = q.trim();
          const res = await fetch(s ? `/api/tickets?q=${encodeURIComponent(s)}&limit=40` : '/api/tickets?limit=60', {cache: 'no-store', signal: controller.signal});
          if (res.status === 401 || res.status === 403) { setStatus('auth'); setRows([]); return; }
          if (!res.ok) throw new Error('lookup failed');
          const d = await res.json() as {tickets: {id: number; ticketNumber: string; title: string; subcategory: string; studio: string; status: string}[]};
          const pool = (s ? d.tickets : d.tickets.filter(t => !['resolved', 'closed', 'recorded'].includes(t.status))).slice(0, 40);
          setRows(pool.map(t => ({id: t.ticketNumber, label: `${t.ticketNumber} · ${t.title}`, sublabel: `${t.subcategory} · ${String(t.studio || '').split(',')[0]} · ${t.status.replaceAll('_', ' ')}`})));
          setStatus('board');
          return;
        }
        const params = new URLSearchParams({module: module === 'member' ? 'members' : 'sessions', q, page: '0', pageSize: module === 'session' ? '120' : '60'});
        if (module === 'session') {
          if (opts.studio) params.set('studio', opts.studio);
          for (const type of sessionTypesKey.split(',').filter(Boolean)) params.append('types[]', type);
          // A class starting in the next few minutes is one the desk is dealing with now, so
          // "recent" reaches slightly forward and "upcoming" slightly back.
          const grace = 15 * 60e3;
          if (opts.when === 'upcoming') params.set('startAfter', new Date(Date.now() - grace).toISOString()); else params.set('startBefore', new Date(Date.now() + grace).toISOString());
        }
        type Listing = {items: {id: string; name: string; subtitle: string; raw: Record<string, unknown>}[]; source: string};
        const read = async (p: URLSearchParams) => {
          const res = await fetch(`/api/momence?${p}`, {cache: 'no-store', signal: controller.signal});
          if (res.status === 401 || res.status === 403) return 'auth' as const;
          if (!res.ok) throw new Error('lookup failed');
          return await res.json() as Listing;
        };
        let d = await read(params);
        let widened = false;
        // A named class that is not in the chosen window is still the class the desk means:
        // widen to the whole schedule rather than answer "no match" for a class that exists.
        if (d !== 'auth' && module === 'session' && q.trim() && !d.items.length) {
          params.delete('startAfter'); params.delete('startBefore');
          const all = await read(params);
          if (all !== 'auth' && all.items.length) { d = all; widened = true; }
        }
        if (d === 'auth') { setStatus('auth'); setRows([]); return; }
        let items = d.items;
        if (module === 'session' && (opts.when === 'upcoming' || widened)) items = [...items].sort((a, b) => String(a.raw.startsAt).localeCompare(String(b.raw.startsAt)));
        setRows(items.map(r => ({
          id: r.id, label: r.name, raw: r.raw,
          sublabel: module === 'session' ? [r.subtitle, r.raw.startsAt ? indiaDate(r.raw.startsAt) : ''].filter(Boolean).join(' · ') : r.subtitle,
        })));
        setWidened(widened);
        setStatus(d.source === 'live' ? 'live' : d.source === 'workspace' ? 'workspace' : 'demo');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setRows([]); setStatus('error'); }
      } finally { setBusy(false); }
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [module, q, open, opts.studio, opts.when, sessionTypesKey]);
  return {rows, status, busy, widened};
}

export const STATUS_LINE: Record<LookupStatus, string> = {
  idle: 'Momence lookup', live: 'Live Momence records', demo: 'Demo data · connect Momence for live records', workspace: 'Workspace directory',
  auth: 'Sign in to search Momence — or type the details', error: 'Momence did not answer — type the details for now', board: 'Tickets on the board',
};

export function LookupField({module, value, onChange, studio, sessionTypes, multi = false, placeholder, allowManual = true, id, invalid, onPick, disabled}: {
  module: LookupModule;
  value: unknown;
  onChange: (encoded: string) => void;
  studio?: string;
  /** Momence session types to request, sent as repeated `types[]` query parameters. */
  sessionTypes?: string[];
  multi?: boolean;
  placeholder?: string;
  /** Lets the desk keep a typed name when there is no record to link — labelled as typed. */
  allowManual?: boolean;
  id?: string;
  invalid?: boolean;
  onPick?: (ref: LookupRef, raw?: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const meta = META[module];
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [when, setWhen] = useState<'recent' | 'upcoming'>('recent');
  const box = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => decodeLookups(value), [value]);
  const {rows, status, busy, widened} = useLookupRows(module, q, open, {studio, when, sessionTypes});

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const emit = (refs: LookupRef[]) => onChange(multi ? encodeLookups(refs) : refs.length ? encodeLookup(refs[0]) : '');
  const isChecked = (rid: string) => selected.some(s => String(s.id) === String(rid));
  const pick = (r: Row) => {
    const ref: LookupRef = {id: r.id, label: r.label, sublabel: module === 'member' ? String(r.raw?.email || '') : r.sublabel};
    onPick?.(ref, r.raw);
    if (!multi) { emit([ref]); setOpen(false); setQ(''); return; }
    emit(isChecked(r.id) ? selected.filter(s => String(s.id) !== String(r.id)) : [...selected, ref]);
  };
  const keepTyped = () => {
    const text = q.trim(); if (!text) return;
    const ref: LookupRef = {id: text, label: text, manual: true};
    onPick?.(ref);
    emit(multi ? [...selected, ref] : [ref]); setOpen(false); setQ('');
  };
  const remove = (rid: string) => emit(selected.filter(s => String(s.id) !== String(rid)));
  const manualRow = allowManual && q.trim().length > 1;
  const total = rows.length + (manualRow ? 1 : 0);

  const keys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // The popover is the only thing Escape closes here: the form behind it must survive,
      // and a dialog above it must not hear the key.
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(total - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[cursor]) pick(rows[cursor]); else if (manualRow && cursor === rows.length) keepTyped(); }
  };
  const Icon = meta.icon;

  return (
    <div className={'lk' + (open ? ' lk-open' : '') + (selected.length ? ' lk-filled' : '') + (invalid ? ' lk-invalid' : '')} ref={box} data-module={module}>
      {selected.length > 0 && (
        <div className="lk-chips">
          {selected.map(s => (
            <span className={'lk-chip' + (s.manual ? ' typed' : '')} key={s.id}>
              {module === 'member' && !s.manual ? <Avatar name={s.label} /> : <span className="lk-mark">{s.manual ? <PencilLine size={12} /> : <Icon size={13} />}</span>}
              <span className="lk-chip-text"><b>{s.label}</b>{s.sublabel && <em>{s.sublabel}</em>}</span>
              <span className="lk-chip-id mono">{s.manual ? 'typed · not linked' : '#' + s.id}</span>
              {!disabled && <button type="button" aria-label={'Remove ' + s.label} onClick={() => remove(s.id)}><X size={12} /></button>}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="lk-bar">
          <Search size={13} className="muted" />
          <input id={id} value={q} aria-label={meta.title} aria-invalid={invalid || undefined}
            placeholder={selected.length && !multi ? 'Change selection…' : placeholder || meta.placeholder}
            onChange={e => { setQ(e.target.value); setOpen(true); setCursor(0); }}
            onFocus={() => setOpen(true)} onKeyDown={keys} autoComplete="off" />
          {busy ? <Loader2 size={13} className="muted animate-spin" /> : null}
          {module === 'session' && (
            <span className="lk-scope" role="group" aria-label="Which classes to search">
              <button type="button" className={when === 'recent' ? 'on' : ''} onClick={() => { setWhen('recent'); setOpen(true); }}>Recent</button>
              <button type="button" className={when === 'upcoming' ? 'on' : ''} onClick={() => { setWhen('upcoming'); setOpen(true); }}>Upcoming</button>
            </span>
          )}
        </div>
      )}
      {open && !disabled && (
        <div className="lk-pop" role="listbox" aria-label={meta.title}>
          {status === 'auth' && (
            <div className="lk-note"><LockKeyhole size={13} /> Sign in to your workspace account to search {module === 'ticket' ? 'the board' : 'Momence'}.{allowManual ? ' You can still type the details below.' : ''}</div>
          )}
          {!rows.length && !busy && status !== 'auth' && (
            <div className="lk-empty">{q.trim() ? 'No match — keep typing' + (allowManual ? ', or keep what you typed.' : '.') : module === 'session' ? `No ${when} classes${studio ? ' at ' + studio.split(',')[0] : ''}.` : 'Start typing to search.'}</div>
          )}
          {rows.map((r, i) => (
            <button type="button" key={r.id} role="option" aria-selected={isChecked(r.id)} className={'lk-row' + (i === cursor ? ' cur' : '') + (isChecked(r.id) ? ' on' : '')}
              onMouseEnter={() => setCursor(i)} onClick={() => pick(r)}>
              {module === 'member' ? <Avatar name={r.label} /> : <span className="lk-mark"><Icon size={14} /></span>}
              <span className="lk-txt"><b>{r.label}</b>{r.sublabel && <em>{r.sublabel}</em>}</span>
              <span className="lk-id mono">{module === 'ticket' ? '' : '#' + r.id}</span>
            </button>
          ))}
          {manualRow && (
            <button type="button" role="option" aria-selected={false} className={'lk-row lk-manual' + (cursor === rows.length ? ' cur' : '')} onMouseEnter={() => setCursor(rows.length)} onClick={keepTyped}>
              <span className="lk-mark"><PencilLine size={14} /></span>
              <span className="lk-txt"><b>Keep “{q.trim()}” as typed</b><em>Not linked to a {module === 'ticket' ? 'ticket' : 'Momence record'} — the owner will see it was typed by hand.</em></span>
            </button>
          )}
          <div className="lk-foot">
            <span className={'lk-src ' + status}><i />{STATUS_LINE[status]}{widened ? ` · nothing ${when} matched, showing the whole schedule` : ''}</span>
            <span>{rows.length} shown · ↑↓ Enter</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** A compact read-back chip for a lookup answer, used by the aside and the review sheet. */
export function LookupChip({module, value, onOpen}: {module: LookupModule; value: unknown; onOpen?: (ref: LookupRef) => void}) {
  const refs = decodeLookups(value);
  if (!refs.length) return null;
  const Icon = META[module].icon;
  return <>{refs.map(r => (
    <span className={'lk-chip mini' + (r.manual ? ' typed' : '')} key={r.id}>
      <span className="lk-mark">{r.manual ? <PencilLine size={11} /> : <Icon size={11} />}</span>
      <b>{r.label}</b>
      {!r.manual && <span className="lk-chip-id mono">#{r.id}</span>}
      {r.manual && <span className="lk-chip-id mono">typed</span>}
      {onOpen && !r.manual && <button type="button" aria-label={'Open ' + r.label} onClick={() => onOpen(r)}><ArrowUpRight size={11} /></button>}
    </span>
  ))}</>;
}
