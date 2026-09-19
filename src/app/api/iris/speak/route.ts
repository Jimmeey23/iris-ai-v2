import OpenAI from 'openai';
import {credentials} from '@/lib/config';
import {intakeActor,errorResponse,ApiError,sameOrigin} from '@/lib/auth';
import {enforceRateLimit} from '@/lib/rate-limit';

export const dynamic='force-dynamic';

export async function POST(req:Request){
  try {
    sameOrigin(req);
    await intakeActor();
    await enforceRateLimit('speak');
    const c = await credentials('chatgpt');
    if (!c.api_key || c._enabled === 'false') {
      throw new ApiError('Connect OpenAI in Integrations to enable spoken replies.', 503);
    }
    const {text} = await req.json();
    const clean = String(text || '').replace(/[*_#`]/g, '').slice(0, 3000);
    if (!clean.trim()) throw new ApiError('No text supplied to speak.');

    const client = new OpenAI({apiKey: c.api_key, timeout: 30000});
    try {
      const speech = await client.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: 'shimmer',
        input: clean,
        response_format: 'mp3',
      });
      const buffer = Buffer.from(await speech.arrayBuffer());
      return new Response(buffer, {
        headers: {'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store'},
      });
    } catch (openaiErr) {
      console.error('[iris/speak] OpenAI TTS error:', openaiErr instanceof Error ? openaiErr.message : String(openaiErr));
      // Surface a generic failure so the client falls back to browser synthesis.
      throw new ApiError('Spoken reply is unavailable right now.', 503);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
