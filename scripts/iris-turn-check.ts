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
import {mergeProposedTurn} from '@/lib/iris';

let failed = 0;
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

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
