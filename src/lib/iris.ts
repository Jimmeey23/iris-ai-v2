import OpenAI from 'openai';
import {getConfig,credentials} from './config';
import {extractEntities,inferSentiment,classifyIssue,matchStudio} from './classifier';
import {makeDraft,historicalExamples} from './tickets';
import {listMomence,obj} from './momence';
import {STUDIO_AREAS,SYSTEMS,OCCURRED_OPTIONS,REPORTED_BY_OPTIONS} from './constants';
import type {IrisTurn,IrisMessage} from './iris-contract';
import type {AdvancedDraft} from './ticket-contract';

const FIELD_KEYS=['category','subcategory','kind','description','studio','classFormat','trainer','membership','memberName','memberEmail','memberPhone','incidentAt','preferredContact','requestedResolution','impact','sentiment','area','systemName','itemDescription','lastSeen','isClassImpacted','isImmediateDanger','alreadyReported','channelOfIssue','reportedBy'];
const options=(values:string[])=>values.map(value=>({label:value,value}));

/** Context-aware urgency detection — returns true if this ticket signals time-sensitivity or blocking issues. */
function detectUrgency(c:Record<string,unknown>):boolean{
  const blocking=c.isClassImpacted==='Yes, blocking now'||c.isImmediateDanger==='Yes — happening now';
  const impactLevel=String(c.impact||'').toLowerCase();
  const severe=impactLevel.includes('safety')||impactLevel.includes('could not proceed')||blocking;
  return Boolean(severe);
}

/** Extra category-specific questions, phrased for a staff member logging what they saw or were told.
 *  Intelligent filtering: skip redundant questions by inferring answers from context. */
function extraSlot(category:string,c:Record<string,unknown>):{key:string;prompt:string;values:string[]}|null{
  const isMaintenance=category==='Repair and Maintenance'||category==='Studio Amenities and Facilities';
  const isTech=category==='Operating Systems'||category==='Tech Issues';
  
  // Skip "already reported?" if they explicitly said they just noticed it — clearly not already logged
  const isStudioReport=c.reportedBy===REPORTED_BY_OPTIONS[0];
  const skipDuplicateCheck=isStudioReport&&c.incidentAt==='Earlier today';
  
  // For maintenance/facilities: ask location, then impact, then dedup check (in that order, skip if redundant)
  if(isMaintenance&&!c.area)return{key:'area',prompt:'Where in the studio is this?',values:[...STUDIO_AREAS]};
  if(isMaintenance&&!c.isClassImpacted)return{key:'isClassImpacted',prompt:'Is it affecting a live class right now?',values:['Yes, blocking now','Not yet, but it will be','No, comfort / back-office only']};
  if(isMaintenance&&!skipDuplicateCheck&&!c.alreadyReported)return{key:'alreadyReported',prompt:'Has this already been reported or logged by someone else?',values:['Not that I know of','Yes — already logged','Yes — told a manager, not logged']};
  
  // For tech issues: ask system, then impact, then dedup check
  if(isTech&&!c.systemName)return{key:'systemName',prompt:'Which system or piece of equipment is acting up?',values:[...SYSTEMS]};
  if(isTech&&!c.isClassImpacted)return{key:'isClassImpacted',prompt:'Is it blocking a class or booking right now?',values:['Yes, blocking now','Not yet, but it will be','No, comfort / back-office only']};
  if(isTech&&!skipDuplicateCheck&&!c.alreadyReported)return{key:'alreadyReported',prompt:'Has this already been reported or logged by someone else?',values:['Not that I know of','Yes — already logged','Yes — told a manager, not logged']};
  
  // Safety: urgent impact escalation — ask about immediate danger FIRST, skip duplicate check if urgent
  if(category==='Safety and Security'&&!c.isImmediateDanger)return{key:'isImmediateDanger',prompt:'Is anyone in immediate danger right now?',values:['Yes — happening now','No, but it needs urgent attention']};
  if(category==='Safety and Security'&&!detectUrgency(c)&&!c.alreadyReported)return{key:'alreadyReported',prompt:'Has this already been flagged to a manager or security?',values:['Yes','Not yet']};
  
  if(category==='Theft and Lost Items'&&!c.itemDescription)return{key:'itemDescription',prompt:'What item is missing? A short description is enough.',values:[]};
  if(category==='Theft and Lost Items'&&!c.lastSeen)return{key:'lastSeen',prompt:'Where was it last seen?',values:['Locker','Studio floor','Lounge','Valet','Boutique','Changing room']};
  if(category==='Customer Service and Communication'&&!c.channelOfIssue)return{key:'channelOfIssue',prompt:'Where did this interaction happen?',values:['Front desk','Phone','WhatsApp','Email','Social media']};
  return null;
}

/** The intake answers that belong on the ticket. Undefined keys are dropped so the
 *  stored JSON stays readable. */
function intakeAnswers(c:Record<string,unknown>){
  const out:Record<string,unknown>={reportedBy:c.reportedBy,sessionContext:c.sessionContext,area:c.area,systemName:c.systemName,isClassImpacted:c.isClassImpacted,isImmediateDanger:c.isImmediateDanger,alreadyReported:c.alreadyReported,itemDescription:c.itemDescription,lastSeen:c.lastSeen,channelOfIssue:c.channelOfIssue,occurredAt:occurredAtIso(c.incidentAt)};
  for(const k of Object.keys(out))if(out[k]===undefined||out[k]==='')delete out[k];
  return out;
}

/** Turns a relative answer ("Earlier today") into an approximate instant, so the age of
 *  an incident is queryable instead of living only as display text. */
function occurredAtIso(value:unknown):string|undefined{
  const label=String(value||'').trim();if(!label)return undefined;
  const parsed=Date.parse(label);if(Number.isFinite(parsed))return new Date(parsed).toISOString();
  const now=Date.now(),day=86400000;
  const offsets:Record<string,number>={'Just now':0,'Earlier today':4*3600000,'Yesterday':day,'Earlier this week':3*day,'Last week':7*day,'Ongoing / recurring':0};
  const offset=offsets[label];
  return offset===undefined?undefined:new Date(now-offset).toISOString();
}

export async function irisWelcome(sessionId:string,preset?:{category?:string;subcategory?:string}):Promise<IrisTurn>{const c=preset?.category?{category:preset.category,subcategory:preset.subcategory}:{};return{sessionId,message:preset?.category?'Good — let’s log this properly. What did you see, or what were you told?':'Hi, I’m Iris — your team’s logging assistant. Tell me what you noticed on the floor, or what a member told you, and I’ll turn it into a clean ticket for the right department.',phase:'welcome',fieldKey:'description',options:[{label:'A member reported an issue to me',value:'A member told me about an issue and I need to log it.'},{label:'I noticed something myself',value:'I noticed something on the floor that needs attention.'},{label:'Trainer or class feedback',value:'I want to log feedback about a class or a trainer.'},{label:'Log a compliment',value:'I want to log a compliment a member shared.'}],collected:c,progress:{done:0,total:8},engine:(await credentials('chatgpt')).api_key?'openai':'guided'};}

export async function runIris(input:{sessionId:string;collected:Record<string,unknown>;message?:string;fieldKey?:string;history:IrisMessage[];selectionApplied?:boolean;patch?:Record<string,unknown>}):Promise<IrisTurn>{const cfg=await getConfig();const c={...input.collected,...input.patch};const raw=(input.message||'').trim();const priorField=input.fieldKey;const connection=await credentials('chatgpt');const key=connection._enabled==='false'?undefined:connection.api_key;let engine:'openai'|'guided'=cfg.aiEnabled&&key?'openai':'guided';let notice:string|undefined;let ai:OpenAI|undefined;
if(engine==='openai')ai=new OpenAI({apiKey:key,timeout:20000,maxRetries:1});
if(raw.startsWith('A member told me')||raw.startsWith('I noticed something')||raw.startsWith('I want to log feedback')||raw.startsWith('I want to log a compliment')){c.kind=raw.includes('compliment')?'compliment':raw.includes('feedback')?'feedback':'issue';c.reportedBy=raw.startsWith('A member told me')?REPORTED_BY_OPTIONS[1]:raw.startsWith('I noticed')?REPORTED_BY_OPTIONS[0]:undefined;c.description='';if(c.kind==='compliment')c.sentiment='positive';}
else if(raw==='__accept_category__'){c._categoryConfirmed=true;}else if(raw==='__reject_category__'){delete c.category;delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;}else if(raw==='__manual_member__'){c.memberLookupDone=true;c.manualMember=true;}else if(raw==='__studio_report__'){c.memberLookupDone=true;c.memberName=c.reportedBy===REPORTED_BY_OPTIONS[1]?'Member (not named)':'Studio team observation';c.memberEmail='';c.studioReport=true;}else if(raw==='__manual_session__'){c.sessionLookupDone=true;c.manualSession=true;}else if(raw==='__hosted_class__'){c.hostedClass=true;c.classFormat=c.classFormat||'Studio Hosted Class';}else if(raw&&!raw.startsWith('__')){
if(priorField&&FIELD_KEYS.includes(priorField)){c[priorField]=raw;if(priorField==='category'){delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;}if(priorField==='studio'){const m=matchStudio(raw);if(m)c.studio=m;}}else c.description=String(c.description||'')+(c.description?'\n':'')+raw;
{const heuristic=extractEntities(raw);for(const[k,v]of Object.entries(heuristic)){if(!FIELD_KEYS.includes(k)||v===undefined||c[k])continue;if(k==='studio'){const m=matchStudio(String(v));if(m)c.studio=m;continue;}if(k==='category')c._categoryInferred=true;c[k]=v;}const top=classifyIssue(String(c.description||raw));if(top[0])c._guess={category:top[0].category,subcategory:top[0].subcategory,score:top[0].score};if(priorField==='description'||!priorField){
const nameMatch=raw.match(/(?:her name is|his name is|the member is|member's name is)\s+([a-z]+(?:\s+[a-z]+)?)(?=[,.!]|$)/i);if(nameMatch)c.memberName=nameMatch[1];
if(/\b(loved|love|amazing|compliment|wonderful|excellent|fantastic|appreciation)\b/i.test(raw)&&!/(but |however|unsafe|complaint|not |didn.t)/i.test(raw)){c.kind='compliment';c.sentiment='positive';}else c.kind=c.kind||'issue';
if(ai){try{const toolDefs:OpenAI.Chat.Completions.ChatCompletionTool[]=[{type:'function',function:{name:'find_momence',description:'Find member or session suggestions from Momence to help identify who or what this is about. Never select a record on the user’s behalf.',parameters:{type:'object',properties:{module:{type:'string',enum:['members','sessions']},query:{type:'string'}},required:['module','query'],additionalProperties:false}}}];
const messages:OpenAI.Chat.Completions.ChatCompletionMessageParam[]=[{role:'system',content:`You are Iris, the internal logging assistant for Physique 57 India studio staff. Staff use you to record issues, snags and feedback they noticed or were told about by a member — you do not talk to members directly. Extract only facts explicitly provided. Return JSON {"fields":{...}}. Allowed fields: ${FIELD_KEYS.join(',')}. kind: issue/request/compliment/feedback. Exact taxonomy: ${JSON.stringify(cfg.taxonomy)}. Exact studios: ${JSON.stringify(cfg.studios)}. Do not guess a member, class, date, studio or contact detail — a room reference such as "Studio 1" or "Studio 2" names a room inside a location and is NOT a studio, so leave studio unset for those. Do not convert safety reports into compliments. Heuristic classification hint (trust it unless the message clearly contradicts it): ${JSON.stringify(c._guess||null)}. Studio aliases: kemps/kwality→Kwality House, Kemps Corner; shq/supreme/bandra→Supreme HQ, Bandra; kenkere→Kenkere House, Bengaluru; courtside→Courtside, Mumbai; copper/cloves/c&c→the Studio by Copper & Cloves, Bengaluru. Current facts: ${JSON.stringify(c)}. Correct earlier facts when explicitly corrected. Tools provide suggestions, not identity verification.`},...input.history.slice(-12),{role:'user',content:raw}];
let result=await ai.chat.completions.create({model:cfg.aiModel,messages,tools:toolDefs,response_format:{type:'json_object'},max_completion_tokens:1200});
const calls=result.choices[0]?.message.tool_calls;if(calls?.length){messages.push(result.choices[0].message);for(const call of calls){if(call.type!=='function')continue;let output:unknown;try{const args=obj(JSON.parse(call.function.arguments));if(!['members','sessions'].includes(String(args.module)))throw new Error('Invalid module');const found=await listMomence(args.module as 'members'|'sessions',{query:String(args.query||''),pageSize:5});output={source:found.source,suggestions:found.items.map(i=>({id:i.id,name:i.name}))};}catch{output={error:'Lookup unavailable. Ask the user to search and select manually.'};}messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(output)});}result=await ai.chat.completions.create({model:cfg.aiModel,messages,response_format:{type:'json_object'},max_completion_tokens:1200});}
const fields=obj(obj(JSON.parse(result.choices[0]?.message.content||'{}')).fields);for(const[k,v]of Object.entries(fields)){if(!FIELD_KEYS.includes(k)||typeof v!=='string'||v.length>=20000)continue;
// A studio names a site the ticket gets routed to, so the model's answer has to resolve
// through the same alias table a typed answer does. "Studio 1" is a room, not a site:
// it resolves to nothing, the field stays empty, and the flow asks which studio it is.
// Studio is never taken from the model. Validating its answer is not enough: asked to
// place "studio 1" it returns a real site name, which passes every check and silently
// files the ticket against the wrong location. The alias match on the reporter's own
// words is the only trusted source; when that finds nothing, the flow asks.
if(k==='studio')continue;
if(k==='category'&&!c.category)c._categoryInferred=true;
c[k]=v;}
}catch{engine='guided';notice='AI is unavailable right now. Your answers are saved; guided assistance is continuing.';}}
}}}
if(c.category&&!cfg.taxonomy[String(c.category)])delete c.category;if(c.category&&c.subcategory&&!cfg.taxonomy[String(c.category)].includes(String(c.subcategory)))delete c.subcategory;
// Same contract for the two fields that steer routing and reporting: an unrecognised
// value is dropped rather than written onto the ticket unchallenged.
if(c.studio&&!cfg.studios.includes(String(c.studio))){const m=matchStudio(String(c.studio));if(m)c.studio=m;else delete c.studio;}
if(c.area&&!STUDIO_AREAS.includes(String(c.area) as typeof STUDIO_AREAS[number]))delete c.area;
if(!['issue','request','compliment','feedback','assessment'].includes(String(c.kind)))c.kind='issue';
if(c.memberEmail&&typeof c.memberEmail==='string'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.memberEmail))delete c.memberEmail;
let fieldKey:string|undefined,lookup:'members'|'sessions'|undefined,question='',opts:{label:string;value:string}[]=[];let lookupFilters:{studio?:string;sessionTypes?:string[]}|undefined;
const choose=(key:string,prompt:string,values:string[]=[])=>{fieldKey=key;question=prompt;opts=options(values);};
const classRelated=['Class Experience','Trainer Feedback','Scheduling'].includes(String(c.category));const praise=c.kind==='compliment'||c.kind==='feedback'&&c.sentiment==='positive';
const isStudioReport=c.reportedBy===REPORTED_BY_OPTIONS[0];
const isMemberReport=c.reportedBy===REPORTED_BY_OPTIONS[1];

// CONTEXT-AWARE FLOW: Skip redundant questions based on what we already know
if(!c.description||String(c.description).length<12)choose('description',c.reportedBy===REPORTED_BY_OPTIONS[1]?'What did the member tell you?':c.reportedBy===REPORTED_BY_OPTIONS[0]?'What did you see?':'Go ahead — describe what happened, in as much detail as you have.');
else if(!c.reportedBy)choose('reportedBy','Quick context: how did this come to you?',[...REPORTED_BY_OPTIONS]);
else if(c.category&&c.subcategory&&c._categoryInferred&&!c._categoryConfirmed){fieldKey='confirmCategory';question=`I've read this as ${String(c.subcategory).toLowerCase()} (${c.category}). File it there?`;opts=[{label:`Yes — ${c.subcategory}`,value:'__accept_category__'},{label:'No, let me pick the category',value:'__reject_category__'}];}
else if(!c.category){
  if(c._guess&&typeof c._guess==='object'&&'score'in c._guess&&(c._guess as unknown as {score:number}).score>3){
    c.category=(c._guess as unknown as {category:string}).category;
    c.subcategory=(c._guess as unknown as {subcategory:string}).subcategory;
    c._categoryInferred=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined});
  }
  choose('category',praise?'Who or what deserves the recognition?':'Which area does this fall under?',Object.keys(cfg.taxonomy));
}
else if(!c.subcategory)choose('subcategory',praise?'What stood out most?':'Which of these best matches it?',cfg.taxonomy[String(c.category)]);
// SMART MEMBER LOOKUP: If staff observed it themselves (not member-reported), skip member lookup entirely
else if(!c.memberLookupDone&&isStudioReport&&!c.memberName){c.memberLookupDone=true;c.memberName='Studio team observation';c.memberEmail='';c.studioReport=true;return runIris({...input,message:undefined,collected:c,patch:undefined});}
// Only ask member lookup if the report came from a member
else if(!c.memberLookupDone){
  const involvesMember=[REPORTED_BY_OPTIONS[1] as string,REPORTED_BY_OPTIONS[2] as string].includes(String(c.reportedBy));
  fieldKey='memberLookup';
  lookup='members';
  const q1=`Who is this member? Search Momence, or skip if you'd rather not name them yet.`;
  const q2='Is this about a specific member, or a general studio observation?';
  question=involvesMember?q1:q2;
  opts=[{label:'Not member-specific',value:'__studio_report__'},{label:'Enter member details manually',value:'__manual_member__'}];
}
else if(classRelated&&!c.sessionLookupDone){fieldKey='sessionLookup';lookup='sessions';question=`Which class was this? Pick the session and I'll pull in the trainer, studio and time.`;
const hosted=c.hostedClass===true||c.classFormat==='Studio Hosted Class';
lookupFilters={studio:typeof c.studio==='string'&&c.studio!=='—'?c.studio:undefined,sessionTypes:hosted?['private']:undefined};
opts=[{label:'Session not listed / enter manually',value:'__manual_session__'},...(hosted?[]:[{label:'It was a hosted / private class',value:'__hosted_class__'}])];}
else if(!c.studio||c.studio==='—')choose('studio','Which studio is this for?',cfg.studios);
else if(!c.incidentAt)choose('incidentAt','When did this happen?',[...OCCURRED_OPTIONS]);
else if(c.manualMember&&!c.memberName)choose('memberName','What name should go on the ticket?');
else if(c.manualMember&&!c.memberEmail)choose('memberEmail','Any contact detail on file for them? (optional — you can skip)');
else if(classRelated&&c.manualSession&&!c.classFormat)choose('classFormat','Which class format was it?',cfg.formats);
else if(classRelated&&c.manualSession&&!c.trainer)choose('trainer','Who was teaching?', [...cfg.trainers,'Not sure']);
else{const extra=!praise?extraSlot(String(c.category),c):null;if(extra)choose(extra.key,extra.prompt,extra.values);
// INTELLIGENT IMPACT GATHERING: Detect urgency and tailor the question accordingly
else if(!praise&&!c.impact){if(c.isClassImpacted==='Yes, blocking now'){c.impact='Could not proceed as normal';return runIris({...input,message:undefined,collected:c,patch:undefined});}const memberInvolved=isMemberReport&&!c.studioReport;const urgentContext=c.isClassImpacted==='Not yet, but it will be';const impactPrompt=memberInvolved?'How much did this affect the member?':urgentContext?'This will block classes. How severe is the issue?':'How much is this affecting the floor?';choose('impact',impactPrompt,['Minor inconvenience','Noticeably affected the experience','Could not proceed as normal','Safety concern']);}
else if(!praise&&!c.requestedResolution){const urgentContext=detectUrgency(c);const resolutionOptions=urgentContext?['Investigate urgently','Escalate to a manager','Restore a class credit','Review and follow up']:['Review and follow up','Restore a class credit','Explain the policy to the member','Escalate to a manager','Investigate urgently'];choose('requestedResolution','What should happen next?',resolutionOptions);}
else if(!praise&&!c.preferredContact){if(!isMemberReport){c.preferredContact='Internal log only';return runIris({...input,message:undefined,collected:c,patch:undefined});}choose('preferredContact','Does the member need a callback, or is this an internal-only log?',['Internal log only','Member expects a callback','Member expects a WhatsApp reply','Member expects an email reply']);}
else if(['Member expects a callback'].includes(String(c.preferredContact))&&!c.memberPhone)choose('memberPhone','What number should the team use to reach them?');}
const required=['description','reportedBy','category','subcategory','memberLookupDone','studio','incidentAt',...(classRelated?['sessionLookupDone']:[]),...(praise?[]:['impact','requestedResolution','preferredContact'])];const done=required.filter(k=>Boolean(c[k])).length;
let draft:AdvancedDraft|undefined;if(!fieldKey){const cf=obj(c.customFields);draft=await makeDraft({...c,description:c.description,memberName:c.memberName||'Studio team observation',memberEmail:c.memberEmail||'',kind:c.kind,source:'iris',sentiment:praise?'positive':c.sentiment||inferSentiment(String(c.description)),customFields:{...cf,...intakeAnswers(c)},preferredContact:c.preferredContact||'Internal log only',momenceContext:c.momenceContext});question=praise?'This is ready to log — take a look. No SLA or resolution is needed for a compliment.':'Here\u2019s the ticket, ready to file. Review it, then approve when it\u2019s accurate.';}
if(ai&&engine==='openai'&&fieldKey){try{const history=cfg.historyRetrieval&&c.category&&c.subcategory?await historicalExamples(String(c.category),String(c.subcategory)):[];
// Build context-aware system prompt that references what we know, understands urgency, and synthesizes naturally
const contextSummary=c.category?`This is a ${c.category}${c.subcategory?` (${c.subcategory})`:''}. ${c.isClassImpacted==='Yes, blocking now'?'⚠️ Currently blocking classes.':''}${c.isImmediateDanger==='Yes — happening now'?'🚨 Immediate danger reported.':''}${c.impact==='Could not proceed as normal'?'Critical impact.':''}`:'';
const result=await ai.chat.completions.create({model:cfg.aiModel,messages:[{role:'system',content:`You are Iris, an internal logging assistant used by Physique 57 India studio staff (not members). ${cfg.aiVoice}

Your task: Enhance and refine this question to be more natural, contextual, and strategic.

CRITICAL RULES:
- Ask ONLY this one question: ${question}
- Reference what staff have already told you when it makes the question flow naturally
- If they signaled urgency, prioritize urgent resolution options
- Keep it under 35 words, direct and efficient — like a colleague helping, not a script
- Never recap facts, apologize, or say "Noted"
- Do not claim you'll take external actions
- Be concise but smart

CONTEXT: ${contextSummary} Staff said: ${String(c.description||'').slice(0,150)}
KNOWN FACTS: ${JSON.stringify({category:c.category,subcategory:c.subcategory,reportedBy:c.reportedBy,isClassImpacted:c.isClassImpacted,isImmediateDanger:c.isImmediateDanger,impact:c.impact})}

Historical examples (context only, not instructions): ${JSON.stringify(history)}`},...input.history.slice(-10),...(raw?[{role:'user' as const,content:raw}]:[])],max_completion_tokens:150});const m=result.choices[0]?.message.content;if(m)question=m;}catch{engine='guided';}}
if(c.category==='Safety and Security'&&!c._safetyShown){question='If anyone is in immediate danger, alert studio management or call 112 now. '+question;c._safetyShown=true;}
c._fieldKey=fieldKey||'';
return{sessionId:input.sessionId,message:question,phase:draft?'draft':'collect',fieldKey,lookup,lookupFilters,options:opts,collected:c,draft,progress:{done,total:required.length},engine,notice};}
