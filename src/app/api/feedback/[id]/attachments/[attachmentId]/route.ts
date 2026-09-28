import {and, eq} from 'drizzle-orm';
import {db} from '@/db';
import {productFeedbackAttachments} from '@/db/schema';
import {errorResponse, requireAdmin, ApiError} from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Serves one stored screenshot or file. Administrators only — the same reason the
 *  list is: a screenshot can contain anything that was on the reporter's screen. */
export async function GET(_req: Request, {params}: {params: Promise<{id: string; attachmentId: string}>}) {
  try {
    await requireAdmin();
    const {id, attachmentId} = await params;
    const [row] = await db
      .select()
      .from(productFeedbackAttachments)
      .where(and(eq(productFeedbackAttachments.id, attachmentId), eq(productFeedbackAttachments.feedbackId, id)));
    if (!row) throw new ApiError('Attachment not found.', 404);
    return new Response(new Uint8Array(row.data), {
      headers: {
        'Content-Type': row.fileType,
        'Content-Length': String(row.fileSize),
        'Content-Disposition': `inline; filename="${row.fileName.replace(/["\\\r\n]/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
