/**
 * What a ticket label has to do: say what the ticket is about, in the reporter's own words
 * where there are any, without repeating the taxonomy that is already shown as chips.
 */
import {describeTicket, isGenericLabel, LABEL_MAX} from '../src/lib/ticket-label';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

section('It uses what the reporter actually wrote');
const plain = describeTicket({description: 'The studio 1 AC stopped working and is throwing warm air.', subcategory: 'Air Quality Poor', category: 'Studio Amenities and Facilities', kind: 'issue', studio: 'Kwality House, Kemps Corner'});
check('the sentence becomes the label', plain === 'The studio 1 AC stopped working and is throwing warm air', plain);
check('it does not repeat the subcategory', !plain.includes('Air Quality'), plain);

const greeted = describeTicket({description: 'Hi team, just wanted to report that the mic in Studio 2 keeps cutting out mid-class.', subcategory: 'Mic Not Working', kind: 'issue'});
check('a greeting is stripped', greeted.startsWith('The mic in Studio 2'), greeted);

const stacked = describeTicket({description: 'Hello! I wanted to raise that the shower water pressure on the ladies side has dropped a lot this week.', subcategory: 'Shower Water Pressure', kind: 'issue'});
check('stacked openers are all stripped', stacked.startsWith('The shower water pressure'), stacked);

section('Length and shape');
const long = describeTicket({description: 'The front desk laptop has been freezing every time we open the booking system and it takes about ten minutes to recover which is holding up check-in for the whole morning class.', subcategory: 'Laptops Not Functioning', kind: 'issue'});
check('it is clipped to the limit', long.length <= LABEL_MAX, long.length);
check('it is clipped at a word boundary', !/\s\S{0,2}…$/.test(long) && long.endsWith('…'), long);
check('it starts with a capital', /^[A-Z]/.test(long), long);

section('Form submissions are not prose');
const form = describeTicket({description: 'Key strengths: Playlist is improving\n\nDevelopment areas: Unilateral setup needs work', subcategory: 'Knowledge and Competence', kind: 'assessment', trainer: 'Anisha Shah'});
check('an assessment is labelled by who and what', form === 'Trainer assessment — Anisha Shah · Knowledge and competence', form);

const emptyForm = describeTicket({description: 'Development areas: No', subcategory: 'Knowledge and Competence', kind: 'assessment', trainer: 'Kajol Kanchan'});
check('a trivial form answer never becomes the label', !emptyForm.includes('No') || emptyForm.startsWith('Trainer assessment'), emptyForm);

const mixedForm = describeTicket({description: 'Reported by: Shifa Ali\nIssue: The card machine at the front desk declines every tap payment since this morning\nStudio: Kemps', subcategory: 'Payment Processing Delays', kind: 'issue'});
check('the narrative field is preferred over the first field', mixedForm.startsWith('The card machine'), mixedForm);

section('Imported conversation threads');
const thread = describeTicket({description: "[Client upset and wants to cancel membership] — Booking / Scheduling: Class Cancellation & Schedule Imbalance. Reported by Sheetal . on 2024-11-11.\n\nKey statements:\n• Client upset and wants to cancel membership", subcategory: 'Class Cancellation & Schedule Imbalance', kind: 'issue'});
check('the thread subject becomes the label', thread === 'Client upset and wants to cancel membership', thread);

const idTag = describeTicket({description: '[REF-99] — The steam room in the mens changing area has been cold since Friday.', subcategory: 'Steam Room Not Working', kind: 'issue'});
check('a bare identifier tag is dropped, not used', idTag.startsWith('The steam room'), idTag);

section('When there is nothing to go on');
const bare = describeTicket({description: 'broken', subcategory: 'Shower Water Pressure', category: 'Studio Amenities and Facilities', kind: 'issue', studio: 'Supreme HQ, Bandra'});
check('it falls back to readable English, not a taxonomy string', bare === 'Low shower water pressure at Supreme HQ', bare);
check('the fallback is not the raw subcategory', bare !== 'Shower Water Pressure', bare);

const empty = describeTicket({description: '', subcategory: 'Locker Availability', kind: 'issue', studio: 'Kenkere House, Bengaluru'});
check('an empty description still yields a label', empty.length > 10 && /^[A-Z]/.test(empty), empty);

const praise = describeTicket({description: '', kind: 'compliment', trainer: 'Anisha Shah', subcategory: 'Instructor Energy and Motivation'});
check('a compliment reads as appreciation', praise === 'Appreciation for Anisha Shah', praise);

section('Which old labels get replaced');
check('the old middot format is generic', isGenericLabel('Waitlist Concerns · Studio Barre 57 · Kwality House'), true);
check('a bare subcategory is generic', isGenericLabel('Locker Availability', 'Locker Availability'), true);
check('a written sentence is not generic', !isGenericLabel('The studio 1 AC stopped working and is throwing warm air'), true);
check('an empty title is generic', isGenericLabel(''), true);

console.log(`\n${fail ? 'FAILED' : 'OK'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
