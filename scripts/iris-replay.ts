/**
 * Replays real transcripts through the Iris flow and asserts what went wrong in them
 * stays fixed.
 *
 * Each scenario below grew out of a ticket that was filed wrong: a date moved by the word
 * "Yes", a bike fault filed against the wrong part, a class attached to a maintenance
 * ticket, an answer that matched no chip and vanished. They are replayed here so the
 * regressions cannot come back quietly.
 *
 * Run: npm run check:iris:flow
 */
import {runIris} from '@/lib/iris';
import {mergeProposedTurn, scanStreamedArray, firstConflict, buildAssetNote} from '@/lib/iris';
import {studioAreasFor} from '@/lib/constants';
import {parseAssetReference, assetName, plannedAssetCounts} from '@/lib/assets';
import {scoreDuplicate, isDuplicate} from '@/lib/duplicates';
import {assets, tickets} from '@/db/schema';
import {seed, rowsOf} from './iris-replay-support/stub-db';
import type {IrisMessage} from '@/lib/iris-contract';
import type {IrisTurn} from '@/lib/iris-contract';

let failed = 0;
let passed = 0;

function check(name: string, ok: boolean, got?: unknown) {
  if (ok) { passed++; console.log('  PASS  ' + name); }
  else { failed++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(got)); }
}
function section(title: string) { console.log('\n' + title); }

/** Drives a scripted conversation, one reporter message at a time. */
async function replay(messages: string[], seed: Record<string, unknown> = {}) {
  let turn: IrisTurn = {
    sessionId: 'replay', message: '', phase: 'collect', fieldKey: 'description',
    collected: seed, progress: {done: 0, total: 8}, engine: 'guided',
  };
  const asked: string[] = [];
  for (const message of messages) {
    const next = await runIris({
      sessionId: 'replay', collected: {...turn.collected}, message,
      fieldKey: turn.fieldKey, history: [] as IrisMessage[],
    });
    if (next.fieldKey) asked.push(next.fieldKey);
    turn = next;
  }
  return {turn, asked, collected: turn.collected};
}

async function main() {
  // Momence reads its credentials from the environment, and the session-lookup branch is
  // gated on it being connected. Set it here rather than in package.json so the command
  // stays the same on every shell.
  process.env.MOMENCE_ACCESS_TOKEN = process.env.MOMENCE_ACCESS_TOKEN || 'replay-token';

  /* ------------------------------------------------------------------ */
  section('The 19 Sept Bandra bike ticket, as it was reported');

  const bandra = await replay([
    'cycle no 6 in the bandra studio pedal came off today',
    'Cycle studio',
    'Yes, blocking now',
    '__manual_session__',
    'Recurring \u2014 happened before',
    'Took bike out of rotation',
    'Yes \u2014 members were affected',
    'Riya and Anmol',
  ]);
  const c = bandra.collected;

  check('the bike number is read off the opening line', String(c.bikeNumber) === '6', c.bikeNumber);
  check('Iris never asks for it again', !bandra.asked.includes('bikeNumber'), bandra.asked);
  check('"pedal came off" is recognised as the fault', String(c.cycleIssueType).includes('Pedal'), c.cycleIssueType);
  check('the affected part follows from the fault', String(c.cyclePart).includes('Pedal'), c.cyclePart);
  check('a detachment is scored critical', String(c.cycleSeverity) === 'critical', c.cycleSeverity);
  check('the room is filed under one spelling', String(c.area) === 'PowerCycle Studio', c.area);
  check('the date survives an answer that opens with "Yes"', String(c.incidentAt) === 'Earlier today', c.incidentAt);
  check('no class is attached to a maintenance ticket', c.classFormat === undefined, c.classFormat);
  check('the class disruption is recorded', String(c.isClassImpacted) === 'Yes, blocking now', c.isClassImpacted);
  check('whether it had happened before is still asked, though the fault was recognised', String(c.cycleFirstOrRecurring) === 'Recurring \u2014 happened before', c.cycleFirstOrRecurring);
  check('the bike being out of rotation is recorded', String(c.cycleReporterAction) === 'Took bike out of rotation', c.cycleReporterAction);
  check('members losing their session is asked about', bandra.asked.includes('memberImpact'), bandra.asked);
  check('who was affected is captured', String(c.impactedMembers) === 'Riya and Anmol', c.impactedMembers);
  check('a rider-safety fault is filed critical', bandra.turn.draft?.priority === 'critical', bandra.turn.draft?.priority);
  check('the title names the studio, not a class', bandra.turn.draft?.title === 'Broken Equipment Not Repaired \u00b7 Supreme HQ', bandra.turn.draft?.title);
  check('the ticket reaches a draft', bandra.turn.phase === 'draft', bandra.turn.phase);

  // The messages exactly as they were typed that afternoon, answers and all. The flow no
  // longer asks for the bike number or the symptom, so several of them now answer a
  // different question than they did — what must not come back is the damage they did.
  const original = await replay([
    'cycle no 6 in the bandra studio pedal came off today',
    'Cycle studio',
    'Yes, blocking now',
    '6',
    'Resistance knob not engaging / no resistance change',
    'Recurring \u2014 happened before',
    'Took bike out of rotation',
  ]);
  check('the original transcript no longer loses the date', String(original.collected.incidentAt) === 'Earlier today', original.collected.incidentAt);
  check('the original transcript no longer gains a class', original.collected.classFormat === undefined, original.collected.classFormat);
  check('the original transcript keeps the bike number', String(original.collected.bikeNumber) === '6', original.collected.bikeNumber);

  /* ------------------------------------------------------------------ */
  section('Momence: a disrupted class is identified');

  const withClass = await replay([
    'cycle no 6 in the bandra studio pedal came off today',
    'PowerCycle Studio',
    'Yes, blocking now',
  ]);
  check('the affected class is looked up in Momence', withClass.turn.lookup === 'sessions', {field: withClass.turn.fieldKey, lookup: withClass.turn.lookup});
  check('the lookup is narrowed to the studio', withClass.turn.lookupFilters?.studio === 'Supreme HQ, Bandra', withClass.turn.lookupFilters);
  check('a class that is running now is searched in the recent schedule', withClass.turn.lookupFilters?.upcoming === false, withClass.turn.lookupFilters);

  const upcomingClass = await replay([
    'cycle no 6 in the bandra studio pedal came off today',
    'PowerCycle Studio',
    'Not yet, but it will be',
  ]);
  check('a class that has not started is searched in the upcoming schedule', upcomingClass.turn.lookupFilters?.upcoming === true, upcomingClass.turn.lookupFilters);

  /* ------------------------------------------------------------------ */
  section('Members affected by a mid-class fault');

  const members = await replay([
    'cycle no 6 in the bandra studio pedal came off today',
    'PowerCycle Studio',
    'Yes, blocking now',
    '__manual_session__',
    'Recurring \u2014 happened before',
    'Took bike out of rotation',
  ]);
  check('the reporter is asked whether members were affected', members.turn.fieldKey === 'memberImpact', members.turn.fieldKey);
  check('the answers offered are about members, not the reporter',
    JSON.stringify(members.turn.options?.map(o => o.value)) === JSON.stringify(['Yes \u2014 members were affected', 'No, no member impact', 'Not sure', '__other__']),
    members.turn.options?.map(o => o.value));

  /* ------------------------------------------------------------------ */
  section('Rooms offered are the rooms that studio has');

  const supreme = studioAreasFor('Supreme HQ, Bandra');
  check('Kwality-only rooms are not offered at Bandra', !supreme.includes('Brain Cell') && !supreme.includes('His Space'), supreme);
  check('the PowerCycle studio is offered', supreme.includes('PowerCycle Studio'), supreme);
  check('the two spellings of the cycle studio are one room',
    studioAreasFor('Supreme HQ, Bandra').filter(a => /cycle/i.test(a)).length === 1,
    studioAreasFor('Supreme HQ, Bandra').filter(a => /cycle/i.test(a)));
  check('shared areas are still on offer', supreme.includes('Reception / lobby'), supreme);
  check('an unknown studio keeps everything on offer', studioAreasFor(undefined).length > 10, studioAreasFor(undefined).length);

  /* ------------------------------------------------------------------ */
  section('An answer that is not on the list');

  const other = await replay([
    'the AC in the kenkere studio is not cooling',
    '__other__',
    'the mezzanine',
  ]);
  check('a free answer after "Something else" is kept', String(other.collected.area) === 'the mezzanine', other.collected.area);
  check('the field is not filed as "Not specified"', String(other.collected.area) !== 'Not specified', other.collected.area);
  check('the intake moves on instead of asking the same closed question again', other.turn.fieldKey !== 'area', other.turn.fieldKey);

  const unmatched = await replay([
    'the AC in the kenkere studio is not cooling',
    'the mezzanine',
  ]);
  check('an answer that matches nothing is not silently dropped', unmatched.turn.message.includes("didn't catch"), unmatched.turn.message);
  check('the near misses are offered instead', (unmatched.turn.options?.length ?? 0) > 1, unmatched.turn.options?.map(o => o.value));
  check('the field stays empty rather than being guessed', unmatched.collected.area === undefined, unmatched.collected.area);
  check('there is still a way to answer in their own words', Boolean(unmatched.turn.options?.some(o => o.value === '__other__')), unmatched.turn.options?.map(o => o.value));

  /* ------------------------------------------------------------------ */
  section('A contradiction stops the intake');

  const conflict = await runIris({
    sessionId: 'replay',
    collected: {description: 'cycle no 6 pedal came off today', studio: 'Supreme HQ, Bandra', incidentAt: 'Earlier today', category: 'Repair and Maintenance', subcategory: 'Broken Equipment Not Repaired', memberLookupDone: true, bikeNumber: '6', cycleIssueType: 'Resistance knob not engaging / no resistance change', impact: 'x', requestedResolution: 'y', preferredContact: 'Internal log only'},
    message: 'Resistance knob not engaging / no resistance change',
    fieldKey: 'cycleIssueType',
    history: [] as IrisMessage[],
    proposedTurn: {
      conflicts: [{field: 'cycleIssueType', earlier: 'pedal came off', now: 'Resistance knob not engaging / no resistance change'}],
    },
  });
  check('Iris asks about the contradiction instead of moving on', conflict.fieldKey === 'clarify', conflict.fieldKey);
  check('both readings are offered back',
    Boolean(conflict.options?.map(o => o.value).includes('pedal came off')) && Boolean(conflict.options?.map(o => o.value).includes('Resistance knob not engaging / no resistance change')),
    conflict.options?.map(o => o.value));
  check('there is a way out that is neither of them', Boolean(conflict.options?.some(o => o.value === '__other__')), conflict.options?.map(o => o.value));

  const settled = await runIris({
    sessionId: 'replay',
    collected: {...conflict.collected},
    message: 'pedal came off',
    fieldKey: 'clarify',
    history: [] as IrisMessage[],
  });
  check('the reporter\'s pick becomes the value', String(settled.collected.cycleIssueType) === 'pedal came off', settled.collected.cycleIssueType);
  check('the same field is not contradicted twice', Boolean((settled.collected._clarified as Record<string, unknown>)?.cycleIssueType), settled.collected._clarified);

  check('a settled contradiction is not raised again',
    firstConflict({conflicts: [{field: 'cycleIssueType', earlier: 'pedal came off', now: 'something else'}]}, {_clarified: {cycleIssueType: true}}) === undefined);
  check('a restatement is not a contradiction',
    firstConflict({conflicts: [{field: 'area', earlier: 'Studio 1', now: 'studio 1'}]}, {}) === undefined);
  check('a conflict on a field the ticket does not store is ignored',
    firstConflict({conflicts: [{field: 'notAField', earlier: 'a', now: 'b'}]}, {}) === undefined);

  /* ------------------------------------------------------------------ */
  section('The conflict is read before the question is typed out');

  const partial = '{"conflicts":[{"field":"cycleIssueType","earlier":"pedal came off","now":"Resista';
  const scanned = scanStreamedArray(partial, 'conflicts');
  check('a half-written conflict is not read as none', scanned.items.length === 1, scanned.items);
  check('a half-written conflict is not closed', scanned.closed === false, scanned.closed);
  const whole = scanStreamedArray('{"conflicts":[{"field":"area","earlier":"Studio 1","now":"Studio 2"}],"turn":{', 'conflicts');
  check('a whole conflict closes', whole.closed === true, whole);
  check('an absent conflicts key closes empty', scanStreamedArray('{"turn":{', 'conflicts').closed === false);

  /* ------------------------------------------------------------------ */
  section('The wording the model writes still cannot redefine the answers');

  const merged = mergeProposedTurn({
    fieldKey: 'clarify',
    question: 'You said "pedal came off" earlier, and "Resistance knob not engaging" now — which one?',
    options: [{label: 'Resistance knob', value: 'Resistance knob not engaging / no resistance change'}],
    proposed: {nextField: 'impact', question: 'How bad is it?', options: [{label: 'Bad', value: 'Bad'}]},
  });
  check('a question about a different field is rejected', merged.question.includes('which one?'), merged.question);
  check('the values on offer survive', merged.options?.[0].value === 'Resistance knob not engaging / no resistance change', merged.options);

  /* ------------------------------------------------------------------ */
  section('The bike is a thing, not a string');

  check('"cycle no 6" names one bike', JSON.stringify(parseAssetReference('cycle no 6 pedal came off')) === JSON.stringify({type: 'PowerCycle bike', label: '6'}), parseAssetReference('cycle no 6 pedal came off'));
  check('"bike #12" names one bike', parseAssetReference('bike #12')?.label === '12', parseAssetReference('bike #12'));
  check('"bike 06" is the same bike as "bike 6"', parseAssetReference('bike 06')?.label === parseAssetReference('bike 6')?.label, [parseAssetReference('bike 06'), parseAssetReference('bike 6')]);
  check('a class duration is not a bike', !parseAssetReference('cycle 45 min'), parseAssetReference('cycle 45 min'));
  check('the aircon is not a bike', !parseAssetReference('the AC in studio 1 is not cooling'), parseAssetReference('the AC in studio 1 is not cooling'));
  check('the name reads the way the floor says it', assetName('PowerCycle bike', '6') === 'Bike #6', assetName('PowerCycle bike', '6'));
  check('the register is planned from the studio layouts', plannedAssetCounts().length > 0 && plannedAssetCounts().every(p => p.count > 0), plannedAssetCounts());

  // The transcript above resolved the bike while collecting it; the register now has it.
  const bandraAssets = rowsOf(assets);
  check('reporting a bike puts it in the register', bandraAssets.length === 1, bandraAssets);
  check('the bike is stored under its studio', bandraAssets[0]?.studio === 'Supreme HQ, Bandra', bandraAssets[0]);
  check('the bike is stored under its number', bandraAssets[0]?.label === '6', bandraAssets[0]);
  check('the report carries the asset, not just the number', Number(c.assetId) === Number(bandraAssets[0]?.id), [c.assetId, bandraAssets[0]?.id]);
  // The second replay of the same afternoon reported the same bike again. If the register
  // keyed on anything but (studio, type, label) that would be two bikes.
  check('the same bike reported twice is one bike', bandraAssets.length === 1 && rowsOf(assets).length === 1, rowsOf(assets).map(a => a.label));
  check('the note shown to the reporter names the bike', String(buildAssetNote({assetName: 'Bike #6', assetStatus: 'out-of-rotation', assetFaults: 3, assetFaults30: 2, assetOpenFaults: 1, assetLastTicket: 'P57-1'})).includes('Bike #6'), buildAssetNote({assetName: 'Bike #6', assetStatus: 'out-of-rotation', assetFaults: 3, assetFaults30: 2, assetOpenFaults: 1, assetLastTicket: 'P57-1'}));
  check('a bike with no history says so', String(buildAssetNote({assetName: 'Bike #7', assetStatus: 'in-service', assetFaults: 0, assetOpenFaults: 0})).includes('no faults'), buildAssetNote({assetName: 'Bike #7', assetStatus: 'in-service', assetFaults: 0, assetOpenFaults: 0}));
  check('a report with no asset has no note', buildAssetNote({}) === undefined, buildAssetNote({}));

  /* ------------------------------------------------------------------ */
  section('Scoring a possible duplicate');

  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const report = {studio: 'Supreme HQ, Bandra', category: 'Repair and Maintenance', subcategory: 'Broken Equipment Not Repaired', area: 'PowerCycle Studio', bikeNumber: '6', assetId: 1001};
  const openBike6 = {id: 501, ticketNumber: 'P57-0501', title: 'x', status: 'open', priority: 'high', studio: 'Supreme HQ, Bandra', subcategory: 'Broken Equipment Not Repaired', assignedStaffName: null, customFields: {assetId: 1001, bikeNumber: '6', area: 'PowerCycle Studio'}, createdAt: dayAgo};
  const openOtherBike = {...openBike6, id: 502, customFields: {assetId: 1009, bikeNumber: '9', area: 'PowerCycle Studio'}};
  const oldOtherBike = {...openOtherBike, id: 503, createdAt: new Date(Date.now() - 40 * 86400000).toISOString()};

  check('the same bike clears the bar on its own', isDuplicate(scoreDuplicate(report, openBike6).score), scoreDuplicate(report, openBike6));
  check('a different bike on the same fault does not', !isDuplicate(scoreDuplicate(report, openOtherBike).score), scoreDuplicate(report, openOtherBike));
  check('neither does one that is weeks old', !isDuplicate(scoreDuplicate(report, oldOtherBike).score), scoreDuplicate(report, oldOtherBike));
  check('the reason given is the bike, not the paperwork', scoreDuplicate(report, openBike6).reasons.includes('the same bike'), scoreDuplicate(report, openBike6).reasons);
  check('a matching subcategory is worth less than a matching bike',
    scoreDuplicate({...report, assetId: undefined, bikeNumber: undefined}, {...openBike6, customFields: {}}).score < scoreDuplicate(report, openBike6).score,
    [scoreDuplicate({...report, assetId: undefined, bikeNumber: undefined}, {...openBike6, customFields: {}}).score, scoreDuplicate(report, openBike6).score]);
  check('the same subcategory alone is not a duplicate', !isDuplicate(scoreDuplicate({...report, assetId: undefined, bikeNumber: undefined}, {...openBike6, customFields: {}}).score), scoreDuplicate({...report, assetId: undefined, bikeNumber: undefined}, {...openBike6, customFields: {}}).score);

  /* ------------------------------------------------------------------ */
  section('The same fault reported again the next morning');

  const bike6Id = Number(bandraAssets[0]?.id || 1001);
  const TRANSCRIPT = [
    'cycle no 6 in the bandra studio pedal came off today',
    'Cycle studio',
    'Yes, blocking now',
    '__manual_session__',
    'Recurring \u2014 happened before',
    'Took bike out of rotation',
    'Yes \u2014 members were affected',
    'Riya and Anmol',
  ];

  seed(tickets, [{...openBike6, customFields: {...openBike6.customFields, assetId: bike6Id, recurrenceCount: 2}}]);
  const again = await replay(TRANSCRIPT);
  check('Iris asks before filing a second ticket', again.turn.fieldKey === 'duplicateCheck', {field: again.turn.fieldKey, phase: again.turn.phase});
  check('the question names the ticket already open', String(again.turn.message).includes('P57-0501'), again.turn.message);
  check('the question says what matched', String(again.turn.message).includes('the same bike'), again.turn.message);
  check('the reporter is offered the choice, not told', again.turn.options?.length === 2, again.turn.options?.map(o => o.label));
  check('the choice is add-to-it or log-separately',
    JSON.stringify(again.turn.options?.map(o => o.value)) === JSON.stringify([`__link__:501`, `__new__:501`]),
    again.turn.options?.map(o => o.value));
  check('the count shown includes this report', Number((again.turn.collected._duplicate as Record<string, unknown>)?.recurrence) === 3, (again.turn.collected._duplicate as Record<string, unknown>)?.recurrence);

  const added = await replay([...TRANSCRIPT, '__link__:501']);
  check('saying it is the same one folds it into the open ticket', added.turn.linkedTicket?.id === 501, added.turn.linkedTicket);
  check('no second ticket is offered', added.turn.draft === undefined, added.turn.draft);
  check('the reporter is told which report number this is', String(added.turn.message).includes('#3'), added.turn.message);

  const separate = await replay([...TRANSCRIPT, '__new__:501']);
  check('saying it is separate still reaches a draft', separate.turn.phase === 'draft', separate.turn.phase);
  check('the two are kept readable together', Number(separate.turn.collected._relatedTicketId) === 501, separate.turn.collected._relatedTicketId);
  check('the draft says it is related', String(separate.turn.message).includes('P57-0501') || String(separate.turn.draft?.description || '').includes('P57-0501'), separate.turn.message);

  /* ------------------------------------------------------------------ */
  section('What is not a duplicate');

  seed(tickets, [{...openBike6, id: 504, status: 'resolved', customFields: {...openBike6.customFields, assetId: bike6Id}}]);
  const afterResolved = await replay(TRANSCRIPT);
  check('a resolved ticket is not offered', afterResolved.turn.fieldKey !== 'duplicateCheck', afterResolved.turn.fieldKey);

  seed(tickets, [{...openBike6, id: 505, studio: 'Kwality, Andheri West', customFields: {...openBike6.customFields, assetId: 4242}}]);
  const otherStudio = await replay(TRANSCRIPT);
  check('a fault at another studio is not offered', otherStudio.turn.fieldKey !== 'duplicateCheck', otherStudio.turn.fieldKey);

  seed(tickets, []);
  const nothingOpen = await replay(TRANSCRIPT);
  check('with nothing open, no duplicate question is asked', nothingOpen.turn.fieldKey !== 'duplicateCheck', nothingOpen.turn.fieldKey);
  check('the report is filed', nothingOpen.turn.phase === 'draft', nothingOpen.turn.phase);

  /* ------------------------------------------------------------------ */
  console.log(`\n${failed ? 'FAILED' : 'OK'} — ${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch(e => { console.error('\nREPLAY CRASHED:', e); process.exit(1); });
