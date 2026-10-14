import {llmJson} from '@/lib/llm';
import {intakeActor, errorResponse, ApiError, sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {z} from 'zod';

const bodySchema = z.object({
  category: z.string().min(1),
  subcategory: z.string().min(1),
  kind: z.enum(['issue', 'request', 'feedback', 'compliment']),
  answers: z.record(z.string(), z.unknown()),
  target: z.enum(['title', 'summary', 'both']).optional(),
});

/**
 * POST /api/intake/draft
 * Given the answers already on the intake form, ask the connected OpenAI model
 * to tighten the title and/or summary. The prompt is strictly grounded: it only
 * receives what the desk has entered, and the response is parsed as JSON.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await intakeActor();
    await enforceRateLimit('intake-draft');
    const {category, subcategory, kind, answers, target = 'both'} = bodySchema.parse(await req.json());
    const system = `You are IRIS, an operations-intelligence analyst for Physique 57 India. Turn support-ticket answers into an executive-quality draft grounded ONLY in the supplied facts. Never invent names, times, studios, causes, measurements, or outcomes. Return JSON with keys "title" and "summary". The title is a precise one-line incident or opportunity label. The summary is a rich 4-6 sentence operational brief that clearly separates: what was reported, the member or session context, observed impact, evidence already available, and the requested next action. Adapt the language to the ticket kind: issues describe failure and impact; requests state the desired change and rationale; feedback records the observation and learning; compliments identify the positive behavior and who or what should be recognised. Use third-person documentation language such as "Member reported" when applicable.`;
    const user = `Category: ${category}\nSub-category: ${subcategory}\nKind: ${kind}\nAnswers:\n${JSON.stringify(answers, null, 2)}\n\nGenerate ${target === 'title' ? 'only a title' : target === 'summary' ? 'only a summary' : 'a title and summary'}.`;
    const res = await llmJson({system, user, temperature: 0.4, maxTokens: 700, timeoutMs: 20000});
    if (!res) throw new ApiError('Connect OpenAI or Claude in Integrations to use AI drafting.', 503);
    const raw = res.text || '{}';
    const parsed = JSON.parse(raw) as {title?: string; summary?: string};
    return Response.json({
      title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
