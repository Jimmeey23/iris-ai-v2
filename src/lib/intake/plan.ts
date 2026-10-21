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
import {lateArrivalFields, isLateArrival} from './scenarios';
import {simpleLanguage} from '../plain-language';
import {FIELD_COPY, GLOBAL_FIELD_IDS, OBSERVATION_FIELDS, enrichmentRelevant} from './content';
export const FORM_SCHEMA_VERSION='2026-10-20';
import type {TicketInput} from '../ticket-contract';
import {CATEGORY_MAP, PRIORITY_SLA_HOURS, type SlaHours} from '../constants';

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
  /** Answer to start from when the sub-category already implies it — a mic fault is about a
   *  microphone, so nobody should have to say so. Always editable. */
  prefill?: string;
  /** Whether the list carries a "Something else" escape with a free-text box behind it. */
  allowOther?: boolean;
  section: string;
};

export type IntakeSubMeta = {
  key: string;
  category: string;
  name: string;
  /** The priority the sub-category files at. Callers pass Iris's routing tier (which already
   *  takes the higher of its own and the Hub's); without one it is the Hub's tier. */
  hubPriority: string;
  /** Resolution target from the workspace's responseHours — the plan carries no SLA of its own. */
  slaLabel: string;
  hours: [number | null, null];
  hist: number;
  fieldCount: number;
  requiredCount: number;
};

type RawDef = {
  id: string; label: string; type: IntakeFieldType; desc?: string; required?: boolean; conditional?: boolean;
  dependsOn?: string; condText?: string; placeholder?: string; o?: number; options?: string[]; module?: LookupModule; multi?: boolean; enrich?: string;
  when?: string; prefill?: string; allowOther?: boolean;
  /** Overlay questions can name their group when the shared id means something else here. */
  section?: string;
};
/** `p` is the Hub's tier, kept for the drift check; `department` is a routing hint only — Iris routes
 *  by the workspace's categoryDepartments, never by the plan. */
type RawSub = {f: number[]; p: string; hist: number; department?: string};
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
const DEF_BY_ID=new Map(DATA.defs.map(d=>[d.id,d]));

export const PLAN_SOURCE = DATA.source;
export const subKey = (category: string, sub: string) => `${category}|||${sub}`;
const REPAIR_PLAN_ALIASES: Record<string, string> = {
  'PowerCycle Bike Malfunction & Repairs': 'PowerCycle Bike Fault (Stages SC3)',
  'Studio Lighting Malfunction & Repairs': 'Lighting Issues',
  'Resistance Bands & Small Equipment Repairs': 'Broken Equipment Not Repaired',
  'Strength Studio Equipment Repairs': 'Broken Equipment Not Repaired',
  'Audio, Mic & Headphone Malfunction': 'Studio System Malfunction',
  'Housekeeping & Cleaning Issues': 'Dust and Mold in Corners',
  'Washroom & Plumbing Repairs': 'Plumbing Leaks',
  'AC & Ventilation Repairs': 'AC and HVAC Issues',
  'Electrical & Power Issues': 'General Maintenance Delays',
  'Doors, Locks & Fixture Repairs': 'Door Lock Issues',
  'General Studio Repairs & Maintenance': 'General Maintenance Delays',
};
const sourceSubKey = (category: string, sub: string) => subKey(category, category === 'Repair and Maintenance' ? REPAIR_PLAN_ALIASES[sub] || sub : sub);

/* ------------------------------------------------------------------ sections */
/** Topical groups. Every question lands in the group a desk would look for it in — money with
 *  money, the broken thing with the building, the injury with the incident — instead of one
 *  catch-all "specifics" block. Ids not listed fall back to their category's own group. */
const GROUPS: Record<string, string[]> = {
  'Reporter': ['reporter_type', 'reporter_name', 'reporter_contact'],
  'Who this is about': ['member_name', 'member_named', 'member_email', 'member_id', 'membership', 'notified_members', 'preferred_contact', 'follow_up_channel'],
  'Where & when': ['report_channel', 'studio', 'area', 'specific_area', 'incident_location', 'affected_room', 'occurred_at', 'occurred_relative', 'time_of_day', 'service_time'],
  'Class context': ['class_format', 'class_date', 'trainer', 'session_point', 'experience_dimension'],
  'Safety & incident': ['incident_type', 'injury_occurred', 'injury_risk', 'medical_response', 'member_notified', 'police_escalation', 'witnesses', 'statement_taken', 'cctv_requested', 'cctv_time', 'cctv_retention', 'privacy_flag', 'followup_due', 'regulatory_note'],
  'Lost & found': ['item_category', 'item_desc', 'item_value', 'serial_imei', 'lost_or_stolen', 'last_seen', 'time_window', 'locker_number', 'cfhr_checked', 'staff_implicated', 'police_complaint', 'compensation'],
  'Payment & billing': ['transaction_ref', 'payment_mode', 'payment_date', 'amount_inr', 'amount_charged', 'amount_expected', 'amount_basis', 'city_rate', 'gst_invoice', 'dispute_reason', 'refund_required', 'refund_amount', 'receipt_needed', 'entitlement_state', 'balance_classes', 'freeze_type', 'freeze_dates', 'approval_ref', 'accounts_action'],
  'Equipment & facility': ['asset_type', 'asset_id', 'asset_condition', 'usable', 'downtime', 'amenity', 'cycle_symptom', 'cycle_part', 'light_circuit', 'isolation', 'temp_reading', 'reading_now', 'noise_source', 'audio_source', 'music_action', 'supply_count', 'par_level', 'sku', 'stock_on_hand', 'housekeeping_log', 'immediate_fix', 'vendor_needed', 'vendor_name', 'vendor_amc', 'vendor_visit_log', 'eng_site_ref', 'quote_ref'],
  'Systems & data': ['system', 'device', 'user_type', 'login_user', 'failure_mode', 'error_text', 'repro_steps', 'frequency', 'scope', 'workaround', 'fallback_entry', 'bandwidth_check', 'last_restart', 'momence_record', 'data_impact', 'backdated', 'data_source', 'report_spec', 'change_window'],
  'Schedule & timetable': ['schedule_action', 'current_slot', 'requested_slot', 'requested_time', 'change_day', 'change_time', 'current_level', 'requested_level', 'weekly_impact', 'grid_impact', 'members_requesting_change', 'demand_evidence', 'change_reason', 'roster_alternates'],
  'Trainer & method': ['trainer_under_review', 'feedback_nature', 'coaching_status', 'method_conformance', 'conflict_of_interest', 'current_trainer', 'preferred_trainer', 'preference_reason'],
  'Member service': ['complaint_nature', 'service_channel', 'response_waited', 'contact_attempted', 'desk_owner', 'goodwill_offered', 'reply_deadline', 'review_or_public'],
  'Brand & partnerships': ['partner_name', 'program_name', 'brand_topic', 'ambassador_status', 'platform', 'commercial_terms', 'value_inr', 'deliverables', 'go_live', 'rights_used', 'pr_speaker'],
  'Internal & policy': ['internal_type', 'misc_bucket', 'idea_type', 'suggested_action', 'decision_needed', 'policy_owner', 'applies_to_roles', 'affected_studios', 'effective_date', 'version_from', 'sop_action', 'sop_ref', 'rollout_plan', 'people_impact', 'lead_ref', 'due_date', 'followup_owner', 'followup_date'],
  'Impact and urgency': ['affected_count', 'guest_count', 'member_impact', 'class_impacted', 'immediate_danger', 'is_repeat', 'linked_ticket', 'sentiment', 'churn_risk'],
  'Feedback and requested action': ['title', 'summary', 'member_verbatim', 'requested_outcome'],
  'Evidence': ['valet_ticket', 'ticket_vendor', 'asset_link'],
};
const SECTION: Record<string, string> = Object.fromEntries(Object.entries(GROUPS).flatMap(([s, ids]) => ids.map(id => [id, s])));
/** Where a question sits inside its group — the order a desk would answer them in. */
const RANK: Record<string, number> = Object.fromEntries(Object.values(GROUPS).flatMap(ids => ids.map((id, i) => [id, i])));
export const fieldRank = (id: string) => RANK[id] ?? 999;
/** Class-desk enrichment rides inside the group it belongs to, as an optional "more detail" drawer. */
const ENRICH_SECTION: Record<string, string> = {class: 'Class context', roster: 'Class context', trainer: 'Trainer & method', asset: 'Equipment & facility', payment: 'Payment & billing', vendor: 'Equipment & facility'};
export const ENRICH_GROUP_LABEL: Record<string, string> = {class: 'Class detail', roster: 'Roll call', trainer: 'Trainer detail', asset: 'Asset detail', payment: 'Payment detail', vendor: 'Vendor detail'};
/** Unmapped questions go to the group their category is about. */
const CATEGORY_SECTION: Record<string, string> = {
  'Scheduling': 'Schedule & timetable', 'Class Experience': 'Class context', 'Trainer Feedback': 'Trainer & method',
  'Repair and Maintenance': 'Equipment & facility', 'Studio Amenities and Facilities': 'Equipment & facility',
  'Operating Systems': 'Systems & data', 'Tech Issues': 'Systems & data', 'Pricing and Memberships': 'Payment & billing',
  'Customer Service and Communication': 'Member service', 'Brand Feedback': 'Brand & partnerships',
  'Safety and Security': 'Safety & incident', 'Theft and Lost Items': 'Lost & found', 'Miscellaneous': 'Other details',
  'Internal Operations & Admin': 'Internal & policy',
};
export const SECTION_ORDER = ['Global details', 'Late arrival details', 'Reporter', 'Who this is about', 'Where & when', 'Class context', 'Safety & incident', 'Lost & found', 'Payment & billing', 'Equipment & facility', 'Systems & data', 'Schedule & timetable', 'Trainer & method', 'Member service', 'Brand & partnerships', 'Internal & policy', 'Other details', 'Impact and urgency', 'Feedback and requested action', 'Evidence'];
/** Section names earlier plans (and published builder plans) were saved with. */
const LEGACY_SECTIONS = new Set(['Member experience', 'Sub-category specifics', 'Class detail', 'Roll call', 'Trainer detail', 'Asset detail', 'Payment detail', 'Vendor detail']);
export const sectionOf = (id: string, enrich?: string, category?: string) =>
  SECTION[id] || (enrich && ENRICH_SECTION[enrich]) || (category && CATEGORY_SECTION[category]) || 'Other details';
/** Known sections in form order, then anything an administrator named themselves. */
export const orderSections = (names: Iterable<string>) => {
  const set = new Set(names);
  return [...SECTION_ORDER.filter(s => set.has(s)), ...[...set].filter(s => !SECTION_ORDER.includes(s))];
};

/* ------------------------------------------------------------------ taxonomy */
export type HubCategory = PlanData['categories'][number];
export function hubCategories(): HubCategory[] {
  return DATA.categories.map(category => category.name === 'Repair and Maintenance'
    ? {...category, subs: [...CATEGORY_MAP['Repair and Maintenance']]}
    : category);
}
/** "4 h resolution target", from the configured hours (Settings → response hours) for a tier. */
export function slaLabelFor(priority: string, hours: SlaHours = PRIORITY_SLA_HOURS, override?: number | null) {
  const h = override ?? hours[priority as keyof SlaHours];
  return h ? `${h} h resolution target` : '';
}
/** Plan metadata for a sub-category, or null when the plan has nothing for it (an admin-added
 *  sub-category): planFields still serves it the universal block. */
export function hubSub(category: string, sub: string, opts: {priority?: string; hours?: SlaHours; slaHours?: number | null} = {}): IntakeSubMeta | null {
  const raw = DATA.subs[sourceSubKey(category, sub)];
  const overlay = SUB_OVERLAYS[subKey(category, sub)] || [];
  if (!raw && !overlay.length) return null;
  const defs = [...DATA.universal.map(i => DATA.defs[i]), ...(raw?.f || []).map(i => DATA.defs[i]), ...overlay];
  const seen = new Set<string>(); let required = 0, total = 0;
  for (const d of defs) { if (seen.has(d.id)) continue; seen.add(d.id); total++; if (d.required) required++; }
  const priority = opts.priority || raw?.p || 'low';
  const first = opts.slaHours ?? (opts.hours || PRIORITY_SLA_HOURS)[priority as keyof SlaHours] ?? null;
  return {key: subKey(category, sub), category, name: sub, hubPriority: priority, slaLabel: slaLabelFor(priority, opts.hours, opts.slaHours), hours: [first, null], hist: raw?.hist || 0, fieldCount: total, requiredCount: required};
}
/** The Support Hub's own tier, for drift checks only — never shown or filed. */
export function hubTier(category: string, sub: string): string | null {
  return DATA.subs[sourceSubKey(category, sub)]?.p ?? null;
}
export function cycleIntakeQuestions() { return DATA.cycleIntake; }
/** The controlled list a plan field answers from, by id — the class desk shares these lists
 *  with the form so the two can never drift apart. */
export function fieldOptions(id: string): string[] {
  const def = DATA.defs.find(d => d.id === id && typeof d.o === 'number');
  return def && typeof def.o === 'number' ? DATA.opts[def.o] : [];
}

/* ------------------------------------------------------------------ fields */
/** The answer that opens a free-text box. Stored only while the box is empty: once the
 *  person types, their own words are the answer, so nothing downstream ever has to know
 *  this sentinel existed. */
export const OTHER_OPTION = 'Something else…';
const CHOICE_TYPES = new Set<IntakeFieldType>(['select', 'multiselect', 'radio']);
/** Lists that already carry an escape of their own, in whatever wording. */
const ESCAPE_OPTION = /other|something else|not listed|unsure|don't know|prefer not|none of/i;
/** Studio is the one list that must stay closed: routing, access scoping and the SLA clock
 *  are all keyed off it, and a typed-in studio belongs to no team. */
const NO_OTHER = new Set(['studio']);
export type PlanContext = {studios: string[]; formats: string[]; trainers: string[]; memberships?: string[]};

function materialise(def: RawDef, universal: boolean, ctx: PlanContext, category?: string): Omit<IntakeField, 'dep'> {
  const f: Omit<IntakeField, 'dep'> = {id: def.id, label: def.label, type: def.type, section: def.section || sectionOf(def.id, def.enrich, category), universal};
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
  if (def.prefill) f.prefill = def.prefill;
  // Iris owns the workspace directories; the Hub's copies are replaced at build time.
  if (def.id === 'studio') f.options = ctx.studios;
  else if (def.id === 'class_format') f.options = ctx.formats;
  else if (['trainer', 'trainer_under_review', 'roster_alternates', 'preferred_trainer', 'current_trainer'].includes(def.id)) {
    f.options = ctx.trainers;
    // The trainer directory replaces the Hub's frozen name list and the free-text boxes.
    if (def.id === 'preferred_trainer' || def.id === 'current_trainer') f.type = 'select';
  }
  else if (def.id === 'membership' && def.type !== 'lookup' && ctx.memberships?.length) f.options = ctx.memberships;
  else if (def.id === 'area') f.options = []; // per studio, see areasFor in the form
  else if (Array.isArray(def.options) && def.options.length) f.options = def.options;
  else if (typeof def.o === 'number') f.options = DATA.opts[def.o];
  if (def.allowOther !== undefined) f.allowOther = def.allowOther;
  else if (CHOICE_TYPES.has(f.type) && f.options?.length && !NO_OTHER.has(f.id) && !f.options.some(o => ESCAPE_OPTION.test(o))) f.allowOther = true;
  return f;
}

/** Which field does the condition talk about? Explicit `dependsOn` wins when the field is on
 *  this form; otherwise the prose is scanned for a field id. No match → always visible, so a
 *  required field can never be hidden by a dependency we cannot resolve. */
function dependencyOf(f: Omit<IntakeField, 'dep'>, index: Map<string, unknown>): string | null {
  if (f.dependsOn && index.has(f.dependsOn)) return f.dependsOn;
  if (f.dependsOn?.startsWith('_')) return f.dependsOn;
  if (f.dependsOn) return '_unavailable_dependency';
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
  id: 'member_name', label: 'Member', type: 'lookup', module: 'member',
  desc: 'Leave blank if no member is involved. Picking the member links their Momence record.',
};

/** Extra questions that make sense only for a specific sub-category. These are injected
 *  after the Hub plan so a rebuild of plan-data.json does not wipe them. */
const CLASS_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All levels'];
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Equipment a sub-category already names.
 *
 * "Mic Not Working" is a microphone ticket before anyone has typed a word, yet the asset
 * question was either absent or blank — so the owner received a repair ticket that did not
 * say what was broken. Each entry names the asset the sub-category is about; the field is
 * still a normal dropdown, so a mis-set default takes one click to correct.
 *
 * Keys are matched against `category|||sub`, values against the `asset_type` option list.
 */
const EQUIPMENT_PREFILL: Record<string, string> = {
  'Tech Issues|||Mic Not Working': 'Microphone',
  'Tech Issues|||Speakers Static Noise': 'Speaker',
  'Tech Issues|||Studio Music Preferences': 'Music system',
  'Class Experience|||Audio Issues': 'Music system',
  'Repair and Maintenance|||AC and HVAC Issues': 'Air conditioning system',
  'Repair and Maintenance|||Lighting Issues': 'Studio lighting rig',
  'Repair and Maintenance|||PowerCycle Bike Fault (Stages SC3)': 'PowerCycle bike',
  'Safety and Security|||CCTV Malfunction': 'TFA system',
  'Miscellaneous|||Lighting Preferences': 'Studio lighting rig',
};
/** The asset question, added where the sub-category names equipment but the plan left it out. */
const ASSET_TYPE_DEF: RawDef = {
  id: 'asset_type', label: 'Equipment', type: 'select', section: 'Equipment & facility',
  desc: 'Filled in from the issue type. Change it if something else is broken.',
  options: [],
};
function equipmentOverlay(category: string, sub: string, presentIds: string[]): RawDef[] {
  const asset = EQUIPMENT_PREFILL[subKey(category, sub)];
  if (!asset) return [];
  // Already on the plan: nothing to add, `applyPrefill` sets the value.
  if (presentIds.includes('asset_type')) return [];
  return [{...ASSET_TYPE_DEF, options: fieldOptions('asset_type'), prefill: asset}];
}

/** Who was affected, asked only once a count says somebody was.
 *
 * `affected_count` was universal while the member picker sat on 60 of 296 plans and hung off
 * the class lookup, so "3 members affected" routinely reached the owner with no names on it.
 * This picker follows the count instead: answer more than zero and it appears. */
const MEMBERS_AFFECTED_DEF: RawDef = {
  id: 'members_affected', label: 'Which members?', type: 'lookup', module: 'member', multi: true,
  section: 'Who this is about', conditional: true, dependsOn: 'affected_count', when: '^\\s*[1-9]',
  condText: 'Yes — when one or more members were affected',
  desc: 'Pick them from Momence so their records are on the ticket.',
};

const SUB_OVERLAYS: Record<string, RawDef[]> = {
  'Brand Feedback|||Hosted Class Feedback': [
    {id: 'partner_name', label: 'Partner or host', type: 'text', required: true, placeholder: 'Partner or creator name'},
    {id: 'hosted_objective', label: 'Goal of the hosted class', type: 'select', required: true, options: ['Community expansion', 'New prospect acquisition', 'Brand visibility', 'Corporate wellness', 'Partner relationship', 'Content / social amplification']},
    {id: 'guest_count', label: 'How many guests came?', type: 'number', required: true, section: 'Brand & partnerships'},
    {id: 'newcomer_count', label: 'How many were new to Physique 57?', type: 'number'},
    {id: 'audience_fit', label: 'Were the guests a good fit?', type: 'select', required: true, options: ['Excellent fit', 'Good fit with nurturing', 'Mixed fit', 'Low fit', 'Not enough information']},
    {id: 'member_voice', label: 'What guests said', type: 'textarea', required: true, desc: 'Write what guests said, in their own words.', placeholder: 'Member reported… / Guest expressed…'},
    {id: 'continuation_intent', label: 'Do guests want to keep coming?', type: 'select', required: true, options: ['Ready to purchase', 'Interested in an intro offer', 'Requested a follow-up', 'Interested but timing is unclear', 'No stated interest', 'Not captured']},
    {id: 'commercial_outcome', label: 'Sales result', type: 'select', required: true, options: ['Package sold on the day', 'Trial / intro booked', 'Qualified leads captured', 'Follow-up list created', 'No conversion signal', 'Not applicable']},
    {id: 'partner_voice', label: 'What the partner said', type: 'textarea', desc: 'The host or partner’s words, including any changes they asked for.'},
    {id:'social_opportunity',label:'Content ideas discussed',type:'multiselect',options:['Partner post','Partner story','Member testimonial with permission','Creator content','No opportunity discussed','Other'],desc:'Pick only ideas that were really discussed. Note photo permissions separately.'},
    {id: 'repeat_recommendation', label: 'What should we do next?', type: 'select', required: true, options: ['Repeat the partnership', 'Nurture and redesign', 'One-off only', 'Management review required']},
    {id: 'agreed_follow_up', label: 'Agreed next steps', type: 'textarea', required: true, desc: 'Who does what, and by when.'},
  ],
  'Scheduling|||Level Change': [
    {id: 'current_level', label: 'Current level', type: 'select', desc: 'The class level the member is currently booked into or attending.', required: true, options: CLASS_LEVELS},
    {id: 'requested_level', label: 'Requested level', type: 'select', desc: 'The level the member wants to move to.', required: true, options: CLASS_LEVELS},
    {id: 'change_day', label: 'Preferred day(s)', type: 'multiselect', desc: 'Which day(s) of the week work for the new level.', required: true, options: DAYS_OF_WEEK},
    {id: 'change_time', label: 'Preferred time', type: 'text', desc: 'e.g. 7:00 AM, evening, lunch class.', required: true, placeholder: 'Free text'},
    {id: 'members_requesting_change', label: 'How many members asked?', type: 'number', desc: 'How many members want this level change.', required: true},
    {id: 'change_reason', label: 'Reason for change', type: 'textarea', desc: 'Why the change is needed — pace, recovery, goal shift, etc.', required: true, placeholder: 'Brief reason'},
  ],
  'Scheduling|||Time Change': [
    {id: 'current_slot', label: 'Current time', type: 'text', desc: 'Existing day and time the request is against.', required: true, placeholder: 'e.g. Tuesday 7:00 AM'},
    {id: 'requested_time', label: 'Requested time', type: 'text', desc: 'The new day/time the member or staff wants.', required: true, placeholder: 'e.g. Thursday 6:30 PM'},
    {id: 'change_day', label: 'Preferred day(s)', type: 'multiselect', desc: 'Which day(s) of the week work.', required: true, options: DAYS_OF_WEEK},
    {id: 'members_requesting_change', label: 'How many members asked?', type: 'number', desc: 'How many members want this time change.', required: true},
    {id: 'change_reason', label: 'Reason for change', type: 'textarea', desc: 'Why the time change is needed.', required: true, placeholder: 'Brief reason'},
  ],
  'Scheduling|||Trainer Preferences': [
    {id: 'preferred_trainer', label: 'Preferred trainer', type: 'text', desc: 'Trainer the member wants.', required: true, placeholder: 'Trainer name'},
    {id: 'current_trainer', label: 'Current trainer', type: 'text', desc: 'Trainer they currently have or had.', placeholder: 'Trainer name'},
    {id: 'preference_reason', label: 'Why this trainer?', type: 'textarea', desc: 'Style, injury handling, motivation, etc.', required: true, placeholder: 'Brief reason'},
  ],
};

/* ------------------------------------------------------------------ relevance */
/** The Hub attaches its category's whole question bank to every sub-category, so a "Community
 *  Events" suggestion was asked for a thermometer reading and a par level, and "Laptops Not
 *  Functioning" for a UPI reference. These rules keep a question only where the sub-category
 *  gives it meaning. `keep`: asked only when the sub-category matches. `drop`: never asked when
 *  it matches. `cats` narrows a rule to categories. Published builder plans are left alone —
 *  an administrator's snapshot is deliberate. */
type Relevance = {ids: string[]; cats?: RegExp; keep?: RegExp; drop?: RegExp};
const RELEVANCE: Relevance[] = [
  // Where exactly in the building: only for something physical.
  {ids: ['specific_area'], cats: /^(?!Repair and Maintenance|Studio Amenities|Safety and Security|Theft and Lost).*/, keep: /odou?r|temperature|audio|music|overcrowding|injury|discomfort|equipment|layout|laptop|speaker|mic |mic$|phones|camera|wi-fi|router|ipad|pos |cash|noise|lighting|decor|charging|lockers|drafts|lobby|signage|storage/i},
  {ids: ['immediate_danger','injury_risk','class_impacted','is_repeat','affected_count'],cats:/Studio Amenities/,drop:/challenges|perks|community events|holiday-themed|sustainable|integration|lost and found/i},
  {ids: ['specific_area', 'area', 'temp_reading', 'par_level', 'supply_count', 'vendor_needed', 'amenity'], cats: /Studio Amenities/, drop: /challenges|perks|community events|holiday-themed|sustainable|integration|lost and found/i},
  {ids: ['area'], cats: /Pricing|Customer Service|Brand Feedback|Internal Operations|Scheduling|Trainer Feedback/},
  {ids: ['area'], cats: /Operating Systems|Tech Issues/, keep: /router|ipad|cash|pos|laptop|speaker|mic|phones|camera|wi-fi|music|streaming/i},
  // Danger and class disruption belong where something can go wrong in the room.
  {ids: ['immediate_danger'], cats: /Pricing|Customer Service|Brand Feedback|Internal Operations|Operating Systems|Scheduling/},
  {ids: ['immediate_danger'], cats: /Tech Issues/, keep: /camera|surveillance/i},
  {ids: ['class_impacted'], cats: /Pricing|Customer Service|Brand Feedback|Internal Operations|Theft and Lost/},
  {ids: ['member_impact', 'affected_count', 'churn_risk'], cats: /Internal Operations/},
  // Tech: money and logins only where the fault is about money or logins.
  {ids: ['transaction_ref', 'amount_inr', 'amount_basis', 'receipt_needed', 'accounts_action'], cats: /Tech Issues/, keep: /payment|charge|debit|receipt|invoice|booking system|wrong class/i},
  {ids: ['login_user'], cats: /Tech Issues/, keep: /login|password|app|booking|website|notification|social|virtual|streaming/i},
  {ids: ['bandwidth_check'], cats: /Tech Issues/, keep: /wi-fi|streaming|buffering|video|app|website|notification|booking|laptop/i},
  // Pricing: freezes, refunds and rate cards only where they are the subject.
  {ids: ['freeze_type', 'freeze_dates'], cats: /Pricing/, keep: /freeze|pause|flexibility|upgrade|downgrade|expiry|auto-renewal/i},
  {ids: ['refund_required', 'refund_amount'], cats: /Pricing/, drop: /transparency|t ?and ?c|clarity|payment plan|international|location/i},
  {ids: ['city_rate'], cats: /Pricing/, keep: /price|pricing|location|international|corporate|group|private|discount|offer/i},
  // Brand: deal terms only for partnerships and campaigns.
  {ids: ['partner_name', 'commercial_terms', 'value_inr', 'deliverables', 'go_live'], cats: /Brand Feedback/, keep: /hosted|collab|partnership|influencer|event|collateral|post-event|advertising/i},
  {ids: ['ambassador_status'], cats: /Brand Feedback/, keep: /influencer|ambassador|recognition|loyalty/i},
  {ids: ['rights_used'], cats: /Brand Feedback/, keep: /testimonial|social|content|influencer|recognition|collateral|advertising|newsletter/i},
  {ids: ['platform'], cats: /Brand Feedback/, keep: /social|influencer|advertising|newsletter|testimonial|marketing|content|collateral|perception|positioning/i},
  {ids: ['pr_speaker'], cats: /Brand Feedback/, keep: /perception|positioning|press|market|advertising|social|message|tone/i},
  {ids: ['program_name'], cats: /Brand Feedback/, keep: /program|campaign|event|newsletter|collab|partnership|recognition|loyalty|influencer|collateral|advertising/i},
  // Safety: injury questions do not apply to a data breach or a drill.
  {ids: ['injury_occurred', 'medical_response', 'member_notified', 'followup_due'], cats: /Safety and Security/, drop: /data breach|training|fire drills|cctv malfunction|panic button|front desk not checking|unregistered walk-ins/i},
  // Theft vs lost: police and staff questions only where something was taken.
  {ids: ['staff_implicated', 'police_complaint'], cats: /Theft and Lost/, drop: /misplaced|left behind|forgetting|lost shoes|missing towels|lost and found|coffee/i},
  {ids: ['item_category', 'item_desc', 'item_value', 'serial_imei', 'lost_or_stolen', 'last_seen', 'time_window', 'locker_number', 'cfhr_checked', 'staff_implicated', 'police_complaint', 'compensation', 'cctv_requested'], cats: /Theft and Lost/, drop: /coffee|refreshments|theft prevention|safe storage/i},
  // Repair: asset questions only for things with an asset tag.
  {ids: ['asset_type', 'asset_id', 'asset_condition', 'usable', 'downtime'], cats: /Repair and Maintenance/, drop: /pest|uniforms|toiletries|supplies|towel|air fresheners|standard operating|retail|stock|attendance|dust|vendor \/ amc|fire safety/i},
  // Class experience: injury only where the class itself can hurt someone.
  {ids: ['injury_risk'], cats: /Class Experience/, keep: /injury|discomfort|adjustments|hands-on|modifications|intensity|overcrowding|temperature|flow|pacing|fitness levels|following|demonstration|knowledge/i},
  // Internal: each block to its own kind of request.
  {ids: ['data_source', 'report_spec'], cats: /Internal Operations/, keep: /report|intelligence|post-class|lead capture|b2b/i},
  {ids: ['rollout_plan', 'version_from', 'applies_to_roles'], cats: /Internal Operations/, keep: /sop|policy|governance|audit|checklist|handover|communication|memo/i},
  {ids: ['people_impact'], cats: /Internal Operations/, keep: /hr|performance|payroll|leave|shift|zoho/i},
  {ids: ['lead_ref'], cats: /Internal Operations/, keep: /lead|b2b|corporate|hosted/i},
  {ids: ['noise_source'], cats: /Miscellaneous/, keep: /noise|music|construction|volume/i},
  // A hosted class is a partnership report, not a fault: no room, danger or triage block.
  {ids: ['specific_area', 'area', 'class_format', 'class_impacted', 'immediate_danger', 'member_impact', 'affected_count', 'is_repeat', 'linked_ticket', 'churn_risk', 'sentiment', 'requested_outcome'], keep: /^(?!.*hosted class)/i},

  /* ---- 2026-10 form audit: every sub-category reviewed against what it is actually about. ---- */
  // "Is anyone in immediate danger?" only where something physical can hurt someone right now.
  {ids: ['immediate_danger'], cats: /Class Experience/, keep: /odou?r|temperature|overcrowding|injury|discomfort|hands-on|modifications|intensity|fitness levels|following|demonstration|knowledge|audio/i},
  {ids: ['immediate_danger'], cats: /Trainer Feedback/, keep: /injury|emergency|hands-on|behaviour|intensity/i},
  {ids: ['immediate_danger'], cats: /Repair and Maintenance/, drop: /pest|uniforms|toiletries|towel|air fresheners|seating|vending|standard operating|vendor \/ amc|retail|music system|housekeeping/i},
  {ids: ['immediate_danger'], cats: /Theft and Lost/},
  {ids: ['immediate_danger'], cats: /Miscellaneous/, keep: /late-night|overcrowding in lobby/i},
  {ids: ['immediate_danger'], cats: /Safety and Security/, drop: /data breach|employee security training|fire drills not conducted/i},
  // The room only where the room matters.
  {ids: ['area', 'specific_area'], cats: /Class Experience/, keep: /odou?r|audio|temperature|overcrowding|injury|discomfort/i},
  {ids: ['area', 'specific_area'], cats: /Repair and Maintenance/, drop: /standard operating|vendor \/ amc|uniforms/i},
  {ids: ['area', 'specific_area'], cats: /Safety and Security/, drop: /data breach|employee security training/i},
  {ids: ['area', 'specific_area'], cats: /Theft and Lost/, drop: /theft prevention|investigation process/i},
  {ids: ['area', 'specific_area', 'class_impacted'], cats: /Miscellaneous/, drop: /feedback fatigue|social media|child-friendly|noise complaints from neighbors|customer flow/i},
  // One room question is enough; `area` already follows the chosen studio's own rooms.
  {ids: ['affected_room'], cats: /Miscellaneous/},
  // Scheduling: the timetable-change block only for requests to change the timetable.
  {ids: ['schedule_action', 'requested_slot', 'current_slot', 'weekly_impact', 'demand_evidence'], cats: /Scheduling/, keep: /time change|additional classes|studio timings|session length|early morning|weekend vs|holiday and festival|schedule gaps|workshop|special request/i},
  {ids: ['requested_slot'], cats: /Scheduling/, drop: /time change/i}, // its own "Requested time" asks this
  {ids: ['grid_impact', 'notified_members'], cats: /Scheduling/, drop: /booking restrictions|booking confirmation|late arrival policy|special request|private group/i},
  {ids: ['class_impacted', 'member_impact', 'is_repeat', 'affected_count'], cats: /Scheduling/, drop: /time change|level change|trainer preferences|additional classes|studio timings|early morning|weekend vs|holiday and festival/i},
  {ids: ['method_conformance'], cats: /Scheduling/},
  {ids: ['roster_alternates'], cats: /Scheduling/, keep: /substitutions/i},
  // Class desk detail (disruption, booking friction, return intent) only where one class is the subject.
  {ids: ['class_disruption', 'class_experience_effect', 'class_booking_friction', 'class_rebooking_intent'], cats: /Scheduling/, keep: /capacity issues|waitlist|booking|substitutions|overbooking|cancellations|session length|grid review/i},
  // Trainer feedback: "method deviation" only for how the class was taught.
  {ids: ['method_conformance'], cats: /Trainer Feedback|Class Experience|Theft and Lost|Studio Amenities|Internal Operations/, keep: /modifications|demonstration|knowledge|challenges in following|intensity|focus on individual|experience and intensity|music balance|class flow/i},
  {ids: ['ticket_vendor'], cats: /Class Experience|Customer Service|Studio Amenities/, keep: /wi-fi/i},
  // Repair: housekeeping and cleaning are not an asset fault.
  {ids: ['asset_type', 'asset_id', 'asset_condition', 'usable', 'downtime', 'reading_now'], cats: /Repair and Maintenance/, drop: /housekeeping|cleaning|additional waiting/i},
  {ids: ['vendor_amc'], cats: /Repair and Maintenance/, drop: /uniforms|housekeeping|resistance bands/i},
  // Amenities: valet token only for valet, temperature only for air and water, guests only for events.
  {ids: ['valet_ticket'], cats: /Studio Amenities/, keep: /valet/i},
  {ids: ['temp_reading'], cats: /Studio Amenities/, keep: /ventilation|air quality|steam|shower|odou?r/i},
  {ids: ['par_level', 'supply_count'], cats: /Studio Amenities/, keep: /cleanliness|boutique|smoothie|accessories|lounge/i},
  {ids: ['sku', 'stock_on_hand'], cats: /Studio Amenities/, keep: /boutique|smoothie/i},
  {ids: ['guest_count'], keep: /hosted|community events|holiday-themed|challenges|event|workshop/i},
  {ids: ['vendor_needed', 'amenity', 'temp_reading', 'valet_ticket', 'par_level', 'supply_count'], cats: /Studio Amenities/, drop: /attendance|check-in|equipment layout/i},
  // Systems: hardware faults have no member data to back-date.
  {ids: ['backdated', 'data_impact', 'momence_record'], cats: /Operating Systems|Tech Issues/, drop: /router|ipad|cash counting|laptops|speakers|mic|phones|camera|wi-fi/i},
  {ids: ['membership'], cats: /Tech Issues/, keep: /app|booking|password|login|payment|notification|debit|charges|receipt|streaming|virtual|website/i},
  {ids: ['user_type', 'repro_steps', 'frequency', 'device'], cats: /Tech Issues/, drop: /studio music preferences/i},
  // Pricing: transaction fields only where money actually moved.
  {ids: ['amount_charged', 'amount_expected', 'payment_mode', 'payment_date', 'transaction_ref', 'dispute_reason', 'balance_classes', 'gst_invoice', 'approval_ref', 'refund_required', 'refund_amount', 'accounts_action', 'payment_charge_state', 'payment_receipt_shared'], cats: /Pricing/, drop: /transparency|t ?and ?c|clarity|payment plan|international|private session pricing|corporate wellness|special group|location & pricing|holiday and special/i},
  // Service: the complaint block only for complaints about how staff handled something.
  {ids: ['complaint_nature', 'desk_owner', 'goodwill_offered', 'review_or_public', 'service_channel', 'contact_attempted', 'reply_deadline', 'response_waited'], cats: /Customer Service/, drop: /training of|retention strategies|proactive|competitor|lead conversion|lead management/i},
  {ids: ['response_waited', 'contact_attempted', 'reply_deadline'], cats: /Customer Service/, keep: /delay|response|follow-up|unresolved|late response|handling of complaints|lead follow-up/i},
  {ids: ['review_or_public'], cats: /Customer Service/, keep: /complaint|negative reviews|attitude|over-promising|response|delay|friendliness|etiquette|compensation/i},
  // Brand: a creative or market note has no "members affected" count or member impact.
  {ids: ['affected_count', 'member_impact', 'class_impacted'], cats: /Brand Feedback/, keep: /merchandise quality|staff wearing/i},
  // Safety: injury, police and CCTV questions only where an incident can have happened.
  {ids: ['injury_occurred', 'medical_response', 'member_notified', 'followup_due'], cats: /Safety and Security/, drop: /emergency exits|unlocked doors|security guard|suspicious|trespass|first aid kit|staff security/i},
  {ids: ['cctv_retention', 'cctv_time', 'witnesses', 'police_escalation'], cats: /Safety and Security/, drop: /data breach|employee security training|fire drills|first aid kit|panic button|cctv malfunction/i},
  {ids: ['statement_taken'], cats: /Safety and Security/, keep: /harassment|personal safety|medical|unauthorized/i},
  {ids: ['statement_taken'], cats: /Repair and Maintenance|Trainer Feedback|Miscellaneous/, keep: /injury|emergency/i},
  // Lost items: no compensation or staff questions for something a member simply left behind;
  // towels and equipment are studio stock, not a member's lost property.
  {ids: ['compensation'], cats: /Theft and Lost/, drop: /misplaced|left behind|forgetting|lost shoes|lost and found|missing towels|extra equipment|boutique/i},
  {ids: ['item_value', 'serial_imei', 'locker_number', 'cfhr_checked', 'item_category', 'item_desc', 'last_seen', 'lost_or_stolen', 'cctv_requested'], cats: /Theft and Lost/, drop: /missing towels/i},
  {ids: ['serial_imei', 'locker_number', 'staff_implicated', 'police_complaint', 'item_value'], cats: /Theft and Lost/, drop: /extra equipment/i},
  {ids: ['locker_number', 'serial_imei'], cats: /Theft and Lost/, drop: /boutique/i},
  // Miscellaneous: "Who is the suggestion for" only for suggestions.
  {ids: ['noise_source'], cats: /Miscellaneous/, keep: /noise|music|construction|volume/i},
  {ids: ['light_circuit'], cats: /Miscellaneous/, keep: /lighting/i},
  {ids: ['immediate_danger'], cats: /Studio Amenities/, keep: /odou?r|cleanliness|ventilation|air quality|shower|steam|equipment layout|accessories/i},
  {ids: ['immediate_danger', 'area', 'specific_area'], cats: /Repair and Maintenance/, drop: /attendance|check-in/i},
  // Internal: a memo is not a repeat fault.
  {ids: ['is_repeat'], cats: /Internal Operations/, keep: /handover|communication gap|hris/i},
];
/** Questions that stay on the form but should not block filing where they rarely have an
 *  answer: a prospect asking about prices has no membership yet, and a brand note is seldom a
 *  repeat. */
const OPTIONAL: Relevance[] = [
  {ids: ['membership', 'entitlement_state'], cats: /Pricing/, keep: /transparency|t ?and ?c|clarity|payment plan|international|private session pricing|corporate wellness|special group|location & pricing|holiday and special/i},
  {ids: ['is_repeat'], cats: /Brand Feedback|Internal Operations/},
  {ids: ['desk_owner', 'goodwill_offered', 'review_or_public'], cats: /Customer Service/},
];
const optionalHere = (id: string, category: string, sub: string) => OPTIONAL.some(r => r.ids.includes(id) && (!r.cats || r.cats.test(category)) && (r.keep ? r.keep.test(sub) : true));
const relevant = (id: string, category: string, sub: string) => RELEVANCE.every(r => {
  if (!r.ids.includes(id) || (r.cats && !r.cats.test(category))) return true;
  if (r.keep) return r.keep.test(sub);
  if (r.drop) return !r.drop.test(sub);
  return false;
});

/**
 * Universal questions that should not be universal.
 *
 * The block every form inherits is mostly conditional already — the class questions sit
 * behind the "Involves a session" switch, contact preferences behind the reporter, churn
 * behind sentiment. These two were the ones still asked of everybody:
 *
 *  - `report_channel` is recorded automatically. Every ticket is stamped with the surface it
 *    came from (`channel=form|chat|workspace`), so asking the desk to re-enter it is asking
 *    for something already known. It stays for staff relaying from somewhere the app cannot
 *    see — WhatsApp, Instagram, a phone call — which is the only case where the answer adds
 *    anything.
 *  - `affected_count` follows the impact question. "How many members were affected" has one
 *    sensible answer when the impact is "No impact", and nobody should have to type it.
 */
const UNIVERSAL_CONDITIONS: Record<string, {dependsOn: string; when: string; condText: string}> = {
  report_channel: {
    dependsOn: 'reporter_type',
    // Anyone other than the member or prospect in front of you is relaying it from elsewhere.
    when: 'member|prospect|partner|told me|on behalf',
    condText: 'Yes — when staff are relaying this from somewhere else',
  },
  affected_count: {
    dependsOn: 'member_impact',
    when: '^(?!no impact)',
    condText: 'Yes — when members were actually affected',
  },
};

/** Follow-ups the Hub asks on *any* answer to their parent, narrowed to the answers their own
 *  condition text describes ("if injury_occurred is not 'No'"). */
const WHEN: Record<string, string> = {
  medical_response: '^(yes|fatality)', member_notified: '^(yes|fatality)', followup_due: '^(yes|fatality)',
  temp_reading: 'air conditioning|ventilation|steam|hot water',
  supply_count: 'towels|toiletries|drinking water|boutique|smoothie|shoe sanitiser',
  serial_imei: 'phone|laptop|tablet|watch', locker_number: 'locker', police_complaint: 'stolen|valet|damaged',
  downtime: '^(?!yes, fully)', refund_amount: '^yes', freeze_dates: '^(?!not a freeze)',
  transaction_ref: 'payment|pos|card|momence', bandwidth_check: 'wi-fi|router|website|app',
  noise_source: 'noise|construction',
  cctv_retention: 'injury|fall|theft|harassment|abuse|threat|trespass|security|lost child|unsafe',
  witnesses: 'injury|fall|theft|harassment|abuse|threat|medical|unsafe', regulatory_note: 'fire|exit|hazard|equipment failure|medical',
  cctv_time: '^(requested|not yet|downloaded)',
  eng_site_ref: '^yes', vendor_name: '^yes', vendor_visit_log: '^(yes|no - one-off)', quote_ref: '^no',
};

const TIME_SLOT_OPTIONS = [
  'Early morning · 6:00–8:00 AM',
  'Morning · 8:00–11:00 AM',
  'Midday · 11:00 AM–2:00 PM',
  'Afternoon · 2:00–5:00 PM',
  'Evening · 5:00–8:00 PM',
  'Late evening · after 8:00 PM',
];
const TIME_SLOT_IDS = new Set(['current_slot', 'requested_slot', 'requested_time', 'change_time', 'service_time', 'time_of_day']);

/** The full field list for a sub-category: the universal block first, then its own fields,
 *  then any Iris-specific overlay. Unknown sub-categories get the universal block. */
export function planFields(category: string, sub: string, ctx: PlanContext, configured?: Omit<IntakeField, 'dep'>[]): IntakeField[] {
  const raw = DATA.subs[sourceSubKey(category, sub)];
  const base = DATA.universal.map(i => materialise(DATA.defs[i], true, ctx, category));
  const own = (raw?.f || []).map(i => materialise(DATA.defs[i], false, ctx, category));
  const planIds = [...DATA.universal, ...(raw?.f || [])].map(i => DATA.defs[i].id);
  const overlay = [
    ...(SUB_OVERLAYS[subKey(category, sub)] || []),
    ...equipmentOverlay(category, sub, planIds),
    // The count is universal, so the picker that names those members belongs everywhere the
    // roster-based one is not already asking.
    ...(planIds.includes('affected_count') && !planIds.includes('attendees_affected') ? [MEMBERS_AFFECTED_DEF] : []),
  ].map(d => materialise(d, false, ctx, category));
  const seen = new Set<string>();
  const merged = [...base, ...own, ...overlay].filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  // Irrelevant questions go, and so does anything that only followed on from one of them —
  // otherwise its condition could never be met and it would show unconditionally.
  const dropped = new Set(merged.filter(f => !relevant(f.id, category, sub)).map(f => f.id));
  for (let changed = true; changed;) { changed = false; for (const f of merged) if (!dropped.has(f.id) && f.dependsOn && dropped.has(f.dependsOn)) { dropped.add(f.id); changed = true; } }
  const asset = EQUIPMENT_PREFILL[subKey(category, sub)];
  const generated = merged
    .filter(f => !dropped.has(f.id))
    .map(f => WHEN[f.id] && !f.when ? {...f, when: WHEN[f.id]} : f)
    // Only where the field it depends on is actually on this form; dependencyOf falls back to
    // "always visible" otherwise, so a form without the parent keeps asking as it did.
    .map(f => {
      const c = UNIVERSAL_CONDITIONS[f.id];
      // `conditional` alone is not enough to skip: several fields carry the flag with no
      // dependency to resolve it against, which makes them permanently visible.
      if (!c || f.dependsOn || !merged.some(x => x.id === c.dependsOn)) return f;
      return {...f, conditional: true, dependsOn: c.dependsOn, when: c.when, condText: c.condText};
    })
    // Set on the plan the form already had, as well as on the one just injected.
    .map(f => asset && f.id === 'asset_type' && !f.prefill ? {...f, prefill: asset} : f);
  // A published builder plan replaces the generated plan for this sub-category. It is a full
  // snapshot on purpose: administrators can remove irrelevant inherited fields as well as add
  // questions, while Reset can always return to the source-backed generated version.
  let all = configured?.length ? configured.map(f => ({...f, section: !f.section || LEGACY_SECTIONS.has(f.section) ? sectionOf(f.id, f.enrich, category) : f.section})) : generated;
  // A precise occurrence timestamp already answers recency. Showing both creates two competing
  // answers to the same question and was one of the largest sources of repetitive forms.
  if (all.some(f => f.id === 'occurred_at')) all = all.filter(f => f.id !== 'occurred_relative');
  // Scheduling preferences are sets, not prose. A shared option bank makes them filterable and
  // lets a member legitimately choose more than one usable window.
  // `allowOther` is re-decided here because the type and the options both change: these
  // start life as free text and only become a list at this point.
  all = all.map(f => TIME_SLOT_IDS.has(f.id) ? {...f, type: 'multiselect' as const, options: TIME_SLOT_OPTIONS, placeholder: undefined, allowOther: true} : f);
  // These two counts are semantically identical on scheduling requests. Retain the more specific
  // request count and drop the generic impact count wherever both were inherited.
  if (all.some(f => f.id === 'members_requesting_change')) {
    all = all.filter(f => f.id !== 'affected_count');
    // The picker asks who those members are, so it has to follow whichever count survived —
    // left pointing at the dropped one it could never appear.
    all = all.map(f => f.id === 'members_affected' ? {...f, dependsOn: 'members_requesting_change'} : f);
  }
  // Always offer a member lookup if the plan does not already have one.
  if (!all.some(f => f.type === 'lookup' && f.module === 'member' && MEMBER_LOOKUP_IDS.includes(f.id))) all.push(materialise(MEMBER_LOOKUP_DEF, true, ctx, category));
  // Prompt for the exact spot inside the chosen room/area.
  if (!configured?.length && !all.some(f => f.id === 'specific_area') && relevant('specific_area', category, sub)) all.push(materialise({id: 'specific_area', label: 'Exact spot', type: 'text', desc: 'For example: bike 3, mirror wall, left of the front desk.', conditional: true, dependsOn: 'area', condText: 'Asked when an area is selected', placeholder: 'e.g. bike 3, front row'}, false, ctx, category));
  // The title is optional everywhere: left blank, the server writes a descriptive one
  // ("what happened — member · studio") from the description, which reads far better on the
  // board than the sub-category repeated back. A title the reporter types is kept as written.
  all = all.map(f => f.id === 'title' ? {...f, required: false, desc: 'Optional. Leave blank and Iris writes one from your description.', placeholder: 'Leave blank to generate from the description'} : f);
  const memberFields=all.filter(f=>f.type==='lookup'&&f.module==='member'&&MEMBER_LOOKUP_IDS.includes(f.id));
  const memberRequired=memberFields.some(f=>f.required);
  const aliases=new Set(MEMBER_LOOKUP_IDS.filter(id=>id!=='member_name'));
  if(!configured?.length)all=all.filter(f=>f.id!=='title');
  all=all.map(f=>({...f,enrich:f.enrich||DEF_BY_ID.get(f.id)?.enrich}));
  all=all.filter(f=>!['reporter_name','reporter_contact','privacy_flag','incident_location','vendor_visit_log','eng_site_ref','quote_ref','vendor_name','class_compatibility_notes','trainer_feedback_type','trainer_action_now'].includes(f.id))
    .filter(f=>!(f.id==='housekeeping_log'&&category==='Trainer Feedback'))
    .filter(f=>!(['grid_impact','notified_members','roster_alternates'].includes(f.id)&&category!=='Scheduling'))
    .filter(f=>!aliases.has(f.id)&&!['follow_up_channel','churn_risk','service_time','time_of_day'].includes(f.id)&&!OBSERVATION_FIELDS.has(f.id))
    .filter(f=>relevant(f.id,category,sub)&&enrichmentRelevant(f.id,f.enrich,category,sub))
    .map(f=>{
      const copy=FIELD_COPY[f.id];
      const global=GLOBAL_FIELD_IDS.has(f.id);
      const dep=f.dependsOn&&aliases.has(f.dependsOn)?'member_name':f.dependsOn;
      return {...f,...copy,dependsOn:dep,section:global?'Global details':f.section,
        ...(f.id==='member_name'?{required:memberRequired,conditional:!memberRequired,dependsOn:memberRequired?undefined:'_involves_member',when:memberRequired?undefined:'^yes$'}:{}),
        ...(f.id==='occurred_at'?{required:false}:{}),
        ...(['reporter_type','reporter_name','reporter_contact'].includes(f.id)?{required:false}:{}),
        ...(f.id==='sentiment'||f.id==='member_verbatim'?{required:false,conditional:true,dependsOn:'_involves_member',when:'^yes$'}:{}),
        ...(f.id==='class_date'?{conditional:true,dependsOn:'_involves_class',when:'^yes$'}:{}),
        ...(['class_format','trainer'].includes(f.id)||f.enrich==='class'||f.enrich==='roster'?{conditional:true,dependsOn:'class_date',when:undefined}:{}),
      };
    });
  if(!all.some(f=>f.id==='member_name'))all.push({...materialise(MEMBER_LOOKUP_DEF,true,ctx,category),id:'member_name',label:'Member',section:'Global details',required:memberRequired,conditional:!memberRequired,dependsOn:memberRequired?undefined:'_involves_member',when:memberRequired?undefined:'^yes$'});
  // Exact time replaces recency/day part; account and session facts have one source.
  const seenIds=new Set<string>();all=all.filter(f=>!seenIds.has(f.id)&&Boolean(seenIds.add(f.id)));
  const affected=all.find(f=>f.id==='affected_count'||f.id==='members_requesting_change');
  if(affected&&!all.some(f=>f.id==='members_affected'||f.id==='attendees_affected'))all.push({...materialise(MEMBERS_AFFECTED_DEF,false,ctx,category),dependsOn:affected.id});
  if(isLateArrival(category,sub)) all=lateArrivalFields(all,ctx.trainers);
  all=all.map(f=>({...f,label:simpleLanguage(f.label),desc:f.desc?simpleLanguage(f.desc):undefined,placeholder:f.placeholder?simpleLanguage(f.placeholder):undefined,options:f.options?.map(simpleLanguage)}));
  let index = new Map(all.map(f => [f.id, f]));
  // An optional question whose parent is not on this form can never be shown; drop it, and
  // anything that follows on from it, so the form does not carry dead questions.
  for (let changed = true; changed;) {
    changed = false;
    for (const f of all) if (!f.required && f.dependsOn && !f.dependsOn.startsWith('_') && !index.has(f.dependsOn)) { all = all.filter(x => x !== f); index = new Map(all.map(x => [x.id, x])); changed = true; break; }
  }
  return all.map(f => {
    if (f.id === 'preferred_contact' || f.id === 'follow_up_channel') {
      return {...f, required: false, conditional: true, dep: '_involves_member', when: 'yes|directly|indirectly'};
    }
    const dep=dependencyOf(f,index);
    // "Yes — for this sub category" is how the Hub marks a question that belongs on this form
    // with nothing to wait for. With no dependency it was flagged conditional and never shown,
    // so about 20 questions (entitlement, statement collected, fixed already…) were dead.
    if(f.required&&optionalHere(f.id,category,sub))f={...f,required:false};
    if(f.conditional&&dep===null)return {...f,conditional:false,dep};
    return {...f,...(dep==='_unavailable_dependency'&&f.required?{conditional:false}:{}),dep};
  });
}

/** Kind-specific questions are identical in the browser and server validator. */
export function fieldsForKind(fields:IntakeField[],kind:string,category='') {
  if(category==='Safety and Security')return fields;
  const hidden=kind==='compliment'?new Set(['is_repeat','linked_ticket','immediate_danger','class_impacted','member_impact','injury_occurred','injury_risk','medical_response','police_escalation']):['feedback','request'].includes(kind)?new Set(['is_repeat','linked_ticket']):new Set<string>();
  return fields.filter(f=>!hidden.has(f.id)).map(f=>['feedback','compliment','assessment'].includes(kind)&&['member_impact','affected_count','injury_risk'].includes(f.id)?{...f,required:false}:f);
}

/* ------------------------------------------------------------------ values */
export type IntakeValue = string | number | string[] | undefined | null;
export type IntakeData = Record<string, IntakeValue>;

export const filled = (v: unknown) => v != null && !(typeof v==='string'&&!v.trim()) && !(Array.isArray(v)&&!v.length);
export const skipKey = (id: string) => `_skip_${id}`;
export const isSkipped = (data: IntakeData, id: string) => /^yes$/i.test(String(data[skipKey(id)] || ''));
export function isVisible(f: IntakeField, data: IntakeData) {
  if (!f.conditional) return true;
  if (!f.dep) return false;
  if(f.dep==='_involves_class'&&filled(data.class_date))return true;
  if(f.dep==='_involves_member'&&(/member told me|on behalf|^member|^prospect/i.test(String(data.reporter_type||''))||MEMBER_LOOKUP_IDS.some(id=>filled(data[id]))))return true;
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
const STAFF_REPORTER = /front desk|colleague|walkthrough|audit|myself|member told me|coordinator|trainer|regional|corporate|staff|observation/i;
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
  if (classTouched && !isLateArrival(sub.category,sub.name) && !hasLookup(data.class_date)) out.push({id: 'class_date', label: 'Class', reason: 'link the affected class'});
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
/** The answers a plan starts with — currently the equipment a sub-category names. Applied
 *  when the form is built and whenever the sub-category changes, never over something the
 *  person has already answered. */
export function prefillFor(fields: IntakeField[]): IntakeData {
  return Object.fromEntries(fields.filter(f => f.prefill).map(f => [f.id, f.prefill as IntakeValue]));
}

export function seedData(prev: IntakeData, reporter?: {name?: string; email?: string}): IntakeData {
  return {
    reporter_type: 'Staff observation',
    preferred_contact: 'Not provided',
    ...(reporter?.name ? {reporter_name: reporter.name} : {}),
    ...(reporter?.email ? {reporter_contact: reporter.email} : {}),
    ...Object.fromEntries(Object.entries(prev).filter(([, v]) => filled(v))),
  };
}
export const shortStudio = (s: unknown) => String(s || '').split(',')[0].trim();
/** A local preview of the title the server will write when the reporter leaves it blank:
 *  the first sentence of the summary, then the member and studio. Display only — the form
 *  never files it, so the server's labeller always has the last word. Empty until there is
 *  a summary to draw from. */
export function titlePreview(data: IntakeData): string {
  const summary = String(data.summary || '').replace(/\s+/g, ' ').trim();
  if (!summary) return '';
  let lead = (/^.+?[.!?](?=\s|$)/.exec(summary)?.[0] || summary).replace(/[.!?]+$/, '');
  if (lead.length > 90) lead = lead.slice(0, 87).replace(/\s+\S*$/, '') + '…';
  const member = ['member_name', 'member_named'].map(id => decodeLookups(data[id])[0]?.label).find(Boolean);
  const tail = [member, shortStudio(data.studio)].filter(Boolean).join(' · ');
  return tail ? `${lead} — ${tail}` : lead;
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
  const mood = [text('sentiment') && `expressed sentiment: ${lower1(text('sentiment'))}`].filter(Boolean) as string[];
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
const SENTIMENTS = new Set(['positive', 'neutral', 'frustrated', 'negative','unknown']);
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
  /** The hosted-class roster, one line per attendee as the desk filled it in. */
  hostedAttendees?: {name: string; memberId?: string; email?: string; session?: string; booking: string; attendance: string; outcome: string; followUp: string; flags: string[]; note: string}[];
  memberDetail?: {email?: string; phone?: string; membership?: string};
  /** Departments that co-own the ticket beside the lead one (department ids). */
  involvedTeams?: string[];
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
  const emailAnswer = String(data.member_email || member?.sublabel?.match(/[^\s]+@[^\s]+\.[^\s]+/)?.[0] || '');
  const emailFromAnswer = /\[#/.test(emailAnswer) ? (decodeLookup(emailAnswer)?.sublabel || '') : emailAnswer;
  const typedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFromAnswer.trim()) ? emailFromAnswer.trim() : '';
  const session = linkedLookup(data.class_date);
  const staff = isStaffReporter(data.reporter_type);
  const memberReporter = isMemberReporter(data.reporter_type);
  const memberRelated = Boolean(member || memberReporter || /yes|directly|indirectly/i.test(String(args.data._involves_member || '')));
  const reporterName = String(args.data.reporter_name || '').trim();
  const reporterContact = String(args.data.reporter_contact || '').trim();
  // Who the ticket is logged for: the linked (or typed) member; a member or prospect filing
  // for themselves; otherwise the studio team, exactly as the composer files observations.
  const memberName = member?.label || typedMember?.label || (memberReporter && reporterName) || (!staff && !memberReporter && reporterName) || '';
  const contactEmail = memberRelated ? (memberReporter && /@/.test(reporterContact) ? reporterContact : args.memberDetail?.email || typedEmail) : '';
  const contactPhone = memberRelated ? (memberReporter && !/@/.test(reporterContact) ? reporterContact : args.memberDetail?.phone || '') : '';
  const sentimentRaw = String(data.sentiment || '').toLowerCase();
  const sentiment = (SENTIMENTS.has(sentimentRaw) ? sentimentRaw : kind === 'compliment' ? 'positive' : 'unknown') as TicketInput['sentiment'];
  const occurredAt = String(data.scheduled_start_at || data.occurred_at || '');
  const occurred = occurredAt ? new Date(occurredAt) : null;
  const incidentAt = occurred && Number.isFinite(occurred.getTime()) ? occurred.toISOString() : String(data.occurred_relative || 'Not recorded');
  const description = String(data.summary || '').trim() || (isLateArrival(category,sub)?visible.filter(f=>!['summary','studio','member_name'].includes(f.id)&&filled(data[f.id])).map(f=>`${f.label}: ${Array.isArray(data[f.id])?(data[f.id] as string[]).join(', '):String(data[f.id])}`).join('\n'):'');

  // Everything without a column, as readable strings keyed by field id — the same shape
  // guided-template answers use, so the ticket page's supporting-details block shows them.
  const custom: Record<string, unknown> = {};
  // Answers with a ticket column, or recorded below under the name Iris's routing reads.
  const columns = new Set([...MEMBER_LOOKUP_IDS,'members_affected','studio', 'title', 'summary', 'requested_outcome', 'sentiment', 'class_format', 'trainer', 'occurred_at', 'preferred_contact', 'member_impact',
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
  const affected = decodeLookups(data.attendees_affected || data.affected_members || data.members_affected || (memberImpactSignal(data)?data.member_name:undefined)).map(r => r.label).filter(Boolean);
  if (affected.length) custom.impactedMembers = affected.join(', ');
  const linkedTicket = decodeLookup(data.linked_ticket);
  if (linkedTicket) custom.linkedTicket = linkedTicket.label;
  if (args.hostedAttendees?.length) custom.hostedAttendees = args.hostedAttendees;
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
  if(isLateArrival(category,sub)) {
    custom.memberImpact=String(data.members_affected_flag||'Not known');
    custom.isClassImpacted=data.class_cancelled==='Yes'||(filled(data.actual_start_at)&&new Date(String(data.actual_start_at))>new Date(String(data.scheduled_start_at)))?'Yes':'Not known';
  }
  // The plan itself, so a later reader can label every answer and see which form produced it.
  const labels: Record<string, string> = {reportedBy: 'Raised by', reporterName: 'Reporter name', reporterContact: 'Reporter contact', isClassImpacted: 'Class impacted', isImmediateDanger: 'Immediate danger', memberImpact: 'Member impact', affectedCount: 'Members affected', impactedMembers: 'Attendees affected', linkedTicket: 'Related ticket', hostedAttendees: 'Hosted class attendees'};
  for (const f of visible) if (custom[f.id] !== undefined) labels[f.id] = f.label;
  custom._intake = {plan: subKey(category, sub), source: PLAN_SOURCE.repo, version: FORM_SCHEMA_VERSION, answers: {...data,_involves_member:args.data._involves_member,_involves_class:args.data._involves_class,_requires_resolution:args.data._requires_resolution}, labels, memberLinked: Boolean(member), sessionLinked: Boolean(session || args.classSnapshot)};

  const classFormat = args.classSnapshot?.name || (filled(data.class_format) ? String(data.class_format) : undefined);
  const trainer = filled(data.trainer) ? String(data.trainer) : args.classSnapshot?.trainer || undefined;
  return {
    // Blank unless the reporter typed one: the server's labeller writes a descriptive title.
    title: String(args.data.title || data.title || '').trim() || undefined,
    description,
    category, subcategory: sub, kind,
    studio: String(data.studio || ''),
    memberName: memberName.slice(0, 120),
    memberEmail: contactEmail || '',
    memberPhone: contactPhone || undefined,
    momenceMemberId: member?.id,
    momenceSessionId: args.classSnapshot?.sessionId || session?.id,
    classFormat, trainer,
    membership: memberRelated ? (args.memberDetail?.membership || (byId.get('membership') && filled(data.membership) && !hasLookupShape(data.membership) ? String(data.membership) : undefined)) : undefined,
    incidentAt,
    preferredContact: memberRelated ? String(data.preferred_contact || 'Not provided') : 'Internal log only',
    requestedResolution: filled(data.requested_outcome) ? String(data.requested_outcome) : undefined,
    resolutionRequired: !/^no$/i.test(String(args.data._requires_resolution || 'Yes')),
    sentiment,
    impact: filled(data.member_impact) ? String(data.member_impact) : undefined,
    customFields: custom,
    momenceContext: memberRelated ? args.momenceContext : undefined,
    involvedTeams: args.involvedTeams?.length ? [...new Set(args.involvedTeams)].slice(0, 6) : undefined,
    source: 'iris',
    submissionKey,
  };
}
const hasLookupShape = (v: unknown) => /\[#\d+\]/.test(String(v ?? ''));
