"use client";
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, ListFilter, LockKeyhole, MessageSquareText, PenLine, RotateCcw, Settings2, ShieldAlert, Sparkles, UserRound, Zap} from 'lucide-react';
import {Avatar, Badge, Priority, useApp, api} from '../ui';
import {DraftDocument} from '../ticket-composer';
import {TicketDialog} from '../ticket-detail';
import {inferPriority} from '@/lib/routing';
import {object} from '@/lib/display';
import type {AdvancedDraft} from '@/lib/ticket-contract';
import {MEMBER_LOOKUP_IDS, autoTitle, composeWriteup, encodeLookup, filled, gatingFor, linkedLookup, localDateTime, missingFields, priorityInputs, relativeFor, seedData, toTicketInput, visibleFields, type ClassSnapshot, type IntakeData, type IntakeValue, type TicketKind} from '@/lib/intake/plan';
import {matchStudio, sessionFacts, sessionSnapshot, type RosterEntry, type SessionDetail} from '@/lib/intake/class-desk';
import {FormEngine, IntakeContextHeader} from './form-engine';
import {CategoryGrid, SubcategoryGrid} from './pickers';
import {ClassDesk, type ClassDeskResult} from './class-desk';
import {ReviewSheet} from './review-sheet';
import {LookupChip} from './lookup-field';
import type {IntakeCategory, IntakePlan, IntakeTaxonomy} from './types';
import {InlineFormDesigner} from '@/components/inline-form-designer';

type Step = 'category' | 'subcategory' | 'form' | 'classdesk' | 'done';
type Result = {ticket: {id: number; ticketNumber: string}; draft: AdvancedDraft};
const KINDS: {id: TicketKind; label: string; hint: string}[] = [
  {id: 'issue', label: 'Issue', hint: 'Something went wrong and needs fixing'},
  {id: 'request', label: 'Request', hint: 'Something the studio or a member is asking for'},
  {id: 'feedback', label: 'Feedback', hint: 'An observation worth recording'},
  {id: 'compliment', label: 'Compliment', hint: 'Praise — recorded, no SLA'},
];
const STUDIO_KEY = 'iris-intake-studio';
const PRAISE_OPTIONAL = new Set(['is_repeat', 'member_impact', 'immediate_danger']);

export function IntakeFlow({presetCategory, presetSubcategory, presetDesk, onLegacy}: {presetCategory?: string; presetSubcategory?: string; presetDesk?: boolean; onLegacy?: () => void}) {
  const {notify, user, openAuth} = useApp();
  const [taxonomy, setTaxonomy] = useState<IntakeTaxonomy>();
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<IntakeCategory>();
  const [sub, setSub] = useState('');
  const [loaded, setLoaded] = useState<{key: string; plan: IntakePlan}>();
  const [data, setData] = useState<IntakeData>({});
  const [auto, setAuto] = useState<Record<string, IntakeValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useState<TicketKind>('issue');
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [classDetail, setClassDetail] = useState<SessionDetail | null>(null);
  const [classEntries, setClassEntries] = useState<Record<string, RosterEntry>>({});
  const [memberDetail, setMemberDetail] = useState<{id: string; email?: string; phone?: string; membership?: string; context?: Record<string, unknown>}>();
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<Result>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [submissionKey, setSubmissionKey] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [designing, setDesigning] = useState(false);
  const presetDone = useRef(false);

  const rememberedStudio = () => { try { return localStorage.getItem(STUDIO_KEY) || ''; } catch { return ''; } };

  /** Opens the form for a sub-category, seeding the shared block. `prefill` carries what the
   *  class desk read from Momence; it is badged as auto-filled and stays editable. */
  const openSub = useCallback((c: IntakeCategory, s: string, prefill: IntakeData = {}, detail: SessionDetail | null = null, entries: Record<string, RosterEntry> = {}, tax: IntakeTaxonomy | undefined = taxonomy) => {
    const reporter = tax?.reporter || (user ? {name: user.name, email: user.email} : undefined);
    const seed = seedData({studio: rememberedStudio(), ...prefill}, reporter || undefined);
    const nextAuto: Record<string, IntakeValue> = {...Object.fromEntries(Object.entries(prefill).filter(([, v]) => filled(v)))};
    if (reporter?.name) nextAuto.reporter_name = reporter.name;
    if (reporter?.email) nextAuto.reporter_contact = reporter.email;
    // "Now" is an assumption until the desk touches it — a linked class may replace it.
    for (const id of ['occurred_at', 'occurred_relative']) if (!filled(prefill[id]) && filled(seed[id])) nextAuto[id] = seed[id];
    const title = autoTitle(s, seed);
    seed.title = title; nextAuto.title = title;
    setCategory(c); setSub(s); setData(seed); setAuto(nextAuto); setErrors({}); setCollapsed({}); setKind('issue');
    setClassDetail(detail); setClassEntries(entries); setMemberDetail(undefined); setResult(undefined); setFileError('');
    setSubmissionKey(crypto.randomUUID()); setStep('form');
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, [taxonomy, user]);

  // The taxonomy, then any ?category=&subcategory= deep link (the board and the radar open
  // Iris this way) applied once it is known.
  useEffect(() => {
    let cancelled = false;
    api<IntakeTaxonomy>('/api/intake').then(t => {
      if (cancelled) return;
      setTaxonomy(t);
      if (presetDone.current) return;
      presetDone.current = true;
      if (presetDesk) { setStep('classdesk'); return; }
      if (!presetCategory) return;
      const c = t.categories.find(x => x.name === presetCategory);
      if (!c) return;
      if (presetSubcategory && c.subs.some(x => x.name === presetSubcategory)) openSub(c, presetSubcategory, {}, null, {}, t);
      else { setCategory(c); setStep('subcategory'); }
    }).catch(e => { if (!cancelled) setLoadError(e.message || 'The intake taxonomy could not be loaded.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // The field plan for the chosen sub-category, re-read when the studio changes so the owner
  // shown is the one who really covers that studio. The plan on screen stays while the
  // re-read is in flight; only a different sub-category blanks it.
  const studio = typeof data.studio === 'string' ? data.studio : '';
  const wantKey = step === 'form' && category && sub ? `${category.name}|||${sub}|||${studio}` : '';
  useEffect(() => {
    if (!wantKey || !category) return;
    let cancelled = false;
    const params = new URLSearchParams({category: category.name, subcategory: sub});
    if (studio) params.set('studio', studio);
    api<IntakePlan>(`/api/intake?${params}`).then(p => { if (!cancelled) setLoaded({key: wantKey, plan: p}); }).catch(e => { if (!cancelled) notify(e.message || 'The field plan could not be loaded.', 'error'); });
    return () => { cancelled = true; };
  }, [wantKey, category, sub, studio, notify]);
  const plan = loaded && category && loaded.plan.sub.key === `${category.name}|||${sub}` ? loaded.plan : undefined;
  const planBusy = Boolean(wantKey) && loaded?.key !== wantKey;
  useEffect(() => { if (studio) try { localStorage.setItem(STUDIO_KEY, studio); } catch {} }, [studio]);

  const patch = useCallback((id: string, v: IntakeValue) => {
    setData(d => {
      const next = {...d, [id]: v};
      // The title follows the sub-category, studio and area until the desk writes its own.
      if ((id === 'studio' || id === 'area') && sub && (!filled(d.title) || String(d.title) === String(auto.title))) {
        const t = autoTitle(sub, next); next.title = t; setAuto(a => ({...a, title: t}));
      }
      // "How recent?" follows the timestamp until the desk answers it in its own words.
      if (id === 'occurred_at' && (!filled(d.occurred_relative) || d.occurred_relative === 'Just now' || String(d.occurred_relative) === String(auto.occurred_relative))) {
        const rel = relativeFor(String(v || ''));
        if (rel) { next.occurred_relative = rel; setAuto(a => ({...a, occurred_relative: rel})); }
      }
      return next;
    });
    setErrors(e => { if (!e[id]) return e; const n = {...e}; delete n[id]; return n; });
  }, [sub, auto.title, auto.occurred_relative]);

  // Praise is recorded, not triaged: the three triage questions stop being mandatory for it.
  const praise = kind === 'compliment';
  const fields = useMemo(() => (plan?.fields || []).map(f => praise && PRAISE_OPTIONAL.has(f.id) ? {...f, required: false} : f), [plan, praise]);
  // A linked member fills the contact block from Momence — never over an answer already typed.
  // Runs for a member picked in the form and for one the class desk flagged alike.
  const memberRef = MEMBER_LOOKUP_IDS.map(id => linkedLookup(data[id])).find(Boolean) || null;
  const memberId = memberRef?.id;
  useEffect(() => {
    if (!memberId || !user || memberDetail?.id === memberId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/momence?module=members&id=${encodeURIComponent(memberId)}`, {cache: 'no-store'});
        if (!res.ok || cancelled) return;
        const d = await res.json() as {item: {id: string; name: string; raw: Record<string, unknown>}; related: Record<string, Record<string, unknown>[]>; source: string};
        const m = d.item.raw; const pack = d.related.memberships?.[0];
        const membership = pack ? String(pack.name || object(pack.membership).name || '') : '';
        setMemberDetail({id: memberId, email: String(m.email || ''), phone: String(m.phoneNumber || ''), membership: membership || undefined, context: {member: d.item, memberships: d.related.memberships, bookings: d.related.bookings, source: d.source}});
        setData(prev => {
          const next = {...prev}; const add: Record<string, IntakeValue> = {};
          if (!filled(prev.member_email) && m.email && fields.some(x => x.id === 'member_email' && x.type !== 'lookup')) { next.member_email = String(m.email); add.member_email = next.member_email; }
          if (!filled(prev.member_id) && fields.some(x => x.id === 'member_id' && x.type !== 'lookup')) { next.member_id = memberId; add.member_id = memberId; }
          if (!filled(prev.membership) && membership && fields.some(x => x.id === 'membership' && x.type !== 'lookup')) { next.membership = membership; add.membership = membership; }
          if (String(prev.reporter_type || '').startsWith('Member') && !filled(prev.reporter_name)) { next.reporter_name = d.item.name; add.reporter_name = d.item.name; }
          if (Object.keys(add).length) setAuto(a => ({...a, ...add}));
          return next;
        });
        notify(`${d.item.name} linked from Momence${d.source === 'demo' ? ' (demo record)' : ''}.`);
      } catch { /* the chip already shows the link; contact details stay typed */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, user?.id]);

  // A class linked on the form is read from Momence the same way: its format, coach and start
  // fill blanks and assumed answers (never a typed one), and the roster snapshot rides on the
  // ticket exactly as it does from the class desk.
  const sessionId = linkedLookup(data.class_date)?.id;
  useEffect(() => {
    if (!sessionId || !user || classDetail?.item.id === sessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/momence?module=sessions&id=${encodeURIComponent(sessionId)}`, {cache: 'no-store'});
        if (!res.ok || cancelled) return;
        const d = await res.json() as SessionDetail;
        if (cancelled) return;
        setClassDetail(d); setClassEntries({});
        const facts = sessionFacts(d);
        const studio = matchStudio(facts.location, taxonomy?.studios || []);
        // The studio answer is the desk's own; a class held elsewhere is flagged, not overwritten.
        const elsewhere = studio && filled(data.studio) && data.studio !== studio ? studio : '';
        setData(prev => {
          const next = {...prev}; const add: Record<string, IntakeValue> = {};
          const take = (id: string, v: string | undefined) => {
            if (!v || !fields.some(f => f.id === id)) return;
            if (filled(prev[id]) && String(prev[id]) !== String(auto[id])) return;
            next[id] = v; add[id] = v;
          };
          take('class_format', facts.name);
          take('trainer', facts.coach);
          if (facts.when) { take('occurred_at', localDateTime(facts.when)); take('occurred_relative', relativeFor(facts.startsAt)); }
          if (studio && !filled(prev.studio)) take('studio', studio);
          if (Object.keys(add).length) setAuto(a => ({...a, ...add}));
          return next;
        });
        notify(`${facts.name} linked from Momence${d.source === 'demo' ? ' (demo record)' : ''}${elsewhere ? ` — held at ${elsewhere.split(',')[0]}; check the studio answer` : ''}.`);
      } catch { /* the chip already shows the link; class detail stays typed */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  const visible = useMemo(() => visibleFields(fields, data), [fields, data]);
  const missing = useMemo(() => missingFields(fields, data), [fields, data]);
  const gating = useMemo(() => category && sub ? gatingFor(fields, data, {name: sub, category: category.name}) : [], [fields, data, category, sub]);
  // The gates as they would stand with the lookups blank — so a linked class still reads as
  // required on the form rather than flipping to "optional" the moment it is answered.
  const gatingIds = useMemo(() => {
    if (!category || !sub) return new Set<string>();
    const bare = Object.fromEntries(Object.entries(data).filter(([k]) => !fields.some(f => f.id === k && f.type === 'lookup')));
    return new Set(gatingFor(fields, bare, {name: sub, category: category.name}).map(g => g.id));
  }, [fields, data, category, sub]);
  const summaryShort = filled(data.summary) && String(data.summary).trim().length < 12;
  const requiredVisible = visible.filter(f => f.required);
  const completedRequired = Math.max(0, requiredVisible.length - missing.length);
  const completion = requiredVisible.length ? Math.round(100 * completedRequired / requiredVisible.length) : 100;
  const baseline = category && sub ? inferPriority({category: category.name, subcategory: sub}) : 'medium';
  const priority = category && sub ? inferPriority(priorityInputs(category.name, sub, data)) : 'medium';
  const recordOnly = kind === 'compliment' || (kind === 'feedback' && String(data.sentiment || '').toLowerCase() === 'positive' && (taxonomy?.positiveNoSla ?? true));
  const slaHours = taxonomy?.responseHours[priority] ?? 24;
  const classSnapshot: ClassSnapshot | null = useMemo(() => classDetail ? sessionSnapshot(classDetail, classEntries) : null, [classDetail, classEntries]);

  const fix = (id: string) => {
    setReview(false);
    const f = fields.find(x => x.id === id);
    if (f) setCollapsed(c => ({...c, [f.section]: false}));
    setTimeout(() => {
      const el = document.querySelector(`[data-fid="${id}"]`);
      el?.scrollIntoView({behavior: 'smooth', block: 'center'});
      (document.getElementById('f-' + id) as HTMLElement | null)?.focus?.({preventScroll: true});
    }, 60);
  };
  // The write-up: the answers already on the form, phrased as a paragraph. Deterministic — it
  // quotes answers, so it cannot invent anything — and badged as auto until the desk edits it.
  const writeUp = () => {
    if (!category || !sub) return;
    const text = composeWriteup({sub: {name: sub, category: category.name}, fields, data});
    const current = String(data.summary || '').trim();
    if (current && current !== String(auto.summary || '') && !window.confirm('Replace what is in the summary with a write-up of the answers so far?')) return;
    setAuto(a => ({...a, summary: text}));
    patch('summary', text);
    setCollapsed(c => ({...c, 'Description & ask': false}));
    setTimeout(() => (document.getElementById('f-summary') as HTMLTextAreaElement | null)?.focus({preventScroll: true}), 40);
  };
  /** Ask the connected model to tighten the title and summary from the answers so far.
   *  Falls back to the deterministic write-up if the model is not connected or returns nothing. */
  const aiDraft = async (target: 'title' | 'summary' | 'both') => {
    if (!category || !sub) return;
    setAiBusy(true); setFileError('');
    try {
      const answers = Object.fromEntries(Object.entries(data).filter(([, v]) => filled(v) && !String(v).startsWith('[')));
      const res = await fetch('/api/intake/draft', {method: 'POST', body: JSON.stringify({category: category.name, subcategory: sub, kind, answers, target}), headers: {'content-type': 'application/json'}});
      if (!res.ok) throw new Error('AI draft request failed');
      const json = await res.json() as {title?: string; summary?: string};
      if (target === 'title' || target === 'both') {
        const t = String(json.title || '').trim();
        if (t) { setAuto(a => ({...a, title: t})); patch('title', t); }
      }
      if (target === 'summary' || target === 'both') {
        const s = String(json.summary || '').trim();
        if (s) { setAuto(a => ({...a, summary: s})); patch('summary', s); setCollapsed(c => ({...c, 'Description & ask': false})); }
      }
      if (!json.title && !json.summary) {
        const fallback = composeWriteup({sub: {name: sub, category: category.name}, fields, data});
        setAuto(a => ({...a, summary: fallback})); patch('summary', fallback);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'AI draft failed — using the deterministic write-up.', 'error');
      if (target !== 'title') {
        const fallback = composeWriteup({sub: {name: sub, category: category.name}, fields, data});
        setAuto(a => ({...a, summary: fallback})); patch('summary', fallback);
      }
    } finally { setAiBusy(false); }
  };
  const reviewThenFile = () => {
    const e: Record<string, string> = {};
    for (const f of missing) e[f.id] = 'Required for this sub-category';
    for (const g of gating) e[g.id] = g.reason;
    if (summaryShort) e.summary = 'Describe what happened in at least 12 characters.';
    setErrors(e);
    setFileError('');
    setReview(true);
  };
  const file = async () => {
    if (!plan || !category) return;
    setBusy(true); setFileError('');
    try {
      const input = toTicketInput({category: category.name, sub, fields, data, kind, submissionKey, classSnapshot, memberDetail: memberDetail ? {email: memberDetail.email, phone: memberDetail.phone, membership: memberDetail.membership} : undefined, momenceContext: memberDetail?.context});
      const {draft} = await api<{draft: AdvancedDraft}>('/api/tickets?preview=true', {method: 'POST', body: JSON.stringify(input)});
      const {ticket} = await api<{ticket: {id: number; ticketNumber: string}}>('/api/tickets?channel=form', {method: 'POST', body: JSON.stringify({...draft, submissionKey})});
      window.dispatchEvent(new Event('iris:tickets-updated'));
      setResult({ticket, draft}); setReview(false); setStep('done');
      notify(`${ticket.ticketNumber} filed · ${draft.assignedStaffName}`);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'The ticket could not be filed.');
    } finally { setBusy(false); }
  };
  // Seeded answers do not count as the desk's work; anything typed or chosen does.
  const SEEDED = new Set(['occurred_relative', 'reporter_type', 'preferred_contact', 'occurred_at', 'studio']);
  const dirty = step === 'form' && Object.entries(data).some(([k, v]) => filled(v) && !SEEDED.has(k) && String(auto[k]) !== String(v));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const reset = () => { setStep('category'); setCategory(undefined); setSub(''); setLoaded(undefined); setData({}); setAuto({}); setErrors({}); setResult(undefined); setClassDetail(null); setClassEntries({}); setMemberDetail(undefined); window.scrollTo({top: 0}); };
  const cancel = () => { if (dirty && !window.confirm('Discard this ticket? The answers on the form will be lost.')) return; reset(); };
  const onClassBuild = (r: ClassDeskResult) => {
    const c = taxonomy?.categories.find(x => x.name === r.category);
    if (!c) return;
    openSub(c, r.sub, r.answers, r.detail, r.entries);
    notify(`Class loaded · ${r.detail.item.name}`);
  };

  const stepIndex = step === 'category' || step === 'classdesk' ? 0 : step === 'subcategory' ? 1 : step === 'form' ? 2 : 3;

  return (
    <div className="intake">
      <header className="intake-head">
        <div className="intake-head-title">
          <span className="intake-orb"><Sparkles size={16} /></span>
          <div>
            <h1>Raise a ticket</h1>
            <p>Category → sub-category → the questions that desk needs → read it back → filed and routed.</p>
          </div>
        </div>
        <ol className="intake-stepper" aria-label="Progress">
          {['Category', 'Sub-category', 'Details', 'Review & file'].map((label, i) => (
            <li key={label} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="intake-stepper-dot">{i < stepIndex ? <Check size={11} /> : i + 1}</span><span className="intake-stepper-label">{label}</span>
            </li>
          ))}
        </ol>
        <div className="intake-head-actions">
          {step !== 'classdesk' && step !== 'done' && <button type="button" className="btn btn-sm" onClick={() => setStep('classdesk')}><CalendarDays size={13} /> Start from a class</button>}
          {onLegacy && <button type="button" className="btn btn-sm intake-legacy" onClick={onLegacy} title="Open the previous conversational intake"><MessageSquareText size={13} /> Legacy chat</button>}
        </div>
      </header>

      {loadError && <div className="error-box">{loadError} <button type="button" className="text-btn" onClick={() => location.reload()}>Retry</button></div>}
      {!taxonomy && !loadError && <div className="skeleton-cards intake-skeleton">{Array.from({length: 6}).map((_, i) => <div className="skeleton" key={i} style={{height: 150}} />)}</div>}

      {taxonomy && step === 'category' && <CategoryGrid taxonomy={taxonomy} onPick={c => { setCategory(c); setStep('subcategory'); window.scrollTo({top: 0, behavior: 'smooth'}); }} onClassDesk={() => setStep('classdesk')} />}
      {taxonomy && step === 'subcategory' && category && <SubcategoryGrid category={category} onBack={() => setStep('category')} onPick={s => openSub(category, s)} />}
      {taxonomy && step === 'classdesk' && <ClassDesk taxonomy={taxonomy} onBack={() => setStep('category')} onBuild={onClassBuild} />}

      {taxonomy && step === 'form' && category && (
        <div className="intake-form rise">
          <div className="intake-form-main">
            <div className="intake-form-head card">
              <div className="intake-crumbs">
                <button type="button" className="text-btn" onClick={() => setStep('category')}><ArrowLeft size={12} /> Categories</button>
                <ChevronRight size={12} className="muted" />
                <button type="button" className="text-btn" onClick={() => setStep('subcategory')}>{category.name}</button>
                <ChevronRight size={12} className="muted" />
                <strong>{sub}</strong>
              </div>
              <div className="between wrap" style={{gap: 12}}>
                <div>
                  <div className="intake-stage-label"><span>Step 3 of 4</span><i />Details</div>
                  <h2>{sub}</h2>
                  <p className="secondary" style={{fontSize: 12.5}}>Answer the essentials first. Relevant follow-up questions appear automatically.</p>
                </div>
                <div className="intake-head-controls">
                  {user?.role === 'admin' && <button type="button" className="intake-chip intake-admin-edit" onClick={()=>setDesigning(true)} title="Edit this live form and its routing"><Settings2 size={12}/> Design form</button>}
                  <div className="intake-kind" role="radiogroup" aria-label="What kind of entry is this">
                    {KINDS.map(k => <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={'intake-chip' + (kind === k.id ? ' on' : '')} title={k.hint} onClick={() => setKind(k.id)}>{k.label}</button>)}
                  </div>
                  <button type="button" className={'intake-chip intake-toggle' + (requiredOnly ? ' on' : '')} role="switch" aria-checked={requiredOnly} onClick={() => setRequiredOnly(v => !v)} title="Show only the questions the ticket cannot file without"><ListFilter size={12} /> Required only</button>
                </div>
              </div>
              <div className="intake-progress-row">
                <div className="progress-bar intake-progress" role="progressbar" aria-label="Required answers completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><span style={{width: `${completion}%`}} /></div>
                <span className="intake-progress-copy"><strong>{completion}%</strong> complete · {completedRequired}/{requiredVisible.length} required</span>
              </div>
            </div>
            {classSnapshot && (
              <div className="info-box intake-class-note"><CalendarDays size={14} /><span><strong>{classSnapshot.name}</strong> · {classSnapshot.booked ?? 0} booked, {classSnapshot.attended ?? 0} attended of {classSnapshot.capacity ?? '—'} places{classSnapshot.attendees?.length ? ` · ${classSnapshot.attendees.length} attendee note${classSnapshot.attendees.length > 1 ? 's' : ''} attached` : ''}. Read from Momence; the answers below were filled from it and stay editable.</span></div>
            )}
            {planBusy && !plan && <div className="skeleton-cards"><div className="skeleton" style={{height: 220}} /><div className="skeleton" style={{height: 220}} /></div>}
            {plan && <FormEngine fields={fields} data={data} patch={patch} errors={errors} auto={auto} collapsed={collapsed} onToggle={(s, c) => setCollapsed(x => ({...x, [s]: c}))} gatingIds={gatingIds} requiredOnly={requiredOnly}
              contextHeader={<IntakeContextHeader data={data} patch={patch} studio={studio} />}
              extras={{
                title: <button type="button" className="text-btn intake-writeup" onClick={() => aiDraft('title')} disabled={aiBusy} title="Tighten the title from the answers so far"><Sparkles size={11} /> AI title</button>,
                summary: <div className="flex-row" style={{gap: 6}}>
                  <button type="button" className="text-btn intake-writeup" onClick={writeUp} title="Phrase the answers already on this form as a paragraph — nothing is added that was not answered"><PenLine size={11} /> Write it up from the answers</button>
                  <button type="button" className="text-btn intake-writeup" onClick={() => aiDraft('both')} disabled={aiBusy} title="Ask the connected model to rewrite title and summary from the answers"><Sparkles size={11} />{aiBusy ? 'Drafting…' : 'AI draft'}</button>
                </div>,
              }} />}
            <div className="intake-footer">
              <span className="intake-footer-status">
                {missing.length + gating.length ? <>{missing.length + gating.length} outstanding · {missing.length ? `${missing.length} required` : ''}{missing.length && gating.length ? ' + ' : ''}{gating.length ? `${gating.map(g => g.label).join(' & ')} to link` : ''}</> : <><Check size={13} className="accent" /> Ready to route to {plan?.routing?.owner?.name || plan?.routing?.departmentName || 'the desk'}</>}
              </span>
              <div className="flex-row" style={{gap: 8}}>
                <button type="button" className="btn" onClick={cancel}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={reviewThenFile} disabled={!plan}><Zap size={14} /> Review & create ticket</button>
              </div>
            </div>
          </div>

          <aside className="intake-aside" aria-label="Ticket routing and readiness">
            <div className="intake-aside-title"><span>Live ticket preview</span><small>Updates as you answer</small></div>
            <div className="form-aside intake-aside-card">
              <div className="eyebrow">Routing</div>
              <div className="intake-route">
                <div className="intake-route-row"><Building2 size={14} /><div><small>Department</small><b>{plan?.routing?.departmentName || category.department.name || '—'}</b></div></div>
                <div className="intake-route-row">{plan?.routing?.owner ? <Avatar name={plan.routing.owner.name} tone="purple" /> : <Avatar name="" emptyDark />}<div><small>Owner{studio ? ` at ${studio.split(',')[0]}` : ''}</small><b>{plan?.routing?.owner?.name || 'Department queue'}</b>{plan?.routing?.owner?.role && <em>{plan.routing.owner.role}</em>}</div></div>
              </div>
              <div className="intake-route-badges">
                <Priority priority={priority} />
                {priority !== baseline && !recordOnly && <Badge tone="amber"><ShieldAlert size={10} /> raised from {baseline}</Badge>}
                <Badge tone={recordOnly ? 'green' : 'amber'}><Clock3 size={10} />{recordOnly ? 'Record only · no SLA' : `${slaHours}h follow-up target`}</Badge>
              </div>
              {plan?.sub.slaLabel && <p className="muted" style={{fontSize: 10.5, marginTop: 8}}>Support Hub tier: {plan.sub.slaLabel}</p>}
            </div>
            <div className="form-aside intake-aside-card">
              <div className="eyebrow">Linked records</div>
              <div className="intake-links">
                {memberRef ? <LookupChip module="member" value={encodeLookup(memberRef)} /> : <span className="intake-link-empty"><UserRound size={12} /> No member linked</span>}
                {filled(data.class_date) ? <LookupChip module="session" value={data.class_date} /> : <span className="intake-link-empty"><CalendarDays size={12} /> No class linked</span>}
              </div>
              {!user && <p className="muted flex-row" style={{fontSize: 10.5, marginTop: 10, gap: 6}}><LockKeyhole size={11} /> <span>Momence search needs a workspace sign-in. <button type="button" className="text-btn" style={{fontSize: 10.5}} onClick={openAuth}>Sign in</button></span></p>}
              {user && taxonomy && !taxonomy.momence.configured && <p className="muted" style={{fontSize: 10.5, marginTop: 10}}>Momence is not connected — lookups show demo records, labelled as such.</p>}
            </div>
            <div className="form-aside intake-aside-card">
              <div className="eyebrow">Before it files</div>
              <ul className="checklist intake-checklist">
                <li className={missing.length ? '' : 'ok'}>{missing.length ? <span className="intake-check-dot" /> : <Check size={13} />}{missing.length ? `${missing.length} required answer${missing.length > 1 ? 's' : ''} outstanding` : 'Every required question answered'}</li>
                <li className={gating.length ? '' : 'ok'}>{gating.length ? <span className="intake-check-dot" /> : <Check size={13} />}{gating.length ? `Link the ${gating.map(g => g.label.toLowerCase()).join(' and ')}` : 'Linked records in place'}</li>
                <li className={summaryShort || !filled(data.summary) ? '' : 'ok'}>{summaryShort || !filled(data.summary) ? <span className="intake-check-dot" /> : <Check size={13} />}A summary the owner can act on</li>
                <li className="ok"><Check size={13} />Idempotent filing — a double click cannot create two tickets</li>
              </ul>
              <button type="button" className="btn btn-primary" style={{width: '100%', marginTop: 14}} onClick={reviewThenFile} disabled={!plan}><Zap size={14} /> Review & create ticket</button>
            </div>
          </aside>
        </div>
      )}

      {step === 'done' && result && (
        <div className="intake-done rise">
          <div className="card intake-done-card">
            <span className="intake-done-icon"><CheckCircle2 size={26} /></span>
            <div className="grow">
              <div className="eyebrow">Step 4 of 4 · filed</div>
              <h2>{result.ticket.ticketNumber} is on the board</h2>
              <p className="secondary">{result.draft.title}</p>
              <div className="intake-done-facts">
                <div><small>Owner</small><b>{result.draft.assignedStaffName}</b><em>{result.draft.departmentName}</em></div>
                <div><small>Priority</small><Priority priority={result.draft.priority} /></div>
                <div><small>Follow-up target</small><b>{result.draft.slaHours ? `${result.draft.slaHours}h` : 'No SLA'}</b><em>{result.draft.slaLabel}</em></div>
              </div>
            </div>
            <div className="intake-done-actions">
              <button type="button" className="btn btn-primary" onClick={() => setDetailOpen(true)}>Open ticket <ArrowUpRight size={14} /></button>
              <Link className="btn" href={'/tickets/' + result.ticket.id}>Ticket page <ArrowRight size={13} /></Link>
              <button type="button" className="btn" onClick={reset}><RotateCcw size={13} /> Log another</button>
            </div>
          </div>
          <DraftDocument draft={{...result.draft, title: result.draft.title}} />
          <TicketDialog open={detailOpen} id={result.ticket.id} onClose={() => setDetailOpen(false)} />
        </div>
      )}

      {plan && category && (
        <ReviewSheet open={review} onClose={() => setReview(false)} plan={plan} data={data} kind={kind} priority={priority} slaHours={slaHours} recordOnly={recordOnly}
          missing={summaryShort ? [...missing, ...(missing.some(f => f.id === 'summary') ? [] : fields.filter(f => f.id === 'summary'))] : missing} gating={gating} onFix={fix} onFile={file} busy={busy} error={fileError} classSnapshot={classSnapshot} />
      )}
      {category&&sub&&<InlineFormDesigner key={`${category.name}|||${sub}`} open={designing} onClose={()=>setDesigning(false)} category={category.name} subcategory={sub} onPublished={async()=>{const params=new URLSearchParams({category:category.name,subcategory:sub});if(studio)params.set('studio',studio);const[t,p]=await Promise.all([api<IntakeTaxonomy>('/api/intake'),api<IntakePlan>(`/api/intake?${params}`)]);setTaxonomy(t);setLoaded({key:wantKey,plan:p});}}/>}
    </div>
  );
}
