import {NextRequest, after} from 'next/server';
import {desc, eq} from 'drizzle-orm';
import {db} from '@/db';
import {productFeedback, productFeedbackAttachments} from '@/db/schema';
import {errorResponse, optionalUser, requireAdmin, sameOrigin, ApiError} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {deliverPending} from '@/lib/integrations';
import {fileFeedback, feedbackSchema, DEVELOPER_EMAIL, MAX_ATTACHMENTS, type FeedbackFile} from '@/lib/feedback';

export const dynamic = 'force-dynamic';

/** `POST /api/feedback` — files one in-app feedback report and emails it to the
 *  developer straight away. Multipart: a `report` JSON part plus up to eight files. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    await enforceRateLimit('feedback');
    const user = await optionalUser();
    const form = await req.formData();
    const raw = form.get('report');
    if (typeof raw !== 'string') throw new ApiError('The feedback report is missing.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ApiError('The feedback report could not be read.');
    }
    const input = feedbackSchema.parse(parsed);
    if (!user && !input.reporterEmail)
      throw new ApiError('Add your email address so the developer can follow up.');

    const files: FeedbackFile[] = [];
    for (const entry of form.getAll('files')) {
      if (!(entry instanceof File)) continue;
      if (files.length >= MAX_ATTACHMENTS) throw new ApiError(`Attach at most ${MAX_ATTACHMENTS} files.`);
      files.push({
        fileName: entry.name || 'attachment',
        fileType: entry.type || 'application/octet-stream',
        origin: entry.name.startsWith('iris-screenshot') ? 'screenshot' : 'upload',
        bytes: Buffer.from(await entry.arrayBuffer()),
      });
    }

    let result;
    try {
      result = await fileFeedback(input, files, {id: user?.id, name: user?.name || 'Anonymous', email: user?.email});
    } catch (e) {
      // validateFiles throws plain Errors; surface them as a 400 rather than a 500.
      throw e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : 'Feedback could not be saved.');
    }
    // Flushes anything the outbox is holding, including this report if the direct send failed.
    if (!result.emailed) after(() => deliverPending());
    return Response.json(
      {
        reference: result.reference,
        emailed: result.emailed,
        developer: DEVELOPER_EMAIL,
        message: result.emailed
          ? `Sent to the developer. Reference ${result.reference}.`
          : `Saved as ${result.reference}. The email is queued and will go out automatically.`,
      },
      {status: 201},
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/** `GET /api/feedback` — the reports filed so far, newest first. Administrators only:
 *  a report can quote anything that was on the reporter's screen. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 50));
    const rows = await db.select().from(productFeedback).orderBy(desc(productFeedback.createdAt)).limit(limit);
    const attachments = rows.length
      ? await db
          .select({
            id: productFeedbackAttachments.id,
            feedbackId: productFeedbackAttachments.feedbackId,
            fileName: productFeedbackAttachments.fileName,
            fileType: productFeedbackAttachments.fileType,
            fileSize: productFeedbackAttachments.fileSize,
            origin: productFeedbackAttachments.origin,
          })
          .from(productFeedbackAttachments)
      : [];
    return Response.json({
      feedback: rows.map((r) => ({...r, attachments: attachments.filter((a) => a.feedbackId === r.id)})),
      developer: DEVELOPER_EMAIL,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** `PATCH /api/feedback?id=` — an administrator marks a report triaged or closed. */
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req);
    await requireAdmin();
    const {id, status} = await req.json();
    if (!['open', 'triaged', 'fixed', 'wont-fix'].includes(status)) throw new ApiError('Unknown feedback status.');
    const [row] = await db.update(productFeedback).set({status}).where(eq(productFeedback.id, String(id))).returning();
    if (!row) throw new ApiError('That feedback report no longer exists.', 404);
    return Response.json({feedback: row});
  } catch (e) {
    return errorResponse(e);
  }
}
