import OpenAI from 'openai';import {credentials,getConfig} from '@/lib/config';import {intakeActor,errorResponse,ApiError,sameOrigin} from '@/lib/auth';import {enforceRateLimit} from '@/lib/rate-limit';
import {STAGES_SC3_PARTS} from '@/lib/constants';
export const dynamic='force-dynamic';export const maxDuration=60;

/** Most accurate first. A workspace whose key cannot reach a newer model still transcribes
 *  on the next one down instead of failing the recording. */
const MODELS=['gpt-transcribe','gpt-4o-transcribe','whisper-1'] as const;

/** The words staff actually say — studio names, trainers, class formats, bike parts — are the
 *  ones a general model gets wrong. Handing them over as context is what turns "Kenkere" from
 *  "Ken Carey" into the studio, and a trainer's name into that trainer. */
async function vocabulary():Promise<string>{
  const cfg=await getConfig();
  const terms=[...cfg.studios,...cfg.trainers,...cfg.formats,...STAGES_SC3_PARTS.map(p=>p.name),'Physique 57','PowerCycle','Stages SC3','Momence','Kwality House','Kemps Corner','Supreme HQ','Bandra','Kenkere House','Courtside','Copper & Cloves','barre','associate','front desk'];
  return `A Physique 57 India studio staff member is reporting a support ticket, in Indian English that may mix in Hindi words. Spell these names exactly: ${[...new Set(terms)].join(', ')}.`.slice(0,3500);
}

export async function POST(req:Request){try{sameOrigin(req);await intakeActor();await enforceRateLimit('transcribe');
const c=await credentials('chatgpt');if(!c.api_key||c._enabled==='false')throw new ApiError('Connect OpenAI in Integrations to use high-accuracy voice transcription.',503);
const data=await req.formData();const file=data.get('audio');if(!(file instanceof File)||file.size>15000000)throw new ApiError('Supply an audio file smaller than 15 MB.');if(!file.type.startsWith('audio/'))throw new ApiError('An audio recording is required.');
const client=new OpenAI({apiKey:c.api_key,timeout:45000,maxRetries:1});const prompt=await vocabulary();
let lastError:unknown;
for(const model of MODELS){
  try{
    const result=await client.audio.transcriptions.create({file,model,prompt,...(model==='whisper-1'?{language:'en'}:{}),temperature:0});
    return Response.json({text:result.text,model});
  }catch(e){
    lastError=e;
    // Only an unavailable model moves down the list; a bad recording or a bad key fails the same way on every model.
    const status=(e as {status?:number}).status;
    if(status!==404&&status!==400&&status!==403)break;
    console.warn(`[iris/transcribe] ${model} unavailable (${status}), trying next model`);
  }
}
console.error('[iris/transcribe] failed:',lastError);
throw new ApiError('Transcription failed. Try again, or type your message.',502);
}catch(e){return errorResponse(e);}}
