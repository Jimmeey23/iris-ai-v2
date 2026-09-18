import OpenAI from 'openai';
import {getConfig,credentials} from './config';
import {extractEntities,inferSentiment,classifyIssue,matchStudio} from './classifier';
import {makeDraft,historicalExamples} from './tickets';
import {listMomence,obj} from './momence';
import {extractContext,determineSkippableFields} from './context-extractor';
import {STUDIO_AREAS,SYSTEMS,OCCURRED_OPTIONS,REPORTED_BY_OPTIONS} from './constants';
import type {IrisTurn,IrisMessage} from './iris-contract';
import type {AdvancedDraft} from './ticket-contract';

const FIELD_KEYS=['category','subcategory','kind','description','studio','classFormat','trainer','membership','memberName','memberEmail','memberPhone','incidentAt','preferredContact','requestedResolution','impact','sentiment','area','systemName','itemDescription','lastSeen','isClassImpacted','isImmediateDanger','alreadyReported','channelOfIssue','reportedBy'];
const options=(values:string[])=>values.map(value=>({label:value,value}));

/** Fields whose offered chips are the whole answer space: a value that is not one of them is
 *  not a rougher version of the answer, it is unusable. Routing, SLA rules, dedup and every
 *  report read these by exact value, so an unmatched answer is dropped and the question is
 *  asked again rather than written onto the ticket as prose. */
const ENUM_FIELDS=new Set(['category','subcategory','studio','reportedBy','incidentAt','area','systemName','isClassImpacted','isImmediateDanger','alreadyReported','lastSeen','channelOfIssue','classFormat']);
/** Fields the flow can file without, once asking has clearly stopped working. */
const SKIPPABLE=new Set(['impact','requestedResolution','preferredContact','area','alreadyReported','isClassImpacted','systemName','itemDescription','lastSeen','channelOfIssue','trainer','classFormat','incidentAt']);
const SKIP_VALUE:Record<string,string>={trainer:'Not sure',incidentAt:'Ongoing / recurring'};
const SKIPPED='Not specified';
/** How many times one field may be asked before the flow stops waiting on it. Without this a
 *  question whose answer never lands is asked forever — the conversation reads as a loop and
 *  no ticket is ever produced. */
const ASK_LIMIT=3;
/** After this many Iris turns, every skippable field is filled in so the draft can be reached. */
const HARD_CAP=18;

const TIME_SYNONYMS:Record<string,string>={'right now':'Just now','just now':'Just now','moment ago':'Just now','this morning':'Earlier today','this afternoon':'Earlier today','this evening':'Earlier today','earlier today':'Earlier today','today':'Earlier today','yesterday':'Yesterday','this week':'Earlier this week','few days':'Earlier this week','last week':'Last week','keeps happening':'Ongoing / recurring','every day':'Ongoing / recurring','recurring':'Ongoing / recurring','ongoing':'Ongoing / recurring'};
const FIELD_DESCRIPTIONS: Record<string, string> = {
  studioAndTime: "which studio location center (e.g. Kwality House Kemps Corner, Supreme HQ Bandra, Fort, Kenkere House) this occurred in, and when it happened",
  studio: "which studio location center (e.g. Kwality House Kemps Corner, Supreme HQ Bandra, Fort, Kenkere House)",
  incidentAt: "when this issue occurred or was noticed (e.g. Earlier today, Yesterday, Ongoing)",
  area: "which specific room or area inside the studio (e.g. Studio 2, Strength Studio, Changing room, Lounge)",
  isClassImpacted: "whether a live class or upcoming session is affected right now",
  alreadyReported: "whether this has already been reported to a manager or security",
  requestedResolution: "what requested resolution or repair action is needed",
  impact: "how severely this is affecting floor operations or class flow",
  preferredContact: "whether the member needs a callback or if this is an internal-only log",
  systemName: "which system or equipment is acting up (e.g. mic, lights, sound system)",
  category: "what main operational area this issue falls under",
  subcategory: "what specific subcategory best matches this issue",
  memberName: "the name of the member involved",
};

/**
 * Pull facts from every substantive message before treating it as the answer to the
 * previous prompt. Staff routinely answer a different, more important detail in the
 * same breath ("Strength Lab, this morning") than the one Iris last asked for. The
 * old order turned that into, for example, a member name and then asked the same
 * location question again.
 */
function applyMessageFacts(c:Record<string,unknown>,raw:string){
  if(!raw)return;
  const source=raw.toLowerCase();

  // Run deep context extraction for slangs, trainers, areas, and formats
  const context=extractContext(raw);
  for(const[k,v]of Object.entries(context)){
    if(v!==undefined&&v!==''&&(c[k]===undefined||c[k]===''||c[k]==='—')){
      c[k]=v;
    }
  }

  // Slang studio match takes priority
  if(context.studio)c.studio=context.studio;
  else if(!c.studio||c.studio==='—'){
    const studio=matchStudio(raw);if(studio)c.studio=studio;
  }

  if(context.incidentAt&&!c.incidentAt)c.incidentAt=context.incidentAt;
  else{
    const when=normalizeAnswer('incidentAt',raw,OCCURRED_OPTIONS);
    if(when)c.incidentAt=when;
  }

  if(/\b(colleague|coworker|co-worker|team(?:mate| member)?|associate|staff)\b.*\b(flagged|told|reported|mentioned|raised|said)\b|\b(flagged|told|reported|mentioned|raised|said)\b.*\bby (?:a |my )?(colleague|coworker|associate|staff)\b/i.test(raw)){
    c.reportedBy=REPORTED_BY_OPTIONS[2];
    c.memberLookupDone=true;
    c.memberName='Studio team observation';
    c.memberEmail='';
    c.studioReport=true;
  }
  else if(/\b(member|client|community member|guest)\b.*\b(told|said|reported|mentioned|shared|asked|complained)\b/i.test(raw)){
    c.reportedBy=REPORTED_BY_OPTIONS[1];
  }
  else if(/\b(i |we )(noticed|saw|found|spotted|observed|checked)\b/i.test(raw)){
    c.reportedBy=REPORTED_BY_OPTIONS[0];
    c.memberLookupDone=true;
    c.memberName='Studio team observation';
    c.memberEmail='';
    c.studioReport=true;
  }

  const entities=extractEntities(raw);
  for(const key of ['area','systemName'] as const)if(entities[key]&&!c[key])c[key]=entities[key];

  if(context.category&&!c.category){
    c.category=context.category;
    c.subcategory=context.subcategory;
    c._categoryInferred=true;
    c._categoryConfirmed=true;
  } else if(!c.category){
    const top=classifyIssue(raw)[0];
    if(top&&top.score>=6){
      c.category=top.category;
      c.subcategory=top.subcategory;
      c._categoryInferred=true;
      if(top.score>=10)c._categoryConfirmed=true;
    }
  }

  if(c.reportedBy!==REPORTED_BY_OPTIONS[1]){
    c.memberLookupDone=true;
    if(!c.memberName)c.memberName='Studio team observation';
    c.memberEmail='';
    c.studioReport=true;
  }
  if(/\b(not member-specific|not a member issue|general (?:studio )?observation|no member involved|colleague|internal)\b/i.test(source)){
    c.memberLookupDone=true;c.studioReport=true;c.memberName='Studio team observation';c.memberEmail='';
  }
}

function defaultOperationalFields(c:Record<string,unknown>){
  const maintenance=['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems','Safety and Security'].includes(String(c.category));
  if(!maintenance)return;
  if(!c.impact||c._operationalImpactDefault){
    c.impact=c.isClassImpacted==='Yes, blocking now'?'Could not proceed as normal':c.isClassImpacted==='Not yet, but it will be'?'Likely to affect an upcoming session':`Operational issue reported${c.area?` in ${c.area}`:''}`;
    c._operationalImpactDefault=true;
  }
  if(!c.requestedResolution||c._operationalResolutionDefault){
    c.requestedResolution=`Inspect and resolve ${String(c.subcategory||'issue').toLowerCase()}${c.area?` in ${c.area}`:''}.`;
    c._operationalResolutionDefault=true;
  }
  if(!c.preferredContact||c._operationalContactDefault){
    if(c.reportedBy!==REPORTED_BY_OPTIONS[1]){
      c.preferredContact='Internal log only';
      c._operationalContactDefault=true;
    }
  }
}

/** Maps a typed answer onto one of the values that were offered. Staff type "this morning",
 *  "yes" or "no", not "Earlier today" or "Yes, blocking now". */
function normalizeAnswer(key:string,raw:string,values:readonly string[]):string|undefined{
  const t=raw.trim().toLowerCase();if(!t)return undefined;if(!values.length)return raw.trim();
  const exact=values.find(v=>v.toLowerCase()===t);if(exact)return exact;
  if(/^(yes|yeah|yep|yup|y|correct|true)\b/.test(t)){const hit=values.find(v=>/^yes/i.test(v));if(hit)return hit;}
  // "No" means the negative option, not merely the first option that begins with the letters
  // n-o: "Not yet, but it will be" is a yes with a delay and must never absorb a plain "no".
  if(/^(no|nope|nah|n|none|false)\b/.test(t)){const hit=values.find(v=>/^no\b/i.test(v))||values.find(v=>/^(not|no)\b/i.test(v));if(hit)return hit;}
  if(key==='incidentAt')for(const[phrase,value]of Object.entries(TIME_SYNONYMS))if(t.includes(phrase)&&values.includes(value))return value;
  if(t.length>=4){const contains=values.find(v=>v.toLowerCase().includes(t)||t.includes(v.toLowerCase()));if(contains)return contains;}
  const words=new Set(t.split(/[^a-z0-9]+/).filter(w=>w.length>3));
  let best:{value:string;score:number}|undefined;
  for(const v of values){const score=v.toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>3&&words.has(w)).length;if(score&&(!best||score>best.score))best={value:v,score};}
  return best?.value;
}

/** Per-field ask counts, read back off the session so they survive between requests. */
function askCounts(c:Record<string,unknown>):Record<string,number>{
  const out:Record<string,number>={};
  for(const[k,v]of Object.entries(obj(c._asked)))out[k]=Number(v)||0;
  return out;
}

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
  
  // URGENCY CHECK: If this is blocking RIGHT NOW or needs urgent attention, skip optional dedup question
  const isUrgent=c.isClassImpacted==='Yes, blocking now'||c.isImmediateDanger==='Yes — happening now'||c.isImmediateDanger==='No, but it needs urgent attention';
  
  // For maintenance/facilities: ask location, then impact, skip dedup if urgent
  if(isMaintenance&&!c.area)return{key:'area',prompt:'Where in the studio is this?',values:[...STUDIO_AREAS]};
  if(isMaintenance&&!c.isClassImpacted)return{key:'isClassImpacted',prompt:'Is it affecting a live class right now?',values:['Yes, blocking now','Not yet, but it will be','No, comfort / back-office only']};
  
  // For tech issues: ask system, then impact, skip dedup if urgent
  if(isTech&&!c.systemName)return{key:'systemName',prompt:'Which system or piece of equipment is acting up?',values:[...SYSTEMS]};
  if(isTech&&!c.isClassImpacted)return{key:'isClassImpacted',prompt:'Is it blocking a class or booking right now?',values:['Yes, blocking now','Not yet, but it will be','No, comfort / back-office only']};
  
  // Safety: urgent impact escalation — ask about immediate danger FIRST, skip duplicate check if urgent
  if(category==='Safety and Security'&&!c.isImmediateDanger)return{key:'isImmediateDanger',prompt:'Is anyone in immediate danger right now?',values:['Yes — happening now','No, but it needs urgent attention']};
  if(category==='Safety and Security'&&!isUrgent&&!c.alreadyReported)return{key:'alreadyReported',prompt:'Has this already been flagged to a manager or security?',values:['Yes','Not yet']};
  
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
if(raw.startsWith('A member told me')||raw.startsWith('I noticed something')||raw.startsWith('I want to log feedback')||raw.startsWith('I want to log a compliment')){c.kind=raw.includes('compliment')?'compliment':raw.includes('feedback')?'feedback':'issue';c.reportedBy=raw.startsWith('A member told me')?REPORTED_BY_OPTIONS[1]:raw.startsWith('I noticed')?REPORTED_BY_OPTIONS[0]:REPORTED_BY_OPTIONS[2];c.description='';c._welcomeProcessed=true;if(c.kind==='compliment')c.sentiment='positive';}
else if(raw==='__accept_category__'){c._categoryConfirmed=true;}else if(raw==='__reject_category__'){delete c.category;delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;}else if(raw==='__manual_member__'){c.memberLookupDone=true;c.manualMember=true;}else if(raw==='__studio_report__'){c.memberLookupDone=true;c.memberName=c.reportedBy===REPORTED_BY_OPTIONS[1]?'Member (not named)':'Studio team observation';c.memberEmail='';c.studioReport=true;}else if(raw==='__manual_session__'){c.sessionLookupDone=true;c.manualSession=true;}else if(raw==='__hosted_class__'){c.hostedClass=true;c.classFormat=c.classFormat||'Studio Hosted Class';}else if(raw==='__manual_studio_time__'){
  // User chose to enter studio/time manually — fall through to normal processing
}
else if(['kwality-earlier','kwality-yesterday','fort-earlier','fort-yesterday'].includes(raw)){
  // BUNDLED RESPONSE: Parse studio + incidentAt shortcut
  const parts=raw.split('-');c.studio=parts[0]==='kwality'?'Kwality House, Kemps Corner':'Fort';c.incidentAt=parts[1]==='earlier'?'Earlier today':'Yesterday';
}
else if(raw&&!raw.startsWith('__')){
// Extract cross-cutting facts first. This is deliberately before pending-field binding:
// a location/time update must not become a member name merely because Iris happened to
// be showing the member picker in the previous turn.
applyMessageFacts(c,raw);
if(priorField==='studioAndTime'){
  // The bundled question has no field of its own: its answer carries two. Before this split
  // existed the answer matched no known field and was appended to the description, leaving
  // studio and time empty — so the same question came back every turn, forever.
  const m=matchStudio(raw);if(m)c.studio=m;
  const when=normalizeAnswer('incidentAt',raw,OCCURRED_OPTIONS);if(when)c.incidentAt=when;
  if(!m&&!when)c.description=String(c.description||'')+(c.description?'\n':'')+raw;
}
else if(priorField==='confirmCategory'){
  // The chips send sentinels, but staff also just type "yes". Without this the reply matched no
  // field, landed in the description, and the confirmation was asked again on every turn.
  const v=normalizeAnswer('confirmCategory',raw,['yes','no']);
  if(v==='yes')c._categoryConfirmed=true;
  else if(v==='no'){delete c.category;delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;}
  else c.description=String(c.description||'')+(c.description?'\n':'')+raw;
}
else if(priorField==='memberLookup'){
  if(c.reportedBy!==REPORTED_BY_OPTIONS[1]||c.memberLookupDone){
    c.memberLookupDone=true;c.studioReport=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';
  }else{c.memberLookupDone=true;c.manualMember=true;c.memberName=raw.slice(0,120);}
}
else if(priorField==='sessionLookup'){c.sessionLookupDone=true;c.manualSession=true;c.description=String(c.description||'')+(c.description?'\n':'')+raw;}
else if(priorField&&FIELD_KEYS.includes(priorField)){
  const offered=Array.isArray(c._options)?(c._options as unknown[]).filter((v):v is string=>typeof v==='string'&&!v.startsWith('__')):[];
  const strict=ENUM_FIELDS.has(priorField)&&offered.length>0;
  const value=strict?normalizeAnswer(priorField,raw,offered):raw;
  if(value!==undefined)c[priorField]=value;
  if(priorField==='category'&&value!==undefined){delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;}
  if(priorField==='studio'){const m=matchStudio(raw);if(m)c.studio=m;else if(strict&&value===undefined)delete c.studio;}
}
else if(!/^(yes|no|ok|okay|nope|yeah|yep|nah|sure|thanks|thank you)\W*$/i.test(raw))c.description=String(c.description||'')+(c.description?'\n':'')+raw;
{const heuristic=extractEntities(raw);for(const[k,v]of Object.entries(heuristic)){if(!FIELD_KEYS.includes(k)||v===undefined||c[k])continue;if(k==='studio'){const m=matchStudio(String(v));if(m)c.studio=m;continue;}if(k==='category')c._categoryInferred=true;c[k]=v;}
// Keep scanning the whole conversation, rather than only the first description. A later
// answer often supplies the room, location or timing that was missing at the start.
{const contextExtracted=extractContext(raw);for(const[k,v]of Object.entries(contextExtracted)){if(!c[k])c[k]=v;}}
const top=classifyIssue(String(c.description||raw));if(top[0])c._guess={category:top[0].category,subcategory:top[0].subcategory,score:top[0].score};if(priorField==='description'||!priorField){
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
defaultOperationalFields(c);
const asked=askCounts(c);
// A long conversation that still has open optional fields is a conversation that is not
// converging. Fill them in so the draft — the point of the whole exchange — is reachable.
if(input.history.filter(m=>m.role==='assistant').length>=HARD_CAP)for(const k of SKIPPABLE)if(!c[k])c[k]=SKIP_VALUE[k]||SKIPPED;
let fieldKey:string|undefined,lookup:'members'|'sessions'|undefined,question='',opts:{label:string;value:string}[]|undefined=[];let lookupFilters:{studio?:string;sessionTypes?:string[]}|undefined;
const choose=(key:string,prompt:string,values:string[]=[])=>{fieldKey=key;question=prompt;opts=options(values);};
const classRelated=['Class Experience','Trainer Feedback','Scheduling'].includes(String(c.category));const praise=c.kind==='compliment'||c.kind==='feedback'&&c.sentiment==='positive';
const isStudioReport=c.reportedBy===REPORTED_BY_OPTIONS[0];
const isColleagueReport=c.reportedBy===REPORTED_BY_OPTIONS[2];
const isMemberReport=c.reportedBy===REPORTED_BY_OPTIONS[1];

// CONTEXT-AWARE FLOW: Skip redundant questions based on what we already know
if(!c.description||String(c.description).length<12){
  // Only ask description if welcome was processed (meaning reportedBy is set)
  const descPrompt=c.reportedBy===REPORTED_BY_OPTIONS[1]?'What did the member tell you?':c.reportedBy===REPORTED_BY_OPTIONS[0]?'What did you see?':'Go ahead — describe what happened, in as much detail as you have.';
  choose('description',descPrompt);
}
else if(c.category&&c.subcategory&&c._categoryInferred&&!c._categoryConfirmed){fieldKey='confirmCategory';question=`I've read this as ${String(c.subcategory).toLowerCase()} (${c.category}). File it there?`;opts=[{label:`Yes — ${c.subcategory}`,value:'__accept_category__'},{label:'No, let me pick the category',value:'__reject_category__'}];}
else if(!c.category){
  if(c._guess&&typeof c._guess==='object'&&'score'in c._guess&&(c._guess as unknown as {score:number}).score>3){
    c.category=(c._guess as unknown as {category:string}).category;
    c.subcategory=(c._guess as unknown as {subcategory:string}).subcategory;
    c._categoryInferred=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined});
  }
  fieldKey='category';
  question=praise?'Who or what deserves the recognition?':'What area does this fall under?';
  opts=options(Object.keys(cfg.taxonomy));
}
else if(!c.subcategory){
  fieldKey='subcategory';
  question=praise?'What stood out most?':'Which of these best matches it?';
  opts=options(cfg.taxonomy[String(c.category)]);
}
// SMART MEMBER LOOKUP: If staff observed it themselves or colleague reported it, skip member lookup entirely
else if(!c.memberLookupDone&&(isStudioReport||isColleagueReport||c.studioReport)){
  c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
  return runIris({...input,message:undefined,collected:c,patch:undefined});
}
// Only ask member lookup if the report explicitly came from a member
else if(!c.memberLookupDone){
  if(!isMemberReport){
    c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined});
  }
  fieldKey='memberLookup';
  lookup='members';
  question=`Who is this member? Search Momence, or skip if you'd rather not name them yet.`;
  opts=[{label:'Not member-specific',value:'__studio_report__'},{label:'Enter member details manually',value:'__manual_member__'}];
}
else if(classRelated&&!c.sessionLookupDone){fieldKey='sessionLookup';lookup='sessions';question=`Which class was this? Pick the session and I'll pull in the trainer, studio and time.`;
const hosted=c.hostedClass===true||c.classFormat==='Studio Hosted Class';
lookupFilters={studio:typeof c.studio==='string'&&c.studio!=='—'?c.studio:undefined,sessionTypes:hosted?['private']:undefined};
opts=[{label:'Session not listed / enter manually',value:'__manual_session__'},...(hosted?[]:[{label:'It was a hosted / private class',value:'__hosted_class__'}])];}
else if((!c.studio||c.studio==='—')&&!c.incidentAt&&!c._bundleTried){
  // BUNDLED QUESTION: ask studio + time together. Asked once — if the answer resolves
  // neither, the two fields are asked separately, with chips.
  fieldKey='studioAndTime';
  question=`Which studio is this for, and when'd you notice it?`;
  opts=undefined; // Let AI enhance this conversationally, not structured options
}
else if(!c.studio||c.studio==='—'){
  // Studio cannot be skipped or guessed: it is what routes the ticket to a site.
  const contextNote = c.area ? `Noted for ${c.area}${c.trainer ? ` (${c.trainer}'s session)` : ''}. ` : '';
  choose('studio',contextNote+((asked.studio||0)>=2?'I can\u2019t file this without the location \u2014 which studio was it? Pick one below.':'Which studio location center was this at?'),cfg.studios);
}
else if(!c.incidentAt){
  choose('incidentAt','When did this happen?',[...OCCURRED_OPTIONS]);
}
else if(c.manualMember&&!c.memberName)choose('memberName','What name should go on the ticket?');
else if(c.manualMember&&!c.memberEmail&&!(asked.memberEmail||0))choose('memberEmail','Any contact detail on file for them? (optional \u2014 you can skip)');
else if(classRelated&&c.manualSession&&!c.classFormat)choose('classFormat','Which class format was it?',cfg.formats);
else if(classRelated&&c.manualSession&&!c.trainer)choose('trainer','Who was teaching?', [...cfg.trainers,'Not sure']);
else{const extra=!praise?extraSlot(String(c.category),c):null;if(extra){choose(extra.key,extra.prompt,extra.values);}
else if(!praise&&!c.impact){
  if(c.isClassImpacted==='Yes, blocking now'){c.impact='Could not proceed as normal';return runIris({...input,message:undefined,collected:c,patch:undefined});}
  fieldKey='impact';
  question=`How much is this affecting the floor right now?`;
  opts=undefined;
}
else if(!praise&&!c.requestedResolution){
  fieldKey='requestedResolution';
  question=`What should happen next?`;
  opts=undefined;
}
else if(!praise&&!c.preferredContact){
  if(!isMemberReport){c.preferredContact='Internal log only';return runIris({...input,message:undefined,collected:c,patch:undefined});}
  fieldKey='preferredContact';
  question=`Does the member need a callback, or is this internal-only?`;
  opts=undefined;
}
else if(['Member expects a callback'].includes(String(c.preferredContact))&&!c.memberPhone&&!(asked.memberPhone||0)){
  fieldKey='memberPhone';
  question=`What's the best number to reach them?`;
  opts=undefined;
}}
if(fieldKey&&(asked[fieldKey]||0)>=ASK_LIMIT){
  if(fieldKey==='studioAndTime'){c._bundleTried=true;return runIris({...input,message:undefined,collected:c,patch:undefined});}
  if(SKIPPABLE.has(fieldKey)){c[fieldKey]=SKIP_VALUE[fieldKey]||SKIPPED;return runIris({...input,message:undefined,collected:c,patch:undefined});}
  if(fieldKey==='confirmCategory'){c._categoryConfirmed=true;return runIris({...input,message:undefined,collected:c,patch:undefined});}
  if(fieldKey==='memberLookup'){c.memberLookupDone=true;c.studioReport=true;c.memberName=c.memberName||'Studio team observation';return runIris({...input,message:undefined,collected:c,patch:undefined});}
  if(fieldKey==='sessionLookup'){c.sessionLookupDone=true;c.manualSession=true;return runIris({...input,message:undefined,collected:c,patch:undefined});}
}
if(fieldKey)asked[fieldKey]=(asked[fieldKey]||0)+1;
c._asked=asked;
// Reporter identity is useful context, but it must not block an operational ticket. For
// non-member reports there is no member to identify, and the maintenance defaults above
// provide an actionable next step without asking staff to type "fix it".
const required=['description','category','subcategory','studio','incidentAt',...(isMemberReport?['memberLookupDone']:[]),...(classRelated?['sessionLookupDone']:[]),...(praise?[]:['impact','requestedResolution','preferredContact'])];
// URGENCY OVERRIDE: If blocking right now or needs urgent attention, skip to draft early
const isBlockingNow=c.isClassImpacted==='Yes, blocking now'||c.isImmediateDanger==='Yes — happening now'||c.isImmediateDanger==='No, but it needs urgent attention';
const urgentRequired=isBlockingNow?required.filter(k=>!['alreadyReported','preferredContact','impact','requestedResolution','trainer','classFormat'].includes(k)):required;
let draft:AdvancedDraft|undefined;if(!fieldKey){const cf=obj(c.customFields);draft=await makeDraft({...c,description:c.description,memberName:c.memberName||'Studio team observation',memberEmail:c.memberEmail||'',kind:c.kind,source:'iris',sentiment:praise?'positive':c.sentiment||inferSentiment(String(c.description)),customFields:{...cf,...intakeAnswers(c)},preferredContact:c.preferredContact||'Internal log only',momenceContext:c.momenceContext});// The recap is the deliverable: the reporter needs to see the routing, priority and SLA the
// ticket will carry before approving it, not just be told that a ticket exists.
const recap=['• '+draft.title,`• ${draft.category} → ${draft.subcategory}`,`• ${draft.departmentName}${draft.assignedStaffName?` · ${draft.assignedStaffName}`:''}`,`• ${draft.priority} priority${draft.resolutionRequired&&draft.slaLabel?` · ${draft.slaLabel}`:''}`,`• ${draft.studio}${draft.incidentAt?` · ${draft.incidentAt}`:''}`].join('\n');
question=(praise?'This is ready to log — no SLA or resolution is needed for a compliment.':'Here\u2019s the ticket, ready to file.')+'\n\n'+recap+'\n\nReview it, then approve when it\u2019s accurate.';}
// The acknowledgement is written once, by the model, inside the block above. A second canned
// one prefixed here is what produced "Understood. Understood, you spotted the mic issue...".

if(ai&&engine==='openai'&&fieldKey&&!fieldKey.includes('Lookup')){
  const guided=question;
  try{
    const history=cfg.historyRetrieval&&c.category&&c.subcategory?await historicalExamples(String(c.category),String(c.subcategory)):[];
    const known=JSON.stringify({kind:c.kind,category:c.category,subcategory:c.subcategory,studio:c.studio,area:c.area,when:c.incidentAt,reportedBy:c.reportedBy,classImpact:c.isClassImpacted,urgency:detectUrgency(c)?'flagged':'normal'});
    
    // Determine if we should write a smart question or just an ack
    const askCount=(asked[fieldKey]||0);
    const recentFields=Object.keys(asked).slice(-2); // Last 2 fields asked
    const shouldWriteQuestion=askCount===1&&fieldKey!==priorField; // First time asking this field, AND it's different from prior
    const targetDesc=FIELD_DESCRIPTIONS[fieldKey]||String(fieldKey);
    
    const systemPrompt=shouldWriteQuestion?
      `You are Iris, the internal logging assistant for Physique 57 India studio staff (never members). ${cfg.aiVoice}
You are collecting facts so this report becomes an actionable ticket. You are concise, context-aware, warm, professional, and smart.
Facts already collected (NEVER ask for any of these again): ${known}
What they reported: ${String(c.description||'').slice(0,300)}
${history.length?`Similar past tickets for reference: ${JSON.stringify(history)}`:''}

Your task: Write a single smart, context-aware question asking for: ${targetDesc}.
CRITICAL GUIDELINES:
- If the user already mentioned a room (e.g. "Studio 2", "Strength Studio"), acknowledge that room, and ask ONLY for the missing facility studio location center (e.g. Kwality House Kemps Corner, Supreme HQ Bandra, Fort, Kenkere House).
- Do NOT ask who reported the issue if context shows it's a staff or colleague report.
- Do NOT ask for facts already in context.
- Keep it brief, conversational, and direct (one sentence, max 20 words).
- Do NOT repeat questions from this conversation: ${JSON.stringify(recentFields)}
- Output ONLY the question. No preamble, no options, no follow-up.`
    :`You are Iris, the internal logging assistant for Physique 57 India studio staff. ${cfg.aiVoice}
Facts already collected: ${known}
What they reported: ${String(c.description||'').slice(0,300)}
${history.length?`Similar past tickets, for tone only: ${JSON.stringify(history)}`:''}

Write ONE brief context-aware acknowledgement of their last answer: at most 12 words, plain text, no markdown. Do not ask a question. Do not greet or chatter. Output the sentence only.`;

    const result=await ai.chat.completions.create({model:cfg.aiModel,messages:[{role:'system',content:systemPrompt},...input.history.slice(-8),...(raw?[{role:'user' as const,content:raw}]:[])],max_completion_tokens:60});
    const response=(result.choices[0]?.message.content||'').trim().replace(/^["']|["']$/g,'');
    
    if(shouldWriteQuestion){
      // Use the AI-generated question if it looks good (has question mark, doesn't look like small talk)
      const isGoodQuestion=/[?!]$/.test(response)&&response.split(/\s+/).length<=20&&!/(anything else|feel free|happy to help|let me know|thanks)/i.test(response);
      if(isGoodQuestion){
        question=response;
      }
    } else {
      // Write an acknowledgement before the guided question
      const ack=response;
      const chatter=/(anything else|feel free|reach out|happy to help|let me know|no worries|keep an eye|thank|i'?ll |i will |i have (noted|logged))/i;
      const echo=/^(yes|no|okay|ok|sure|right|correct)\b[.!]?$/i.test(ack);
      if(ack&&!echo&&!ack.includes('?')&&ack.split(/\s+/).length<=16&&!chatter.test(ack))question=ack.replace(/\s+$/,'')+' '+guided;
    }
  }catch{engine='guided';}
}
if(c.category==='Safety and Security'&&!c._safetyShown){question='If anyone is in immediate danger, alert studio management or call 112 now. '+question;c._safetyShown=true;}

// The acknowledgement is written once, by the model, inside the block above. A second canned
// one prefixed here is what produced "Understood. Understood, you spotted the mic issue...".

c._fieldKey=fieldKey||'';
c._options=(opts||[]).map(o=>o.value);
const done=urgentRequired.filter(k=>Boolean(c[k])).length;
return{sessionId:input.sessionId,message:question,phase:draft?'draft':'collect',fieldKey,lookup,lookupFilters,options:opts,collected:c,draft,progress:{done,total:urgentRequired.length},engine,notice};}
