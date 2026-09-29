/**
 * The intake form plan: what each sub-category asks, and what it should not have to.
 *
 * Covers the three rules added after the field audit —
 *   1. a sub-category that names equipment pre-fills the asset question,
 *   2. "members affected > 0" reveals the Momence member picker,
 *   3. every closed list carries a "Something else" escape (bar the ones routing depends on).
 *
 * Run: npm run check:forms
 */
import {planFields, prefillFor, isVisible, OTHER_OPTION} from '../src/lib/intake/plan.ts';
const ctx = {studios:['Kwality House, Kemps Corner'], formats:['Studio Barre 57'], trainers:['Anisha Shah']};
let fail = 0;
const ok = (c, m) => { console.log((c?'PASS  ':'FAIL  ')+m); if(!c) fail++; };

// 1. equipment prefill, including the form that had no asset field at all
for (const [cat, sub, want] of [
  ['Tech Issues','Mic Not Working','Microphone'],
  ['Tech Issues','Speakers Static Noise','Speaker'],
  ['Repair and Maintenance','AC and HVAC Issues','Air conditioning system'],
  ['Repair and Maintenance','PowerCycle Bike Fault (Stages SC3)','PowerCycle bike'],
]) {
  const f = planFields(cat, sub, ctx);
  const at = f.find(x => x.id === 'asset_type');
  ok(at?.prefill === want, `${sub}: asset_type prefilled "${at?.prefill}" (wanted "${want}")`);
  ok(prefillFor(f).asset_type === want, `${sub}: prefillFor seeds the value`);
  ok(Boolean(at?.options?.includes(want)), `${sub}: "${want}" is a real option on the list`);
}
// a form with no named equipment must not gain one
const plain = planFields('Scheduling','Time Change',ctx);
ok(!plain.some(f => f.id==='asset_type'), 'Scheduling/Time Change gains no equipment field');

// 2. members_affected appears only when the count says so
const mic = planFields('Tech Issues','Mic Not Working',ctx);
const ma = mic.find(f => f.id==='members_affected');
ok(Boolean(ma), 'members_affected injected where the roster picker is absent');
ok(ma && !isVisible(ma, {}), 'hidden when the count is blank');
ok(ma && !isVisible(ma, {affected_count:'0'}), 'hidden when the count is 0');
ok(ma && isVisible(ma, {affected_count:'3'}), 'shown when the count is 3');
ok(ma && isVisible(ma, {affected_count:'12'}), 'shown when the count is 12');
ok(ma?.multi === true && ma?.module === 'member', 'it is a multi-select Momence member lookup');
// forms that already ask the roster question must not get a second picker
const roster = Object.entries({}), withRoster = planFields('Class Experience','Audio Issues',ctx);
if (withRoster.some(f=>f.id==='attendees_affected')) ok(!withRoster.some(f=>f.id==='members_affected'), 'no duplicate picker where attendees_affected exists');

// 3. something-else escape
const all = planFields('Tech Issues','Mic Not Working',ctx);
const choice = all.filter(f => ['select','multiselect','radio'].includes(f.type) && f.options?.length);
const withOther = choice.filter(f => f.allowOther);
ok(withOther.length > 0, `escape hatch added to ${withOther.length}/${choice.length} closed lists on this form`);
ok(!all.find(f=>f.id==='studio')?.allowOther, 'studio stays closed (routing depends on it)');
const alreadyHad = choice.find(f => f.options.some(o=>/other|not listed|unsure/i.test(o)));
ok(!alreadyHad || !alreadyHad.allowOther, 'a list that already had its own escape gets no second one');
console.log(OTHER_OPTION === 'Something else…' ? 'PASS  sentinel is the expected string' : 'FAIL  sentinel');


// 4. questions that should not be asked of everybody.
{
  const f = planFields('Tech Issues', 'Mic Not Working', ctx);
  const g = (id) => f.find(x => x.id === id);
  const shows = (id, data) => isVisible(g(id), data);
  ok(!shows('report_channel', {reporter_type: 'Member'}), 'report_channel: not asked when the member raises it (the app already knows)');
  ok(shows('report_channel', {reporter_type: 'Front desk / associate'}), 'report_channel: asked when staff relay it from elsewhere');
  ok(!shows('affected_count', {member_impact: 'No impact'}), 'affected_count: not asked when nobody was affected');
  ok(shows('affected_count', {member_impact: 'Could not proceed as normal'}), 'affected_count: asked when somebody was');
}

// 5. coverage across every sub-category in the plan, not just the sampled ones.
import planData from '../src/lib/intake/plan-data.json' with {type: 'json'};
let lists = 0, escapes = 0, prefilled = 0, pickers = 0, forms = 0;
for (const key of Object.keys(planData.subs)) {
  const [cat, sub] = key.split('|||');
  const f = planFields(cat, sub, ctx);
  forms++;
  const count = f.find(x => x.id === 'affected_count' || x.id === 'members_requesting_change');
  const picker = f.find(x => x.id === 'members_affected' || x.id === 'attendees_affected');
  // A form that never asks how many members were affected has nobody to name.
  if (!count || picker) pickers++;
  if (count && picker && picker.id === 'members_affected' && picker.dependsOn !== count.id)
    console.log(`   ! ${key}: picker follows ${picker.dependsOn}, form asks ${count.id}`);
  if (f.some(x => x.prefill)) prefilled++;
  for (const x of f) {
    if (!['select', 'multiselect', 'radio'].includes(x.type) || !x.options?.length) continue;
    lists++;
    // Studio is deliberately closed — see NO_OTHER in plan.ts.
    if (x.id === 'studio' || x.allowOther || x.options.some(o => /other|something else|not listed|unsure|don't know|prefer not|none of/i.test(o))) escapes++;
  }
}
console.log(`\n${forms} forms · ${lists} closed lists`);
ok(escapes === lists, `every closed list has a way out (${escapes}/${lists})`);
ok(pickers === forms, `every form that counts affected members can name them (${pickers}/${forms})`);
console.log(`   equipment pre-filled on ${prefilled} forms`);

// 6. nothing may be required behind a condition that can never be satisfied, or the form
//    cannot be submitted at all.
{
  const stuck = [];
  let visible = 0, n = 0;
  for (const key of Object.keys(planData.subs)) {
    const [c, s2] = key.split('|||');
    const f = planFields(c, s2, ctx);
    n++;
    visible += f.filter(x => isVisible(x, {})).length;
    for (const x of f) if (x.required && x.conditional && x.dep && !f.some(y => y.id === x.dep)) stuck.push(`${key} :: ${x.id}`);
  }
  ok(stuck.length === 0, `no required field is hidden behind an unreachable condition${stuck.length ? ' — ' + stuck[0] : ''}`);
  console.log(`   ${(visible / n).toFixed(1)} questions visible before the first answer`);
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
