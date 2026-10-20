"use client";
import {simpleLanguage} from "@/lib/plain-language";
import Link from 'next/link';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowLeft, ArrowRight, ArrowUpRight, Building2, CalendarClock, CalendarDays, Camera, Check, CheckCircle2, ChevronRight, ClipboardList, Clock3, FileAudio, IndianRupee, ListFilter, LockKeyhole, Megaphone, MessageSquareText, MonitorCog, Paperclip, PenLine, Quote, RotateCcw, Search, Settings2, ShieldAlert, Sparkles, UserRound, Wrench, Zap, type LucideIcon} from 'lucide-react';
import {Avatar, Badge, Priority, useApp, api} from '../ui';
import {PasscodeDialog} from '../passcode-dialog';
import {DraftDocument} from '../draft-document';
import {TicketDialog} from '../ticket-detail';
import {inferPriority} from '@/lib/routing';
import {defaultEntryKind, evaluateTicketPolicy} from '@/lib/ticket-policy';
import {object} from '@/lib/display';
import type {AdvancedDraft} from '@/lib/ticket-contract';
import {fieldsForKind, MEMBER_LOOKUP_IDS, composeWriteup, encodeLookup, filled, gatingFor, isMemberReporter, isSkipped, linkedLookup, localDateTime, missingFields, prefillFor, priorityInputs, seedData, titlePreview, toTicketInput, visibleFields, type ClassSnapshot, type IntakeData, type IntakeValue, type TicketKind} from '@/lib/intake/plan';
import {matchStudio, sessionFacts, sessionSnapshot, type RosterEntry, type SessionDetail} from '@/lib/intake/class-desk';
import {FormEngine, IntakeContextHeader, SECTION_META, SectionNav, groupSections, headerIds, sectionSlug, withInjected, type InjectedSection} from './form-engine';
import {HOSTED_FLAGS, HostedRoster, hostedRosterError, hostedRowMissing, type HostedRow} from './hosted-roster';
import {InvolvedTeams, suggestTeams, teamName} from './involved-teams';
import {alertFor, focusOf, tipsFor, type Tip} from './nuance';
import {CategoryArt, CATEGORY_TONE, HeroBackdrop} from '../ticket-art';
import {CategoryGrid, SubcategoryGrid} from './pickers';
import {ClassDesk, type ClassDeskResult} from './class-desk';
import {ReviewSheet} from './review-sheet';
import {hostedFeedbackError, isHostedClassTicket} from '@/lib/hosted-feedback';
import {LookupChip} from './lookup-field';
import type {IntakeCategory, IntakePlan, IntakeTaxonomy} from './types';
import {InlineFormDesigner} from '@/components/inline-form-designer';
import {AttachmentPreviewList, FileUpload, type UploadedFile} from '@/components/file-upload';

type Step = 'category' | 'subcategory' | 'form' | 'classdesk' | 'done';
type Result = {ticket: {id: number; ticketNumber: string}; draft: AdvancedDraft};
const KINDS: {id: TicketKind; label: string; hint: string}[] = [
  {id: 'issue', label: 'Issue', hint: 'Something went wrong and needs fixing'},
  {id: 'request', label: 'Request', hint: 'Something the studio or a member is asking for'},
  {id: 'feedback', label: 'Feedback', hint: 'An observation worth recording'},
  {id: 'compliment', label: 'Compliment', hint: 'Praise — recorded, no SLA'},
];
const STUDIO_KEY = 'iris-intake-studio';
const TIP_ICON: Record<Tip['icon'], LucideIcon> = {shield: ShieldAlert, rupee: IndianRupee, wrench: Wrench, monitor: MonitorCog, calendar: CalendarClock, user: UserRound, quote: Quote, megaphone: Megaphone, search: Search, clipboard: ClipboardList, camera: Camera, clock: Clock3};
const PRIORITY_STEPS = ['low', 'medium', 'high', 'critical'] as const;

/** Four bars that fill to the live priority. It moves as triage answers raise it. */
function PriorityMeter({priority, raised, recordOnly, slaHours}: {priority: string; raised: boolean; recordOnly: boolean; slaHours: number}) {
  const level = Math.max(0, PRIORITY_STEPS.indexOf(priority as typeof PRIORITY_STEPS[number]));
  return <div className="imeter" data-level={level} aria-label={`Priority ${priority}${raised ? ', raised by your answers' : ''}`}>
    <div className="imeter-bars" aria-hidden="true">{PRIORITY_STEPS.map((p, i) => <i key={p} className={i <= level ? 'on' : ''} style={{'--b': i} as React.CSSProperties} />)}</div>
    <div className="imeter-copy">
      <strong key={priority}>{priority[0].toUpperCase() + priority.slice(1)} priority</strong>
      <span>{recordOnly ? 'Recorded only · no resolution target' : `${slaHours}h resolution target`}{raised ? ' · raised by your answers' : ''}</span>
    </div>
  </div>;
}

function ProgressDial({value}: {value: number}) {
  const r = 22, c = 2 * Math.PI * r;
  return <div className="idial" role="progressbar" aria-label="Required answers completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r={r} className="idial-track" /><circle cx="26" cy="26" r={r} className="idial-fill" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} /></svg>
    <b>{value}<small>%</small></b>
  </div>;
}
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
  // One section open at a time; undefined opens the first.
  const [openSec, setOpenSec] = useState<string | null | undefined>(undefined);
  const [hostedRows, setHostedRows] = useState<HostedRow[]>([]);
  const [hostedStatus, setHostedStatus] = useState<'loading' | 'ready' | 'error'>('ready');
  const [kind, setKind] = useState<TicketKind>('issue');
  const [reviewDraft,setReviewDraft]=useState<AdvancedDraft>();
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
  const [askPass, setAskPass] = useState(false);
  const [designUnlocked, setDesignUnlocked] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  // Co-owning teams: the suggestion stands until the desk touches the chips.
  const [teamPick, setTeamPick] = useState<string[] | null>(null);
  const presetDone = useRef(false);

  const rememberedStudio = () => { try { return localStorage.getItem(STUDIO_KEY) || ''; } catch { return ''; } };

  /** Opens the form for a sub-category, seeding the shared block. `prefill` carries what the
   *  class desk read from Momence; it is badged as auto-filled and stays editable. */
  const openSub = useCallback((c: IntakeCategory, s: string, prefill: IntakeData = {}, detail: SessionDetail | null = null, entries: Record<string, RosterEntry> = {}, tax: IntakeTaxonomy | undefined = taxonomy) => {
    const reporter = tax?.reporter || (user ? {name: user.name, email: user.email} : undefined);
    const seed = seedData({studio: rememberedStudio(), ...prefill}, reporter || undefined);
    seed._involves_member = prefill._involves_member ?? 'No';
    seed._involves_class = prefill._involves_class ?? 'No';
    seed._requires_resolution = prefill._requires_resolution ?? (['compliment','feedback','assessment'].includes(defaultEntryKind(c.name,s))?'No':'Yes');
    const nextAuto: Record<string, IntakeValue> = {...Object.fromEntries(Object.entries(prefill).filter(([, v]) => filled(v)))};
    if (reporter?.name) nextAuto.reporter_name = reporter.name;
    if (reporter?.email) nextAuto.reporter_contact = reporter.email;
    // "Now" is an assumption until the desk touches it — a linked class may replace it.
    if (!filled(prefill.occurred_at) && filled(seed.occurred_at)) nextAuto.occurred_at = seed.occurred_at;
    // No title is seeded: left blank, the server writes a descriptive one from the summary.
    setCategory(c); setSub(s); setData(seed); setAuto(nextAuto); setErrors({}); setOpenSec(undefined); setHostedRows([]); setKind(defaultEntryKind(c.name,s));
    setClassDetail(detail); setClassEntries(entries); setMemberDetail(undefined); setResult(undefined); setFileError(''); setAttachments([]);
    setTeamPick(null); setSubmissionKey(crypto.randomUUID()); setStep('form');
    window.scrollTo({top: 0, behavior: 'smooth'});
  }, [taxonomy, user]);

  /** Accepts an IRIS suggestion: opens the form on that sub-category with what the description
   *  implied pre-filled (badged auto, editable) and the kind IRIS read. */
  const acceptSuggestion = (pick: {category: string; subcategory: string}, s: {prefill: IntakeData; kind: TicketKind}) => {
    const c = taxonomy?.categories.find(x => x.name === pick.category);
    if (!c || !c.subs.some(x => x.name === pick.subcategory)) { notify('That sub-category is not in this workspace.', 'error'); return; }
    openSub(c, pick.subcategory, s.prefill);
    setKind(s.kind);
  };

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
    const memberChange=MEMBER_LOOKUP_IDS.includes(id)||id==='_involves_member'&&v==='No';
    const sessionChange=id==='class_date'||id==='_involves_class'&&v==='No';
    if(memberChange||id==='studio')setMemberDetail(undefined);
    if(sessionChange||id==='studio'){setClassDetail(null);setClassEntries({});}
    setData(d=>{
      const next={...d,[id]:v};
      if(id==='_involves_member')next.reporter_type=v==='Yes'?'A member told me':'Staff observation';
      if(memberChange||id==='studio')for(const key of ['member_email','membership','preferred_contact'])if(next[key]===auto[key]||id==='studio')delete next[key];
      if(sessionChange||id==='studio')for(const key of ['class_format','trainer','occurred_at','scheduled_start_at'])if(next[key]===auto[key])delete next[key];
      if(id==='studio'){for(const key of [...MEMBER_LOOKUP_IDS,'class_date'])delete next[key];next._involves_member='No';next._involves_class='No';}
      return next;
    });
    setErrors(e=>{const fieldId=id.startsWith('_skip_')?id.slice(6):id;if(!e[fieldId])return e;const n={...e};delete n[fieldId];return n;});
  }, [auto]);


  // Praise is recorded, not triaged: the three triage questions stop being mandatory for it.
  const praise = kind === 'compliment';
  const fields=useMemo(()=>fieldsForKind(plan?.fields||[],kind,category?.name),[plan,kind,category?.name]);
  // What the sub-category already implies — the equipment a mic or AC ticket is about — is
  // filled in as soon as the plan arrives, and never over an answer already given.
  // Adjusted during render rather than in an effect: the plan arrives asynchronously, and a
  // field that flashes empty before an effect fills it is a field somebody starts answering.
  const prefillKey = fields.filter(f => f.prefill).map(f => `${f.id}=${f.prefill}`).join('|');
  const [prefilled, setPrefilled] = useState('');
  if (prefillKey && prefillKey !== prefilled) {
    setPrefilled(prefillKey);
    setData(d => {
      const add = Object.entries(prefillFor(fields)).filter(([id]) => !filled(d[id]));
      return add.length ? {...d, ...Object.fromEntries(add)} : d;
    });
  }

  // A linked member fills the contact block from Momence — never over an answer already typed.
  // Runs for a member picked in the form and for one the class desk flagged alike.
  const memberRef = MEMBER_LOOKUP_IDS.map(id => linkedLookup(data[id])).find(Boolean) || null;
  const memberId = memberRef?.id;
  const selectedMemberDetail=memberDetail?.id===memberId?memberDetail:undefined;
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
          take('trainer_under_review',facts.coach);
          if (facts.when) {take('occurred_at', localDateTime(facts.when));take('scheduled_start_at', localDateTime(facts.when));}
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
  const signals=priorityInputs(category?.name||'',sub,data);
  const policy=evaluateTicketPolicy({category:category?.name||'',subcategory:sub,kind,resolutionRequired:!/^no$/i.test(String(data._requires_resolution||'Yes')),impact:signals.impact,customFields:signals},
    {responseHours:taxonomy?.responseHours||{critical:12,high:16,medium:48,low:72},subcategoryRouting:plan?.slaOverride!=null?{[`${category?.name}|||${sub}`]:{slaHours:plan.slaOverride}}:{}});
  const {priority,slaHours}=policy;
  const recordOnly=!policy.resolutionRequired;
  const classSnapshot: ClassSnapshot | null = useMemo(() => classDetail&&sessionId===classDetail.item.id ? sessionSnapshot(classDetail,classEntries) : null,[classDetail,classEntries,sessionId]);


  const fix = (id: string) => {
    setReview(false);
    const f = fields.find(x => x.id === id);
    if (f) setOpenSec(f.section);
    setTimeout(() => {
      const el = document.querySelector(`[data-fid="${id}"]`) || document.querySelector(`[data-fids~="${id}"]`);
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
    setOpenSec('Feedback and requested action');
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
        if (s) { setAuto(a => ({...a, summary: s})); patch('summary', s); setOpenSec('Feedback and requested action'); }
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
  const buildInput=()=> { if(!category)throw new Error('Select a category.'); return toTicketInput({category: category.name, sub, fields, data, kind, submissionKey, classSnapshot, involvedTeams: involvedTeams.length ? involvedTeams : undefined, hostedAttendees: hostedClass ? hostedRows.map(r => ({name: r.name, memberId: r.memberId, email: r.email, session: r.session, booking: r.booking, attendance: r.attendance, outcome: r.outcome, followUp: r.followUp, flags: r.flags.map(f => HOSTED_FLAGS.find(x => x.id === f)?.label || f), note: r.note})) : undefined, memberDetail: selectedMemberDetail ? {email: selectedMemberDetail.email, phone: selectedMemberDetail.phone, membership: selectedMemberDetail.membership} : undefined, momenceContext: selectedMemberDetail?.context}); };
  const reviewThenFile = async () => {
    const e: Record<string, string> = {};
    for (const f of missing) e[f.id] = 'Required for this sub-category';
    for (const g of gating) e[g.id] = g.reason;
    if (hostedError) e._hosted_comments = hostedError;
    if (summaryShort) e.summary = 'Describe what happened in at least 12 characters.';
    setErrors(e);
    setFileError('');
    if(Object.keys(e).length){setReviewDraft(undefined);setReview(true);return;}
    setBusy(true);
    try{const {draft}=await api<{draft:AdvancedDraft}>('/api/tickets?preview=true',{method:'POST',body:JSON.stringify(buildInput())});setReviewDraft(draft);setReview(true);}
    catch(error){notify(error instanceof Error?error.message:'The ticket could not be reviewed.','error');}
    finally{setBusy(false);}
  };
  const file = async () => {
    if (!plan || !category) return;
    if (hostedError) { setFileError(hostedError); jump('Attendees'); return; }
    setBusy(true); setFileError('');
    try {
      const input=buildInput();
      const {draft} = await api<{draft: AdvancedDraft}>('/api/tickets?preview=true', {method: 'POST', body: JSON.stringify(input)});
      if(reviewDraft&&['category','subcategory','priority','slaHours','resolutionRequired'].some(key=>draft[key as keyof AdvancedDraft]!==reviewDraft[key as keyof AdvancedDraft])){setReviewDraft(draft);setFileError('The routing or action policy changed. Review the updated details and submit again.');return;}
      const {ticket} = await api<{ticket: AdvancedDraft & {id: number; ticketNumber: string}}>('/api/tickets?channel=form', {method: 'POST', body: JSON.stringify(input)});
      if (attachments.some(a => a.file)) {
        const form = new FormData();
        attachments.forEach(a => { if (a.file) form.append('files', a.file); });
        const upload = await fetch(`/api/tickets/${ticket.id}/resolution/attachments`, {method: 'POST', body: form});
        if (!upload.ok) throw new Error(`${ticket.ticketNumber} was saved, but its attachments could not be uploaded. Retry filing to attach the files to the same ticket.`);
      }
      window.dispatchEvent(new Event('iris:tickets-updated'));
      setResult({ticket, draft:{...draft,...ticket}}); setReview(false); setStep('done');
      notify(`${ticket.ticketNumber} created · ${ticket.assignedStaffName}`);
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
  const reset = () => { setTeamPick(null); setStep('category'); setCategory(undefined); setSub(''); setLoaded(undefined); setData({}); setAuto({}); setErrors({}); setResult(undefined); setClassDetail(null); setClassEntries({}); setMemberDetail(undefined); setHostedRows([]); setAttachments([]); window.scrollTo({top: 0}); };
  const cancel = () => { if (dirty && !window.confirm('Discard this ticket? The answers on the form will be lost.')) return; reset(); };
  const onClassBuild = (r: ClassDeskResult) => {
    const c = taxonomy?.categories.find(x => x.name === r.category);
    if (!c) return;
    openSub(c, r.sub, r.answers, r.detail, r.entries);
    notify(`Class loaded · ${r.detail.item.name}`);
  };

  const tone = category ? CATEGORY_TONE[category.name] || 'accent' : 'accent';
  const tips = useMemo(() => category && sub ? tipsFor(category.name, sub) : [], [category, sub]);
  const alert = step === 'form' ? alertFor(data) : null;
  // Both hosted-class ticket types (the brand feedback form and the ops lead-capture record)
  // are a roster of real people: the roster is required and cannot be skipped.
  const hostedClass = Boolean(category && isHostedClassTicket(category.name, sub));
  const hostedLinked = hostedClass && linkedLookup(data.class_date) !== null;
  const hostedError = hostedClass && category
    ? hostedRosterError(hostedRows, {status: hostedStatus, linked: hostedLinked}) || hostedFeedbackError(category.name, sub, hostedRows.map(r => ({name: r.name, attendance: r.attendance, note: r.note})))
    : null;
  const hostedIncomplete = hostedRows.filter(r => hostedRowMissing(r).length).length;
  const hostedGate = hostedError ? [{id: '_hosted_comments', label: 'Attendee roster', reason: hostedError}] : [];
  // Teams that co-own the ticket beside the lead department.
  const leadDept = plan?.routing?.departmentId || category?.department.id || null;
  const memberInvolved = Boolean(memberRef) || /yes|directly|indirectly/i.test(String(data._involves_member || '')) || isMemberReporter(data.reporter_type) || /member told me/i.test(String(data.reporter_type || ''));
  const teamText = [data.summary, data.asset_type, data.specific_area, data.experience_dimension].filter(filled).map(v => Array.isArray(v) ? v.join(' ') : String(v)).join(' ');
  const suggested = useMemo(() => category && sub && policy.resolutionRequired ? suggestTeams({category: category.name, sub, memberInvolved, text: teamText}).filter(t => t !== leadDept) : [], [category, sub, memberInvolved, teamText, leadDept,policy.resolutionRequired]);
  const involvedTeams = (teamPick ?? suggested).filter(t => t !== leadDept);
  const baseSections = useMemo(() => groupSections(fields, data, {hidden: headerIds(fields), requiredOnly, gatingIds, errors}), [fields, data, requiredOnly, gatingIds, errors]);
  // The roster fills the head-count questions it can answer, never over a typed number.
  const onHostedRows = useCallback((next: HostedRow[] | ((prev: HostedRow[]) => HostedRow[]), loaded?: {firstTimers: number; booked: number}) => {
    setHostedRows(next);
    if (!loaded) return;
    setData(d => {
      const add: IntakeData = {};
      if (!filled(d.guest_count) && loaded.booked) add.guest_count = String(loaded.booked);
      if (!filled(d.newcomer_count) && loaded.firstTimers) add.newcomer_count = String(loaded.firstTimers);
      if (!Object.keys(add).length) return d;
      setAuto(a => ({...a, ...add}));
      return {...d, ...add};
    });
  }, []);
  const injected: InjectedSection[] = hostedClass ? [{
    name: 'Attendees', after: baseSections.some(x => x.name === 'Class context') ? 'Class context' : 'Where & when',
    answered: hostedRows.length - hostedIncomplete, total: hostedRows.length,
    // Required: at least one row, and every row complete.
    required: Math.max(1, hostedRows.length), missing: hostedRows.length ? hostedIncomplete : 1, errors: hostedError && errors._hosted_comments ? 1 : 0,
    body: <HostedRoster sessions={data.class_date} rows={hostedRows} onRows={onHostedRows} onStatus={setHostedStatus} error={hostedError} />,
  }] : [];
  const navSections = withInjected(baseSections, injected);
  const focus = useMemo(() => focusOf(visible.filter(f => !headerIds(fields).has(f.id))), [visible, fields]);
  const jump = (name: string) => {
    setOpenSec(name);
    setTimeout(() => document.getElementById(sectionSlug(name))?.scrollIntoView({behavior: 'smooth', block: 'start'}), 30);
  };

  const stepIndex = step === 'category' || step === 'classdesk' ? 0 : step === 'subcategory' ? 1 : step === 'form' ? 2 : 3;

  return (
    <div className="intake">
      <header className="intake-head">
        <div className="intake-head-title">
          <span className="intake-orb"><Sparkles size={16} /></span>
          <div>
            <h1>Raise a ticket</h1>
            <p>Select a category, provide the relevant details, then review and submit.</p>
          </div>
        </div>
        <ol className="intake-stepper" aria-label="Progress">
          {['Category', 'Sub-category', 'Details', 'Review and submit'].map((label, i) => (
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

      {taxonomy && step === 'category' && <CategoryGrid taxonomy={taxonomy} onPick={c => { setCategory(c); setStep('subcategory'); window.scrollTo({top: 0, behavior: 'smooth'}); }} onClassDesk={() => setStep('classdesk')} onSuggest={acceptSuggestion} />}
      {taxonomy && step === 'subcategory' && category && <SubcategoryGrid category={category} onBack={() => setStep('category')} onPick={s => openSub(category, s)} />}
      {taxonomy && step === 'classdesk' && <ClassDesk taxonomy={taxonomy} onBack={() => setStep('category')} onBuild={onClassBuild} />}

      {taxonomy && step === 'form' && category && (
        <div className="isheet" data-tone={tone} data-alert={alert?.tone} data-priority={priority}>
          <header className="isheet-hero">
            <HeroBackdrop tone={tone} />
            <CategoryArt category={category.name} className="isheet-art" />
            <div className="isheet-hero-layout">
              <div className="isheet-hero-left">
                <nav className="intake-crumbs" aria-label="Breadcrumb">
                  <button type="button" className="text-btn" onClick={() => setStep('category')}><ArrowLeft size={12} /> Categories</button>
                  <ChevronRight size={12} className="muted" />
                  <button type="button" className="text-btn" onClick={() => setStep('subcategory')}>{category.name}</button>
                  <ChevronRight size={12} className="muted" />
                  <strong>{simpleLanguage(sub)}</strong>
                </nav>
                <div className="isheet-hero-copy">
                  <h2>{simpleLanguage(sub)}</h2>
                  <p>{category.department.name || 'Operations'}{plan?.sub.hist ? ` · filed ${plan.sub.hist} times before` : ''}{recordOnly?' · Recorded for reference':` · ${slaHours}h resolution target`}</p>
                </div>
                <ul className="isheet-tips">
                  {tips.map(t => { const Icon = TIP_ICON[t.icon]; return <li key={t.text}><Icon size={13} /><span>{t.text}</span></li>; })}
                </ul>
              </div>
              <div className="isheet-hero-right">
                <button type="button" className="isheet-design" onClick={() => designUnlocked ? setDesigning(true) : setAskPass(true)} title="Edit this live form and its routing">{designUnlocked ? <Settings2 size={13} /> : <LockKeyhole size={13} />} Design form</button>
                <PriorityMeter priority={priority} raised={priority !== baseline && !recordOnly} recordOnly={recordOnly} slaHours={slaHours} />
                {focus.length > 0 && <div className="isheet-focus" aria-label="This form covers">{focus.map(name => { const Icon = SECTION_META[name]?.icon; return <button type="button" key={name} className="isheet-focus-chip" onClick={() => jump(name)}>{Icon && <Icon size={11} />}{name}</button>; })}</div>}
              </div>
            </div>
            <div className="isheet-controls">
              <div className="intake-kind" role="radiogroup" aria-label="What kind of entry is this">
                <span className="intake-kind-thumb" aria-hidden="true" style={{'--k': KINDS.findIndex(k => k.id === kind)} as React.CSSProperties} />
                {KINDS.map(k => <button type="button" key={k.id} role="radio" aria-checked={kind === k.id} className={'intake-chip' + (kind === k.id ? ' on' : '')} title={k.hint} onClick={() => {setKind(k.id);patch('_requires_resolution',['feedback','compliment'].includes(k.id)?'No':'Yes');}}>{k.label}</button>)}
              </div>
              <button type="button" className={'intake-chip intake-toggle' + (requiredOnly ? ' on' : '')} role="switch" aria-checked={requiredOnly} onClick={() => setRequiredOnly(v => !v)} title="Show only the questions the ticket cannot file without"><ListFilter size={12} /> Required only</button>
            </div>
            {alert && (
              <div className={'isheet-alert ' + alert.tone} role="alert" key={alert.title}>
                <ShieldAlert size={16} /><div><strong>{alert.title}</strong><span>{alert.body}</span></div>
              </div>
            )}
          </header>

          <div className="isheet-grid">
            <div className="isheet-main">
              {classSnapshot && (
                <div className="isheet-note"><CalendarDays size={14} /><span><strong>{classSnapshot.name}</strong> · {classSnapshot.booked ?? 0} booked, {classSnapshot.attended ?? 0} attended of {classSnapshot.capacity ?? '—'} places{classSnapshot.attendees?.length ? ` · ${classSnapshot.attendees.length} attendee note${classSnapshot.attendees.length > 1 ? 's' : ''} attached` : ''}. Read from Momence; the answers below were filled from it and stay editable.</span></div>
              )}
              {(selectedMemberDetail || classSnapshot) && (
                <div className="momence-enrichment" aria-label="Linked Momence details">
                  {selectedMemberDetail && <div><span><UserRound size={13}/> Member profile</span><strong>{memberRef?.label || 'Linked member'}</strong><p>{[selectedMemberDetail.email, selectedMemberDetail.phone, selectedMemberDetail.membership].filter(Boolean).join(' · ') || 'Profile linked; no contact or membership details returned.'}</p></div>}
                  {classSnapshot && <div><span><CalendarDays size={13}/> Class details</span><strong>{classSnapshot.name}</strong><p>{[classSnapshot.trainer, classSnapshot.startsAt ? new Date(classSnapshot.startsAt).toLocaleString('en-IN') : '', classSnapshot.studio].filter(Boolean).join(' · ')}</p><small>{classSnapshot.booked ?? 0} booked · {classSnapshot.attended ?? 0} attended · {classSnapshot.waitlist ?? 0} waitlisted · {classSnapshot.fillPct ?? 0}% fill</small></div>}
                </div>
              )}
              {planBusy && !plan && <div className="isheet-skeleton"><div className="skeleton" style={{height: 180}} /><div className="skeleton" style={{height: 240}} /></div>}
              {plan && <FormEngine fields={fields} data={data} patch={patch} errors={errors} auto={auto} open={openSec} onOpen={setOpenSec} injected={injected} onFinish={reviewThenFile} gatingIds={gatingIds} requiredOnly={requiredOnly}
                contextHeader={<IntakeContextHeader data={data} patch={patch} studio={studio} fields={fields} gatingIds={gatingIds} hostedClass={hostedClass} />}
                extras={{
                  title: <button type="button" className="text-btn intake-writeup" onClick={() => aiDraft('title')} disabled={aiBusy} title="Tighten the title from the answers so far"><Sparkles size={11} /> AI title</button>,
                  summary: <span className="flex-row" style={{gap: 10}}>
                    <button type="button" className="text-btn intake-writeup" onClick={writeUp} title="Phrase the answers already on this form as a paragraph. Nothing is added that was not answered."><PenLine size={11} /> Write it up from the answers</button>
                    <button type="button" className="text-btn intake-writeup" onClick={() => aiDraft('both')} disabled={aiBusy} title="Ask the connected model to rewrite the title and summary from the answers"><Sparkles size={11} />{aiBusy ? 'Drafting…' : 'AI draft'}</button>
                  </span>,
                }} />}
              <section className="intake-evidence-panel" aria-label="Supporting evidence">
                <div><span className="intake-evidence-icon"><Paperclip size={15}/></span><div><strong>Supporting files &amp; voice notes</strong><p>Attach images, PDFs, documents, spreadsheets, audio recordings, or voice notes. They stay linked to the ticket.</p></div></div>
                <div className="intake-evidence-actions"><FileUpload files={attachments} onFilesSelected={setAttachments} maxFiles={8}/><span><FileAudio size={13}/>{attachments.length ? `${attachments.length} attached` : 'Up to 8 files · 10 MB each'}</span></div>
                <AttachmentPreviewList files={attachments} onRemove={id => setAttachments(current => current.filter(file => file.id !== id))}/>
              </section>
            </div>

            <aside className="isheet-aside" aria-label="Progress and routing">
              <div className="isheet-aside-block isheet-progress">
                <ProgressDial value={completion} />
                <div><strong>{completedRequired} of {requiredVisible.length} required</strong><span>{missing.length + gating.length + hostedGate.length ? `${missing.length + gating.length + hostedGate.length} still to answer or link` : 'Required details complete'}</span></div>
              </div>
              {plan && <div className="isheet-aside-block"><SectionNav sections={navSections} onJump={jump} /></div>}
              <div className="isheet-aside-block">
                <div className="isheet-aside-label">Routes to</div>
                <div className="intake-route">
                  <div className="intake-route-row"><Building2 size={14} /><div><small>Department</small><b>{plan?.routing?.departmentName || category.department.name || '—'}</b></div></div>
                  <div className="intake-route-row">{plan?.routing?.owner ? <Avatar name={plan.routing.owner.name} tone="purple" /> : <Avatar name="" emptyDark />}<div><small>Owner{studio ? ` at ${studio.split(',')[0]}` : ''}</small><b>{plan?.routing?.owner?.name || 'Department queue'}</b>{plan?.routing?.owner?.role && <em>{plan.routing.owner.role}</em>}</div></div>
                </div>
                <InvolvedTeams lead={leadDept} value={involvedTeams} suggested={suggested} onChange={setTeamPick} />
              </div>
              <div className="isheet-aside-block">
                <div className="isheet-aside-label">Linked records</div>
                <div className="intake-links">
                  {memberRef ? <LookupChip module="member" value={encodeLookup(memberRef)} /> : <span className="intake-link-empty"><UserRound size={12} /> No member linked</span>}
                  {filled(data.class_date) ? <LookupChip module="session" value={data.class_date} /> : <span className="intake-link-empty"><CalendarDays size={12} /> No class linked</span>}
                </div>
                {!user && <p className="muted flex-row" style={{fontSize: 10.5, marginTop: 10, gap: 6}}><LockKeyhole size={11} /> <span>Momence search needs a workspace sign-in. <button type="button" className="text-btn" style={{fontSize: 10.5}} onClick={openAuth}>Sign in</button></span></p>}
                {user && taxonomy && !taxonomy.momence.configured && <p className="muted" style={{fontSize: 10.5, marginTop: 10}}>Momence is not connected. Lookups show demo records, labelled as such.</p>}
              </div>
            </aside>
          </div>

          <footer className="isheet-foot">
            <span className="intake-footer-status">
              {missing.length + gating.length + hostedGate.length ? <><span className="isheet-foot-dot" />{[
                missing.length ? `${missing.length} required answer${missing.length > 1 ? 's' : ''}` : '',
                gating.length ? `${gating.map(g => g.label.toLowerCase()).join(' & ')} to link` : '',
                hostedError ? (hostedRows.length ? `${hostedIncomplete} attendee row${hostedIncomplete === 1 ? '' : 's'} to complete` : 'at least one attendee to add') : '',
              ].filter(Boolean).join(' and ')}</> : <><Check size={13} className="accent" /> Ready to submit · {plan?.routing?.owner?.name || plan?.routing?.departmentName || 'department queue'}{involvedTeams.length ? ` + ${involvedTeams.length} team${involvedTeams.length > 1 ? 's' : ''}` : ''}</>}
            </span>
            <div className="flex-row" style={{gap: 8}}>
              <button type="button" className="btn" onClick={cancel}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={reviewThenFile} disabled={!plan}><Zap size={14} /> Review &amp; create ticket</button>
            </div>
          </footer>
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
                <div><small>Resolution target</small><b>{result.draft.slaHours ? `${result.draft.slaHours}h` : 'No SLA'}</b><em>{result.draft.slaLabel}</em></div>
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
        <ReviewSheet open={review} onClose={() => setReview(false)} plan={reviewDraft?{...plan,sub:{...plan.sub,category:reviewDraft.category,name:reviewDraft.subcategory},routing:{departmentId:reviewDraft.departmentId,departmentName:reviewDraft.departmentName,owner:reviewDraft.assignedStaffId?{name:reviewDraft.assignedStaffName,role:reviewDraft.assignedStaffRole}:null,autoAssign:true}}:plan} data={data} kind={kind} priority={reviewDraft?.priority||priority} slaHours={reviewDraft?.slaHours??slaHours} recordOnly={reviewDraft?!reviewDraft.resolutionRequired:recordOnly}
          missing={summaryShort ? [...missing, ...(missing.some(f => f.id === 'summary') ? [] : fields.filter(f => f.id === 'summary'))] : missing} gating={[...gating, ...hostedGate]} onFix={id => { if (id === '_hosted_comments') { setReview(false); jump('Attendees'); } else fix(id); }} onFile={file} busy={busy} error={fileError} classSnapshot={classSnapshot}
          titlePreview={titlePreview(data)} involvedTeams={involvedTeams.map(teamName)} hostedRows={hostedClass ? hostedRows : undefined} />
      )}
      <PasscodeDialog open={askPass} onClose={() => setAskPass(false)} onUnlock={() => { setDesignUnlocked(true); setAskPass(false); setDesigning(true); }} />
      {category&&sub&&<InlineFormDesigner key={`${category.name}|||${sub}`} open={designing} onClose={()=>setDesigning(false)} category={category.name} subcategory={sub} onPublished={async()=>{const params=new URLSearchParams({category:category.name,subcategory:sub});if(studio)params.set('studio',studio);const[t,p]=await Promise.all([api<IntakeTaxonomy>('/api/intake'),api<IntakePlan>(`/api/intake?${params}`)]);setTaxonomy(t);setLoaded({key:wantKey,plan:p});}}/>}
    </div>
  );
}
