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
const BRAND = {ink: '#16161c', muted: '#5f5c6d', faint: '#94919f', line: '#eae8f0', gold: '#a8760a', goldSoft: '#fdf7e8', red: '#c0392b', redSoft: '#fdeeec', page: '#f2f1f6'};
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

function metaCell(label: string, value?: string | null) {
  if (!value) return '';
  return `<td width="50%" style="padding:0 0 14px;vertical-align:top;">
    <p style="margin:0 0 3px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.faint};font-weight:700;">${esc(label)}</p>
    <p style="margin:0;font-size:14px;color:${BRAND.ink};font-weight:600;line-height:1.4;">${esc(value)}</p>
  </td>`;
}

/** Meta laid out two to a row. Email clients have no grid and no flexbox, so the pairs are
 *  built here rather than wrapped by the renderer. */
function metaGrid(pairs: [string, string | null | undefined][]) {
  const cells = pairs.filter(([, v]) => v).map(([l, v]) => metaCell(l, v));
  if (!cells.length) return '';
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(`<tr>${cells[i]}${cells[i + 1] || '<td width="50%"></td>'}</tr>`);
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows.join('')}</table>`;
}

function shell(opts: {eyebrow: string; accent: string; accentSoft: string; heading: string; lede: string; ticket: TicketEmailSubject; cta: string; urgent?: boolean}) {
  const {eyebrow, accent, accentSoft, heading, lede, ticket, cta, urgent} = opts;
  const tone = PRIORITY_TONE[String(ticket.priority || '').toLowerCase()] || PRIORITY_TONE.low;
  const taxonomy = [ticket.category, ticket.subcategory].filter(Boolean).join(' · ');
  const link = ticket.appUrl || '';
  const due = ticket.slaDueAt ? indiaDate(ticket.slaDueAt) : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(ticket.ticketNumber)} · ${esc(ticket.title)}${due ? ' · due ' + esc(due) : ''}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.page};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(22,22,28,.06),0 12px 32px -12px rgba(22,22,28,.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

  <!-- masthead -->
  <tr><td style="padding:20px 32px;background:${BRAND.ink};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.14em;">IRIS</td>
      <td align="right" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:600;">Physique 57 India</td>
    </tr></table>
  </td></tr>

  <!-- status band -->
  <tr><td style="padding:14px 32px;background:${accentSoft};border-bottom:1px solid ${BRAND.line};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="font-size:11px;letter-spacing:.13em;text-transform:uppercase;color:${accent};font-weight:700;">${esc(eyebrow)}</td>
      ${ticket.priority ? `<td align="right"><span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${tone.bg};color:${tone.fg};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;">${esc(ticket.priority)} priority</span></td>` : ''}
    </tr></table>
  </td></tr>

  <!-- headline -->
  <tr><td style="padding:30px 32px 0;">
    <h1 style="margin:0 0 10px;font-size:25px;line-height:1.25;color:${BRAND.ink};font-weight:700;letter-spacing:-.02em;">${esc(heading)}</h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:${BRAND.muted};">${esc(lede)}</p>
  </td></tr>

  <!-- the ticket itself -->
  <tr><td style="padding:0 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${BRAND.line};border-left:3px solid ${accent};border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <p style="margin:0 0 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;letter-spacing:.04em;color:${BRAND.faint};">${esc(ticket.ticketNumber)}</p>
        <p style="margin:0;font-size:17px;font-weight:650;color:${BRAND.ink};line-height:1.4;">${esc(ticket.title)}</p>
        ${taxonomy ? `<p style="margin:10px 0 0;font-size:12.5px;color:${BRAND.muted};">${esc(taxonomy)}</p>` : ''}
      </td></tr>
    </table>
  </td></tr>

  ${due ? `<tr><td style="padding:14px 32px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${urgent ? BRAND.redSoft : '#f4f5f8'};border-radius:10px;">
      <tr><td style="padding:12px 16px;font-size:13px;color:${urgent ? BRAND.red : BRAND.ink};font-weight:600;">
        ${urgent ? '⏱ ' : ''}Follow-up target — ${esc(due)}
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- meta -->
  <tr><td style="padding:22px 32px 0;">
    ${metaGrid([['Studio', ticket.studio], ['Member', ticket.memberName], ['Owner', ticket.assignedStaffName], ['Raised in', ticket.category]])}
  </td></tr>

  ${ticket.summary ? `<tr><td style="padding:4px 32px 0;">
    <p style="margin:0 0 7px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${BRAND.faint};font-weight:700;">What happened</p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:${BRAND.ink};">${esc(ticket.summary.length > 420 ? ticket.summary.slice(0, 420) + '…' : ticket.summary)}</p>
  </td></tr>` : ''}

  <!-- action -->
  <tr><td style="padding:26px 32px 30px;">
    ${link ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${BRAND.ink};">
      <a href="${esc(link)}" style="display:inline-block;padding:13px 26px;color:#ffffff;text-decoration:none;font-size:14.5px;font-weight:650;letter-spacing:.01em;">${esc(cta)} &rarr;</a>
    </td></tr></table>` : ''}
  </td></tr>

  <tr><td style="padding:18px 32px 24px;border-top:1px solid ${BRAND.line};">
    <p style="margin:0;font-size:11.5px;line-height:1.6;color:${BRAND.faint};">Sent automatically by IRIS because this ticket is assigned to you. Replies to this address are not monitored — please respond on the ticket.</p>
  </td></tr>
</table>
</td></tr></table>
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
          lede: 'IRIS routed this to you. Taking the first action while the detail is fresh is usually what keeps it from becoming a long one.',
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
          ticket, cta: 'Update the ticket', urgent: true,
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
