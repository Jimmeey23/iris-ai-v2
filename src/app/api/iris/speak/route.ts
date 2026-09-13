import OpenAI from 'openai';
import {credentials} from '@/lib/config';
import {requireWorkspace,errorResponse,ApiError,sameOrigin} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{sameOrigin(req);await requireWorkspace();const c=await credentials('chatgpt');if(!c.api_key||c._enabled==='false')throw new ApiError('Connect OpenAI in Integrations to enable spoken replies.',503);const {text}=await req.json();const clean=String(text||'').replace(/[*_#`]/g,'').slice(0,3000);if(!clean.trim())throw new ApiError('No text supplied to speak.');const client=new OpenAI({apiKey:c.api_key,timeout:30000});const speech=await client.audio.speech.create({model:'gpt-4o-mini-tts',voice:'shimmer',input:clean,response_format:'mp3'});const buffer=Buffer.from(await speech.arrayBuffer());return new Response(buffer,{headers:{'Content-Type':'audio/mpeg','Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
