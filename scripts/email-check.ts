/**
 * The automatic ticket emails and the Integrations-page preview share one builder
 * (lib/ticket-emails.ts). These checks hold that contract: every action declared in
 * the Mailtrap catalogue is implemented, and the preview is the real assignment mail
 * rather than a copy that can drift.
 */
import {ticketEmailBody, sampleAssignmentEmail, SAMPLE_TICKET} from '../src/lib/ticket-emails';
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
check('subject names the ticket', assigned.subject === 'Assigned: P57-01284', assigned.subject);
check('body opens with the title', assigned.text.startsWith(ticket.title), assigned.text.slice(0, 40));
check('body states the follow-up target', assigned.text.includes('Follow-up target:'), assigned.text);
check('a ticket with no target omits the deadline line',
  !ticketEmailBody({...ticket, slaDueAt: null}, 'assigned').text.includes('Follow-up target:'));

section('SLA reminder email');
const reminder = ticketEmailBody(ticket, 'sla-3h');
check('subject marks it as due', reminder.subject === 'Due in 3 hours: P57-01284', reminder.subject);
check('body differs from the assignment mail', reminder.text !== assigned.text);

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
