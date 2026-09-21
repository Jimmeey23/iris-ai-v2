/**
 * Checks the form-based intake against the ticket contract it files through.
 *
 * The plan is generated data (src/lib/intake/plan-data.json) and the mapping onto Iris's
 * ticket payload is hand-written; this keeps the two honest: every workspace sub-category
 * yields a plan, every plan yields a payload the Zod contract accepts, the visibility and
 * gating rules behave as the Support Hub's did, and the class desk reads a session the way
 * the review sheet expects.
 *
 * Run: npm run check:intake
 */
import {CATEGORY_MAP, CLASS_FORMATS, STUDIOS, TRAINERS} from '@/lib/constants';
import {ticketInputSchema} from '@/lib/ticket-contract';
import {inferPriority} from '@/lib/routing';
import {
  composeWriteup, decodeLookup, decodeLookups, encodeLookup, encodeLookups, fieldOptions, gatingFor, hubCategories, hubSub, isVisible, linkedLookup,
  missingFields, planFields, priorityInputs, relativeFor, seedData, toTicketInput, visibleFields, type IntakeData,
} from '@/lib/intake/plan';
import {classDeskAnswers, rosterRows, sessionSnapshot, sessionStats, type SessionDetail} from '@/lib/intake/class-desk';

let failed = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log('  PASS  ' + name);
  else { failed++; console.log('  FAIL  ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}
const ctx = {studios: STUDIOS.map(s => s.name), formats: [...CLASS_FORMATS], trainers: [...TRAINERS]};

console.log('\nEvery workspace sub-category has a plan the contract accepts');
{
  let plans = 0, missingHub = 0, parseFailures: string[] = [], dupIds = 0, hiddenRequired = 0;
  for (const [category, subs] of Object.entries(CATEGORY_MAP)) {
    for (const sub of subs) {
      const fields = planFields(category, sub, ctx);
      plans++;
      if (!hubSub(category, sub)) missingHub++;
      const ids = fields.map(f => f.id);
      if (new Set(ids).size !== ids.length) dupIds++;
      // A required field whose dependency can never be answered would block filing forever.
      for (const f of fields) if (f.required && f.dep && !fields.some(x => x.id === f.dep)) hiddenRequired++;
      // Answer every visible required field with a legal value and file it through the schema.
      const data: IntakeData = seedData({studio: ctx.studios[0], reporter_name: 'Desk Tester', reporter_contact: '+91 98200 00000', summary: 'A member reported that the pedal on bike four came loose during the 7am class.'});
      for (let pass = 0; pass < 4; pass++) {
        for (const f of missingFields(fields, data)) {
          if (f.type === 'lookup') data[f.id] = encodeLookup({id: '481102', label: 'Priya Mehta'});
          else if (f.type === 'number') data[f.id] = '2';
          else if (f.type === 'datetime') data[f.id] = '2026-09-21T07:00';
          else if (f.type === 'multiselect') data[f.id] = (f.options || ['x']).slice(0, 1);
          else if (f.options?.length) data[f.id] = f.options[0];
          else data[f.id] = f.type === 'textarea' ? 'Enough words to clear the minimum length.' : 'Recorded';
        }
      }
      const input = toTicketInput({category, sub, fields, data, kind: 'issue', submissionKey: 'check-' + Math.random().toString(36).slice(2).padEnd(12, 'x')});
      const parsed = ticketInputSchema.safeParse(input);
      if (!parsed.success) parseFailures.push(`${category} › ${sub}: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    }
  }
  check(`${plans} plans built`, plans > 200, plans);
  check('every plan is covered by the Support Hub data', missingHub === 0, missingHub);
  check('no plan repeats a field id', dupIds === 0, dupIds);
  check('no required field hides behind an unanswerable dependency', hiddenRequired === 0, hiddenRequired);
  check('every filled plan passes ticketInputSchema', parseFailures.length === 0, parseFailures.slice(0, 3));
}

console.log('\nThe shared block and its dependencies');
{
  const fields = planFields('Scheduling', 'Time Change', ctx);
  const byId = Object.fromEntries(fields.map(f => [f.id, f]));
  check('universal block comes first', fields[0].id === 'reporter_type' && fields[0].universal === true, fields[0]);
  check('file uploads are not offered', !fields.some(f => f.type === ('file' as string)));
  check('area depends on studio', byId.area.dep === 'studio', byId.area.dep);
  check('class_format depends on the class lookup', byId.class_format.dep === 'class_date', byId.class_format.dep);
  check('linked_ticket depends on is_repeat', byId.linked_ticket.dep === 'is_repeat', byId.linked_ticket.dep);
  check('studio options come from the workspace list', byId.studio.options?.[0] === ctx.studios[0], byId.studio.options);
  check('trainer options come from the workspace list', byId.trainer.options?.length === TRAINERS.length);
  const blank: IntakeData = {};
  check('a conditional field is hidden until its dependency is answered', !isVisible(byId.area, blank) && isVisible(byId.area, {studio: 'Courtside, Mumbai'}));
  check('a required field is never hidden', visibleFields(fields, blank).filter(f => f.required).length === fields.filter(f => f.required && !f.dep).length);
  check('developer notes were stripped from hints', !fields.some(f => /inferPriority|schema|enum|verbatim/i.test(f.desc || '')), fields.filter(f => /inferPriority|schema|enum|verbatim/i.test(f.desc || '')).map(f => f.id));
}

console.log('\nLookups keep their record and read back as text');
{
  const enc = encodeLookup({id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com'});
  check('encodes as "Label [#id] · sublabel"', enc === 'Priya Mehta [#481102] · priya@example.com', enc);
  check('decodes back', JSON.stringify(decodeLookup(enc)) === JSON.stringify({id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com'}), decodeLookup(enc));
  check('a typed name is kept and marked manual', decodeLookup('Priya M')?.manual === true);
  check('a typed name is not a Momence link', linkedLookup('Priya M') === null);
  const many = encodeLookups([{id: '1', label: 'A'}, {id: '2', label: 'B'}]);
  check('multi lookups round-trip', decodeLookups(many).map(r => r.id).join(',') === '1,2', many);
}

console.log('\nGating: link, do not type');
{
  const fields = planFields('Pricing and Memberships', 'Auto-Renewal Concerns', ctx);
  const memberField = fields.find(f => f.type === 'lookup' && f.module === 'member');
  check('the sub-category carries a member lookup', Boolean(memberField), fields.filter(f => f.type === 'lookup').map(f => f.id));
  const onBehalf: IntakeData = {reporter_type: 'A member told me about it'};
  const gates = gatingFor(fields, onBehalf, {name: 'Auto-Renewal Concerns', category: 'Pricing and Memberships'});
  check('staff filing on behalf of a member must link the member', gates.some(g => g.id === memberField?.id), gates);
  const linked: IntakeData = {...onBehalf, [memberField!.id]: encodeLookup({id: '481102', label: 'Priya Mehta'})};
  check('…and the gate clears once linked', gatingFor(fields, linked, {name: 'Auto-Renewal Concerns', category: 'Pricing and Memberships'}).length === 0);
  const capacity = planFields('Scheduling', 'Class Capacity Issues', ctx);
  check('a class-bound sub-category needs the class', gatingFor(capacity, {}, {name: 'Class Capacity Issues', category: 'Scheduling'}).some(g => g.id === 'class_date'));
  check('a timetable request does not', gatingFor(planFields('Scheduling', 'Additional Classes', ctx), {}, {name: 'Additional Classes', category: 'Scheduling'}).length === 0);
  check('a blocked class needs the class wherever it is filed', gatingFor(planFields('Repair and Maintenance', 'AC and HVAC Issues', ctx), {class_impacted: 'Yes — happening now'}, {name: 'AC and HVAC Issues', category: 'Repair and Maintenance'}).some(g => g.id === 'class_date'));
  check('a typed class satisfies the gate, labelled as typed', gatingFor(capacity, {class_date: 'Barre 57, 7am'}, {name: 'Class Capacity Issues', category: 'Scheduling'}).length === 0);
}

console.log('\nEvery plan can name the member; answers narrow, and hidden answers do not file');
{
  const capacity = planFields('Scheduling', 'Class Capacity Issues', ctx);
  const member = capacity.find(f => f.id === 'member_name');
  check('a plan without a member field gets the shared member lookup', member?.type === 'lookup' && member.module === 'member' && !member.required && member.universal === true && member.section === 'Who this is about', member);
  const own = planFields('Pricing and Memberships', 'Auto-Renewal Concerns', ctx).filter(f => f.id === 'member_name');
  check('a plan with its own member lookup keeps it and does not get the shared one', own.length === 1 && own[0].required === true && !own[0].universal, own);
  check('it is optional for a studio observation', gatingFor(capacity, {reporter_type: 'I noticed this myself', class_date: 'Barre 57, 7am'}, {name: 'Class Capacity Issues', category: 'Scheduling'}).length === 0);
  check('…and a gate when staff pass on what a member told them', gatingFor(capacity, {reporter_type: 'A member told me about it', class_date: 'Barre 57, 7am'}, {name: 'Class Capacity Issues', category: 'Scheduling'}).some(g => g.id === 'member_name'));
  const byId = Object.fromEntries(capacity.map(f => [f.id, f]));
  check('linked_ticket waits for "ticket already open"', !isVisible(byId.linked_ticket, {is_repeat: 'No, first time'}) && isVisible(byId.linked_ticket, {is_repeat: 'Yes, ticket already open (link it below)'}));
  check('sentiment is asked when a member is in the picture', !isVisible(byId.sentiment, {reporter_type: 'I noticed this myself'}) && isVisible(byId.sentiment, {reporter_type: 'Member'}) && isVisible(byId.sentiment, {reporter_type: 'A member told me about it'}));
  check('churn risk follows a frustrated or negative member', !isVisible(byId.churn_risk, {reporter_type: 'Member', sentiment: 'Positive'}) && isVisible(byId.churn_risk, {reporter_type: 'Member', sentiment: 'Frustrated'}));
  const stale: IntakeData = seedData({studio: ctx.studios[0], reporter_name: 'Desk', reporter_contact: 'desk@physique57.in', is_repeat: 'No, first time', linked_ticket: encodeLookup({id: 'P57-00007', label: 'P57-00007 · Old AC fault'}), member_impact: 'No impact', immediate_danger: 'No', schedule_action: 'Move to a new time', summary: 'A member asked for the 7am to move to 7:30 so the car park is open.', class_date: 'Barre 57, 7am'});
  const filed = toTicketInput({category: 'Scheduling', sub: 'Class Capacity Issues', fields: capacity, data: stale, kind: 'request', submissionKey: 'check-hidden-000001'});
  check('an answer behind a question that is hidden again is not filed', !('linkedTicket' in (filed.customFields as Record<string, unknown>)) && !('linked_ticket' in (filed.customFields as Record<string, unknown>)), Object.keys(filed.customFields));
}

console.log('\nA timestamp answers "How recent?" in the taxonomy\u2019s words');
{
  const now = new Date(2026, 8, 22, 18, 30);
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const options = fieldOptions('occurred_relative');
  const cases: [Date, string][] = [[new Date(2026, 8, 22, 18, 20), 'Just now'], [new Date(2026, 8, 22, 7, 30), 'Earlier today'], [new Date(2026, 8, 21, 23, 50), 'Yesterday'], [new Date(2026, 8, 18, 9, 0), 'Earlier this week'], [new Date(2026, 8, 12, 9, 0), 'Last week']];
  for (const [d, want] of cases) check(`${local(d)} → ${want}`, relativeFor(local(d), now) === want, relativeFor(local(d), now));
  check('every answer it gives is one of the options', cases.every(([, want]) => options.includes(want)), options);
  check('a class about to start reads as just now; one hours away as ongoing', relativeFor(local(new Date(2026, 8, 22, 19, 0)), now) === 'Just now' && relativeFor(local(new Date(2026, 8, 23, 7, 0)), now) === 'Ongoing / recurring');
  check('older than the options reach stays blank', relativeFor(local(new Date(2026, 7, 1)), now) === undefined);
  check('garbage stays blank', relativeFor('not a date', now) === undefined);
}

console.log('\nThe write-up quotes the form and nothing else');
{
  const fields = planFields('Repair and Maintenance', 'AC and HVAC Issues', ctx);
  const sub = {name: 'AC and HVAC Issues', category: 'Repair and Maintenance'};
  const data: IntakeData = {
    reporter_type: 'A member told me about it', reporter_name: 'Zahur Shaikh', report_channel: 'In person at the desk', studio: 'Kwality House, Kemps Corner', area: 'Studio 1',
    occurred_at: '2026-09-21T07:30', member_name: encodeLookup({id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com'}),
    class_date: encodeLookup({id: '2208', label: 'Studio HIIT'}), class_format: 'Studio HIIT', trainer: 'Karanvir Bhatia',
    is_repeat: 'No, first time', member_impact: 'Could not proceed as normal', immediate_danger: 'No', affected_count: '12', sentiment: 'Frustrated',
    requested_outcome: 'Fix before the 6pm class.', reading_now: '31°C on the wall sensor',
  };
  const text = composeWriteup({sub, fields, data});
  check('opens with the drawer, the studio and the room', text.startsWith('AC and HVAC Issues at Kwality House, Studio 1 — '), text.slice(0, 80));
  check('says who told the desk and who logged it', text.includes('Priya Mehta told the desk; logged by Zahur Shaikh (in person at the desk).'), text);
  check('names the class and the coach', text.includes('Class: Studio HIIT with Karanvir Bhatia.'), text);
  check('carries the triage answers', text.includes('Impact on the member: could not proceed as normal; 12 members affected.'), text);
  check('quiet answers stay out ("No" danger, "first time")', !/immediate danger|repeat:/i.test(text), text);
  check('the sub-category\u2019s own answers ride along by label', /: 31°C on the wall sensor\./.test(text), text);
  check('ends with the ask', text.endsWith('Asked for: Fix before the 6pm class.'), text.slice(-60));
  check('is deterministic', composeWriteup({sub, fields, data}) === text);
  const sparse = composeWriteup({sub, fields, data: {studio: 'Courtside, Mumbai', occurred_relative: 'Yesterday'}});
  check('with two answers it writes two facts, not a story', sparse === 'AC and HVAC Issues at Courtside — yesterday.', sparse);
  check('never longer than the description column allows', text.length <= 4000);
}

console.log('\nThe payload maps onto the contract Iris already files through');
{
  const fields = planFields('Repair and Maintenance', 'AC and HVAC Issues', ctx);
  const data: IntakeData = {
    reporter_type: 'A member told me about it', reporter_name: 'Zahur Shaikh', reporter_contact: 'zahur@physique57.in', preferred_contact: 'WhatsApp',
    studio: 'Kwality House, Kemps Corner', area: 'Studio 1', occurred_at: '2026-09-21T07:30', occurred_relative: 'Earlier today',
    class_date: encodeLookup({id: '2208', label: 'Studio HIIT', sublabel: 'Karanvir Bhatia · Kwality House'}), class_format: 'Studio HIIT', trainer: 'Karanvir Bhatia',
    member_name: encodeLookup({id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com'}),
    is_repeat: 'No, first time', member_impact: 'Could not proceed as normal', class_impacted: 'Yes — happening now', immediate_danger: 'No',
    title: 'AC down in Studio 1', summary: 'The AC in Studio 1 stopped mid-class; the room hit 31°C and the class was cut short.', requested_outcome: 'Fix before the 6pm class.',
    sentiment: 'Frustrated', affected_count: '12', reading_now: '31°C on the wall sensor', not_a_field: 'ignored',
  };
  const input = toTicketInput({category: 'Repair and Maintenance', sub: 'AC and HVAC Issues', fields, data, kind: 'issue', submissionKey: 'check-payload-000001', memberDetail: {email: 'priya@example.com', phone: '+91 98200 11111', membership: 'Studio 10 Single Class Pack'}});
  const parsed = ticketInputSchema.safeParse(input);
  check('parses under ticketInputSchema', parsed.success, parsed.success ? undefined : parsed.error.issues[0]);
  check('member column from the linked lookup', input.memberName === 'Priya Mehta' && input.momenceMemberId === '481102', [input.memberName, input.momenceMemberId]);
  check('member contact from Momence detail', input.memberEmail === 'priya@example.com' && input.memberPhone === '+91 98200 11111' && input.membership === 'Studio 10 Single Class Pack');
  check('session id from the class lookup', input.momenceSessionId === '2208', input.momenceSessionId);
  check('incidentAt is an ISO instant', /^\d{4}-\d{2}-\d{2}T.*Z$/.test(input.incidentAt), input.incidentAt);
  check('summary becomes the description', input.description === data.summary);
  check('member_impact becomes the impact column', input.impact === 'Could not proceed as normal');
  check('sentiment lower-cased into the enum', input.sentiment === 'frustrated');
  check('source is iris', input.source === 'iris');
  const cf = input.customFields as Record<string, unknown>;
  check('routing signals recorded under the names makeDraft reads', cf.isClassImpacted === 'Yes — happening now' && cf.isImmediateDanger === 'No' && cf.reportedBy === 'A member told me about it' && cf.memberImpact === 'Yes — members were affected', cf);
  check('sub-category answers ride in customFields by field id', cf.reading_now === '31°C on the wall sensor' && cf.affectedCount === 12);
  check('answers outside the plan are not filed', !('not_a_field' in cf));
  check('no duplicate raw/alias pairs', !('reporter_type' in cf) && !('immediate_danger' in cf) && !('class_impacted' in cf), Object.keys(cf));
  check('plan provenance is kept out of sight', typeof cf._intake === 'object' && (cf._intake as {plan: string}).plan === 'Repair and Maintenance|||AC and HVAC Issues');
  check('the session context is recorded', (cf.sessionContext as {id: string}).id === '2208');
  const inputs = priorityInputs('Repair and Maintenance', 'AC and HVAC Issues', data);
  check('the live priority is the one routing will file', inferPriority(inputs) === 'high', inferPriority(inputs));
  check('a danger answer lifts it to critical', inferPriority(priorityInputs('Repair and Maintenance', 'AC and HVAC Issues', {...data, immediate_danger: 'Yes — fire / smoke'})) === 'critical');
  // The observation-only case: staff noticed it, nobody linked.
  const staff = toTicketInput({category: 'Repair and Maintenance', sub: 'AC and HVAC Issues', fields, data: {...data, reporter_type: 'I noticed this myself', member_name: ''}, kind: 'issue', submissionKey: 'check-payload-000002'});
  check('an observation files for the studio team', staff.memberName === 'Studio team observation' && !staff.momenceMemberId, staff.memberName);
  const self = toTicketInput({category: 'Repair and Maintenance', sub: 'AC and HVAC Issues', fields, data: {...data, reporter_type: 'Member', reporter_name: 'Rhea Shah', reporter_contact: 'rhea@example.com', member_name: ''}, kind: 'issue', submissionKey: 'check-payload-000003'});
  check('a member filing for themselves is the member', self.memberName === 'Rhea Shah' && self.memberEmail === 'rhea@example.com', [self.memberName, self.memberEmail]);
  // Some plans make member_email the member lookup itself; the email must still come out clean.
  const renew = planFields('Pricing and Memberships', 'Auto-Renewal Concerns', ctx);
  const viaEmailLookup = toTicketInput({category: 'Pricing and Memberships', sub: 'Auto-Renewal Concerns', fields: renew, data: {...data, member_name: '', member_email: encodeLookup({id: '481102', label: 'Priya Mehta', sublabel: 'priya@example.com'})}, kind: 'issue', submissionKey: 'check-payload-000005'});
  check('a member linked through member_email files with a clean email', viaEmailLookup.momenceMemberId === '481102' && viaEmailLookup.memberEmail === 'priya@example.com' && ticketInputSchema.safeParse(viaEmailLookup).success, [viaEmailLookup.momenceMemberId, viaEmailLookup.memberEmail]);
  const praise = toTicketInput({category: 'Trainer Feedback', sub: 'Trainer Encouragement', fields: planFields('Trainer Feedback', 'Trainer Encouragement', ctx), data: {...data, sentiment: ''}, kind: 'compliment', submissionKey: 'check-payload-000004'});
  check('a compliment defaults to positive sentiment', praise.sentiment === 'positive' && praise.kind === 'compliment');
}

console.log('\nPriority: Iris routing agrees with the Support Hub tiers where both exist');
{
  let shared = 0, agree = 0; const off: string[] = [];
  for (const c of hubCategories()) for (const sub of c.subs) {
    if (!CATEGORY_MAP[c.name]?.includes(sub)) continue;
    shared++;
    const iris = inferPriority({category: c.name, subcategory: sub});
    if (iris === hubSub(c.name, sub)!.hubPriority) agree++; else off.push(`${sub}: hub ${hubSub(c.name, sub)!.hubPriority} / iris ${iris}`);
  }
  check(`${agree}/${shared} baseline tiers agree (the rest are Iris's deliberate choices)`, agree / shared > 0.9, off.slice(0, 5));
}

console.log('\nThe class desk reads a session the way the review sheet expects');
{
  const detail: SessionDetail = {
    item: {id: '2208', name: 'Studio HIIT', subtitle: 'Karanvir Bhatia · Courtside, Mumbai', raw: {id: 2208, startsAt: '2026-09-21T01:30:00.000Z', capacity: 12, teacher: {firstName: 'Karanvir', lastName: 'Bhatia'}, inPersonLocation: {name: 'Courtside, Mumbai'}, waitlistBookingCount: 2, durationInMinutes: 50}},
    related: {bookings: [
      {id: 1, member: {id: 481102, firstName: 'Priya', lastName: 'Mehta', email: 'priya@example.com'}, checkedIn: true},
      {id: 2, member: {id: 481103, firstName: 'Aarav', lastName: 'Khanna'}, checkedIn: false},
      {id: 3, member: {id: 481104, firstName: 'Sana', lastName: 'Kapoor'}, checkedIn: false, cancelledAt: '2026-09-20T10:00:00.000Z'},
      {id: 4, guestName: 'Walk-in', checkedIn: true, compatibility: {usable: false}},
    ]},
    source: 'demo',
  };
  const rows = rosterRows(detail);
  const st = sessionStats(detail, rows);
  check('roll counts', st.booked === 3 && st.attended === 2 && st.absent === 1 && st.cancelled === 1 && st.waitlist === 2 && st.guests === 1, st);
  check('fill and over-book', st.fillPct === 25 && st.overbook === 0, st);
  const entries = {'2': {status: 'No-show', actions: ['Class credit granted'], note: 'Stuck in traffic'}};
  const answers = classDeskAnswers(detail, {class_disruption: 'Class shortened'}, entries, ctx.studios, rows);
  check('the class is linked, not typed', linkedLookup(answers.class_date)?.id === '2208', answers.class_date);
  check('format, coach and studio come from the session', answers.class_format === 'Studio HIIT' && answers.trainer === 'Karanvir Bhatia' && answers.studio === 'Courtside, Mumbai', answers);
  check('the flagged attendee becomes the member', linkedLookup(answers.member_name)?.id === '481103', answers.member_name);
  check('attendee notes are summarised', String(answers.attendee_summary).startsWith('Aarav Khanna: No-show → Class credit granted · Stuck in traffic'), answers.attendee_summary);
  check('a disruption marks the class as impacted', answers.class_impacted === 'Yes — class was disrupted');
  check('the desk lists share the plan\u2019s options', fieldOptions('class_disruption').includes('Class shortened') && fieldOptions('class_host_situation').length > 3);
  const snap = sessionSnapshot(detail, entries, rows);
  check('the snapshot carries the flagged attendee', snap.attendees?.length === 1 && snap.attendees[0].memberId === '481103' && snap.source === 'demo', snap.attendees);
  const fields = planFields('Scheduling', 'Class Capacity Issues', ctx);
  const data = seedData({...answers, title: 'Class Capacity Issues — Courtside', reporter_name: 'Desk', reporter_contact: 'desk@physique57.in', is_repeat: 'No, first time', member_impact: 'Turned away / had to leave', immediate_danger: 'No', schedule_action: 'Move to a new time', summary: 'Two members were turned away from the 7am class because the grid was overbooked.'});
  const input = toTicketInput({category: 'Scheduling', sub: 'Class Capacity Issues', fields, data, kind: 'issue', submissionKey: 'check-classdesk-0001', classSnapshot: snap});
  const parsed = ticketInputSchema.safeParse(input);
  check('a class-desk ticket passes the contract', parsed.success, parsed.success ? undefined : parsed.error.issues[0]);
  check('it files against the session and the member', input.momenceSessionId === '2208' && input.momenceMemberId === '481103' && input.classFormat === 'Studio HIIT');
  const cf = input.customFields as Record<string, unknown>;
  check('the roll rides along for the owner', Array.isArray(cf.attendeeNotes) && (cf.classSnapshot as {booked: number}).booked === 3 && cf.impactedMembers === 'Aarav Khanna', cf);
  check('nothing is left required', missingFields(fields, data).length === 0 && gatingFor(fields, data, {name: 'Class Capacity Issues', category: 'Scheduling'}).length === 0, missingFields(fields, data).map(f => f.id));
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall passed');
process.exit(failed ? 1 : 0);
