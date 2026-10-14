import {z} from 'zod';
import {getConfig} from '@/lib/config';
import {llmJson} from '@/lib/llm';
import {intakeActor, errorResponse, sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';
import {buildSuggestion, classifyPrompt, type ModelAnswer} from '@/lib/intake/suggest';
import {reportError} from '@/lib/observability';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({text: z.string().trim().min(8, 'Describe what happened in a sentence or two.').max(2000)});

/**
 * POST /api/intake/classify
 * Proposes a category, sub-category and a few pre-filled answers for a free-text description.
 *
 * Works without a model: when OpenAI is not connected, or the call fails, the keyword
 * classifier answers on its own and the response says so (`engine: "keywords"`), with a
 * confidence that never reaches "high". The caller always gets something it can show.
 */
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await intakeActor();
    await enforceRateLimit('intake-classify');
    const {text} = bodySchema.parse(await req.json());
    const cfg = await getConfig();
    const taxonomy = cfg.taxonomy;
    const ctx = {studios: [...cfg.studios], trainers: [...cfg.trainers], formats: [...cfg.formats]};

    let model: ModelAnswer | null = null;
    if (cfg.aiEnabled) {
      try {
        // OpenAI first, Claude Haiku if OpenAI is out of credits or down (lib/llm).
        const r = await llmJson({system: classifyPrompt(taxonomy, ctx), user: text, maxTokens: 400, temperature: 0, timeoutMs: 12000});
        if (r) model = JSON.parse(r.text) as ModelAnswer;
      } catch (err) {
        // Every provider failed: the keyword answer stands in, and filing a ticket is never blocked.
        await reportError(err, {source: 'api.intake.classify', severity: 'warning', path: '/api/intake/classify', method: 'POST'});
      }
    }
    return Response.json(buildSuggestion({text, taxonomy, ctx, model}));
  } catch (e) {
    return errorResponse(e);
  }
}
