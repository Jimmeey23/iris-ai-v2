/**
 * Compacts the Support Hub field plan into src/lib/intake/plan-data.json.
 *
 * The source is `src/data.json` in Jimmeey23/physique57-support-hub. It is 1.5 MB because
 * every sub-category carries a full copy of each field definition; across 4,600 field
 * instances there are only ~200 distinct definitions. This script interns them, keeps the
 * option tables, and drops what Iris already owns (studios, rooms, formats, trainers come
 * from the workspace settings at request time).
 *
 * Run: node scripts/build-intake-plan.mjs /path/to/physique57-support-hub [commit]
 */
import fs from 'node:fs';
import path from 'node:path';

const [, , hubDir, commit = 'unknown'] = process.argv;
if (!hubDir) {
  console.error('usage: node scripts/build-intake-plan.mjs <support-hub checkout> [commit]');
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(path.join(hubDir, 'src', 'data.json'), 'utf8'));

const opts = [];
const optIndex = new Map();
const internOpts = (list) => {
  const key = JSON.stringify(list);
  if (!optIndex.has(key)) { optIndex.set(key, opts.length); opts.push(list); }
  return optIndex.get(key);
};

const defs = [];
const defIndex = new Map();
const clean = (s) => (s == null ? undefined : String(s));

// The Hub's field notes were written for its maintainers as much as for the desk; the ones
// that talk about schemas, enums and routing internals are rewritten for the shared block and
// trimmed sentence-by-sentence everywhere else.
const HINTS = {
  reporter_type: 'Who is raising this. Sets the tone of the update and who receives it.',
  report_channel: 'How the report reached the desk.',
  reporter_name: 'Full name of the person who raised it, as they want to be addressed.',
  reporter_contact: 'Best number or email for a call-back.',
  preferred_contact: 'Where the first update should go.',
  follow_up_channel: 'If the follow-up should go somewhere else.',
  studio: 'Where it happened. Drives the room list, the owner and Momence lookups.',
  area: 'The room or spot, if it matters.',
  occurred_at: 'When it actually happened, not when it was typed.',
  occurred_relative: 'Quick answer when the exact time is unclear.',
  class_format: 'Which class or offering this is about.',
  class_date: 'Pick the session so the roll and coach come with it.',
  trainer: 'Who was coaching.',
  affected_count: 'How many members were affected. Leave blank if none.',
  is_repeat: 'Has this come up before? A linked ticket jumps the queue.',
  linked_ticket: 'The earlier ticket, if one is already open.',
  member_impact: 'How much this affected the member or the floor. Sets the priority floor.',
  class_impacted: 'Whether a live class is affected — blocking now outranks everything else.',
  immediate_danger: 'Any "yes" makes this critical and pages the manager on duty.',
  title: 'One line, drafted from the sub-category and studio — edit freely.',
  summary: 'Two to four sentences in the reporter\u2019s own words. At least 12 characters.',
  requested_outcome: 'What the reporter wants to walk away with.',
  sentiment: 'How the member came across.',
  churn_risk: 'Your read on whether they might not renew.',
};
// Conditions the Hub only states in prose ("Yes — if is_repeat = 'Yes, ticket already open'").
// Its engine shows the field as soon as the dependency has any answer; these narrow that to the
// answers the prose names, as a case-insensitive pattern on the dependency's value.
const WHEN = {
  linked_ticket: 'already open',
  churn_risk: 'frustrated|negative',
  sentiment: '^(member|prospect)|member told me',
};
const BOILERPLATE = /reference-data pass|filled in by the class desk/i;
const TECH = /inferPriority|enum\b|schema|\bhub\b|customFields|\(\)|verbatim|contract|isImmediateDanger|momenceMemberId|\bL1\b|\bL2\b|payload|auto-opens|re-ranks|\bkey off\b/i;
function cleanDesc(id, desc) {
  if (HINTS[id]) return HINTS[id];
  if (!desc || BOILERPLATE.test(desc)) return undefined;
  const kept = String(desc).split(/(?<=[.!?])\s+/).filter((sentence) => !TECH.test(sentence));
  return kept.join(' ').trim() || undefined;
}

function internDef(f) {
  const d = { id: f.id, label: f.label, type: f.type };
  const desc = cleanDesc(f.id, f.desc);
  if (desc) d.desc = desc;
  if (f.required) d.required = true;
  if (f.conditional) d.conditional = true;
  if (f.dependsOn) d.dependsOn = f.dependsOn;
  if (f.conditional && f.condText && !/^no\b/i.test(f.condText.trim())) d.condText = f.condText;
  if (f.conditional && f.dependsOn && WHEN[f.id]) d.when = WHEN[f.id];
  const ph = clean(f.placeholder);
  if (ph && ph !== '—') d.placeholder = ph;
  if (Array.isArray(f.options) && f.options.length) d.o = internOpts(f.options);
  else if (typeof f.optsRef === 'number' && src.opts[f.optsRef]) d.o = internOpts(src.opts[f.optsRef]);
  if (f.module) d.module = f.module;
  if (f.multi) d.multi = true;
  if (f._enrich) d.enrich = String(f._enrich).replace(/^G:/, '');
  const key = JSON.stringify(d);
  if (!defIndex.has(key)) { defIndex.set(key, defs.length); defs.push(d); }
  return defIndex.get(key);
}

// File uploads are chat-session scoped in Iris and have no home on a form submission yet.
const usable = (f) => f.type !== 'file';

const universal = src.universal.filter(usable).map(internDef);
const subs = {};
const categories = src.categories.map((c) => ({
  name: c.name,
  department: c.department,
  owners: { mumbai: c.ownerMumbai, bengaluru: c.ownerBengaluru, l1: c.l1, l2: c.l2 },
  subs: c.subs.map((s) => {
    const key = `${c.name}|||${s.name}`;
    subs[key] = {
      f: (src.subFields[key] || []).filter(usable).map(internDef),
      p: s.priority,
      sla: s.slaLabel,
      h: [s.hours?.first ?? null, s.hours?.res ?? null],
      hist: s.hist || 0,
      department: s.department !== c.department ? s.department : undefined,
    };
    return s.name;
  }),
}));

const out = {
  source: { repo: 'Jimmeey23/physique57-support-hub', file: 'src/data.json', commit, generatedAt: new Date().toISOString().slice(0, 10) },
  counts: { categories: categories.length, subcategories: Object.keys(subs).length, defs: defs.length, opts: opts.length },
  opts,
  defs,
  universal,
  categories,
  subs,
  cycleIntake: src.repo?.cycleIntake || [],
};
const dest = path.join(process.cwd(), 'src', 'lib', 'intake', 'plan-data.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`, out.counts);
