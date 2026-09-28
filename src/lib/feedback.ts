/**
 * In-app product feedback: what the Feedback tab collects, how it is stored, and
 * the email the developer receives.
 *
 * This is deliberately NOT the ticket pipeline. A ticket is studio operations work
 * — routed, SLA'd, assigned to staff. A feedback report is a message about the app
 * itself, and its only destination is the developer's inbox, so it skips routing,
 * classification and assignment entirely and is emailed the moment it is filed.
 */
import {createHash, randomUUID} from 'crypto';
import {eq} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {productFeedback, productFeedbackAttachments, deliveryLogs} from '@/db/schema';
import {runIntegration, type MailAttachment} from './integrations';
import {indiaDate} from './display';
import {emailSendingEnabled} from './tickets';
import {
  FEEDBACK_KINDS,
  FEEDBACK_SEVERITIES,
  KIND_LABELS,
  SEVERITY_LABELS,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type FeedbackKind,
  type FeedbackSeverity,
} from './feedback-shared';

/** Where every report goes. Overridable so a fork or a staging deploy does not mail
 *  the production developer, but it defaults to the owner of this codebase. */
export const DEVELOPER_EMAIL = (process.env.FEEDBACK_DEVELOPER_EMAIL || 'jimmeey@physique57india.com').trim();

export {FEEDBACK_KINDS, FEEDBACK_SEVERITIES, KIND_LABELS, SEVERITY_LABELS, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES} from './feedback-shared';

/** Mailtrap caps a message at roughly 25MB base64-encoded. Anything past this stays
 *  in the database and the email links to it rather than carrying it. */
const MAX_EMAIL_ATTACHMENT_BYTES = 9 * 1024 * 1024;
const ALLOWED_TYPES = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/(plain|csv)|video\/(webm|mp4))$/;

/** Everything the browser sends. The context block is best-effort — a field that the
 *  browser could not produce is simply absent, never a reason to reject a report. */
export const feedbackSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  severity: z.enum(FEEDBACK_SEVERITIES).default('normal'),
  title: z.string().trim().min(4, 'Give the report a short title.').max(160),
  details: z.string().trim().min(10, 'Describe what happened in a sentence or two.').max(8000),
  stepsToReproduce: z.string().trim().max(4000).optional(),
  expected: z.string().trim().max(2000).optional(),
  actual: z.string().trim().max(2000).optional(),
  pagePath: z.string().trim().min(1).max(512),
  pageLabel: z.string().trim().max(120).optional(),
  contactBack: z.boolean().default(false),
  reporterEmail: z.string().trim().email().max(200).optional(),
  reporterName: z.string().trim().max(120).optional(),
  context: z.record(z.string(), z.unknown()).default({}),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;

export type FeedbackFile = {fileName: string; fileType: string; origin: 'screenshot' | 'upload'; bytes: Buffer};

/** Human-readable id in the email subject, so a reply can be traced back to the row. */
function reference(when: Date) {
  const stamp = when.toISOString().slice(2, 10).replace(/-/g, '');
  return `FB-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function validateFiles(files: FeedbackFile[]) {
  if (files.length > MAX_ATTACHMENTS) throw new Error(`Attach at most ${MAX_ATTACHMENTS} files.`);
  let total = 0;
  for (const f of files) {
    if (!ALLOWED_TYPES.test(f.fileType)) throw new Error(`${f.fileName}: only images, PDFs, text files and screen recordings can be attached.`);
    if (f.bytes.length > MAX_ATTACHMENT_BYTES) throw new Error(`${f.fileName} is larger than 8MB.`);
    total += f.bytes.length;
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw new Error('Attachments come to more than 25MB in total.');
}

const escapeHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);

function contextRows(context: Record<string, unknown>) {
  return Object.entries(context)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)] as const);
}

/** Subject, plain text and HTML for one report. Kept as a pure function so the text
 *  can be inspected (and tested) without a database or a mail provider. */
export function feedbackEmail(row: {
  reference: string;
  kind: string;
  severity: string;
  title: string;
  details: string;
  stepsToReproduce?: string | null;
  expected?: string | null;
  actual?: string | null;
  pagePath: string;
  pageLabel?: string | null;
  reporterName: string;
  reporterEmail?: string | null;
  contactBack: boolean;
  context: Record<string, unknown>;
  createdAt: Date;
}, files: FeedbackFile[] = []) {
  const kind = KIND_LABELS[row.kind as FeedbackKind] || row.kind;
  const severity = SEVERITY_LABELS[row.severity as FeedbackSeverity] || row.severity;
  const flag = row.severity === 'blocker' ? '🔴' : row.severity === 'high' ? '🟠' : '🔵';
  const subject = `${flag} IRIS feedback [${row.severity}] ${row.title} — ${row.pageLabel || row.pagePath}`;

  const section = (label: string, value?: string | null) => (value ? `\n${label}\n${value}\n` : '');
  const ctx = contextRows(row.context);
  const text = [
    `${row.reference} · ${kind} · ${severity}`,
    `Page: ${row.pageLabel ? `${row.pageLabel} (${row.pagePath})` : row.pagePath}`,
    `Reported by: ${row.reporterName}${row.reporterEmail ? ` <${row.reporterEmail}>` : ''}${row.contactBack ? ' — asked for a reply' : ''}`,
    `Filed: ${indiaDate(row.createdAt)} IST`,
    '',
    'What happened',
    row.details,
    section('Steps to reproduce', row.stepsToReproduce),
    section('Expected', row.expected),
    section('Actual', row.actual),
    files.length ? `\nAttachments (${files.length}): ${files.map((f) => f.fileName).join(', ')}` : '\nNo attachments.',
    ctx.length ? `\nEnvironment\n${ctx.map(([k, v]) => `  ${k}: ${v}`).join('\n')}` : '',
    '',
    'Filed from the IRIS in-app Feedback tab. This is not a ticket — nothing was routed to studio staff.',
  ].join('\n');

  const block = (label: string, value?: string | null) =>
    value ? `<h3 style="margin:18px 0 4px;font:600 13px/1.3 system-ui;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(label)}</h3><p style="margin:0;white-space:pre-wrap;font:14px/1.6 system-ui;color:#111827">${escapeHtml(value)}</p>` : '';
  const html = `<div style="background:#f4f6fa;padding:24px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">
<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
<div style="padding:18px 22px;background:#0a0a0d;color:#fff">
<div style="font:600 12px/1 system-ui;letter-spacing:.18em;text-transform:uppercase;opacity:.6">IRIS product feedback</div>
<div style="font:600 19px/1.35 system-ui;margin-top:8px">${escapeHtml(row.title)}</div>
<div style="font:13px/1.5 system-ui;opacity:.75;margin-top:6px">${escapeHtml(row.reference)} · ${escapeHtml(kind)} · ${escapeHtml(severity)}</div>
</div>
<div style="padding:8px 22px 22px">
<table style="width:100%;border-collapse:collapse;font:13px/1.6 system-ui;color:#374151;margin-top:14px">
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Page</td><td>${escapeHtml(row.pageLabel ? `${row.pageLabel} (${row.pagePath})` : row.pagePath)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Reporter</td><td>${escapeHtml(row.reporterName)}${row.reporterEmail ? ` &lt;${escapeHtml(row.reporterEmail)}&gt;` : ''}${row.contactBack ? ' <strong>— wants a reply</strong>' : ''}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Filed</td><td>${escapeHtml(indiaDate(row.createdAt))} IST</td></tr>
</table>
${block('What happened', row.details)}
${block('Steps to reproduce', row.stepsToReproduce)}
${block('Expected', row.expected)}
${block('Actual', row.actual)}
${files.filter((f) => f.fileType.startsWith('image/')).map((f, i) => `<h3 style="margin:18px 0 6px;font:600 13px/1.3 system-ui;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">${escapeHtml(f.fileName)}</h3><img src="cid:shot${i}" alt="${escapeHtml(f.fileName)}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:10px"/>`).join('')}
${ctx.length ? `<h3 style="margin:18px 0 4px;font:600 13px/1.3 system-ui;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Environment</h3><table style="width:100%;border-collapse:collapse;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#374151">${ctx.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;white-space:nowrap">${escapeHtml(k)}</td><td style="word-break:break-word">${escapeHtml(v)}</td></tr>`).join('')}</table>` : ''}
<p style="margin:22px 0 0;font:12px/1.6 system-ui;color:#9ca3af">Filed from the IRIS in-app Feedback tab. This is not a ticket — nothing was routed to studio staff.</p>
</div></div></div>`;

  return {subject, text, html};
}

/** Files small enough to ride along on the email, with images given a content id so
 *  the HTML can show them inline. */
function mailAttachments(files: FeedbackFile[]): MailAttachment[] {
  const out: MailAttachment[] = [];
  let budget = MAX_EMAIL_ATTACHMENT_BYTES;
  let image = 0;
  for (const f of files) {
    const isImage = f.fileType.startsWith('image/');
    const cid = isImage ? `shot${image++}` : undefined;
    if (f.bytes.length > budget) continue;
    budget -= f.bytes.length;
    out.push({
      filename: f.fileName,
      content: f.bytes.toString('base64'),
      type: f.fileType,
      disposition: cid ? 'inline' : 'attachment',
      ...(cid ? {content_id: cid} : {}),
    });
  }
  return out;
}

/** Builds the developer's message for one stored report. Shared by the initial
 *  send and by a resend from the feedback console, so the two can never drift. */
function developerMessage(
  row: Parameters<typeof feedbackEmail>[0] & {reporterEmail: string | null; contactBack: boolean},
  files: FeedbackFile[],
) {
  return {
    to: [{email: DEVELOPER_EMAIL}],
    ...feedbackEmail(row, files),
    ...(row.reporterEmail && row.contactBack ? {reply_to: {email: row.reporterEmail}} : {}),
    attachments: mailAttachments(files),
  };
}

/**
 * Sends a stored report to the developer again — for when the first attempt was
 * lost, or the mail credentials were fixed after the fact. Rebuilds the message
 * from the stored row and its attachments, so nothing is re-typed.
 */
export async function resendFeedbackEmail(id: string) {
  const [row] = await db.select().from(productFeedback).where(eq(productFeedback.id, id));
  if (!row) throw new Error('That feedback report no longer exists.');
  const stored = await db.select().from(productFeedbackAttachments).where(eq(productFeedbackAttachments.feedbackId, id));
  const files: FeedbackFile[] = stored.map((a) => ({
    fileName: a.fileName,
    fileType: a.fileType,
    origin: a.origin === 'screenshot' ? 'screenshot' : 'upload',
    bytes: a.data,
  }));
  await runIntegration('mailtrap', 'send', developerMessage({...row, context: row.context}, files));
  const [updated] = await db.update(productFeedback).set({emailStatus: 'sent', emailError: null}).where(eq(productFeedback.id, id)).returning();
  return updated;
}

/**
 * Stores the report, then emails the developer immediately. A delivery failure never
 * loses the report: the row is saved first, the failure is recorded on it, and the
 * message is handed to the delivery outbox (which retries with backoff) so it still
 * arrives once the provider or the credentials are fixed.
 */
export async function fileFeedback(
  input: FeedbackInput,
  files: FeedbackFile[],
  reporter: {id?: number | null; name: string; email?: string | null},
) {
  validateFiles(files);
  const now = new Date();
  const id = randomUUID();
  const ref = reference(now);
  const reporterName = input.reporterName?.trim() || reporter.name || 'Anonymous';
  const reporterEmail = input.reporterEmail || reporter.email || null;

  const row = await db.transaction(async (tx) => {
    const [saved] = await tx
      .insert(productFeedback)
      .values({
        id,
        reference: ref,
        kind: input.kind,
        severity: input.severity,
        title: input.title,
        details: input.details,
        stepsToReproduce: input.stepsToReproduce || null,
        expected: input.expected || null,
        actual: input.actual || null,
        pagePath: input.pagePath,
        pageLabel: input.pageLabel || null,
        context: input.context,
        reporterUserId: reporter.id ?? null,
        reporterName,
        reporterEmail,
        contactBack: input.contactBack,
        createdAt: now,
      })
      .returning();
    for (const f of files)
      await tx.insert(productFeedbackAttachments).values({
        id: randomUUID(),
        feedbackId: id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.bytes.length,
        origin: f.origin,
        data: f.bytes,
        checksum: createHash('sha256').update(f.bytes).digest('hex'),
      });
    return saved;
  });

  const message = developerMessage({...row, context: row.context}, files);

  if (!emailSendingEnabled()) {
    await db.update(productFeedback).set({emailStatus: 'skipped', emailError: 'Email sending is disabled on this deployment.'}).where(eq(productFeedback.id, id));
    return {feedback: row, emailed: false as const, reference: ref};
  }

  try {
    await runIntegration('mailtrap', 'send', message);
    await db.update(productFeedback).set({emailStatus: 'sent'}).where(eq(productFeedback.id, id));
    return {feedback: row, emailed: true as const, reference: ref};
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Mail provider unavailable';
    // Queued rather than dropped: the outbox retries with backoff, so a provider
    // outage delays the developer's copy instead of losing the report.
    await db.insert(deliveryLogs).values({integrationId: 'mailtrap', action: 'send', nextAttemptAt: new Date(), payload: message});
    await db.update(productFeedback).set({emailStatus: 'queued', emailError: detail}).where(eq(productFeedback.id, id));
    return {feedback: row, emailed: false as const, reference: ref, error: detail};
  }
}
