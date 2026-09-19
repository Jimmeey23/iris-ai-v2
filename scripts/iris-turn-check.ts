/**
 * Checks the contract between what Iris says and the answers it offers below it.
 *
 * The flow decides which field is next and which values are valid; the model writes the
 * words. When that split slips, the chat asks one question and shows the chips for another
 * — which is exactly what shipped once: "Which studio location…?" above "Yes, Late Arrival
 * / No, let me pick the category".
 *
 * Run: npm run check:iris
 */
import {mergeProposedTurn, scanStreamedString, ackSeparator} from '@/lib/iris';
import {streamTurn} from '@/components/iris-chat';

let failed = 0;
async function main() {
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log('  PASS  ' + name);
  else { failed++; console.log('  FAIL  ' + name + '  got: ' + JSON.stringify(got)); }
}

// The reported bug: the model drifts to a studio question while the flow is on confirmCategory.
{
  const r = mergeProposedTurn({
    fieldKey: 'confirmCategory',
    question: "I've read this as late arrival (Scheduling). File it there?",
    options: [{label: 'Yes — Late Arrival', value: '__accept_category__'}, {label: 'No, let me pick the category', value: '__reject_category__'}],
    proposed: {nextField: 'studio', question: 'Which studio location did this class take place in?', options: [{label: 'Kwality House', value: 'Kwality House, Kemps Corner'}]},
  });
  check('drifted question is rejected', r.question.includes('File it there?'), r.question);
  check('chips stay the category sentinels', JSON.stringify(r.options?.map(o => o.value)) === JSON.stringify(['__accept_category__', '__reject_category__']), r.options);
}

// On-field question is adopted, and the chips keep their canonical values while taking its labels.
{
  const r = mergeProposedTurn({
    fieldKey: 'studio',
    question: 'Which studio location center was this at?',
    options: [{label: 'Kwality House, Kemps Corner', value: 'Kwality House, Kemps Corner'}, {label: 'Supreme HQ, Bandra', value: 'Supreme HQ, Bandra'}],
    proposed: {
      ack: 'Got it, Rohan was late for the 10am',
      nextField: 'studio',
      question: 'Which studio was the 10am class in?',
      options: [{label: 'Kemps Corner', value: 'Kwality House, Kemps Corner'}],
    },
  });
  check('ack leads the question', r.question === 'Got it, Rohan was late for the 10am. Which studio was the 10am class in?', r.question);
  check('values preserved', JSON.stringify(r.options?.map(o => o.value)) === JSON.stringify(['Kwality House, Kemps Corner', 'Supreme HQ, Bandra']), r.options);
  check('label relabelled', r.options?.[0].label === 'Kemps Corner', r.options);
  check('unmatched option keeps its own label', r.options?.[1].label === 'Supreme HQ, Bandra', r.options);
}

// A free-text field may gain model-written chips.
{
  const r = mergeProposedTurn({
    fieldKey: 'impact',
    question: 'How much is this affecting the floor right now?',
    options: [],
    proposed: {nextField: 'impact', options: [{label: 'Class ran late', value: 'Class ran late'}, {label: 'Members waiting', value: 'Members waiting'}]},
  });
  check('free-text field gains chips', r.options?.length === 2, r.options);
}

// A field whose exact values drive later branches must not.
{
  const r = mergeProposedTurn({
    fieldKey: 'preferredContact',
    question: 'Does the member need a callback, or is this internal-only?',
    options: [],
    proposed: {nextField: 'preferredContact', options: [{label: 'Yes, call them', value: 'Yes, call them'}]},
  });
  check('branch-critical field gains no invented chips', !r.options?.length, r.options);
}

// Junk acks and non-questions are refused.
{
  const r = mergeProposedTurn({
    fieldKey: 'incidentAt',
    question: 'When did this happen?',
    options: [{label: 'Earlier today', value: 'Earlier today'}],
    proposed: {ack: 'Thanks so much, let me know if anything else comes up!', nextField: 'incidentAt', question: 'I can help with that.'},
  });
  check('chatty ack dropped', r.question === 'When did this happen?', r.question);
  check('non-question dropped', !r.question.includes('I can help'), r.question);
}


// A picker turn keeps its own wording and choices, but still gets acknowledged.
{
  const r = mergeProposedTurn({
    fieldKey: 'sessionLookup',
    question: "Which class was this? Pick the session and I'll pull in the trainer, studio and time.",
    options: [{label: 'Session not listed / enter manually', value: '__manual_session__'}],
    proposed: {ack: 'Thirteen bikes, noted', nextField: 'classFormat', question: 'Which format was it?', options: [{label: 'Barre 57', value: 'Barre 57'}]},
  });
  check('picker keeps its question', r.question.endsWith("trainer, studio and time."), r.question);
  check('picker gets the ack', r.question.startsWith('Thirteen bikes, noted. '), r.question);
  check('picker choices untouched', JSON.stringify(r.options?.map(o => o.value)) === JSON.stringify(['__manual_session__']), r.options);
}


// The streamed acknowledgement is decoded out of JSON that has not finished arriving.
{
  const full = '{"turn":{"ack":"Noted, bike 3 is out of rotation","nextField":"studio"';
  check('partial value, still open', (() => { const r = scanStreamedString('{"turn":{"ack":"Noted, bike', 'ack'); return r.value === 'Noted, bike' && !r.closed; })());
  check('closed value read whole', (() => { const r = scanStreamedString(full, 'ack'); return r.value === 'Noted, bike 3 is out of rotation' && r.closed; })(), scanStreamedString(full, 'ack'));
  check('key not yet arrived', scanStreamedString('{"tur', 'ack').value === '');
  check('escapes decoded', scanStreamedString('{"ack":"She said \\"fix it\\" today"}', 'ack').value === 'She said "fix it" today', scanStreamedString('{"ack":"She said \\"fix it\\" today"}', 'ack'));
  check('escape split across chunks is not mangled', (() => { const r = scanStreamedString('{"ack":"line one\\', 'ack'); return !r.closed && r.value === 'line one'; })());
  check('null ack closes with nothing to show', (() => { const r = scanStreamedString('{"ack":null,"nextField":"studio"', 'ack'); return r.value === '' && r.closed; })());
}


// The client reader against the exact frames the route emits, including a frame that arrives
// split across two chunks and a keep-alive-sized dribble.
{
  const frame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const wire =
    frame('ack', {text: 'Noted, '}) +
    frame('ack', {text: 'bike 3 '}) +
    frame('ack', {text: 'is out of rotation'}) +
    frame('turn', {sessionId: 's1', message: 'Noted, bike 3 is out of rotation. Which studio?', phase: 'collect', fieldKey: 'studio', options: [{label: 'Kemps', value: 'Kwality House, Kemps Corner'}], collected: {}, progress: {done: 1, total: 5}, engine: 'openai'});

  // Deliberately chop the byte stream mid-frame.
  const cuts = [12, 40, 41, 95, wire.length];
  const chunks: Uint8Array[] = [];
  const enc = new TextEncoder();
  let from = 0;
  for (const to of cuts) { chunks.push(enc.encode(wire.slice(from, to))); from = to; }

  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    new ReadableStream<Uint8Array>({start(c) { for (const ch of chunks) c.enqueue(ch); c.close(); }}),
    {status: 200, headers: {'Content-Type': 'text/event-stream'}}
  )) as typeof fetch;

  const deltas: string[] = [];
  const turn = await streamTurn({sessionId: 's1', message: 'hi'}, (d) => deltas.push(d));
  check('all ack deltas arrive in order across split frames', deltas.join('') === 'Noted, bike 3 is out of rotation', deltas);
  check('delta count preserved', deltas.length === 3, deltas);
  check('final turn parsed', turn.fieldKey === 'studio' && turn.options?.[0].value === 'Kwality House, Kemps Corner', turn);
  check('streamed text is a prefix of the final message', turn.message.startsWith(deltas.join('')), turn.message);

  // An error event after the stream has opened must surface as a thrown error.
  globalThis.fetch = (async () => new Response(
    new ReadableStream<Uint8Array>({start(c) { c.enqueue(enc.encode(frame('ack', {text: 'One moment'}) + frame('error', {error: 'Another answer was received.'}))); c.close(); }}),
    {status: 200, headers: {'Content-Type': 'text/event-stream'}}
  )) as typeof fetch;
  let thrown = '';
  try { await streamTurn({sessionId: 's1'}, () => {}); } catch (e) { thrown = (e as Error).message; }
  check('mid-stream error is thrown', thrown === 'Another answer was received.', thrown);

  // A truncated stream must not be mistaken for a completed turn.
  globalThis.fetch = (async () => new Response(
    new ReadableStream<Uint8Array>({start(c) { c.enqueue(enc.encode(frame('ack', {text: 'Half a th'}))); c.close(); }}),
    {status: 200, headers: {'Content-Type': 'text/event-stream'}}
  )) as typeof fetch;
  let cut = '';
  try { await streamTurn({sessionId: 's1'}, () => {}); } catch (e) { cut = (e as Error).message; }
  check('truncated stream rejected', /ended before it was complete/.test(cut), cut);

  // No stream support (or a proxy that buffers): fall back to a plain JSON turn.
  globalThis.fetch = (async () => new Response(JSON.stringify({sessionId: 's1', message: 'Plain reply', phase: 'collect', collected: {}, engine: 'guided'}), {status: 200, headers: {'Content-Type': 'application/json'}})) as typeof fetch;
  const plain = await streamTurn({sessionId: 's1'}, () => { throw new Error('should not stream'); });
  check('non-streaming response still works', plain.message === 'Plain reply', plain);

  globalThis.fetch = original;
}


// Text that has already been typed out to the reporter must not be swapped at the last
// moment: whatever was streamed has to survive into the stored message.
{
  const shown = mergeProposedTurn({
    fieldKey: 'bikeNumber',
    question: 'Which bike number is this about?',
    options: [],
    proposed: {ack: 'Bike #3 has a scraping flywheel?', nextField: 'bikeNumber', question: 'Please give the bike number for reference.', shownAck: 'Bike #3 has a scraping flywheel?', shownQuestion: true},
  });
  check('an ack that was shown is kept verbatim', shown.question.startsWith('Bike #3 has a scraping flywheel?'), shown.question);
  check('a question that was shown is kept verbatim', shown.question.endsWith('Please give the bike number for reference.'), shown.question);

  const notShown = mergeProposedTurn({
    fieldKey: 'bikeNumber',
    question: 'Which bike number is this about?',
    options: [],
    proposed: {ack: 'Bike #3 has a scraping flywheel?', nextField: 'bikeNumber', question: 'Please give the bike number for reference.'},
  });
  check('unstreamed ack with a question mark is dropped', notShown.question === 'Which bike number is this about?', notShown.question);
  check('unstreamed non-question is dropped', !notShown.question.includes('for reference'), notShown.question);

  // The separator has to match what the streamer emitted, or the typed text stops being a
  // prefix of the final message and the bubble rewrites itself.
  check('separator adds a full stop when missing', ackSeparator('Noted, bike 3 is out') === '. ');
  check('separator respects the model\'s own punctuation', ackSeparator('Got that!') === ' ' && ackSeparator('Really?') === ' ' && ackSeparator('Noted.') === ' ');
  const joined = mergeProposedTurn({fieldKey: 'impact', question: 'How bad is it?', options: [], proposed: {ack: 'Got that!', nextField: 'impact', shownAck: 'Got that!'}});
  check('joined message uses that separator', joined.question === 'Got that! How bad is it?', joined.question);
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
void main();
