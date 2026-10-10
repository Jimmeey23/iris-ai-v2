/**
 * The automatic ticket emails and the Integrations-page preview share one builder
 * (lib/ticket-emails.ts). These checks hold that contract: every action declared in
 * the Mailtrap catalogue is implemented, and the preview is the real assignment mail
 * rather than a copy that can drift.
 */
import {ticketEmailBody, sampleAssignmentEmail, SAMPLE_TICKET} from '../src/lib/ticket-emails';
import {firstName} from '../src/lib/email-layout';
import {INTEGRATION_CATALOGUE} from '../src/lib/integration-catalogue';
import {readFileSync} from 'fs';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

const ticket = {ticketNumber: 'P57-01284', title: 'Mic cutting out in Studio 2', slaDueAt: new Date('2026-09-29T06:00:00.000Z')};

section('Assignment email');
const assigned = ticketEmailBody(ticket, 'assigned');
check('subject carries the number and the title', assigned.subject.includes('P57-01284') && assigned.subject.includes(ticket.title), assigned.subject);
check('body leads with the number and the title', assigned.text.startsWith('P57-01284') && assigned.text.includes(ticket.title), assigned.text.slice(0, 60));
check('an HTML part is built', Boolean(assigned.html?.startsWith('<!doctype html>')), String(assigned.html).slice(0, 40));
check('HTML names the ticket', Boolean(assigned.html?.includes('P57-01284')), 'ticket number missing from the HTML');
check('HTML escapes what it interpolates', !/<script/i.test(ticketEmailBody({...ticket, title: '<script>x</script>'}, 'assigned').html ?? ''), 'unescaped title reached the HTML');
check('body states the follow-up target', assigned.text.includes('Follow-up target:'), assigned.text);
check('a ticket with no target omits the deadline line',
  !ticketEmailBody({...ticket, slaDueAt: null}, 'assigned').text.includes('Follow-up target:'));

section('SLA reminder email');
const reminder = ticketEmailBody(ticket, 'sla-3h');
check('subject marks it as due', /due in 3 hours/i.test(reminder.subject) && reminder.subject.includes('P57-01284'), reminder.subject);
check('the two mails do not look alike', reminder.html !== assigned.html, 'the reminder reuses the assignment HTML');
check('body differs from the assignment mail', reminder.text !== assigned.text);

section('Greeting by first name');
check('first name is the first word of the directory name', firstName('Anita Rao') === 'Anita', firstName('Anita Rao'));
check('a title is not a first name', firstName('Dr. Meera Shah') === 'Meera', firstName('Dr. Meera Shah'));
check('an email address is never used as a name', firstName('ops@physique57india.com') === null);
check('a lowercase name is capitalised', firstName('rohan') === 'Rohan');
const named = {...ticket, assignedStaffName: 'Anita Rao', escalatedFromName: 'Anita Rao'};
const toOwner = ticketEmailBody(named, 'assigned', {name: 'Anita Rao', role: 'owner'});
check('the owner is greeted by first name in HTML and text', toOwner.html.includes('Hi Anita,') && toOwner.text.startsWith('Hi Anita,'), toOwner.text.slice(0, 40));
const toManager = ticketEmailBody(named, 'assigned', {name: 'Rahul Kapoor', role: 'manager'});
check('the manager is greeted by their own first name', toManager.html.includes('Hi Rahul,') && toManager.text.startsWith('Hi Rahul,'));
check('the manager is not told the ticket is theirs', !/assigned to you/i.test(toManager.subject) && /assigned to Anita/.test(toManager.subject), toManager.subject);
const escalated = ticketEmailBody(named, 'escalated', {name: 'Rahul Kapoor', role: 'manager'});
check('the escalation greets the manager by first name', escalated.html.includes('Hi Rahul,') && escalated.text.startsWith('Hi Rahul,'));
check('the escalation names whose ticket it was', escalated.html.includes('Anita Rao'));
check('the escalation subject is labelled Escalated', escalated.subject.startsWith('[Escalated] P57-01284'), escalated.subject);
const copiedEscalation = ticketEmailBody(named, 'escalated', {name: 'Rahul Kapoor', role: 'manager', copied: ['Anita Rao']});
check('the escalation says the owner is copied', copiedEscalation.html.includes('Anita Rao is copied on this email.') && copiedEscalation.text.includes('Anita Rao is copied on this email.'));
check('a recipient with no usable name gets a neutral greeting', ticketEmailBody(named, 'escalated', {name: 'ops@x.com', role: 'manager'}).text.startsWith('Hello,'));
check('the greeting escapes the name', !ticketEmailBody(named, 'assigned', {name: '<b>x</b>', role: 'owner'}).html.includes('<b>x</b>'));
check('every ticket email is responsive', /@media only screen and \(max-width:620px\)/.test(toOwner.html) && toOwner.html.includes('name="viewport"'));

section('Integrations-page preview');
const preview = sampleAssignmentEmail();
check('has a non-empty subject', preview.subject.length > 0 && preview.subject.length <= 200, preview.subject);
check('has a non-empty body', preview.text.length > 0, preview.text.length);
check('is built from the assignment builder, not a copy',
  preview.text.startsWith(ticketEmailBody({...SAMPLE_TICKET, slaDueAt: new Date()}, 'assigned').text.split('\n')[0]),
  preview.text.slice(0, 60));
check('is visibly a sample', /sample/i.test(preview.subject + preview.text));
check('says no ticket was created', preview.text.includes('No ticket was created.'), preview.text);
check('carries a follow-up target, like a real assignment', preview.text.includes('Follow-up target:'), preview.text);

section('Catalogue contract');
// Every declared Mailtrap action must have a branch in runIntegration. 'send-assignment-preview'
// was declared without one and failed validation on every click.
const mailtrap = INTEGRATION_CATALOGUE.find(d => d.id === 'mailtrap');
const source = readFileSync(new URL('../src/lib/integrations.ts', import.meta.url), 'utf8');
check('the Mailtrap connector is in the catalogue', Boolean(mailtrap));
for (const action of mailtrap?.actions ?? []) {
  const handled = action.id === 'send'
    ? source.includes('return sendMailtrap(c,b);')
    : source.includes(`action==='${action.id}'`);
  check(`action "${action.id}" is implemented`, handled, action.id);
}
check('every write action declares a sample payload',
  (mailtrap?.actions ?? []).filter(a => a.write).every(a => a.sample && Object.keys(a.sample).length > 0));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
