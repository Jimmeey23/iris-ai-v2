/**
 * The taxonomy-driven field plan behind the Iris intake form.
 *
 * Ported from Jimmeey23/physique57-support-hub (src/forms.jsx, conditions.js, lookups.jsx,
 * core.js). The plan itself lives in plan-data.json (built by scripts/build-intake-plan.mjs);
 * this module turns it into fields for one sub-category, decides which of them are visible,
 * groups them into sections, and maps the answers onto Iris's ticket contract.
 *
 * Everything here is pure and runs on both sides: the API route uses it to serve a plan, the
 * form uses it to evaluate visibility, gating and the live routing preview per keystroke.
 */
import planData from './plan-data.json';
import type {TicketInput} from '../ticket-contract';

export type IntakeFieldType = 'text' | 'textarea' | 'number' | 'url' | 'datetime' | 'select' | 'multiselect' | 'radio' | 'lookup';
export type LookupModule = 'member' | 'session' | 'ticket';

export type IntakeField = {
  id: string;
  label: string;
  type: IntakeFieldType;
  desc?: string;
  required?: boolean;
  conditional?: boolean;
  dependsOn?: string;
  condText?: string;
  placeholder?: string;
  options?: string[];
  module?: LookupModule;
  multi?: boolean;
  /** Class-desk enrichment group (class, roster, trainer, asset, payment, vendor). */
  enrich?: string;
  /** True for the block every sub-category shares. */
  universal?: boolean;
  /** Resolved dependency: the field whose answer reveals this one, or null. */
  dep: string | null;
  /** Optional regex (source) the dependency's answer must match for this field to show. Plain
   *  conditional fields only need the dependency answered; this narrows it to particular answers. */
  when?: string;
  section: string;
};

export type IntakeSubMeta = {
  key: string;
  category: string;
  name: string;
  /** Support Hub's own tier for the sub-category; Iris's routing decides the filed priority. */
  hubPriority: string;
  slaLabel: string;
  hours: [number | null, number | null];
  hist: number;
  fieldCount: number;
  requiredCount: number;
};

type RawDef = {
  id: string; label: string; type: IntakeFieldType; desc?: string; required?: boolean; conditional?: boolean;
  dependsOn?: string; condText?: string; placeholder?: string; o?: number; options?: string[]; module?: LookupModule; multi?: boolean; enrich?: string;
  when?: string;
};
type RawSub = {f: number[]; p: string; sla: string; h: [number | null, number | null]; hist: number; department?: string};
type PlanData = {
  source: {repo: string; file: string; commit: string; generatedAt: string};
  opts: string[][];
  defs: RawDef[];
  universal: number[];
  categories: {name: string; department: string; owners: {mumbai: string; bengaluru: string; l1: string; l2: string}; subs: string[]}[];
  subs: Record<string, RawSub>;
  cycleIntake: {key: string; prompt: string; type: string; values?: string[]}[];
};
const DATA = planData as unknown as PlanData;

export const PLAN_SOURCE = DATA.source;
export const subKey = (category: string, sub: string) => `${category}|||${sub}`;

/* ------------------------------------------------------------------ sections */
const SECTION: Record<string, string> = {
  reporter_type: 'Reporter', report_channel: 'Reporter', reporter_name: 'Reporter', reporter_contact: 'Reporter', preferred_contact: 'Reporter', follow_up_channel: 'Reporter',
  studio: 'Where & when', area: 'Where & when', occurred_at: 'Where & when', occurred_relative: 'Where & when',
  class_format: 'Class context', class_date: 'Class context', trainer: 'Class context',
  member_name: 'Who this is about', member_named: 'Who this is about', member_email: 'Who this is about',
  member_id: 'Who this is about', membership: 'Who this is about', notified_members: 'Who this is about',
  valet_ticket: 'Evidence', ticket_vendor: 'Evidence', asset_link: 'Evidence',
  affected_count: 'Impact & triage', is_repeat: 'Impact & triage', linked_ticket: 'Impact & triage',
  member_impact: 'Impact & triage', class_impacted: 'Impact & triage', immediate_danger: 'Impact & triage',
  sentiment: 'Impact & triage', churn_risk: 'Impact & triage',
  title: 'Description & ask', summary: 'Description & ask', requested_outcome: 'Description & ask',
};
const ENRICH_SECTION: Record<string, string> = {class: 'Class detail', roster: 'Roll call', trainer: 'Trainer detail', asset: 'Asset detail', payment: 'Payment detail', vendor: 'Vendor detail'};
export const ENRICH_SECTIONS = new Set(Object.values(ENRICH_SECTION));
export const SECTION_ORDER = ['Reporter', 'Who this is about', 'Where & when', 'Class context', 'Impact & triage', 'Sub-category specifics', 'Description & ask', 'Evidence', ...Object.values(ENRICH_SECTION)];
/** Enrichment groups (what the class desk captures, asset/payment/vendor detail) sit in their
 *  own optional sections so a 50-question plan reads as a short form with drawers. */
export const sectionOf = (id: string, enrich?: string) => SECTION[id] || (enrich && ENRICH_SECTION[enrich]) || 'Sub-category specifics';

/* ------------------------------------------------------------------ taxonomy */
export type HubCategory = PlanData['categories'][number];
export function hubCategories(): HubCategory[] { return DATA.categories; }
export function hubSub(category: string, sub: string): IntakeSubMeta | null {
  const raw = DATA.subs[subKey(category, sub)];
  if (!raw) return null;
  const overlay = SUB_OVERLAYS[subKey(category, sub)] || [];
  const defs = [...DATA.universal.map(i => DATA.defs[i]), ...raw.f.map(i => DATA.defs[i]), ...overlay];
  const seen = new Set<string>(); let required = 0, total = 0;
  for (const d of defs) { if (seen.has(d.id)) continue; seen.add(d.id); total++; if (d.required) required++; }
  return {key: subKey(category, sub), category, name: sub, hubPriority: raw.p, slaLabel: raw.sla, hours: raw.h, hist: raw.hist, fieldCount: total, requiredCount: required};
}
export function cycleIntakeQuestions() { return DATA.cycleIntake; }
/** The controlled list a plan field answers from, by id — the class desk shares these lists
 *  with the form so the two can never drift apart. */
export function fieldOptions(id: string): string[] {
  const def = DATA.defs.find(d => d.id === id && typeof d.o === 'number');
  return def && typeof def.o === 'number' ? DATA.opts[def.o] : [];
}

/* ------------------------------------------------------------------ fields */
export type PlanContext = {studios: string[]; formats: string[]; trainers: string[]; memberships?: string[]};

function materialise(def: RawDef, universal: boolean, ctx: PlanContext): Omit<IntakeField, 'dep'> {
  const f: Omit<IntakeField, 'dep'> = {id: def.id, label: def.label, type: def.type, section: sectionOf(def.id, def.enrich), universal};
  if (def.desc) f.desc = def.desc;
  if (def.required) f.required = true;
  if (def.conditional) f.conditional = true;
  if (def.dependsOn) f.dependsOn = def.dependsOn;
  if (def.condText) f.condText = def.condText;
  if (def.placeholder) f.placeholder = def.placeholder;
  if (def.module) f.module = def.module;
  if (def.multi) f.multi = true;
  if (def.enrich) f.enrich = def.enrich;
  if (def.when) f.when = def.when;
  // Iris owns the workspace directories; the Hub's copies are replaced at build time.
  if (def.id === 'studio') f.options = ctx.studios;
  else if (def.id === 'class_format') f.options = ctx.formats;
  else if (def.id === 'trainer' || def.id === 'trainer_under_review') f.options = ctx.trainers;
  else if (def.id === 'membership' && def.type !== 'lookup' && ctx.memberships?.length) f.options = ctx.memberships;
  else if (def.id === 'area') f.options = []; // per studio, see areasFor in the form
  else if (Array.isArray(def.options) && def.options.length) f.options = def.options;
  else if (typeof def.o === 'number') f.options = DATA.opts[def.o];
  return f;
}

/** Which field does the condition talk about? Explicit `dependsOn` wins when the field is on
 *  this form; otherwise the prose is scanned for a field id. No match → always visible, so a
 *  required field can never be hidden by a dependency we cannot resolve. */
function dependencyOf(f: Omit<IntakeField, 'dep'>, index: Map<string, unknown>): string | null {
  if (f.dependsOn && index.has(f.dependsOn)) return f.dependsOn;
  if (f.dependsOn) return null;
  if (!f.conditional) return null;
  const prose = (f.condText || '').toLowerCase();
  if (!prose || /^no\b/.test(prose.trim())) return null;
  for (const id of index.keys()) if (prose.includes(id.replace(/_/g, ' ')) || prose.includes(id)) return id;
  return null;
}

/** Reporter answers that say a member is at the centre of the ticket: one filing for themselves,
 *  a prospect, or staff passing on what a member told them. */
export const MEMBER_REPORTER = /^(member|prospect)|member told me/i;

/** Iris's ticket has a member on it whatever the drawer, but half the Hub's plans carry no member
 *  field at all (the class desk lists attendees instead). Those plans get one shared, optional
 *  lookup — the class desk pre-fills it with the flagged attendee, and it becomes a gate when
 *  staff file on a member's behalf — so the member column is linked from Momence rather than
 *  left as "studio team observation". */
const MEMBER_LOOKUP_DEF: RawDef = {
  id: 'member_name', label: 'Member this is about', type: 'lookup', module: 'member',
  desc: 'Leave blank for a studio observation. Picking the member links their Momence record, so the ticket carries their contact and membership.',
};

/** Extra questions that make sense only for a specific sub-category. These are injected
 *  after the Hub plan so a rebuild of plan-data.json does not wipe them. */
const CLASS_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SUB_OVERLAYS: Record<string, RawDef[]> = {
  'Scheduling|||Level Change': [
    {id: 'current_level', label: 'Current level', type: 'select', desc: 'The class level the member is currently booked into or attending.', required: true, options: CLASS_LEVELS},
    {id: 'requested_level', label: 'Requested level', type: 'select', desc: 'The level the member wants to move to.', required: true, options: CLASS_LEVELS},
    {id: 'change_day', label: 'Preferred day(s)', type: 'multiselect', desc: 'Which day(s) of the week work for the new level.', required: true, options: DAYS_OF_WEEK},
    {id: 'change_time', label: 'Preferred time', type: 'text', desc: 'e.g. 7:00 AM, evening, lunch class.', required: true, placeholder: 'Free text'},
    {id: 'members_requesting_change', label: 'Members requesting change', type: 'number', desc: 'How many members want this level change.', required: true},
    {id: 'change_reason', label: 'Reason for change', type: 'textarea', desc: 'Why the change is needed — pace, recovery, goal shift, etc.', required: true, placeholder: 'Brief reason'},
  ],
  'Scheduling|||Time Change': [
    {id: 'current_slot', label: 'Current / affected slot', type: 'text', desc: 'Existing day and time the request is against.', required: true, placeholder: 'e.g. Tuesday 7:00 AM'},
    {id: 'requested_time', label: 'Requested time', type: 'text', desc: 'The new day/time the member or staff wants.', required: true, placeholder: 'e.g. Thursday 6:30 PM'},
    {id: 'change_day', label: 'Preferred day(s)', type: 'multiselect', desc: 'Which day(s) of the week work.', required: true, options: DAYS_OF_WEEK},
    {id: 'members_requesting_change', label: 'Members requesting change', type: 'number', desc: 'How many members want this time change.', required: true},
    {id: 'change_reason', label: 'Reason for change', type: 'textarea', desc: 'Why the time change is needed.', required: true, placeholder: 'Brief reason'},
  ],
  'Scheduling|||Trainer Preferences': [
    {id: 'preferred_trainer', label: 'Preferred trainer', type: 'text', desc: 'Trainer the member wants.', required: true, placeholder: 'Trainer name'},
    {id: 'current_trainer', label: 'Current / past trainer', type: 'text', desc: 'Trainer they currently have or had.', placeholder: 'Trainer name'},
    {id: 'preference_reason', label: 'Reason for preference', type: 'textarea', desc: 'Style, injury handling, motivation, etc.', required: true, placeholder: 'Brief reason'},
  ],
};

/** The full field list for a sub-category: the universal block first, then its own fields,
 *  then any Iris-specific overlay. Unknown sub-categories get the universal block. */
export function planFields(category: string, sub: string, ctx: PlanContext): IntakeField[] {
  const raw = DATA.subs[subKey(category, sub)];
  const base = DATA.universal.map(i => materialise(DATA.defs[i], true, ctx));
  const own = (raw?.f || []).map(i => materialise(DATA.defs[i], false, ctx));
  const overlay = (SUB_OVERLAYS[subKey(category, sub)] || []).map(d => materialise(d, false, ctx));
  const seen = new Set<string>();
  const all = [...base, ...own, ...overlay].filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  // Always offer a member lookup if the plan does not already have one.
  if (!all.some(f => f.type === 'lookup' && f.module === 'member' && MEMBER_LOOKUP_IDS.includes(f.id))) all.push(materialise(MEMBER_LOOKUP_DEF, true, ctx));
  // Prompt for the exact spot inside the chosen room/area.
  if (!all.some(f => f.id === 'specific_area')) all.push(materialise({id: 'specific_area', label: 'Specific spot / equipment', type: 'text', desc: 'Exact location within the area — e.g. bike 3, mirror wall, front desk left.', conditional: true, dependsOn: 'area', condText: 'Asked when an area is selected', placeholder: 'e.g. bike 3, front row'}, false, ctx));
  const index = new Map(all.map(f => [f.id, f]));
  return all.map(f => ({...f, dep: dependencyOf(f, index)}));
}

/* ------------------------------------------------------------------ values */
export type IntakeValue = string | number | string[] | undefined | null;
export type IntakeData = Record<string, IntakeValue>;

export const filled = (v: unknown) => v !== '' && v != null && !(Array.isArray(v) && !v.length);
export function isVisible(f: IntakeField, data: IntakeData) {
  if (!f.conditional || !f.dep) return true;
  if (!filled(data[f.dep])) return false;
  return f.when ? new RegExp(f.when, 'i').test(String(data[f.dep])) : true;
}
export const visibleFields = (fields: IntakeField[], data: IntakeData) => fields.filter(f => isVisible(f, data));
export const missingFields = (fields: IntakeField[], data: IntakeData) => visibleFields(fields, data).filter(f => f.required && !filled(data[f.id]));

/* ------------------------------------------------------------------ lookups */
/** A lookup answer stays a plain string — "Priya Mehta [#481102] · priya@…" — so it reads in a
 *  handover and survives every serialisation. decodeLookup turns it back into a record. */
export type LookupRef = {id: string; label: string; sublabel?: string; manual?: boolean};
export const encodeLookup = (o: LookupRef) => `${o.id && o.id !== o.label ? `${o.label} [#${o.id}]` : o.label}${o.sublabel ? ` · ${o.sublabel}` : ''}`;
export const encodeLookups = (arr: LookupRef[]) => arr.map(encodeLookup).filter(Boolean).join(' | ');
export function decodeLookup(v: unknown): LookupRef | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as LookupRef;
  const text = String(v ?? '').trim();
  if (!text) return null;
  const m = /^(.+?) ?\[#([^\]]+)\](?: · (.*))?$/.exec(text);
  if (!m) return {id: text, label: text, manual: true};
  return {id: m[2], label: m[1].trim(), sublabel: m[3] || ''};
}
export function decodeLookups(v: unknown): LookupRef[] {
  if (Array.isArray(v)) return v.map(decodeLookup).filter((x): x is LookupRef => Boolean(x));
  const text = String(v ?? '').trim();
  if (!text) return [];
  return text.split(/\s*\|\s*/).map(decodeLookup).filter((x): x is LookupRef => Boolean(x));
}
export const hasLookup = (v: unknown) => decodeLookups(v).length > 0;
/** A lookup that points at a real Momence record rather than a typed name. */
export const linkedLookup = (v: unknown) => decodeLookups(v).find(r => !r.manual && /^\d+$/.test(r.id)) || null;

export const MEMBER_LOOKUP_IDS = ['member_name', 'member_named', 'member_id', 'member_email'];
export const SESSION_LOOKUP_IDS = ['class_date', 'session_point'];

/* ------------------------------------------------------------------ gating */
export type Gate = {id: string; label: string; reason: string};
const STAFF_REPORTER = /front desk|colleague|walkthrough|audit|myself|member told me|coordinator|trainer|regional|corporate|other staff/i;
export const isStaffReporter = (reporterType: unknown) => STAFF_REPORTER.test(String(reporterType || ''));
export const isMemberReporter = (reporterType: unknown) => /^(member|prospect)/i.test(String(reporterType || ''));

/** Sub-categories that are always about one specific session. Requests about the timetable
 *  ("Additional Classes", "Weekend vs. Weekday Class Balance") are not, so they are not gated. */
const CLASS_BOUND_SUB = /overcrowding|capacity issues|waitlist|class substitutions|trainer substitutions|last-minute cancellations|punctuality|ending on time|class flow|class intensity|overbooking|unregistered attendance/i;

/** The two records the desk must link rather than type, mirroring the Hub: a member when staff
 *  file on a member's behalf and the form has a member field, a class when a class was touched. */
export function gatingFor(fields: IntakeField[], data: IntakeData, sub: {name: string; category: string}): Gate[] {
  const out: Gate[] = [];
  // Only a member field the desk can see can be asked for; a plan's own member lookup that is
  // still hidden behind another answer is not a gate yet.
  const memberField = fields.find(f => f.type === 'lookup' && f.module === 'member' && MEMBER_LOOKUP_IDS.includes(f.id) && isVisible(f, data));
  const involvesMember = /yes|directly|indirectly|behalf|told me/i.test(String(data._involves_member || ''));
  const staffOnBehalf = involvesMember || /member told me|on behalf/i.test(String(data.reporter_type || ''));
  if (memberField && staffOnBehalf && !hasLookup(data[memberField.id])) out.push({id: memberField.id, label: memberField.label, reason: 'pick the member this is about'});
  const involvesClass = /yes|directly|indirectly/i.test(String(data._involves_class || ''));
  const impacted = involvesClass || /^\s*(yes|not yet)/i.test(String(data.class_impacted || ''));
  const classTouched = impacted || filled(data.class_format) || CLASS_BOUND_SUB.test(sub.name);
  if (classTouched && !hasLookup(data.class_date)) out.push({id: 'class_date', label: 'Class', reason: 'link the affected class'});
  return out;
}

/* ------------------------------------------------------------------ defaults */
export const localDateTime = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
/**
 * The "How recent?" answer a timestamp implies, in the taxonomy's own words. A class that has
 * not started yet reads as "Just now" when it is about to, otherwise as ongoing; anything older
 * than the options reach comes back undefined so the desk answers it.
 */
export function relativeFor(iso?: string, now = new Date()): string | undefined {
  if (!iso) return undefined;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return undefined;
  const diff = now.getTime() - at.getTime();
  if (diff < 0) return diff > -2 * 3600e3 ? 'Just now' : 'Ongoing / recurring';
  if (diff < 30 * 60e3) return 'Just now';
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 864e5);
  if (days <= 0) return 'Earlier today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Earlier this week';
  if (days < 14) return 'Last week';
  return undefined;
}
/** What a fresh form starts with. Only ever fills blanks, so a studio the desk chose stays. */
export function seedData(prev: IntakeData, reporter?: {name?: string; email?: string}): IntakeData {
  return {
    occurred_relative: 'Just now',
    reporter_type: 'Front desk / associate',
    preferred_contact: 'WhatsApp',
    occurred_at: localDateTime(new Date()),
    ...(reporter?.name ? {reporter_name: reporter.name} : {}),
    ...(reporter?.email ? {reporter_contact: reporter.email} : {}),
    ...Object.fromEntries(Object.entries(prev).filter(([, v]) => filled(v))),
  };
}
export const shortStudio = (s: unknown) => String(s || '').split(',')[0].trim();
export function autoTitle(subName: string, data: IntakeData) {
  const studio = shortStudio(data.studio);
  return `${subName} — ${studio || 'studio'}${data.area ? ' · ' + data.area : ''}`;
}

/* ------------------------------------------------------------------ write-up */
/** Fields the write-up already covers in its opening lines, or that are the write-up itself. */
const WRITEUP_COVERED = new Set(['reporter_type', 'report_channel', 'reporter_name', 'reporter_contact', 'preferred_contact', 'follow_up_channel', 'studio', 'area', 'occurred_at', 'occurred_relative',
  'class_format', 'class_date', 'trainer', 'affected_count', 'is_repeat', 'linked_ticket', 'member_impact', 'class_impacted', 'immediate_danger', 'sentiment', 'churn_risk',
  'title', 'summary', 'requested_outcome', ...MEMBER_LOOKUP_IDS, 'attendees_affected', 'attendee_summary']);
const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const endStop = (s: string) => /[.!?]$/.test(s) ? s : s + '.';

/** The write-up: a paragraph the next shift can read, built only from what is on the form.
 *  No model is involved — every clause quotes an answer verbatim, so it cannot invent a fact,
 *  and the desk edits the result like any other summary. */
export function composeWriteup(args: {sub: {name: string; category: string}; fields: IntakeField[]; data: IntakeData}): string {
  const {sub, fields, data} = args;
  const visible = visibleFields(fields, data);
  const byId = new Map(fields.map(f => [f.id, f]));
  const text = (id: string) => {
    const v = data[id]; if (!filled(v)) return '';
    if (byId.get(id)?.type === 'lookup') return decodeLookups(v).map(r => r.label).join(', ');
    return Array.isArray(v) ? v.join(', ') : String(v).trim();
  };
  const out: string[] = [];
  // Where and when.
  const studio = shortStudio(data.studio);
  const iso = String(data.occurred_at || ''); const at = iso ? new Date(iso) : null;
  const when = at && Number.isFinite(at.getTime()) ? at.toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'}) : lower1(text('occurred_relative'));
  out.push(`${sub.name}${studio ? ` at ${studio}` : ''}${text('area') ? `, ${text('area')}` : ''}${when ? ` — ${when}` : ''}.`);
  // Who raised it, and who it is about.
  const reporterType = text('reporter_type'); const reporterName = text('reporter_name'); const channel = text('report_channel');
  const member = MEMBER_LOOKUP_IDS.map(text).find(Boolean) || '';
  if (isMemberReporter(reporterType)) out.push(`Raised by ${reporterName || 'the member'} (${lower1(reporterType)})${channel ? ` via ${lower1(channel)}` : ''}.`);
  else if (/member told me/i.test(reporterType)) out.push(`${member || 'A member'} told the desk${reporterName ? `; logged by ${reporterName}` : ''}${channel ? ` (${lower1(channel)})` : ''}.`);
  else if (reporterType || reporterName) out.push(`Logged by ${reporterName || 'the desk'}${reporterType ? ` (${lower1(reporterType)})` : ''}${member ? ` about ${member}` : ''}${channel ? `, reached the desk via ${lower1(channel)}` : ''}.`);
  const affected = text('attendees_affected');
  if (affected && affected !== member) out.push(`Attendees affected: ${affected}.`);
  // The class.
  const cls = text('class_format') || text('class_date'); const trainer = text('trainer');
  if (cls || trainer) out.push(`Class: ${cls || 'not named'}${trainer ? ` with ${trainer}` : ''}.`);
  // Impact and triage, only the answers given.
  const triage = [
    text('member_impact') && `impact on the member: ${lower1(text('member_impact'))}`,
    text('affected_count') && `${text('affected_count')} member${text('affected_count') === '1' ? '' : 's'} affected`,
    text('class_impacted') && `class impacted: ${lower1(text('class_impacted'))}`,
    text('immediate_danger') && !/^no\b/i.test(text('immediate_danger')) && `immediate danger: ${lower1(text('immediate_danger'))}`,
    text('is_repeat') && !/first time/i.test(text('is_repeat')) && `repeat: ${lower1(text('is_repeat'))}${text('linked_ticket') ? ` (${text('linked_ticket')})` : ''}`,
  ].filter(Boolean) as string[];
  if (triage.length) out.push(endStop(triage.join('; ').replace(/^./, c => c.toUpperCase())));
  // The sub-category's own answers, then what the class desk captured.
  const specifics = visible.filter(f => !WRITEUP_COVERED.has(f.id) && !f.enrich && filled(data[f.id])).map(f => `${f.label.replace(/[?:]$/, '')}: ${text(f.id)}`);
  if (specifics.length) out.push(endStop(specifics.join('; ')));
  const desk = visible.filter(f => !WRITEUP_COVERED.has(f.id) && f.enrich && filled(data[f.id])).map(f => `${f.label.replace(/[?:]$/, '')}: ${text(f.id)}`);
  if (desk.length) out.push(endStop(`From the class desk — ${desk.join('; ')}`));
  if (text('attendee_summary')) out.push(endStop(`Roll notes: ${text('attendee_summary')}`));
  // How the member came across and what they want.
  const mood = [text('sentiment') && `came across ${lower1(text('sentiment'))}`, text('churn_risk') && `churn risk ${lower1(text('churn_risk'))}`].filter(Boolean) as string[];
  if (mood.length) out.push(endStop(`The member ${mood.join(', ')}`));
  if (text('requested_outcome')) out.push(endStop(`Asked for: ${text('requested_outcome')}`));
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}

/* ------------------------------------------------------------------ priority inputs */
/** The answers Iris's routing reads (see makeDraft in lib/tickets.ts), lifted from the plan's
 *  field ids. Kept in one place so the live badge and the filed ticket agree. */
export function priorityInputs(category: string, sub: string, data: IntakeData) {
  return {
    category, subcategory: sub,
    isImmediateDanger: String(data.immediate_danger || ''),
    isClassImpacted: String(data.class_impacted || ''),
    impact: filled(data.member_impact) ? String(data.member_impact) : undefined,
    memberImpact: memberImpactSignal(data),
    cycleSeverity: String(data.cycle_severity || data.cycleSeverity || ''),
  };
}
/** "Yes — …" when the answers say members lost part of their session; blank otherwise. */
function memberImpactSignal(data: IntakeData) {
  const impact = String(data.member_impact || '');
  if (/could not proceed|turned away|safety concern/i.test(impact)) return 'Yes — members were affected';
  if (Number(data.affected_count) > 0 && /degraded|delayed/i.test(impact)) return 'Yes — members were affected';
  return '';
}

/* ------------------------------------------------------------------ payload */
export type TicketKind = TicketInput['kind'];
const SENTIMENTS = new Set(['positive', 'neutral', 'frustrated', 'negative']);
const displayValue = (v: IntakeValue) => Array.isArray(v) ? v.join(' · ') : v == null ? '' : String(v);

export type ClassSnapshot = {
  sessionId: string; name: string; startsAt?: string; studio?: string; trainer?: string; capacity?: number | null;
  booked?: number | null; attended?: number | null; absent?: number | null; waitlist?: number | null; cancelled?: number | null;
  guests?: number | null; firstTimers?: number | null; overbook?: number | null; fillPct?: number | null; source?: string;
  attendees?: {id: string; memberId?: string; name: string; status?: string; actions?: string[]; note?: string}[];
};

/** Maps the answers onto Iris's ticket contract. Fields with a column go there; everything
 *  else rides in customFields the way template answers do, keyed by the plan's field id. */
export function toTicketInput(args: {
  category: string; sub: string; fields: IntakeField[]; data: IntakeData; kind: TicketKind; submissionKey: string;
  classSnapshot?: ClassSnapshot | null; momenceContext?: Record<string, unknown>;
  memberDetail?: {email?: string; phone?: string; membership?: string};
}): TicketInput & {submissionKey: string} {
  const {category, sub, fields, kind, submissionKey} = args;
  const visible = visibleFields(fields, args.data);
  // Only what the desk could see is filed: an answer left behind a question that has since
  // been hidden (a member picked before the reporter type changed) does not ride along.
  const data: IntakeData = Object.fromEntries(visible.map(f => [f.id, args.data[f.id]]));
  const byId = new Map(fields.map(f => [f.id, f]));
  const member = MEMBER_LOOKUP_IDS.map(id => linkedLookup(data[id])).find(Boolean) || null;
  const typedMember = decodeLookups(data.member_name)[0] || decodeLookups(data.member_named)[0];
  // member_email is a member lookup on some plans and a plain email on others.
  const emailAnswer = String(data.member_email || '');
  const emailFromAnswer = /\[#/.test(emailAnswer) ? (decodeLookup(emailAnswer)?.sublabel || '') : emailAnswer;
  const typedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFromAnswer.trim()) ? emailFromAnswer.trim() : '';
  const session = linkedLookup(data.class_date);
  const staff = isStaffReporter(data.reporter_type);
  const memberReporter = isMemberReporter(data.reporter_type);
  const reporterName = String(data.reporter_name || '').trim();
  const reporterContact = String(data.reporter_contact || '').trim();
  // Who the ticket is logged for: the linked (or typed) member; a member or prospect filing
  // for themselves; otherwise the studio team, exactly as the composer files observations.
  const memberName = member?.label || typedMember?.label || (memberReporter && reporterName) || (!staff && !memberReporter && reporterName) || 'Studio team observation';
  const contactEmail = memberReporter && /@/.test(reporterContact) ? reporterContact : args.memberDetail?.email || typedEmail;
  const contactPhone = memberReporter && !/@/.test(reporterContact) ? reporterContact : args.memberDetail?.phone || '';
  const sentimentRaw = String(data.sentiment || '').toLowerCase();
  const sentiment = (SENTIMENTS.has(sentimentRaw) ? sentimentRaw : kind === 'compliment' ? 'positive' : 'neutral') as TicketInput['sentiment'];
  const occurredAt = String(data.occurred_at || '');
  const occurred = occurredAt ? new Date(occurredAt) : null;
  const incidentAt = occurred && Number.isFinite(occurred.getTime()) ? occurred.toISOString() : String(data.occurred_relative || 'Not recorded');
  const description = String(data.summary || '').trim();

  // Everything without a column, as readable strings keyed by field id — the same shape
  // guided-template answers use, so the ticket page's supporting-details block shows them.
  const custom: Record<string, unknown> = {};
  // Answers with a ticket column, or recorded below under the name Iris's routing reads.
  const columns = new Set(['studio', 'title', 'summary', 'requested_outcome', 'sentiment', 'class_format', 'trainer', 'occurred_at', 'preferred_contact', 'member_impact',
    'reporter_type', 'reporter_name', 'reporter_contact', 'class_impacted', 'immediate_danger', 'affected_count', 'linked_ticket', 'attendees_affected', 'affected_members']);
  for (const f of visible) {
    const v = data[f.id];
    if (!filled(v) || columns.has(f.id)) continue;
    custom[f.id] = f.type === 'number' ? Number(v) : displayValue(v as IntakeValue);
  }
  // Answers Iris's routing and checklist read by name.
  if (filled(data.reporter_type)) custom.reportedBy = data.reporter_type;
  if (filled(data.reporter_name)) custom.reporterName = data.reporter_name;
  if (filled(data.reporter_contact)) custom.reporterContact = data.reporter_contact;
  if (filled(data.area)) custom.area = data.area;
  if (filled(data.class_impacted)) custom.isClassImpacted = data.class_impacted;
  if (filled(data.immediate_danger)) custom.isImmediateDanger = data.immediate_danger;
  const memberImpact = memberImpactSignal(data);
  if (memberImpact) custom.memberImpact = memberImpact;
  if (filled(data.affected_count)) custom.affectedCount = Number(data.affected_count);
  const affected = decodeLookups(data.attendees_affected || data.affected_members).map(r => r.label).filter(Boolean);
  if (affected.length) custom.impactedMembers = affected.join(', ');
  const linkedTicket = decodeLookup(data.linked_ticket);
  if (linkedTicket) custom.linkedTicket = linkedTicket.label;
  if (args.classSnapshot) {
    const c = args.classSnapshot;
    custom.classSnapshot = {sessionId: c.sessionId, name: c.name, startsAt: c.startsAt, capacity: c.capacity, booked: c.booked, attended: c.attended, absent: c.absent, waitlist: c.waitlist, guests: c.guests, firstTimers: c.firstTimers, overbook: c.overbook, fillPct: c.fillPct, source: c.source};
    if (c.attendees?.length) custom.attendeeNotes = c.attendees.map(a => ({name: a.name, memberId: a.memberId, status: a.status, actions: a.actions, note: a.note}));
    custom.sessionContext = {id: c.sessionId, name: c.name, startsAt: c.startsAt, studio: c.studio, trainer: c.trainer, source: c.source};
  } else if (session) {
    custom.sessionContext = {id: session.id, name: session.label, sublabel: session.sublabel, source: 'momence'};
  } else if (hasLookup(data.class_date)) {
    custom.sessionContext = {manual: true, note: decodeLookups(data.class_date)[0]?.label};
  }
  // The plan itself, so a later reader can label every answer and see which form produced it.
  const labels: Record<string, string> = {reportedBy: 'Raised by', reporterName: 'Reporter name', reporterContact: 'Reporter contact', isClassImpacted: 'Class impacted', isImmediateDanger: 'Immediate danger', memberImpact: 'Member impact', affectedCount: 'Members affected', impactedMembers: 'Attendees affected', linkedTicket: 'Related ticket'};
  for (const f of visible) if (custom[f.id] !== undefined) labels[f.id] = f.label;
  custom._intake = {plan: subKey(category, sub), source: PLAN_SOURCE.repo, version: PLAN_SOURCE.generatedAt, labels, memberLinked: Boolean(member), sessionLinked: Boolean(session || args.classSnapshot)};

  const classFormat = args.classSnapshot?.name || (filled(data.class_format) ? String(data.class_format) : undefined);
  const trainer = filled(data.trainer) ? String(data.trainer) : args.classSnapshot?.trainer || undefined;
  return {
    title: String(data.title || '').trim() || autoTitle(sub, data),
    description,
    category, subcategory: sub, kind,
    studio: String(data.studio || ''),
    memberName: memberName.slice(0, 120),
    memberEmail: contactEmail || '',
    memberPhone: contactPhone || undefined,
    momenceMemberId: member?.id,
    momenceSessionId: args.classSnapshot?.sessionId || session?.id,
    classFormat, trainer,
    membership: args.memberDetail?.membership || (byId.get('membership') && filled(data.membership) && !hasLookupShape(data.membership) ? String(data.membership) : undefined),
    incidentAt,
    preferredContact: String(data.preferred_contact || 'Email'),
    requestedResolution: filled(data.requested_outcome) ? String(data.requested_outcome) : undefined,
    sentiment,
    impact: filled(data.member_impact) ? String(data.member_impact) : undefined,
    customFields: custom,
    momenceContext: args.momenceContext,
    source: 'iris',
    submissionKey,
  };
}
const hasLookupShape = (v: unknown) => /\[#\d+\]/.test(String(v ?? ''));
