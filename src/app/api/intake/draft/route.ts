import OpenAI from 'openai';
import {credentials, getConfig} from '@/lib/config';
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
    const cfg = await getConfig();
    const {category, subcategory, kind, answers, target = 'both'} = bodySchema.parse(await req.json());
    const c = await credentials('chatgpt');
    if (!c.api_key) throw new ApiError('Connect OpenAI in Integrations to use AI drafting.', 503);
    const client = new OpenAI({apiKey: c.api_key, timeout: 20000, maxRetries: 1});
    const model = cfg.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const system = `You are a helpful assistant that turns support-ticket form answers into a concise title and summary. Use ONLY the facts in the answers. Do not invent names, times, studios, or outcomes. Return JSON with keys "title" and "summary". The title should be one short line. The summary should be 1-3 plain sentences in the reporter's tone.`;
    const user = `Category: ${category}\nSub-category: ${subcategory}\nKind: ${kind}\nAnswers:\n${JSON.stringify(answers, null, 2)}\n\nGenerate ${target === 'title' ? 'only a title' : target === 'summary' ? 'only a summary' : 'a title and summary'}.`;
    const res = await client.chat.completions.create({
      model,
      temperature: 0.4,
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: system},
        {role: 'user', content: user},
      ],
    });
    const raw = res.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw) as {title?: string; summary?: string};
    return Response.json({
      title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : undefined,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
