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
  /** Everything below is optional: an older caller that knows only the three fields above
   *  still produces a valid message, just a shorter one. */
  priority?: string | null;
  category?: string | null;
  subcategory?: string | null;
  studio?: string | null;
  memberName?: string | null;
  assignedStaffName?: string | null;
  summary?: string | null;
  appUrl?: string | null;
};

/** Inline styles only, tables for layout, no external assets: the rules of email HTML, and
 *  the reason this does not reuse the app's stylesheet. Colours are the IRIS palette with
 *  light-mode values, since most clients ignore a dark scheme anyway. */
const BRAND = {ink: '#16161c', muted: '#6b6878', line: '#e6e4ee', gold: '#b8860b', goldSoft: '#fdf6e3', red: '#c0392b', redSoft: '#fdeceb', page: '#f6f5f9'};
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c] as string));

const PRIORITY_TONE: Record<string, {bg: string; fg: string}> = {
  critical: {bg: BRAND.redSoft, fg: BRAND.red},
  high: {bg: BRAND.redSoft, fg: BRAND.red},
  medium: {bg: BRAND.goldSoft, fg: BRAND.gold},
  low: {bg: '#eef1f6', fg: BRAND.muted},
};

function row(label: string, value?: string | null) {
  if (!value) return '';
  return `<tr>
    <td style="padding:7px 0;color:${BRAND.muted};font-size:13px;width:132px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:7px 0;color:${BRAND.ink};font-size:13px;font-weight:500;">${esc(value)}</td>
  </tr>`;
}

function shell(opts: {eyebrow: string; accent: string; accentSoft: string; heading: string; lede: string; ticket: TicketEmailSubject; cta: string}) {
  const {eyebrow, accent, accentSoft, heading, lede, ticket, cta} = opts;
  const tone = PRIORITY_TONE[String(ticket.priority || '').toLowerCase()] || PRIORITY_TONE.low;
  const taxonomy = [ticket.category, ticket.subcategory].filter(Boolean).join(' · ');
  const link = ticket.appUrl || '';
  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:${BRAND.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
  <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td style="padding:26px 28px 0;">
    <p style="margin:0 0 14px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:700;">${esc(eyebrow)}</p>
    <h1 style="margin:0 0 8px;font-size:19px;line-height:1.35;color:${BRAND.ink};font-weight:600;">${esc(heading)}</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${BRAND.muted};">${esc(lede)}</p>
  </td></tr>
  <tr><td style="padding:0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${accentSoft};border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:${BRAND.muted};">${esc(ticket.ticketNumber)}</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:${BRAND.ink};line-height:1.4;">${esc(ticket.title)}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:6px 28px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      ${ticket.priority ? `<tr>
        <td style="padding:7px 0;color:${BRAND.muted};font-size:13px;width:132px;">Priority</td>
        <td style="padding:7px 0;"><span style="display:inline-block;padding:3px 9px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${esc(ticket.priority)}</span></td>
      </tr>` : ''}
      ${row('Category', taxonomy)}
      ${row('Studio', ticket.studio)}
      ${row('Member', ticket.memberName)}
      ${row('Owner', ticket.assignedStaffName)}
      ${row('Follow-up target', ticket.slaDueAt ? indiaDate(ticket.slaDueAt) : null)}
    </table>
  </td></tr>
  ${ticket.summary ? `<tr><td style="padding:16px 28px 0;">
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;">What happened</p>
    <p style="margin:0;font-size:13.5px;line-height:1.65;color:${BRAND.ink};">${esc(ticket.summary.length > 420 ? ticket.summary.slice(0, 420) + '…' : ticket.summary)}</p>
  </td></tr>` : ''}
  <tr><td style="padding:24px 28px 28px;">
    ${link ? `<a href="${esc(link)}" style="display:inline-block;padding:11px 20px;background:${BRAND.ink};color:#ffffff;text-decoration:none;border-radius:9px;font-size:14px;font-weight:600;">${esc(cta)}</a>` : ''}
    <p style="margin:18px 0 0;font-size:11.5px;line-height:1.6;color:${BRAND.muted};">Sent by IRIS · Physique 57 India. You are receiving this because the ticket is assigned to you.</p>
  </td></tr>
</table>
</body></html>`;
}

/** Subject and plain-text body for one automatic ticket email. */
export function ticketEmailBody(ticket: TicketEmailSubject, kind: TicketEmailKind) {
  const deadline = ticket.slaDueAt ? `\nFollow-up target: ${indiaDate(ticket.slaDueAt)}.` : '';
  const facts = [
    ticket.priority ? `Priority: ${ticket.priority}` : '',
    [ticket.category, ticket.subcategory].filter(Boolean).join(' · '),
    ticket.studio ? `Studio: ${ticket.studio}` : '',
    ticket.memberName ? `Member: ${ticket.memberName}` : '',
  ].filter(Boolean).join('\n');
  // The plain-text part is not a fallback nobody reads: it is what a watch, a screen reader
  // and a text-only client show, so it carries the same facts as the HTML.
  const plain = (lede: string) => [ticket.ticketNumber, ticket.title, '', lede + deadline, '', facts,
    ticket.summary ? `\nWhat happened:\n${ticket.summary}` : '', ticket.appUrl ? `\nOpen it: ${ticket.appUrl}` : '']
    .filter(l => l !== '').join('\n');

  return kind === 'assigned'
    ? {
        subject: `${ticket.ticketNumber} assigned to you — ${ticket.title}`,
        text: plain('This ticket has been assigned to you in IRIS.'),
        html: shell({
          eyebrow: 'New ticket assigned', accent: BRAND.gold, accentSoft: BRAND.goldSoft,
          heading: 'This one is yours',
          lede: 'A ticket has been routed to you in IRIS. Have a look and take the first action while the detail is fresh.',
          ticket, cta: 'Open the ticket',
        }),
      }
    : {
        subject: `Due in 3 hours — ${ticket.ticketNumber}: ${ticket.title}`,
        text: plain('This ticket is still open and reaches its follow-up target in about three hours.'),
        html: shell({
          eyebrow: 'Follow-up target approaching', accent: BRAND.red, accentSoft: BRAND.redSoft,
          heading: 'Three hours left on this one',
          lede: 'It is still open and its follow-up target is close. Resolving it, or leaving a note on what is holding it up, keeps the clock honest.',
          ticket, cta: 'Update the ticket',
        }),
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
