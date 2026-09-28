import {errorResponse, requireAdmin, sameOrigin, ApiError} from '@/lib/auth';
import {resendFeedbackEmail} from '@/lib/feedback';

export const dynamic = 'force-dynamic';

/** `POST /api/feedback/[id]/resend` — mails a stored report to the developer again. */
export async function POST(req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    sameOrigin(req);
    await requireAdmin();
    const {id} = await params;
    const feedback = await resendFeedbackEmail(id).catch((e: unknown) => {
      throw e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : 'The email could not be sent.', 502);
    });
    return Response.json({feedback});
  } catch (e) {
    return errorResponse(e);
  }
}
