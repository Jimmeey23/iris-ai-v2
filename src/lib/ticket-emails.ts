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
import {BRAND, FONT, MONO, button, emailDocument, esc, fact, firstName, greeting, grid, label, priorityPill, section} from './email-layout';

export {BRAND, esc};

export type TicketEmailKind = 'assigned' | 'sla-3h' | 'escalated';

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
  departmentName?: string | null;
  createdAt?: Date | string | null;
  summary?: string | null;
  appUrl?: string | null;
  /** Escalation only: who held it when the target passed, so the manager reading this knows
   *  whose work they have just been handed rather than having to open the ticket to find out. */
  escalatedFromName?: string | null;
};

/**
 * Who a copy is for. The owner and their reporting manager both receive the assignment and
 * the three-hour warning, and they are not being asked the same thing: the owner has to act,
 * the manager has to know. Each is greeted by first name.
 */
export type TicketEmailRecipient = {name?: string | null; role?: 'owner' | 'manager'; /** Names on CC, said in the body so nobody wonders who else has read it. */ copied?: string[]};

/** "in 2h 40m", "in 3 days", "5h overdue": read at a glance, unlike a timestamp. */
function relative(due: Date, now: Date) {
  const ms = due.getTime() - now.getTime();
  const mins = Math.floor(Math.abs(ms) / 60_000);
  const h = Math.floor(mins / 60), m = mins % 60;
  const span = h >= 48 ? `${Math.floor(h / 24)} days` : h >= 1 ? `${h}h${m ? ` ${m}m` : ''}` : `${Math.max(1, m)}m`;
  return ms < 0 ? `${span} overdue` : `in ${span}`;
}

type Copy = {
  subject: string;
  textLede: string;
  context: string;
  accent: string;
  eyebrow: string;
  heading: string;
  lede: string;
  steps: string[];
  cta: string;
  footer: string;
  urgent?: boolean;
};

function copyFor(ticket: TicketEmailSubject, kind: TicketEmailKind, role: 'owner' | 'manager'): Copy {
  const owner = ticket.assignedStaffName || 'the owner';
  const ownerFirst = firstName(ticket.assignedStaffName) || 'your team member';
  const ref = `${ticket.ticketNumber}: ${ticket.title}`;
  const notMonitored = 'Replies to this address are not monitored — please update the ticket instead.';

  if (kind === 'escalated') {
    const from = ticket.escalatedFromName;
    const fromFirst = firstName(from);
    return {
      subject: `[Escalated] ${ref}`,
      textLede:
        `This ticket passed its follow-up target${from ? ` with ${from}` : ''} without being resolved or extended, ` +
        `so it has been escalated to you as the reporting manager and reassigned to your name.`,
      context: 'Escalation',
      accent: BRAND.red,
      eyebrow: 'Escalated to you',
      heading: 'This ticket has been escalated to you',
      lede:
        `It passed its follow-up target${from ? ` with ${from}` : ''} with no resolution and no extension, so IRIS has ` +
        `reassigned it to you${fromFirst ? ` as ${fromFirst}'s reporting manager` : ''}. It needs a decision today.`,
      steps: [
        fromFirst ? `Decide who owns it now — keep it, or hand it back to ${fromFirst} with a clear instruction.` : 'Decide who owns it now — keep it, or hand it to someone with a clear instruction.',
        'Make sure the member has heard from us; an update is overdue by definition.',
        'Resolve it, or log the plan and the new target on the ticket so the board reflects it.',
      ],
      cta: 'Take over the ticket',
      footer: `You are receiving this because the ticket was escalated to you in IRIS. ${notMonitored}`,
      urgent: true,
    };
  }

  if (kind === 'sla-3h') {
    return role === 'manager'
      ? {
          subject: `Due in 3 hours — ${ref}`,
          textLede: `This ticket, assigned to ${owner}, is still open and reaches its follow-up target in about three hours.`,
          context: 'Follow-up target',
          accent: BRAND.gold,
          eyebrow: 'Heads-up for you',
          heading: `${ownerFirst}'s ticket is due in three hours`,
          lede: `It is still open with ${owner}, who reports to you. A quick check-in now is far cheaper than an escalation later — if it misses the target it comes to you.`,
          steps: [
            `Ask ${ownerFirst} where it stands and what is blocking it.`,
            'If it genuinely needs longer, the owner or you can take the one extension, with a reason.',
          ],
          cta: 'Check the ticket',
          footer: `You are receiving this because ${owner} reports to you. ${notMonitored}`,
          urgent: true,
        }
      : {
          subject: `Due in 3 hours — ${ref}`,
          textLede: 'This ticket is still open and reaches its follow-up target in about three hours.',
          context: 'Follow-up target',
          accent: BRAND.gold,
          eyebrow: 'Follow-up target approaching',
          heading: 'Three hours left on this ticket',
          lede: 'It is still open and its follow-up target is close. If it passes unresolved and unextended, IRIS escalates it to your reporting manager.',
          steps: [
            'Resolve it now if you can, with a short note on what was done.',
            'Otherwise log what is holding it up, so the next person is not starting cold.',
            'If it genuinely needs longer, take the one extension — with a reason — before the target passes.',
          ],
          cta: 'Update the ticket',
          footer: `You are receiving this because this ticket is assigned to you in IRIS. ${notMonitored}`,
          urgent: true,
        };
  }

  return role === 'manager'
    ? {
        subject: `${ticket.ticketNumber} assigned to ${ownerFirst} — ${ticket.title}`,
        textLede: `This ticket has been assigned to ${owner}, who reports to you.`,
        context: 'New ticket',
        accent: BRAND.blue,
        eyebrow: 'For your awareness',
        heading: `New ticket for ${ownerFirst}`,
        lede: `IRIS routed this to ${owner}, who reports to you. Nothing is needed from you yet — you will hear again if it comes close to its follow-up target.`,
        steps: [],
        cta: 'View the ticket',
        footer: `You are receiving this because ${owner} reports to you. ${notMonitored}`,
      }
    : {
        subject: `${ticket.ticketNumber} assigned to you — ${ticket.title}`,
        textLede: 'This ticket has been assigned to you in IRIS.',
        context: 'New ticket',
        accent: BRAND.gold,
        eyebrow: 'New ticket assigned',
        heading: 'A new ticket is yours',
        lede: 'IRIS routed this to you. A first update while the detail is fresh — even a short note — is what keeps it from becoming a long one.',
        steps: [
          'Read the summary below and open the ticket for the full context.',
          'Take the first action, or reach out to the member if they are waiting on us.',
          'Log progress on the ticket so the board stays current.',
        ],
        cta: 'Open the ticket',
        footer: `You are receiving this because this ticket is assigned to you in IRIS. ${notMonitored}`,
      };
}

function stepsBlock(steps: string[], accent: string) {
  if (!steps.length) return '';
  const rows = steps.map((step, i) => `<tr>
    <td width="30" valign="top" style="width:30px;padding:0 0 10px;vertical-align:top;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="22" height="22" style="width:22px;height:22px;border-radius:11px;background:${accent};font-family:${FONT};font-size:11.5px;line-height:22px;font-weight:700;color:#ffffff;">${i + 1}</td></tr></table>
    </td>
    <td valign="top" style="padding:2px 0 10px;font-family:${FONT};font-size:14px;line-height:1.55;color:${BRAND.body};">${esc(step)}</td>
  </tr>`).join('');
  return `${label('What to do next')}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:4px;">${rows}</table>`;
}

function renderHtml(ticket: TicketEmailSubject, kind: TicketEmailKind, copy: Copy, recipient: TicketEmailRecipient | undefined, now: Date) {
  const due = ticket.slaDueAt ? new Date(ticket.slaDueAt) : null;
  const overdue = due ? due.getTime() < now.getTime() : false;
  const taxonomy = [ticket.category, ticket.subcategory].filter(Boolean).join(' · ');
  const summary = ticket.summary ? (ticket.summary.length > 480 ? ticket.summary.slice(0, 480) + '…' : ticket.summary) : '';

  const dueFact = due
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${copy.urgent || overdue ? BRAND.redSoft : BRAND.soft};border-radius:10px;"><tr><td style="padding:12px 14px;">
        ${label('Follow-up target', copy.urgent || overdue ? BRAND.red : BRAND.faint)}
        <p style="margin:0;font-family:${FONT};font-size:14.5px;line-height:1.4;color:${copy.urgent || overdue ? BRAND.red : BRAND.ink};font-weight:700;">${esc(relative(due, now))}</p>
        <p style="margin:2px 0 0;font-family:${FONT};font-size:12px;line-height:1.4;color:${BRAND.muted};">${esc(indiaDate(due))}</p>
      </td></tr></table>`
    : '';

  const facts = grid([
    dueFact,
    fact('Studio', ticket.studio),
    fact('Member', ticket.memberName),
    kind === 'escalated' ? fact('Was with', ticket.escalatedFromName) : fact('Owner', ticket.assignedStaffName),
    fact('Department', ticket.departmentName),
    fact('Raised', ticket.createdAt ? indiaDate(ticket.createdAt) : null),
  ]);

  const body = [
    section(`
      <p style="margin:0 0 12px;">${pillFor(copy)}</p>
      <h1 class="e-h1" style="margin:0 0 14px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-.02em;color:${BRAND.ink};">${esc(copy.heading)}</h1>
      ${recipient ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${BRAND.ink};font-weight:600;">${esc(greeting(recipient.name))}</p>` : ''}
      <p style="margin:0;font-family:${FONT};font-size:15.5px;line-height:1.65;color:${BRAND.body};">${esc(copy.lede)}</p>
      ${copiedLine(recipient) ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${esc(copiedLine(recipient))}</p>` : ''}
    `),
    section(`
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;">
        <tr><td width="4" style="width:4px;background:${copy.accent};border-radius:12px 0 0 12px;font-size:0;">&nbsp;</td>
        <td style="padding:18px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
            <td style="font-family:${MONO};font-size:12px;line-height:1.4;letter-spacing:.03em;color:${BRAND.faint};">${esc(ticket.ticketNumber)}</td>
            <td align="right">${priorityPill(ticket.priority)}</td>
          </tr></table>
          <p style="margin:8px 0 0;font-family:${FONT};font-size:18px;line-height:1.4;font-weight:700;color:${BRAND.ink};">${esc(ticket.title)}</p>
          ${taxonomy ? `<p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${esc(taxonomy)}</p>` : ''}
        </td></tr>
      </table>
    `),
    facts ? section(facts, '0 36px 12px') : '',
    summary
      ? section(`${label('What happened')}<p style="margin:0;font-family:${FONT};font-size:14.5px;line-height:1.7;color:${BRAND.body};">${esc(summary)}</p>`)
      : '',
    copy.steps.length ? section(stepsBlock(copy.steps, copy.accent)) : '',
    ticket.appUrl ? section(button(ticket.appUrl, copy.cta, copy.urgent ? BRAND.red : BRAND.ink), '4px 36px 32px') : section('', '0 0 8px'),
  ].join('');

  return emailDocument({
    title: copy.subject,
    preheader: `${ticket.ticketNumber} · ${ticket.title}${due ? ` · ${relative(due, now)}` : ''}`,
    context: copy.context,
    accent: copy.accent,
    body,
    footer: esc(copy.footer),
  });
}

const copiedLine = (recipient?: TicketEmailRecipient) => {
  const names = (recipient?.copied ?? []).filter(Boolean);
  if (!names.length) return '';
  return `${names.join(' and ')} ${names.length === 1 ? 'is' : 'are'} copied on this email.`;
};
const pillFor = (copy: Copy) =>
  `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${copy.accent === BRAND.red ? BRAND.redSoft : copy.accent === BRAND.blue ? BRAND.blueSoft : BRAND.goldSoft};color:${copy.accent};font-family:${FONT};font-size:11px;line-height:1.2;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">${esc(copy.eyebrow)}</span>`;

/**
 * Standing blind copy on every ticket email.
 *
 * The workspace keeps one archive address that receives a copy of anything sent about a
 * ticket — assignment, the SLA warning, an escalation, the daily digest — so there is a
 * single mailbox that holds the whole outbound record even after staff turnover.
 *
 * Blind, not CC: the owner and their manager should not see a head-office address on the
 * thread and start replying to it instead of working the ticket. `TICKET_BCC_EMAILS` accepts
 * a comma-separated list, and a single space switches the archive off entirely.
 */
export function ticketBcc(): {email: string}[] {
  return (process.env.TICKET_BCC_EMAILS ?? 'admin@physique57india.com')
    .split(',')
    .map(address => address.trim().toLowerCase())
    .filter(address => address.includes('@'))
    .map(email => ({email}));
}

/** Subject, plain text and HTML for one automatic ticket email, written for `recipient`. */
export function ticketEmailBody(ticket: TicketEmailSubject, kind: TicketEmailKind, recipient?: TicketEmailRecipient, now = new Date()) {
  const role = recipient?.role ?? 'owner';
  const copy = copyFor(ticket, kind, role);
  const deadline = ticket.slaDueAt ? `\nFollow-up target: ${indiaDate(ticket.slaDueAt)}.` : '';
  const facts = [
    ticket.priority ? `Priority: ${ticket.priority}` : '',
    [ticket.category, ticket.subcategory].filter(Boolean).join(' · '),
    ticket.studio ? `Studio: ${ticket.studio}` : '',
    ticket.memberName ? `Member: ${ticket.memberName}` : '',
    kind === 'escalated' && ticket.escalatedFromName ? `Was with: ${ticket.escalatedFromName}` : ticket.assignedStaffName && role === 'manager' ? `Owner: ${ticket.assignedStaffName}` : '',
  ].filter(Boolean).join('\n');
  // The plain-text part is not a fallback nobody reads: it is what a watch, a screen reader
  // and a text-only client show, so it carries the same facts — and the same greeting — as the HTML.
  const text = [
    recipient ? `${greeting(recipient.name)}\n` : '',
    ticket.ticketNumber, ticket.title, '', copy.textLede + deadline, copiedLine(recipient), '', facts,
    ticket.summary ? `\nWhat happened:\n${ticket.summary}` : '',
    copy.steps.length ? `\nWhat to do next:\n${copy.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    ticket.appUrl ? `\nOpen it: ${ticket.appUrl}` : '',
  ].filter(l => l !== '').join('\n');

  return {subject: copy.subject, text, html: renderHtml(ticket, kind, copy, recipient, now)};
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
