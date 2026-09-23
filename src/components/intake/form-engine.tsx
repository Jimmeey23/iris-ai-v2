"use client";
import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {Activity, Building2, CalendarClock, CalendarDays, Check, ChevronDown, Clock3, ClipboardList, GitBranch, GraduationCap, HeartHandshake, IndianRupee, Layers, LockKeyhole, MapPin, Megaphone, Minus, MonitorCog, PackageSearch, Paperclip, PenLine, Plus, ShieldAlert, Sparkles, UserRound, UsersRound, Wrench, X, type LucideIcon} from 'lucide-react';
import {studioAreasFor} from '@/lib/constants';
import {ENRICH_GROUP_LABEL, MEMBER_LOOKUP_IDS, fieldRank, filled, isVisible, localDateTime, orderSections, type IntakeData, type IntakeField, type IntakeValue, type LookupRef} from '@/lib/intake/plan';
import {LookupField} from './lookup-field';
import {OptionSelect} from './option-select';

export type Patch = (id: string, value: IntakeValue) => void;

const WIDE = new Set(['title', 'summary', 'requested_outcome']);
const isWide = (f: IntakeField) => WIDE.has(f.id) || f.type === 'textarea' || f.type === 'lookup';
/** Backdating shortcuts for a datetime answer — the desk rarely knows the exact minute. */
const DATE_PRESETS: {label: string; hint: string; make: () => Date}[] = [
  {label: 'just now', hint: 'Stamp this exact minute', make: () => new Date()},
  {label: '1 hour ago', hint: 'Backdate by an hour', make: () => new Date(Date.now() - 3600e3)},
  {label: 'yesterday', hint: 'Backdate by a day', make: () => new Date(Date.now() - 864e5)},
];
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return ''; } };

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
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return <div className="idt" ref={box}>
    <input id={id} type="datetime-local" value={value} max={max} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />
    <button type="button" className="idt-quick" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)} title="Quick times"><Clock3 size={13} /><ChevronDown size={12} /></button>
    {open && <div className="osel-pop idt-pop" role="menu">
      <div className="osel-list">{DATE_PRESETS.map(p => <button type="button" role="menuitem" key={p.label} className="osel-opt" onClick={() => { onChange(localDateTime(p.make())); setOpen(false); }}><span className="osel-label">{p.label[0].toUpperCase() + p.label.slice(1)}</span><small>{p.hint}</small></button>)}</div>
    </div>}
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
      return <OptionSelect id={id} options={options} value={value} onChange={onChange} multi invalid={invalid} />;
    case 'radio':
    case 'select':
      return <OptionSelect id={id} options={options} value={value} onChange={onChange} invalid={invalid}/>;
    default:
      return <input id={id} type="text" value={String(value ?? '')} placeholder={f.placeholder || ''} maxLength={f.id === 'title' ? 240 : undefined} aria-invalid={invalid || undefined} onChange={e => onChange(e.target.value)} />;
  }
}

/* ------------------------------------------------------------------ sections */

export const SECTION_META: Record<string, {icon: LucideIcon; lede: string}> = {
  'Who this is about': {icon: UsersRound, lede: 'The member at the centre of this, and how they want to hear back.'},
  'Where & when': {icon: MapPin, lede: 'The studio, the exact spot and the moment it happened.'},
  'Class context': {icon: CalendarDays, lede: 'The session involved. Linking it from Momence brings the coach and roster.'},
  'Safety & incident': {icon: ShieldAlert, lede: 'What happened to whom, who responded and what has been preserved.'},
  'Lost & found': {icon: PackageSearch, lede: 'The item, where it was last seen and what has already been checked.'},
  'Payment & billing': {icon: IndianRupee, lede: 'What was charged, what was expected and what is owed back.'},
  'Equipment & facility': {icon: Wrench, lede: 'What is broken, low or wrong, and whether it can still be used.'},
  'Systems & data': {icon: MonitorCog, lede: 'The system, who is blocked and how to make it happen again.'},
  'Schedule & timetable': {icon: CalendarClock, lede: 'The slot today, the slot being asked for and the demand behind it.'},
  'Trainer & method': {icon: GraduationCap, lede: 'The trainer concerned and how it measures against the method.'},
  'Member experience': {icon: HeartHandshake, lede: 'How the member was served, and what has been offered so far.'},
  'Brand & partnerships': {icon: Megaphone, lede: 'The partner or campaign, its terms and what it delivered.'},
  'Internal & policy': {icon: ClipboardList, lede: 'Who needs to decide, what changes and by when.'},
  'Other details': {icon: Layers, lede: 'Anything else this sub-category asks for.'},
  'Impact & triage': {icon: Activity, lede: 'How serious it is. These answers set the priority and follow-up target.'},
  'Description & ask': {icon: PenLine, lede: 'In plain words: what happened and what a good outcome looks like.'},
  'Attendees': {icon: UsersRound, lede: 'Everyone who booked or walked in: attendance, outcome, follow-up and notes.'},
  'Evidence': {icon: Paperclip, lede: 'Tokens, vendor tickets and links that back it up.'},
};
const metaOf = (name: string) => SECTION_META[name] || SECTION_META['Other details'];
export const sectionSlug = (name: string) => 'sec-' + name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');

/** Member lookups the context header answers for the whole plan: the unconditional ones. A
 *  conditional member question (asked only after another answer) stays in its own section. */
export function primaryMemberIds(fields: IntakeField[]) {
  const ids = fields.filter(f => f.type === 'lookup' && f.module === 'member' && MEMBER_LOOKUP_IDS.includes(f.id) && !(f.conditional && f.dep)).map(f => f.id);
  return ids.length ? ids : ['member_name'];
}
/** Answered in the context header, so never repeated as an editable question below it. */
export const headerIds = (fields: IntakeField[]) => new Set(['reporter_type', 'reporter_name', 'reporter_contact', 'class_date', ...primaryMemberIds(fields)]);

export type SectionGroup = {name: string; slug: string; fields: IntakeField[]; required: number; missing: number; answered: number; errors: number; total?: number};

export function groupSections(fields: IntakeField[], data: IntakeData, opts: {hidden?: Set<string>; requiredOnly?: boolean; gatingIds?: Set<string>; errors?: Record<string, string>}): SectionGroup[] {
  const m = new Map<string, IntakeField[]>();
  for (const f of fields) {
    if (opts.hidden?.has(f.id)) continue;
    if (!isVisible(f, data)) continue;
    if (opts.requiredOnly && !f.required && !opts.gatingIds?.has(f.id) && !filled(data[f.id])) continue;
    if (!m.has(f.section)) m.set(f.section, []);
    m.get(f.section)!.push(f);
  }
  return orderSections(m.keys()).map(name => {
    // Stable: questions the grouping does not rank keep the plan's own order.
    const list = m.get(name)!.map((f, i) => ({f, i})).sort((a, b) => fieldRank(a.f.id) - fieldRank(b.f.id) || a.i - b.i).map(x => x.f);
    const req = list.filter(f => f.required || opts.gatingIds?.has(f.id));
    return {
      name, slug: sectionSlug(name), fields: list, required: req.length,
      missing: req.filter(f => !filled(data[f.id])).length,
      answered: list.filter(f => filled(data[f.id])).length,
      errors: list.filter(f => opts.errors?.[f.id]).length,
    };
  });
}

/** A section the flow renders itself (the hosted-class roster), placed among the plan's own. */
export type InjectedSection = {name: string; after: string; body: ReactNode; answered: number; total: number};
export function withInjected(sections: SectionGroup[], injected: InjectedSection[] = []): SectionGroup[] {
  const out = [...sections];
  for (const x of injected) {
    const at = out.findIndex(s => s.name === x.after);
    out.splice(at < 0 ? out.length : at + 1, 0, {name: x.name, slug: sectionSlug(x.name), fields: [], required: 0, missing: 0, answered: x.answered, errors: 0, total: x.total} as SectionGroup);
  }
  return out;
}

/* ------------------------------------------------------------------ one question */

export function IntakeFieldRow({f, value, onChange, error, auto, studio, onLookupPick, required, depLabel, extra, index = 0}: {
  f: IntakeField; value: IntakeValue; onChange: (v: IntakeValue) => void; error?: string; auto?: boolean; studio?: string;
  onLookupPick?: (f: IntakeField, ref: LookupRef, raw?: Record<string, unknown>) => void; required?: boolean;
  /** The question this one followed on from, for the "conditional" badge. */
  depLabel?: string;
  /** Anything the flow wants beside the label — the write-up button sits next to the summary. */
  extra?: ReactNode;
  /** Position in its section, for the reveal stagger. */
  index?: number;
}) {
  const done = filled(value);
  const must = required ?? Boolean(f.required);
  const wide = isWide(f);
  const cls = ['ifield', wide ? 'wide' : 'half', done ? 'done' : '', error ? 'has-error' : '', depLabel ? 'cond' : '', must ? 'must' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} data-fid={f.id} style={{'--i': index} as React.CSSProperties}>
      <div className="ifield-label">
        <label htmlFor={'f-' + f.id}>
          <span className="ifield-state" aria-hidden="true">{error ? <X size={9} strokeWidth={3} /> : done ? <Check size={9} strokeWidth={3} /> : null}</span>
          <span className="ifield-title">{f.label}</span>
          {must && !done && <span className="ifield-req">Required</span>}
          {must && <span className="sr-only"> (required)</span>}
        </label>
        <span className="ifield-flags">
          {auto && done && <span className="ifield-auto" title="Filled in for you. Edit to change it."><Sparkles size={9} /> Auto-filled</span>}
          {depLabel && <span className="ifield-cond" title={`Asked because “${depLabel}” was answered`}><GitBranch size={9} /> Follows “{depLabel}”</span>}
          {extra}
        </span>
      </div>
      <div className="ifield-control">
        <FieldControl f={f} value={value} onChange={onChange} invalid={Boolean(error)} studio={studio} onLookupPick={onLookupPick} />
      </div>
      <div className="ifield-foot">{error ? <span className="intake-error">{error}</span> : f.desc ? <span className="field-hint">{f.desc}</span> : null}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ context band */

function ContextSwitch({label, hint, on, onClick, icon}: {label: string; hint: string; on: boolean; onClick: () => void; icon: ReactNode}) {
  return <button type="button" role="switch" aria-checked={on} className={'ictx-switch' + (on ? ' on' : '')} onClick={onClick}>
    <span className="ictx-switch-icon">{icon}</span>
    <span className="ictx-switch-copy"><strong>{label}</strong><small>{hint}</small></span>
    <span className="intake-switch-track" aria-hidden="true"><i /></span>
  </button>;
}

/** The first band of the sheet: who is reporting, from where, and whether a member or class is
 *  at the centre of the ticket. The switches open the member and class lookups. */
export function IntakeContextHeader({data, patch, studio, hostedClass = false, fields = [], gatingIds}: {data: IntakeData; patch: Patch; studio?: string; hostedClass?: boolean; fields?: IntakeField[]; gatingIds?: Set<string>}) {
  const memberIds = primaryMemberIds(fields);
  const memberRequired = fields.some(f => memberIds.includes(f.id) && f.required);
  const memberValue = memberIds.map(id => data[id]).find(filled);
  const involvesMember = /yes/i.test(String(data._involves_member || '')) || memberRequired || filled(memberValue);
  const involvesClass = /yes/i.test(String(data._involves_class || '')) || Boolean(gatingIds?.has('class_date')) || filled(data.class_date);
  const requiresResolution = !/^no$/i.test(String(data._requires_resolution || 'Yes'));
  const setFlag = (id: string, yes: boolean) => patch(id, yes ? 'Yes' : 'No');
  const setMember = (v: IntakeValue) => { for (const id of memberIds) patch(id, v); };
  const reporterType = String(data.reporter_type || '');
  const reporterName = String(data.reporter_name || '');
  const studioName = String(data.studio || studio || '');
  const showClass = involvesClass || hostedClass;
  // A sub-category that is always about a class keeps the switch on; one the desk turned on can be turned off.
  const classLocked = hostedClass || (Boolean(gatingIds?.has('class_date')) && !/yes/i.test(String(data._involves_class || '')));
  return (
    <div className="ictx" aria-label="Ticket context">
      <div className="ictx-who">
        <div className="ictx-id">
          <span className="ictx-id-icon"><UserRound size={15} /></span>
          <span><small>Reported by</small><strong>{reporterName || 'Signed-in user'}</strong><em>{[String(data.reporter_contact || ''), reporterType].filter(Boolean).join(' · ') || 'Profile details unavailable'}</em></span>
        </div>
        <div className="ictx-id">
          <span className="ictx-id-icon studio"><Building2 size={15} /></span>
          <span><small>Linked studio</small><strong>{studioName ? studioName.split(',')[0] : 'Studio not set'}</strong><em>{studioName ? 'Sets the Momence account searched below' : 'Update your profile to link a studio'}</em></span>
        </div>
        <span className="ictx-lock"><LockKeyhole size={10} /> From your profile</span>
      </div>
      <div className="ictx-switches" role="group" aria-label="What this ticket involves">
        <ContextSwitch label="Involves a member" hint={memberRequired ? 'Required for this sub-category' : 'Link the community member'} icon={<UsersRound size={16} />} on={involvesMember} onClick={() => { if (memberRequired) return; if (involvesMember) setMember(''); setFlag('_involves_member', !involvesMember); }} />
        <ContextSwitch label="Involves a session" hint={classLocked ? 'This sub-category is about a class' : 'Link the Momence session'} icon={<CalendarDays size={16} />} on={showClass} onClick={() => { if (classLocked) return; if (involvesClass) patch('class_date', ''); setFlag('_involves_class', !involvesClass); }} />
        <ContextSwitch label="Requires resolution" hint={requiresResolution ? 'Owner, follow-up target and closure' : 'Recorded only, no follow-up'} icon={<Wrench size={16} />} on={requiresResolution} onClick={() => setFlag('_requires_resolution', !requiresResolution)} />
      </div>
      {(involvesMember || showClass) && (
        <div className="ictx-lookups">
          {involvesMember && (
            <div className="ictx-lookup" data-fid={memberIds[0]} data-fids={memberIds.join(' ')}>
              <label htmlFor={'f-' + memberIds[0]} className="ictx-lookup-label">Member(s) this is about <span className="ifield-req">Required</span></label>
              <LookupField id={'f-' + memberIds[0]} module="member" value={memberValue} onChange={setMember} studio={studioName} multi />
            </div>
          )}
          {showClass && (
            <div className="ictx-lookup" data-fid="class_date">
              <label htmlFor="f-class_date" className="ictx-lookup-label">{hostedClass ? 'Hosted class(es)' : 'Class(es) / session(s)'} <span className="ifield-req">Required</span></label>
              <LookupField id="f-class_date" module="session" value={data.class_date} sessionTypes={hostedClass ? ['private'] : undefined} onChange={v => { patch('class_date', v); if (filled(v)) setFlag('_involves_class', true); }} studio={studioName} multi />
              {hostedClass && <span className="field-hint">Private hosted classes from the Momence account linked to your studio.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the sheet body */

/** Optional class-desk detail inside its section, closed until something in it is answered. */
function Drawer({label, count, open, onToggle, children}: {label: string; count: number; open: boolean; onToggle: () => void; children: ReactNode}) {
  return <div className={'idrawer' + (open ? ' open' : '')}>
    <button type="button" className="idrawer-head" aria-expanded={open} onClick={onToggle}>
      <Plus size={13} className="idrawer-plus" /><span>{label}</span><small>{count} optional question{count === 1 ? '' : 's'}</small>
    </button>
    <div className="icollapse" inert={!open || undefined}><div className="icollapse-inner"><div className="igrid">{children}</div></div></div>
  </div>;
}

export function FormEngine({fields, data, patch, errors, auto, onLookupPick, open, onOpen, injected, onFinish, gatingIds, requiredOnly, extras, contextHeader}: {
  fields: IntakeField[]; data: IntakeData; patch: Patch; errors: Record<string, string>; auto: Record<string, IntakeValue>;
  onLookupPick?: (f: IntakeField, ref: LookupRef, raw?: Record<string, unknown>) => void;
  /** The one open section (an accordion). Undefined opens the first; null closes them all.
   *  It lives with the flow so "fix this field" can open the right section. */
  open: string | null | undefined; onOpen: (section: string | null) => void;
  /** Sections the flow renders itself. */
  injected?: InjectedSection[];
  /** The last section's "next" step: review the ticket. */
  onFinish?: () => void;
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
  const sections = useMemo(() => withInjected(groupSections(fields, data, {hidden: contextHeader ? headerIds(fields) : undefined, requiredOnly, gatingIds, errors}), injected), [fields, data, requiredOnly, gatingIds, errors, contextHeader, injected]);
  const current = open === undefined ? sections[0]?.name : open;
  const go = (name: string | null) => {
    onOpen(name);
    // The section above closes as this one opens; bring the new one's header into view.
    if (name) setTimeout(() => document.getElementById(sectionSlug(name))?.scrollIntoView({behavior: 'smooth', block: 'start'}), 60);
  };
  const [drawers, setDrawers] = useState<Record<string, boolean>>({});
  const row = (f: IntakeField, i: number) => <IntakeFieldRow key={f.id} index={i} f={f} value={data[f.id]} onChange={v => patch(f.id, v)} error={errors[f.id]} auto={auto[f.id] !== undefined && String(auto[f.id]) === String(data[f.id])} studio={studio} onLookupPick={onLookupPick} required={f.required || gatingIds?.has(f.id) || undefined} depLabel={f.conditional && f.dep ? labels.get(f.dep) : undefined} extra={extras?.[f.id]} />;
  return (
    <div className="isections">
      {contextHeader}
      {sections.map((s, n) => {
        const {icon: Icon, lede} = metaOf(s.name);
        const isOpen = current === s.name;
        const inj = injected?.find(x => x.name === s.name);
        const next = sections[n + 1];
        const complete = s.required > 0 && s.missing === 0 && s.errors === 0;
        // Optional class-desk detail groups sit in drawers; a required one never hides.
        const main = s.fields.filter(f => !f.enrich || f.enrich === 'universal' || f.required || gatingIds?.has(f.id));
        const extraGroups = new Map<string, IntakeField[]>();
        for (const f of s.fields) if (!main.includes(f)) { const k = f.enrich!; if (!extraGroups.has(k)) extraGroups.set(k, []); extraGroups.get(k)!.push(f); }
        return (
          <section id={s.slug} data-sec={s.name} className={'isec' + (isOpen ? '' : ' collapsed') + (s.errors ? ' has-error' : '') + (complete ? ' complete' : '')} key={s.name} style={{'--n': n} as React.CSSProperties}>
            <button type="button" className="isec-head" aria-expanded={isOpen} aria-controls={s.slug + '-body'} onClick={() => go(isOpen ? null : s.name)}>
              <span className="isec-num">{String(n + 1).padStart(2, '0')}</span>
              <span className="isec-icon"><Icon size={16} /></span>
              <span className="isec-title"><h3>{s.name}</h3><small>{lede}</small></span>
              <span className="isec-status">
                {s.errors > 0 ? <span className="badge red"><X size={10} />{s.errors} to fix</span>
                  : complete ? <span className="badge green"><Check size={10} />Done</span>
                  : s.required ? <span className="isec-count"><b>{s.required - s.missing}</b>/{s.required} required</span>
                  : <span className="isec-count">{s.answered}/{s.total ?? s.fields.length} {inj ? 'filled in' : 'answered'}</span>}
              </span>
              <ChevronDown size={15} className="isec-chev" />
            </button>
            <div className="icollapse" id={s.slug + '-body'} inert={!isOpen || undefined}>
              <div className="icollapse-inner">
                {inj ? inj.body : <div className="igrid">{main.map(row)}</div>}
                {[...extraGroups].map(([k, list]) => {
                  const key = s.name + '|' + k;
                  // An error inside always opens it, so "fix this" lands on a visible question.
                  const open = list.some(f => errors[f.id]) || (drawers[key] ?? list.some(f => filled(data[f.id])));
                  return <Drawer key={k} label={ENRICH_GROUP_LABEL[k] || 'More detail'} count={list.length} open={open} onToggle={() => setDrawers(d => ({...d, [key]: !open}))}>{list.map(row)}</Drawer>;
                })}
                <div className="isec-next">
                  {s.missing > 0 && <span className="isec-next-note">{s.missing} required answer{s.missing > 1 ? 's' : ''} left in this section</span>}
                  {next ? <button type="button" className="btn btn-sm isec-next-btn" onClick={() => go(next.name)}>Next: {next.name} <ChevronDown size={13} style={{transform: 'rotate(-90deg)'}} /></button>
                    : onFinish && <button type="button" className="btn btn-sm btn-primary isec-next-btn" onClick={onFinish}>Review the ticket <ChevronDown size={13} style={{transform: 'rotate(-90deg)'}} /></button>}
                </div>
              </div>
            </div>
          </section>
        );
      })}
      {!sections.length && <div className="empty-state"><h3>Nothing to answer here</h3><p>Turn off “Required only” to see the full form.</p></div>}
    </div>
  );
}

/* ------------------------------------------------------------------ navigator */

function Ring({value, tone}: {value: number; tone: string}) {
  const r = 8, c = 2 * Math.PI * r;
  return <svg className="inav-ring" viewBox="0 0 20 20" aria-hidden="true" data-tone={tone}>
    <circle cx="10" cy="10" r={r} className="inav-ring-track" />
    <circle cx="10" cy="10" r={r} className="inav-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
  </svg>;
}

/** The sheet's table of contents: one row per section with its own progress, the section in
 *  view marked, a click jumps (and opens) it. */
export function SectionNav({sections, onJump}: {sections: SectionGroup[]; onJump: (name: string) => void}) {
  const [active, setActive] = useState('');
  const names = sections.map(s => s.name).join('|');
  useEffect(() => {
    const els = sections.map(s => document.getElementById(s.slug)).filter((e): e is HTMLElement => Boolean(e));
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set((e.target as HTMLElement).dataset.sec || '', e.isIntersecting);
      const first = sections.find(s => seen.get(s.name));
      if (first) setActive(first.name);
    }, {rootMargin: '-96px 0px -55% 0px'});
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names]);
  const idx = Math.max(0, sections.findIndex(s => s.name === active));
  return (
    <nav className="inav" aria-label="Form sections" style={{'--active': idx} as React.CSSProperties}>
      <span className="inav-marker" aria-hidden="true" />
      {sections.map(s => {
        const {icon: Icon} = metaOf(s.name);
        const total = s.total ?? s.fields.length;
        const value = s.required ? (s.required - s.missing) / s.required : total ? s.answered / total : 0;
        const tone = s.errors ? 'red' : s.required && !s.missing ? 'green' : 'accent';
        return <button type="button" key={s.name} className={'inav-row' + (s.name === active ? ' on' : '')} aria-current={s.name === active ? 'location' : undefined} onClick={() => onJump(s.name)}>
          <span className="inav-icon"><Ring value={value} tone={tone} /><Icon size={10} /></span>
          <span className="inav-name">{s.name}</span>
          <span className="inav-meta">{s.errors ? `${s.errors} to fix` : s.required ? (s.missing ? `${s.missing} left` : 'done') : `${s.answered}/${total}`}</span>
        </button>;
      })}
    </nav>
  );
}
