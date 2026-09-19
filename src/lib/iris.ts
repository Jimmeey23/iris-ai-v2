import OpenAI from 'openai';
import {getConfig,credentials} from './config';
import {extractEntities,inferSentiment,classifyIssue,matchStudio} from './classifier';
import {makeDraft,historicalExamples} from './tickets';
import {listMomence,obj} from './momence';
import {extractContext,determineSkippableFields} from './context-extractor';
import {STUDIO_AREAS,SYSTEMS,OCCURRED_OPTIONS,REPORTED_BY_OPTIONS,STAGES_SC3_PARTS,STAGES_SC3_TROUBLESHOOTING,CYCLE_INTAKE_QUESTIONS} from './constants';
import type {IrisTurn,IrisMessage} from './iris-contract';
import type {AdvancedDraft} from './ticket-contract';

const FIELD_KEYS=['category','subcategory','kind','description','studio','classFormat','trainer','membership','memberName','memberEmail','memberPhone','incidentAt','preferredContact','requestedResolution','impact','sentiment','area','systemName','itemDescription','lastSeen','isClassImpacted','isImmediateDanger','alreadyReported','channelOfIssue','reportedBy','bikeNumber','cycleIssueType','cyclePart','cycleFirstOrRecurring','cycleReporterAction'];
const options=(values:string[])=>values.map(value=>({label:value,value}));

/** Fields whose offered chips are the whole answer space: a value that is not one of them is
 *  not a rougher version of the answer, it is unusable. Routing, SLA rules, dedup and every
 *  report read these by exact value, so an unmatched answer is dropped and the question is
 *  asked again rather than written onto the ticket as prose. */
const ENUM_FIELDS=new Set(['category','subcategory','studio','reportedBy','incidentAt','area','systemName','isClassImpacted','isImmediateDanger','alreadyReported','lastSeen','channelOfIssue','classFormat']);
/** Fields the flow can file without, once asking has clearly stopped working. */
const SKIPPABLE=new Set(['impact','requestedResolution','preferredContact','area','alreadyReported','isClassImpacted','systemName','itemDescription','lastSeen','channelOfIssue','trainer','classFormat','incidentAt','cycleIssueType','cyclePart','cycleFirstOrRecurring','cycleReporterAction']);
const SKIP_VALUE:Record<string,string>={trainer:'Not sure',incidentAt:'Ongoing / recurring',cycleFirstOrRecurring:'Not sure',cycleReporterAction:'Not specified'};
const SKIPPED='Not specified';
/** How many times one field may be asked before the flow stops waiting on it. Without this a
 *  question whose answer never lands is asked forever — the conversation reads as a loop and
 *  no ticket is ever produced. */
const ASK_LIMIT=3;
/** After this many Iris turns, every skippable field is filled in so the draft can be reached. */
const HARD_CAP=18;

const TIME_SYNONYMS:Record<string,string>={'right now':'Just now','just now':'Just now','moment ago':'Just now','this morning':'Earlier today','this afternoon':'Earlier today','this evening':'Earlier today','earlier today':'Earlier today','today':'Earlier today','yesterday':'Yesterday','this week':'Earlier this week','few days':'Earlier this week','last week':'Last week','keeps happening':'Ongoing / recurring','every day':'Ongoing / recurring','recurring':'Ongoing / recurring','ongoing':'Ongoing / recurring'};
/** What the model proposes for the next exchange, alongside the facts it extracted.
 *  It is a proposal only: the deterministic flow below decides which field is actually
 *  next, and the merge keeps the wording and the tappable answers from disagreeing. */
type ProposedTurn={ack?:string;nextField?:string;question?:string;options?:{label:string;value:string}[]};

/** Fields whose answers are free text downstream, so the model may invent tappable
 *  answers for them. Every other field's answers must come from its canonical list —
 *  later branches compare those values exactly, and a paraphrase breaks the flow. */
const MODEL_MAY_PROPOSE_OPTIONS=new Set(['impact','requestedResolution','studioAndTime']);

/** Chatter the acknowledgement must never contain: it is one clause about what they just
 *  said, not a customer-service sign-off. */
const ACK_CHATTER=/(anything else|feel free|reach out|happy to help|let me know|no worries|keep an eye|thank|i'?ll |i will |i have (noted|logged))/i;

/** An acknowledgement is usable when it is short, is not itself a question, and is not
 *  merely echoing the word the reporter just typed. */
function usableAck(ack:string):boolean{
  const t=ack.trim();
  if(!t||t.includes('?'))return false;
  if(t.split(/\s+/).length>16)return false;
  if(/^(yes|no|okay|ok|sure|right|correct)\b[.!]?$/i.test(t))return false;
  return !ACK_CHATTER.test(t);
}

/** A model-written question stands in for the guided one only when it is a single short
 *  question and not small talk. */
function usableQuestion(q:string):boolean{
  const t=q.trim();
  if(!/[?]$/.test(t))return false;
  if(t.split(/\s+/).length>22)return false;
  return !/(anything else|feel free|happy to help|let me know|thanks)/i.test(t);
}

/**
 * Reads one string value out of JSON that is still arriving.
 *
 * The acknowledgement is the first thing the model writes, so it can be shown while the rest
 * of the turn is still being generated — that is the whole point of streaming here. Returns
 * the characters decoded so far and whether the value has closed.
 */
export function scanStreamedString(buffer:string,key:string):{value:string;closed:boolean}{
  const at=buffer.indexOf(`"${key}"`);
  if(at<0)return{value:'',closed:false};
  let i=buffer.indexOf(':',at+key.length+2);
  if(i<0)return{value:'',closed:false};
  i++;
  while(i<buffer.length&&/\s/.test(buffer[i]))i++;
  if(i>=buffer.length)return{value:'',closed:false};
  if(buffer[i]!=='"')return{value:'',closed:true};   // null, or some other type: nothing to show
  i++;
  let out='';
  while(i<buffer.length){
    const ch=buffer[i];
    if(ch==='\\'){
      const next=buffer[i+1];
      if(next===undefined)return{value:out,closed:false};   // escape split across chunks
      out+=({n:'\n',t:'\t',r:'\r',b:'\b',f:'\f','"':'"','\\':'\\','/':'/'} as Record<string,string>)[next]??next;
      i+=2;
      continue;
    }
    if(ch==='"')return{value:out,closed:true};
    out+=ch;
    i++;
  }
  return{value:out,closed:false};
}

/**
 * Combine the scripted turn with the model's proposal.
 *
 * The flow owns which field is next and which answers are valid; the model owns the words.
 * Keeping that split is what stops the question and the chips below it from describing two
 * different questions — the failure that showed up as "Which studio location…?" sitting
 * above "Yes, Late Arrival / No, let me pick the category".
 */
export function mergeProposedTurn({fieldKey,question,options,proposed}:{
  fieldKey:string;
  question:string;
  options?:{label:string;value:string}[];
  proposed:ProposedTurn;
}):{question:string;options?:{label:string;value:string}[]}{
  const canonical=options||[];
  const pickerTurn=fieldKey.includes('Lookup');
  let text=question;
  let opts=options;

  // Its question stands in only when it is asking for the field the flow actually chose.
  if(!pickerTurn&&proposed.nextField===fieldKey&&proposed.question&&usableQuestion(proposed.question)){
    text=proposed.question.trim();
  }

  if(pickerTurn){/* the picker supplies its own choices */}
  else if(canonical.length&&proposed.options?.length){
    // Relabel the canonical answers, never redefine them: every value the flow offered
    // survives, so normalizeAnswer still recognises whatever comes back.
    const byValue=new Map(proposed.options.map(o=>[o.value.trim().toLowerCase(),o.label.trim()]));
    opts=canonical.map(o=>{const relabel=byValue.get(o.value.trim().toLowerCase());return relabel?{label:relabel,value:o.value}:o;});
  }else if(!canonical.length&&proposed.options?.length&&MODEL_MAY_PROPOSE_OPTIONS.has(fieldKey)){
    // Fields with no scripted answers are the ones that read as an interrogation: a bare
    // "How much is this affecting the floor right now?" over an empty text box. The model
    // may offer concrete answers here, because these values are stored as free text.
    const seen=new Set<string>();
    opts=proposed.options.filter(o=>{const k=o.value.trim().toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true;});
  }

  // The acknowledgement leads, the question follows — one sentence of having been heard.
  if(proposed.ack&&usableAck(proposed.ack)){
    text=proposed.ack.trim().replace(/[\s.]+$/,'')+'. '+text;
  }
  return {question:text,options:opts};
}

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
  confirmCategory: "whether the inferred ticket category matches what occurred",
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
    if(top&&top.score>=5){
      c.category=top.category;
      c.subcategory=top.subcategory;
      c._categoryInferred=true;
      if(top.score>=6)c._categoryConfirmed=true;
    }
  }

  const isFacilityCat = ['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems'].includes(String(c.category));
  if(isFacilityCat || c.reportedBy!==REPORTED_BY_OPTIONS[1]){
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
  const maintenance=['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems','Safety and Security','Inventory and Supplies'].includes(String(c.category));
  if(!maintenance)return;
  if(!c.impact||c._operationalImpactDefault){
    c.impact=c.isClassImpacted==='Yes, blocking now'?`Class interrupted / blocking floor operations in ${c.area||'studio'}`:c.isClassImpacted==='Not yet, but it will be'?`Likely to affect upcoming sessions in ${c.area||'studio'}`:`Operational issue reported${c.area?` in ${c.area}`:''}`;
    c._operationalImpactDefault=true;
  }
  if(!c.requestedResolution||c._operationalResolutionDefault){
    const sub=String(c.subcategory||'issue').toLowerCase();
    c.requestedResolution=`Inspect and resolve ${sub}${c.area?` in ${c.area}`:''}.`;
    c._operationalResolutionDefault=true;
  }
  if(!c.preferredContact||c._operationalContactDefault){
    c.preferredContact='Internal log only';
    c._operationalContactDefault=true;
  }
  if(!c.memberLookupDone){
    c.memberLookupDone=true;
    c.memberName=c.memberName||'Studio team observation';
    c.memberEmail='';
    c.studioReport=true;
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

  // PowerCycle / Stages SC3 bike-specific intake questions
  const isCycleRelated=isMaintenance&&(/\b(bike|cycle|powercycle|power cycle|spin|pedal|flywheel|resistance|crank|handlebar|fitloc|console|saddle|belt|sprint\s?shift)\b/i.test(String(c.description||''))||/powercycle/i.test(String(c.area||''))||/powercycle/i.test(String(c.classFormat||'')));
  if(isCycleRelated){
    if(!c.bikeNumber)return{key:'bikeNumber',prompt:'Which bike number is this about? (e.g. Bike #3, Bike 7)',values:[]};
    if(!c.cycleIssueType){
      // Auto-match from description if possible
      const desc=String(c.description||'').toLowerCase();
      const autoMatch=STAGES_SC3_TROUBLESHOOTING.find(t=>t.keywords.some(kw=>desc.includes(kw)));
      if(autoMatch){c.cycleIssueType=autoMatch.symptom;c.cyclePart=STAGES_SC3_PARTS.find(p=>p.id===autoMatch.partId)?.name;return null;}
      return{key:'cycleIssueType',prompt:'What exactly is the issue with this bike?',values:STAGES_SC3_TROUBLESHOOTING.map(t=>t.symptom)};
    }
    if(!c.cyclePart){
      // Auto-fill from matched troubleshooting entry
      const matched=STAGES_SC3_TROUBLESHOOTING.find(t=>t.symptom===c.cycleIssueType);
      if(matched){c.cyclePart=STAGES_SC3_PARTS.find(p=>p.id===matched.partId)?.name;}
      else return{key:'cyclePart',prompt:'Which part of the bike is affected?',values:STAGES_SC3_PARTS.map(p=>p.name)};
    }
    if(!c.cycleFirstOrRecurring)return{key:'cycleFirstOrRecurring',prompt:'Is this the first time this has happened on this bike, or has it happened before?',values:['First time','Recurring \u2014 happened before','Not sure']};
    if(!c.cycleReporterAction)return{key:'cycleReporterAction',prompt:'What did you do when you noticed it?',values:['Took bike out of rotation','Flagged it but class continued','Member reported mid-class','Noticed during setup/walkthrough']};
  }

  return null;
}

/** The intake answers that belong on the ticket. Undefined keys are dropped so the
 *  stored JSON stays readable. */
function intakeAnswers(c:Record<string,unknown>){
  const out:Record<string,unknown>={reportedBy:c.reportedBy,sessionContext:c.sessionContext,area:c.area,systemName:c.systemName,isClassImpacted:c.isClassImpacted,isImmediateDanger:c.isImmediateDanger,alreadyReported:c.alreadyReported,itemDescription:c.itemDescription,lastSeen:c.lastSeen,channelOfIssue:c.channelOfIssue,occurredAt:occurredAtIso(c.incidentAt),bikeNumber:c.bikeNumber,cycleIssueType:c.cycleIssueType,cyclePart:c.cyclePart,cycleFirstOrRecurring:c.cycleFirstOrRecurring,cycleReporterAction:c.cycleReporterAction};
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

function getIstTimeGreeting(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(formatter.format(new Date()), 10);
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 22) return 'Good evening';
    return 'Good evening';
  } catch {
    return 'Hello';
  }
}

export async function irisWelcome(
  sessionId: string,
  preset?: { category?: string; subcategory?: string }
): Promise<IrisTurn> {
  const c = preset?.category ? { category: preset.category, subcategory: preset.subcategory } : {};
  const greeting = getIstTimeGreeting();

  let message = `${greeting}! I'm Iris, your studio operations co-pilot across Kwality House, Supreme HQ Bandra, Kenkere House & Courtside.\n\nTell me what you noticed on the floor, in any studio room, or what a member flagged. You can speak with voice or type naturally — I'll capture all details, room capacities, and route it to the right department.`;

  if (preset?.category) {
    message = `${greeting}! Let's log this ${preset.category}${preset.subcategory ? ` · ${preset.subcategory}` : ''} ticket.\n\nGo ahead and describe what happened on the floor, or who flagged it — I'll compile the ticket details directly.`;
  }

  return {
    sessionId,
    message,
    phase: 'welcome',
    fieldKey: 'description',
    options: [
      { label: 'A member reported an issue to me', value: 'A member told me about an issue and I need to log it.' },
      { label: 'I noticed something myself on the floor', value: 'I noticed something on the floor that needs attention.' },
      { label: 'Trainer or class scheduling feedback', value: 'I want to log feedback about a class or a trainer.' },
      { label: 'Log a compliment from a member', value: 'I want to log a compliment a member shared.' },
    ],
    collected: c,
    progress: { done: 0, total: 8 },
    engine: (await credentials('chatgpt')).api_key ? 'openai' : 'guided',
  };
}

export async function runIris(input:{sessionId:string;collected:Record<string,unknown>;message?:string;fieldKey?:string;history:IrisMessage[];selectionApplied?:boolean;patch?:Record<string,unknown>;proposedTurn?:ProposedTurn;onAckDelta?:(text:string)=>void}):Promise<IrisTurn>{const cfg=await getConfig();const c={...input.collected,...input.patch};const raw=(input.message||'').trim();const priorField=input.fieldKey;
// A turn that skips a field re-enters this function with no message, so the model is not
// called again. Its proposal rides along instead of being thrown away mid-turn.
let proposed:ProposedTurn=input.proposedTurn||{};const connection=await credentials('chatgpt');const key=connection._enabled==='false'?undefined:connection.api_key;let engine:'openai'|'guided'=cfg.aiEnabled&&key?'openai':'guided';let notice:string|undefined;let ai:OpenAI|undefined;
if(engine==='openai')ai=new OpenAI({apiKey:key,timeout:20000,maxRetries:1});
if(raw.startsWith('A member told me')||raw.startsWith('I noticed something')||raw.startsWith('I want to log feedback')||raw.startsWith('I want to log a compliment')){c.kind=raw.includes('compliment')?'compliment':raw.includes('feedback')?'feedback':'issue';c.reportedBy=raw.startsWith('A member told me')?REPORTED_BY_OPTIONS[1]:raw.startsWith('I noticed')?REPORTED_BY_OPTIONS[0]:REPORTED_BY_OPTIONS[2];c.description='';c._welcomeProcessed=true;if(c.kind==='compliment')c.sentiment='positive';}
else if(raw==='__accept_category__'){c._categoryConfirmed=true;}else if(raw==='__reject_category__'){delete c.category;delete c.subcategory;delete c._guess;c._categoryRejected=true;c._categoryInferred=false;c._categoryConfirmed=true;}else if(raw==='__manual_member__'){c.memberLookupDone=true;c.manualMember=true;}else if(raw==='__studio_report__'){c.memberLookupDone=true;c.memberName=c.reportedBy===REPORTED_BY_OPTIONS[1]?'Member (not named)':'Studio team observation';c.memberEmail='';c.studioReport=true;}else if(raw==='__manual_session__'){c.sessionLookupDone=true;c.manualSession=true;}else if(raw==='__hosted_class__'){c.hostedClass=true;c.classFormat=c.classFormat||'Studio Hosted Class';}else if(raw==='__manual_studio_time__'){
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
  else if(v==='no'){delete c.category;delete c.subcategory;delete c._guess;c._categoryRejected=true;c._categoryInferred=false;c._categoryConfirmed=true;}
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
  if(priorField==='category'&&value!==undefined){delete c.subcategory;c._categoryInferred=false;c._categoryConfirmed=true;delete c._categoryRejected;}
  if(priorField==='studio'){const m=matchStudio(raw);if(m)c.studio=m;else if(strict&&value===undefined)delete c.studio;}
}
else if(!/^(yes|no|ok|okay|nope|yeah|yep|nah|sure|thanks|thank you)\W*$/i.test(raw))c.description=String(c.description||'')+(c.description?'\n':'')+raw;
{const heuristic=extractEntities(raw);for(const[k,v]of Object.entries(heuristic)){if(!FIELD_KEYS.includes(k)||v===undefined||c[k])continue;if(k==='studio'){const m=matchStudio(String(v));if(m)c.studio=m;continue;}if(k==='category')c._categoryInferred=true;c[k]=v;}
// Keep scanning the whole conversation, rather than only the first description. A later
// answer often supplies the room, location or timing that was missing at the start.
{const contextExtracted=extractContext(raw);for(const[k,v]of Object.entries(contextExtracted)){if(!c[k])c[k]=v;}}
const top=classifyIssue(String(c.description||raw));if(top[0]&&!c._categoryRejected)c._guess={category:top[0].category,subcategory:top[0].subcategory,score:top[0].score};if(priorField==='description'||!priorField){
const nameMatch=raw.match(/(?:her name is|his name is|the member is|member's name is)\s+([a-z]+(?:\s+[a-z]+)?)(?=[,.!]|$)/i);if(nameMatch)c.memberName=nameMatch[1];
if(/\b(loved|love|amazing|compliment|wonderful|excellent|fantastic|appreciation)\b/i.test(raw)&&!/(but |however|unsafe|complaint|not |didn.t)/i.test(raw)){c.kind='compliment';c.sentiment='positive';}else c.kind=c.kind||'issue';
}
}
// The model runs on EVERY turn — the opening description, a typed answer, and a tapped chip
// alike. Gating it to the first message is what made the rest of the conversation feel like a
// form: from turn two on, every reply was a scripted string. Its extracted `fields` are only
// trusted on the description turn; elsewhere the terse answer to "Which studio?" is bound by
// the deterministic rules above and only the wording it proposes is used.
const trustModelFields=priorField==='description'||!priorField;
if(ai){try{
// Grounding the one call properly is what the second call used to be for: examples of how
// tickets like this one read, and whether this is an emergency or a note for later.
const guessCat=String(c.category||obj(c._guess).category||'');
const guessSub=String(c.subcategory||obj(c._guess).subcategory||'');
const examples=cfg.historyRetrieval&&guessCat&&guessSub?await historicalExamples(guessCat,guessSub):[];
const urgent=detectUrgency(c);
const toolDefs:OpenAI.Chat.Completions.ChatCompletionTool[]=[{type:'function',function:{name:'find_momence',description:'Find member or session suggestions from Momence to help identify who or what this is about. Never select a record on the user’s behalf.',parameters:{type:'object',properties:{module:{type:'string',enum:['members','sessions']},query:{type:'string'}},required:['module','query'],additionalProperties:false}}}];
const messages:OpenAI.Chat.Completions.ChatCompletionMessageParam[]=[{role:'system',content:`You are Iris, the internal logging assistant for Physique 57 India studio staff. Staff use you to record issues, snags and feedback they noticed or were told about by a member — you do not talk to members directly. Extract only facts explicitly provided. Return JSON {"fields":{...}}. Allowed fields: ${FIELD_KEYS.join(',')}. kind: issue/request/compliment/feedback. Exact taxonomy: ${JSON.stringify(cfg.taxonomy)}. Exact studios: ${JSON.stringify(cfg.studios)}.
Studio Knowledge & Room Layouts:
- Kwality House (Kemps Corner): Studio 1 (capacity: 22 pax), Studio 2 (capacity: 13 pax), Strength Studio (capacity: 7 pax), PowerCycle Studio (capacity: 10 pax), His Space (men's washroom), Her Space (women's washroom), GUEST WASHROOM, Brain Cell (office space), Pantry, Lobby / Reception. Note: "His Space", "Her Space", "Guest Washroom", "Brain Cell", and "Pantry" are strictly at Kwality House!
- Supreme HQ Bandra: 3 studios (2 regular studios: Studio 1 & 2 of capacity 13 pax each, 1 PowerCycle studio capacity 13 pax), Lobby / Reception, Lockers, Washrooms.
- Kenkere House (Bengaluru): 2 studios (Studio 1 & 2 of capacity 13 pax each), Lobby / Reception, Washroom & changing.
- Courtside (Mumbai) & Copper & Cloves (Bengaluru): Main Studio Floor, Reception, Lounge.

PowerCycle / Stages SC3 Bike Knowledge (use when issue involves bikes/cycles):
- Model: Stages SC3 / SC3.20 / SC3.22 indoor cycles
- Key parts: ${STAGES_SC3_PARTS.map(p=>`${p.name} (${p.tools}${p.torque?', torque: '+p.torque:''})`).join('; ')}
- Common issues: ${STAGES_SC3_TROUBLESHOOTING.map(t=>`"${t.symptom}" → ${t.partId}, severity: ${t.severity}`).join('; ')}
- CRITICAL: Left pedal (CR-L) is REVERSE THREADED. Flywheel scraping = immediately remove bike from rotation.
- When a bike issue is reported, extract: bikeNumber (e.g. "Bike #3"), cycleIssueType (symptom match), cyclePart (affected part), cycleFirstOrRecurring (first time / recurring).

Do not guess a member, class, date, studio or contact detail — a room reference such as "Studio 1" or "Studio 2" names a room inside a location and is NOT a studio, so leave studio unset for those unless it's a unique room like His Space, Her Space, or Brain Cell (which automatically implies Kwality House). Do not convert safety reports into compliments. Studio aliases: kemps/kwality→Kwality House, Kemps Corner; shq/supreme/bandra→Supreme HQ, Bandra; kenkere/indiranagar→Kenkere House, Bengaluru; courtside→Courtside, Mumbai; copper/cloves/c&c→the Studio by Copper & Cloves, Bengaluru. Correct earlier facts when explicitly corrected. Tools provide suggestions, not identity verification.

SECOND JOB — write the next exchange. Staff should feel talked to, not interrogated, so the
same call that reads the facts also proposes the reply. Return:
{"turn":{"ack":"...","nextField":"...","question":"...","options":[{"label":"...","value":"..."}]},"fields":{...}}
Emit the keys in exactly that order, with turn.ack first — it is shown to the reporter while the rest of your answer is still being written, so anything before it is dead air.
- ack: at most 14 words reacting to what they just said, in ${cfg.aiVoice?'the studio voice':'a warm, professional voice'}. No question, no sign-off, no thanks. Omit when there is nothing new to react to.
- nextField: the single most useful field still missing. These are the fields and what each one means: ${JSON.stringify(FIELD_DESCRIPTIONS)}. Never name a field already present in Current facts.
- question: one sentence, at most 22 words, asking only for nextField.
- options: 2-6 short tappable answers for that field. Use the exact allowed values for category (taxonomy keys), subcategory (taxonomy values), studio (exact studios) and when (${JSON.stringify(OCCURRED_OPTIONS)}). For impact or what-should-happen-next, write your own concrete options drawn from what they reported. Omit options when the answer is genuinely open text.

TURN STATE (this part changes every turn; everything above it does not, so it is kept last):
- Current facts: ${JSON.stringify(c)}
- Heuristic classification hint (trust it unless the message clearly contradicts it): ${JSON.stringify(c._guess||null)}
${examples.length?`- How tickets like this one have read before, for tone and for what usually matters — do not copy them: ${JSON.stringify(examples)}`:''}
${urgent?'- This report carries urgency signals: keep the reply short, lead with the operational next step, and do not ask for optional detail.':''}`},...input.history.slice(-12),{role:'user',content:raw}];

// One pass of the model, streamed when the caller wants the acknowledgement live.
// The ack is the first key the model writes, so it reaches the reporter while the rest of the
// turn — the field decision, the question, the options — is still being generated.
type Pass={content:string;toolCalls:OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]};
const runPass=async(withTools:boolean):Promise<Pass>=>{
  const body={model:cfg.aiModel,messages,...(withTools?{tools:toolDefs}:{}),response_format:{type:'json_object' as const},max_completion_tokens:1200};
  if(!input.onAckDelta){
    const r=await ai!.chat.completions.create(body);
    const m=r.choices[0]?.message;
    return{content:m?.content||'',toolCalls:(m?.tool_calls||[]) as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]};
  }
  const stream=await ai!.chat.completions.create({...body,stream:true});
  let content='',sent=0;
  // Tool-call deltas arrive in fragments keyed by position, so they are reassembled here.
  const slots=new Map<number,{id:string;name:string;args:string}>();
  for await(const chunk of stream){
    const d=chunk.choices[0]?.delta;
    if(d?.content){
      content+=d.content;
      const {value}=scanStreamedString(content,'ack');
      if(value.length>sent){input.onAckDelta(value.slice(sent));sent=value.length;}
    }
    for(const tc of d?.tool_calls||[]){
      const slot=slots.get(tc.index)||{id:'',name:'',args:''};
      if(tc.id)slot.id=tc.id;
      if(tc.function?.name)slot.name+=tc.function.name;
      if(tc.function?.arguments)slot.args+=tc.function.arguments;
      slots.set(tc.index,slot);
    }
  }
  const toolCalls=[...slots.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>({id:v.id,type:'function' as const,function:{name:v.name,arguments:v.args}}));
  return{content,toolCalls};
};
let pass=await runPass(true);
const calls=pass.toolCalls;if(calls.length){messages.push({role:'assistant',content:pass.content||null,tool_calls:calls});for(const call of calls){if(call.type!=='function')continue;let output:unknown;try{const args=obj(JSON.parse(call.function.arguments));if(!['members','sessions'].includes(String(args.module)))throw new Error('Invalid module');const found=await listMomence(args.module as 'members'|'sessions',{query:String(args.query||''),pageSize:5});output={source:found.source,suggestions:found.items.map(i=>({id:i.id,name:i.name}))};}catch{output={error:'Lookup unavailable. Ask the user to search and select manually.'};}messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(output)});}pass=await runPass(false);}
const parsed=obj(JSON.parse(pass.content||'{}'));
const rawTurn=obj(parsed.turn);
proposed={
  ack:typeof rawTurn.ack==='string'?rawTurn.ack:undefined,
  nextField:typeof rawTurn.nextField==='string'?rawTurn.nextField:undefined,
  question:typeof rawTurn.question==='string'?rawTurn.question:undefined,
  options:Array.isArray(rawTurn.options)?rawTurn.options.map(obj).filter(o=>typeof o.label==='string'&&typeof o.value==='string').map(o=>({label:String(o.label).slice(0,60),value:String(o.value).slice(0,120)})).slice(0,6):undefined,
};
const fields=trustModelFields?obj(parsed.fields):{};for(const[k,v]of Object.entries(fields)){if(!FIELD_KEYS.includes(k)||typeof v!=='string'||v.length>=20000)continue;
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
}
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
const isFacilityCat = ['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems'].includes(String(c.category));

if(!c.description||String(c.description).length<12){
  // Only ask description if welcome was processed (meaning reportedBy is set)
  const descPrompt=c.reportedBy===REPORTED_BY_OPTIONS[1]?'What did the member tell you?':c.reportedBy===REPORTED_BY_OPTIONS[0]?'What did you see?':'Go ahead — describe what happened, in as much detail as you have.';
  choose('description',descPrompt);
}
else if(c.category&&c.subcategory&&c._categoryInferred&&!c._categoryConfirmed){
  if(c.area || c.studio || isFacilityCat || (c._guess && typeof c._guess === 'object' && 'score' in c._guess && (c._guess as {score:number}).score >= 5)){
    c._categoryConfirmed = true;
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
  }
  fieldKey='confirmCategory';
  question=`I've read this as ${String(c.subcategory).toLowerCase()} (${c.category}). File it there?`;
  opts=[{label:`Yes — ${c.subcategory}`,value:'__accept_category__'},{label:'No, let me pick the category',value:'__reject_category__'}];
}
else if(!c.category){
  if(!c._categoryRejected&&c._guess&&typeof c._guess==='object'&&'score'in c._guess&&(c._guess as unknown as {score:number}).score>3){
    c.category=(c._guess as unknown as {category:string}).category;
    c.subcategory=(c._guess as unknown as {subcategory:string}).subcategory;
    c._categoryInferred=true;
    c._categoryConfirmed=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
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
// SMART MEMBER LOOKUP: If staff observed it themselves, colleague reported, facility issue, or non-member issue, skip member lookup entirely
else if(!c.memberLookupDone&&(isStudioReport||isColleagueReport||c.studioReport||isFacilityCat||!isMemberReport)){
  c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
  return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
}
// Only ask member lookup if the report explicitly came from a member
else if(!c.memberLookupDone){
  if(!isMemberReport){
    c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
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
  fieldKey='studioAndTime';
  question=`Which studio is this for, and when'd you notice it?`;
  opts=undefined;
}
else if(!c.studio||c.studio==='—'){
  const contextNote = c.area ? `Noted for ${c.area}${c.trainer ? ` (${c.trainer}'s session)` : ''}. ` : '';
  choose('studio',contextNote+((asked.studio||0)>=2?'I can\u2019t file this without the location \u2014 which studio was it? Pick one below.':'Which studio location center was this at?'),cfg.studios);
}
else if(!c.incidentAt){
  if(isFacilityCat){
    c.incidentAt = 'Earlier today';
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
  }
  choose('incidentAt','When did this happen?',[...OCCURRED_OPTIONS]);
}
else if(c.manualMember&&!c.memberName)choose('memberName','What name should go on the ticket?');
else if(c.manualMember&&!c.memberEmail&&!(asked.memberEmail||0))choose('memberEmail','Any contact detail on file for them? (optional \u2014 you can skip)');
else if(classRelated&&c.manualSession&&!c.classFormat)choose('classFormat','Which class format was it?',cfg.formats);
else if(classRelated&&c.manualSession&&!c.trainer)choose('trainer','Who was teaching?', [...cfg.trainers,'Not sure']);
else{const extra=!praise?extraSlot(String(c.category),c):null;if(extra){choose(extra.key,extra.prompt,extra.values);}
else if(!praise&&!c.impact){
  if(c.isClassImpacted==='Yes, blocking now'){c.impact='Could not proceed as normal';return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
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
  if(!isMemberReport){c.preferredContact='Internal log only';return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
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
  if(fieldKey==='studioAndTime'){c._bundleTried=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(SKIPPABLE.has(fieldKey)){c[fieldKey]=SKIP_VALUE[fieldKey]||SKIPPED;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='confirmCategory'){c._categoryConfirmed=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='memberLookup'){c.memberLookupDone=true;c.studioReport=true;c.memberName=c.memberName||'Studio team observation';return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='sessionLookup'){c.sessionLookupDone=true;c.manualSession=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
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

// The model already wrote this turn in the same call that read the facts, so there is no
// second round-trip here. What remains is a merge: the flow above owns WHICH field is next
// and which answers are valid, the model owns the words. Wording and chips can no longer
// drift apart, because the chips are only ever relabelled — never redefined.
if(engine==='openai'&&fieldKey){
  const merged=mergeProposedTurn({fieldKey,question,options:opts,proposed});
  question=merged.question;
  opts=merged.options;
}
if(c.category==='Safety and Security'&&!c._safetyShown){question='If anyone is in immediate danger, alert studio management or call 112 now. '+question;c._safetyShown=true;}

// The acknowledgement is written once, by the model, inside the block above. A second canned
// one prefixed here is what produced "Understood. Understood, you spotted the mic issue...".

c._fieldKey=fieldKey||'';
c._options=(opts||[]).map(o=>o.value);
const done=urgentRequired.filter(k=>Boolean(c[k])).length;
return{sessionId:input.sessionId,message:question,phase:draft?'draft':'collect',fieldKey,lookup,lookupFilters,options:opts,collected:c,draft,progress:{done,total:urgentRequired.length},engine,notice};}
