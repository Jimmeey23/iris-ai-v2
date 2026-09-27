/**
 * The wording of the automatic ticket emails, in one place.
 *
 * Both the real notification (lib/tickets.ts → queueTicketEmails) and the
 * "Send a sample assignment email" preview on the Integrations page build their
 * message here, so a preview can never show something the owner would not
 * actually receive.
 *
 * Kept free of database and integration imports so the delivery path can use it
 * without pulling in the ticket graph.
 */
import {indiaDate} from './display';

export type TicketEmailKind = 'assigned' | 'sla-3h';

export type TicketEmailSubject = {
  ticketNumber: string;
  title: string;
  slaDueAt: Date | string | null;
};

/** Subject and plain-text body for one automatic ticket email. */
export function ticketEmailBody(ticket: TicketEmailSubject, kind: TicketEmailKind) {
  const deadline = ticket.slaDueAt ? `\nFollow-up target: ${indiaDate(ticket.slaDueAt)}.` : '';
  return kind === 'assigned'
    ? {
        subject: `Assigned: ${ticket.ticketNumber}`,
        text: `${ticket.title}\n\nThis ticket has been assigned in IRIS.${deadline}\nPlease sign in to review and update it.`,
      }
    : {
        subject: `Due in 3 hours: ${ticket.ticketNumber}`,
        text: `${ticket.title}\n\nThis ticket remains unresolved and reaches its follow-up target in approximately 3 hours.${deadline}\nPlease add an update or resolve it now.`,
      };
}

/** The fixture behind the Integrations page preview: a plausible ticket that is
 *  visibly a sample, so nobody mistakes the test mail for a real assignment. */
export const SAMPLE_TICKET: TicketEmailSubject = {
  ticketNumber: 'P57-00000 (sample)',
  title: 'Sample ticket — microphone cutting out in Studio 2',
  slaDueAt: null,
};

/** The preview message. Built from the same builder as the real email, with a
 *  trailing note so the recipient knows why it arrived. */
export function sampleAssignmentEmail() {
  const {subject, text} = ticketEmailBody(
    {...SAMPLE_TICKET, slaDueAt: new Date(Date.now() + 24 * 3600_000)},
    'assigned',
  );
  return {
    subject,
    text: `${text}\n\n— This is a sample sent from the IRIS Integrations page to verify Mailtrap delivery. No ticket was created.`,
  };
}
