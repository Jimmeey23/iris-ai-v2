"use client";
import {useMemo, useState, type ReactNode} from 'react';
import {Building2, CalendarDays, Check, ChevronDown, GitBranch, LockKeyhole, Minus, Plus, Sparkles, UserRound, UsersRound, Wrench, X} from 'lucide-react';
import {studioAreasFor} from '@/lib/constants';
import {ENRICH_SECTIONS, SECTION_ORDER, filled, isVisible, localDateTime, type IntakeData, type IntakeField, type IntakeValue, type LookupRef} from '@/lib/intake/plan';
import {LookupField} from './lookup-field';

export type Patch = (id: string, value: IntakeValue) => void;

const WIDE = new Set(['title', 'summary', 'requested_outcome']);
const isWide = (f: IntakeField) => WIDE.has(f.id) || f.type === 'textarea' || f.type === 'lookup' || f.type === 'multiselect' || (f.options?.length || 0) > 14;
/** Short lists answer as chips; longer ones as a native select so the grid stays aligned. */
const asChips = (f: IntakeField, options: string[]) => f.type === 'radio' || (f.type === 'select' && options.length <= 5);
/** Backdating shortcuts for a datetime answer — the desk rarely knows the exact minute. */
const DATE_PRESETS: {label: string; hint: string; make: () => Date}[] = [
  {label: 'just now', hint: 'Stamp this exact minute', make: () => new Date()},
  {label: '1 hour ago', hint: 'Backdate by an hour', make: () => new Date(Date.now() - 3600e3)},
  {label: 'yesterday', hint: 'Backdate by a day', make: () => new Date(Date.now() - 864e5)},
];
const readBack = (v: string) => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString('en-IN', {dateStyle: 'medium', timeStyle: 'short'}) : ''; };
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return ''; } };

export function ChipGroup({options, value, onChange, multi, id, invalid}: {options: string[]; value: IntakeValue; onChange: (v: IntakeValue) => void; multi?: boolean; id?: string; invalid?: boolean}) {
  const chosen = multi ? (Array.isArray(value) ? value : []) : value == null ? [] : [String(value)];
  const toggle = (o: string) => {
    if (!multi) { onChange(chosen[0] === o ? '' : o); return; }
    onChange(chosen.includes(o) ? chosen.filter(x => x !== o) : [...chosen, o]);
  };
  return (
    <div className={'intake-chips' + (invalid ? ' invalid' : '')} role={multi ? 'group' : 'radiogroup'} id={id}>
      {options.map(o => {
        const on = chosen.includes(o);
        return <button type="button" key={o} className={'intake-chip' + (on ? ' on' : '')} role={multi ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(o)}>
          {multi && <span className="intake-chip-box">{on && <Check size={10} />}</span>}{o}
        </button>;
      })}
    </div>
  );
}

function TextArea({f, id, value, invalid, onChange}: {f: IntakeField; id: string; value: string; invalid: boolean; onChange: (v: string) => void}) {
  const [open, setOpen] = useState(false);
  const trimmed = value.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const short = f.id === 'summary' && trimmed.length > 0 && trimmed.length < 12;
  return (
    <div className={'intake-ta' + (open ? ' open' : '')}>
      <textarea id={id} rows={open ? 9 : f.id === 'summary' ? 4 : 3} value={value} placeholder={f.placeholder || ''} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
      <span className="intake-ta-foot">
        <span className={'mono' + (short ? ' warn' : '')}>{trimmed.length} chars · {words} word{words === 1 ? '' : 's'}{short ? ' · at least 12 characters' : ''}</span>
        <button type="button" className="text-btn" onClick={() => setOpen(o => !o)} title={open ? 'Tuck this box away' : 'Give this answer more room'}>{open ? 'collapse' : 'expand'}</button>
      </span>
    </div>
  );
}

function DateTime({id, value, invalid, onChange}: {id: string; value: string; invalid: boolean; onChange: (v: string) => void}) {
  // Tomorrow is as far ahead as an incident can be dated; fixed when the field mounts so
  // rendering stays pure.
  const [max] = useState(() => localDateTime(new Date(Date.now() + 864e5)));
  const read = readBack(value);
  return <div className="intake-datetime">
    <input id={id} type="datetime-local" value={value} max={max} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
    <span className="intake-dt-presets" role="group" aria-label="Quick times">
      {DATE_PRESETS.map(p => <button type="button" key={p.label} className="intake-chip" title={p.hint} onClick={() => onChange(localDateTime(p.make()))}>{p.label}</button>)}
      {read && <em className="intake-dt-read mono">{read}</em>}
    </span>
  </div>;
}

function FieldControl({f, value, onChange, invalid, studio, onLookupPick}: {f: IntakeField; value: IntakeValue; onChange: (v: IntakeValue) => void; invalid: boolean; studio?: string; onLookupPick?: (f: IntakeField, ref: LookupRef, raw?: Record<string, unknown>) => void}) {
  const id = 'f-' + f.id;
  const options = f.id === 'area' ? studioAreasFor(studio) : f.options || [];
  switch (f.type) {
    case 'textarea':
      return <TextArea f={f} id={id} value={String(value ?? '')} invalid={invalid} onChange={onChange} />;
    case 'number': {
      const n = Number(value || 0);
      const step = (d: number) => { const next = n + d; if (next < 0) return; onChange(String(next)); };
      return <div className="intake-count">
        <button type="button" aria-label={'One less — ' + f.label} onClick={() => step(-1)} disabled={n <= 0}><Minus size={13} /></button>
        <input id={id} type="number" inputMode="numeric" min={0} value={value == null ? '' : String(value)} placeholder={f.placeholder || '0'} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
        <button type="button" aria-label={'One more — ' + f.label} onClick={() => step(1)}><Plus size={13} /></button>
      </div>;
    }
    case 'datetime':
      return <DateTime id={id} value={String(value ?? '')} invalid={invalid} onChange={onChange} />;
    case 'url': {
      const v = String(value ?? '');
      const host = /^https?:\/\//i.test(v) ? hostOf(v) : '';
      return <div className="intake-url">
        <input id={id} type="url" value={v} placeholder={f.placeholder || 'https://'} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
        {host && <span className="tag mono" title="Host parsed from what you typed">{host}</span>}
      </div>;
    }
    case 'lookup':
      return <LookupField id={id} module={f.module || 'member'} value={value} multi={Boolean(f.multi)} studio={studio} invalid={invalid} onChange={onChange} onPick={(ref, raw) => onLookupPick?.(f, ref, raw)} />;
    case 'multiselect':
      return <ChipGroup id={id} options={options} value={value} onChange={onChange} multi invalid={invalid} />;
    case 'radio':
    case 'select':
      if (asChips(f, options)) return <ChipGroup id={id} options={options} value={value} onChange={onChange} invalid={invalid} />;
      return <select id={id} value={String(value ?? '')} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)}>
        <option value="">{f.placeholder || 'Select…'}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
        {filled(value) && !options.includes(String(value)) && <option value={String(value)}>{String(value)}</option>}
      </select>;
    default:
      return <input id={id} type="text" value={String(value ?? '')} placeholder={f.placeholder || ''} maxLength={f.id === 'title' ? 240 : undefined} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />;
  }
}

export function IntakeFieldRow({f, value, onChange, error, auto, studio, onLookupPick, required, depLabel, extra}: {
  f: IntakeField; value: IntakeValue; onChange: (v: IntakeValue) => void; error?: string; auto?: boolean; studio?: string;
  onLookupPick?: (f: IntakeField, ref: LookupRef, raw?: Record<string, unknown>) => void; required?: boolean;
  /** The question this one followed on from, for the "conditional" badge. */
  depLabel?: string;
  /** Anything the flow wants beside the label — the write-up button sits next to the summary. */
  extra?: ReactNode;
}) {
  const done = filled(value);
  const must = required ?? Boolean(f.required);
  const wide = isWide(f);
  return (
    <div className={'field intake-field' + (wide ? ' wide' : ' aligned') + (done ? ' done' : '') + (error ? ' has-error' : '')} data-fid={f.id}>
      <label htmlFor={'f-' + f.id} className={'intake-label' + (wide ? ' wide' : '')}>
        <span className="intake-label-text">
          <span className="intake-label-title">{f.label}</span>
          <span className="intake-label-badges">
            {must ? <span className="intake-req" title={f.required ? 'Required' : 'Needed before filing'}>Required</span> : <span className="intake-opt">Optional</span>}
            {auto && done && <span className="intake-auto" title="Filled in for you — edit to change"><Sparkles size={9} /> Auto-filled</span>}
            {depLabel && <span className="intake-cond" title={`Asked because “${depLabel}” was answered`}><GitBranch size={9} /> Conditional</span>}
          </span>
        </span>
        {extra}
      </label>
      <div className="intake-field-control">
        <FieldControl f={f} value={value} onChange={onChange} invalid={Boolean(error)} studio={studio} onLookupPick={onLookupPick} />
        {error ? <span className="intake-error">{error}</span> : f.desc ? <span className="field-hint">{f.desc}</span> : null}
      </div>
    </div>
  );
}

function ContextSwitch({label, hint, on, onClick, icon}: {label: string; hint: string; on: boolean; onClick: () => void; icon: ReactNode}) {
  return <button type="button" role="switch" aria-checked={on} title={hint} className={'intake-context-switch' + (on ? ' on' : '')} onClick={onClick}>
    <span className="intake-context-switch-icon">{icon}</span>
    <span className="intake-context-switch-copy"><strong>{label}</strong><small>{hint}</small></span>
    <span className="intake-switch-track" aria-hidden="true"><i /></span>
  </button>;
}

/** The top-of-form context card: who is reporting, where, and whether a member or class
 *  is at the centre of the ticket. The toggles surface the member/class lookups when on. */
export function IntakeContextHeader({data, patch, studio, hostedClass = false}: {data: IntakeData; patch: Patch; studio?: string; hostedClass?: boolean}) {
  const involvesMember = /yes/i.test(String(data._involves_member || ''));
  const involvesClass = /yes/i.test(String(data._involves_class || ''));
  const requiresResolution = !/^no$/i.test(String(data._requires_resolution || 'Yes'));
  const setFlag = (id: string, yes: boolean) => patch(id, yes ? 'Yes' : 'No');
  const reporterType = String(data.reporter_type || '');
  const reporterName = String(data.reporter_name || '');
  const studioName = String(data.studio || studio || '');
  return (
    <div className="intake-context card">
      <div className="intake-context-switches" aria-label="Ticket context">
        <ContextSwitch label="Involves a Member/s" hint="Link the Community Member this ticket concerns" icon={<UsersRound size={17}/>} on={involvesMember} onClick={() => setFlag('_involves_member', !involvesMember)} />
        <ContextSwitch label="Involves a session" hint="Link the relevant Momence Studio Session" icon={<CalendarDays size={17}/>} on={involvesClass} onClick={() => setFlag('_involves_class', !involvesClass)} />
        <ContextSwitch label="Requires Resolution" hint="Create a follow-up target and resolution workflow" icon={<Wrench size={17}/>} on={requiresResolution} onClick={() => setFlag('_requires_resolution', !requiresResolution)} />
      </div>
      <div className="intake-identity-strip" aria-label="Read-only reporter and studio details">
        <div className="intake-identity-head">
          <span>Reporting context</span>
          <small><LockKeyhole size={10}/> Read only</small>
        </div>
        <div className="intake-identity-grid">
          <div className="intake-identity-item">
            <span className="intake-identity-icon"><UserRound size={17}/></span>
            <div className="intake-identity-copy">
              <small>Reporter</small>
              <strong>{reporterName || 'Signed-in user'}</strong>
              <span>{[String(data.reporter_contact || ''), reporterType].filter(Boolean).join(' · ') || 'Profile details unavailable'}</span>
            </div>
          </div>
          <div className="intake-identity-item">
            <span className="intake-identity-icon studio"><Building2 size={17}/></span>
            <div className="intake-identity-copy">
              <small>Linked studio</small>
              <strong>{studioName ? studioName.split(',')[0] : 'Studio not set'}</strong>
              <span>{studioName ? 'Controls the Momence account and records shown in this form' : 'Update the reporter profile to link a studio'}</span>
            </div>
          </div>
        </div>
      </div>
      {(involvesMember || involvesClass || hostedClass) && (
        <div className="intake-context-lookups">
          {involvesMember && (
            <div className="intake-context-lookup">
              <label htmlFor="f-member_name" className="intake-label"><span className="intake-label-text">Member(s) this is about <i className="intake-req" title="Required when a member is involved">*</i></span></label>
              <LookupField id="f-member_name" module="member" value={data.member_name} onChange={v => patch('member_name', v)} studio={studioName} multi />
            </div>
          )}
          {(involvesClass || hostedClass) && (
            <div className="intake-context-lookup">
              <label htmlFor="f-class_date" className="intake-label"><span className="intake-label-text">{hostedClass ? 'Hosted class(es) (Momence)' : 'Class(es) / session(s)'} <i className="intake-req" title="Required when a class is involved">*</i></span></label>
              <LookupField id="f-class_date" module="session" value={data.class_date} sessionTypes={hostedClass ? ['private'] : undefined} onChange={v => { patch('class_date', v); if (filled(v)) setFlag('_involves_class', true); }} studio={studioName} multi />
              {hostedClass && <span className="field-hint">Private hosted classes from the Momence account linked to the reporter’s studio.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FormEngine({fields, data, patch, errors, auto, onLookupPick, collapsed, onToggle, gatingIds, requiredOnly, extras, contextHeader}: {
  fields: IntakeField[]; data: IntakeData; patch: Patch; errors: Record<string, string>; auto: Record<string, IntakeValue>;
  onLookupPick?: (f: IntakeField, ref: LookupRef, raw?: Record<string, unknown>) => void;
  /** Section collapse state lives with the flow so "fix this field" can open the right section. */
  collapsed: Record<string, boolean>; onToggle: (section: string, collapsed: boolean) => void;
  /** Lookups the gate insists on for this ticket (member on behalf of, the class) — shown as required. */
  gatingIds?: Set<string>;
  /** Hide the optional questions: the shortest path to a filed ticket. */
  requiredOnly?: boolean;
  /** Controls rendered beside a field's label, keyed by field id. */
  extras?: Record<string, ReactNode>;
  /** Render the reporter/context header above the first section. */
  contextHeader?: ReactNode;
}) {
  const studio = typeof data.studio === 'string' ? data.studio : undefined;
  const labels = useMemo(() => new Map(fields.map(f => [f.id, f.label])), [fields]);
  const sections = useMemo(() => {
    // The read-only context header is the sole reporter/studio presentation. Reporter fields
    // and relocated lookups must never be repeated as another editable form section below it.
    const hidden = contextHeader ? new Set(['reporter_type', 'reporter_name', 'reporter_contact', 'member_name', 'member_named', 'member_id', 'member_email', 'class_date', 'session_point']) : new Set<string>();
    const m = new Map<string, IntakeField[]>();
    for (const f of fields) {
      if (hidden.has(f.id)) continue;
      if (!isVisible(f, data)) continue;
      if (requiredOnly && !f.required && !gatingIds?.has(f.id) && !filled(data[f.id])) continue;
      const s = f.section; if (!m.has(s)) m.set(s, []); m.get(s)!.push(f);
    }
    return SECTION_ORDER.filter(s => m.has(s)).map(s => ({name: s, fields: m.get(s)!}));
  }, [fields, data, requiredOnly, gatingIds, contextHeader]);
  return (
    <div className="intake-sections">
      {contextHeader}
      {sections.map((s, i) => {
        const req = s.fields.filter(f => f.required || gatingIds?.has(f.id));
        const answered = s.fields.filter(f => filled(data[f.id])).length;
        const missing = req.filter(f => !filled(data[f.id])).length;
        const errs = s.fields.filter(f => errors[f.id]).length;
        // Optional drawers (class detail, roll call, asset/payment/vendor detail) start closed
        // unless something in them is answered — the class desk fills them, a blank form hides them.
        const isOpen = collapsed[s.name] !== undefined ? !collapsed[s.name] : !(ENRICH_SECTIONS.has(s.name) && answered === 0);
        return (
          <section className={'intake-section' + (isOpen ? '' : ' collapsed') + (errs ? ' has-error' : '') + (!missing && req.length ? ' complete' : '')} key={s.name}>
            <button type="button" className="intake-section-head" aria-expanded={isOpen} onClick={() => onToggle(s.name, isOpen)}>
              <span className="step-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="intake-section-title"><h3>{s.name}</h3><small>{answered} of {s.fields.length} answered{missing ? ` · ${missing} required left` : req.length ? ' · complete' : ''}</small></span>
              {errs > 0 && <span className="badge red"><X size={10} />{errs} to fix</span>}
              {!missing && req.length > 0 && errs === 0 && <span className="badge green"><Check size={10} />Done</span>}
              <ChevronDown size={15} className="intake-section-chev" />
            </button>
            {isOpen && (
              <div className="intake-section-body">
                <div className="form-grid">
                  {s.fields.map(f => <IntakeFieldRow key={f.id} f={f} value={data[f.id]} onChange={v => patch(f.id, v)} error={errors[f.id]} auto={auto[f.id] !== undefined && String(auto[f.id]) === String(data[f.id])} studio={studio} onLookupPick={onLookupPick} required={f.required || gatingIds?.has(f.id) || undefined} depLabel={f.conditional && f.dep ? labels.get(f.dep) : undefined} extra={extras?.[f.id]} />)}
                </div>
              </div>
            )}
          </section>
        );
      })}
      {!sections.length && <div className="empty-state"><h3>Nothing to answer here</h3><p>Turn off “required only” to see the full form.</p></div>}
    </div>
  );
}
