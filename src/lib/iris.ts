import OpenAI from 'openai';
import {getConfig,credentials} from './config';
import {extractEntities,inferSentiment,classifyIssue,matchStudio} from './classifier';
import {makeDraft,historicalExamples} from './tickets';
import {listMomence,obj} from './momence';
import {extractContext,determineSkippableFields} from './context-extractor';
import {parseAssetReference,resolveAsset,assetBrief} from './assets';
import {findDuplicate} from './duplicates';
import {STUDIO_AREAS,SYSTEMS,OCCURRED_OPTIONS,REPORTED_BY_OPTIONS,STAGES_SC3_PARTS,STAGES_SC3_TROUBLESHOOTING,CYCLE_INTAKE_QUESTIONS,studioAreasFor,AREA_ALIASES} from './constants';
import {momenceConfigured} from './momence';
import type {IrisTurn,IrisMessage} from './iris-contract';
import type {AdvancedDraft} from './ticket-contract';

const FIELD_KEYS=['category','subcategory','kind','description','studio','classFormat','trainer','membership','memberName','memberEmail','memberPhone','incidentAt','preferredContact','requestedResolution','impact','sentiment','area','systemName','itemDescription','lastSeen','isClassImpacted','isImmediateDanger','alreadyReported','channelOfIssue','reportedBy','bikeNumber','cycleIssueType','cyclePart','cycleFirstOrRecurring','cycleReporterAction','cycleSeverity','memberImpact','impactedMembers'];
const options=(values:string[])=>values.map(value=>({label:value,value}));

/** Fields whose offered chips are the whole answer space: a value that is not one of them is
 *  not a rougher version of the answer, it is unusable. Routing, SLA rules, dedup and every
 *  report read these by exact value, so an unmatched answer is dropped and the question is
 *  asked again rather than written onto the ticket as prose. */
const ENUM_FIELDS=new Set(['category','subcategory','studio','reportedBy','incidentAt','area','systemName','isClassImpacted','isImmediateDanger','alreadyReported','lastSeen','channelOfIssue','classFormat']);
/** Fields the flow can file without, once asking has clearly stopped working. */
const SKIPPABLE=new Set(['impact','requestedResolution','preferredContact','area','alreadyReported','isClassImpacted','systemName','itemDescription','lastSeen','channelOfIssue','trainer','classFormat','incidentAt','cycleIssueType','cyclePart','cycleFirstOrRecurring','cycleReporterAction','memberImpact','impactedMembers']);
const SKIP_VALUE:Record<string,string>={trainer:'Not sure',incidentAt:'Ongoing / recurring',cycleFirstOrRecurring:'Not sure',cycleReporterAction:'Not specified',memberImpact:'Not sure',impactedMembers:''};
const SKIPPED='Not specified';
/** Chip the reporter taps when none of the answers on screen is their answer. Every closed
 *  list carries it: without an escape hatch the only way to answer freely is to type, and a
 *  typed answer that matches no listed value is dropped without a word. */
const OTHER_VALUE='__other__';
/** Pseudo-field for a turn that stops to resolve a contradiction rather than moving the
 *  intake forward. */
const CLARIFY_FIELD='clarify';
/** A contradiction is worth interrupting for, once. A reporter who repeats the newer
 *  answer is not confused — they are correcting themselves, so the next one stands. */
const CLARIFY_LIMIT=2;
/** Pseudo-field for the one question asked before a second ticket about the same fault
 *  can be created. */
const DUPLICATE_FIELD='duplicateCheck';
/** Whether a member's session was affected. Distinct from who reported the issue: a bike
 *  failing mid-class is logged by staff but affects the riders, and maintenance tickets
 *  used to be forced into "no member involved" before anyone could be asked. */
const MEMBER_IMPACT_OPTIONS=['Yes — members were affected','No, no member impact','Not sure'] as const;
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
type ProposedTurn={
  ack?:string;nextField?:string;question?:string;options?:{label:string;value:string}[];
  /** The acknowledgement that was actually streamed to the reporter, if any. */
  shownAck?:string;
  /** Whether the question was streamed as it was written. */
  shownQuestion?:boolean;
  /** Contradictions between the latest answer and something already recorded, in the
   *  order the model noticed them. Written first in the JSON so a question is not typed
   *  out on screen and then withdrawn to ask about the contradiction. */
  conflicts?:{field?:string;earlier?:string;now?:string}[];
};

/** Fields whose answers are free text downstream, so the model may invent tappable
 *  answers for them. Every other field's answers must come from its canonical list —
 *  later branches compare those values exactly, and a paraphrase breaks the flow. */
const MODEL_MAY_PROPOSE_OPTIONS=new Set(['impact','requestedResolution','studioAndTime']);

/** Chatter the acknowledgement must never contain: it is one clause about what they just
 *  said, not a customer-service sign-off. */
const ACK_CHATTER=/(anything else|feel free|reach out|happy to help|let me know|no worries|keep an eye|thank|i'?ll |i will |i have (noted|logged))/i;

/** An acknowledgement is usable when it is short, is not itself a question, and is not
 *  merely echoing the word the reporter just typed.
 *
 *  `alreadyShown` drops the no-question-mark rule for the same reason the question has one:
 *  a streamed ack is already on the reporter's screen, and a rhetorical "Bike #3 has a
 *  scraping flywheel?" is not worth making the sentence rewrite itself. */
function usableAck(ack:string):boolean{
  const t=ack.trim();
  if(!t)return false;
  if(t.includes('?'))return false;
  if(t.split(/\s+/).length>16)return false;
  if(/^(yes|no|okay|ok|sure|right|correct)\b[.!]?$/i.test(t))return false;
  return !ACK_CHATTER.test(t);
}

/** The separator between the acknowledgement and the question. The model punctuates its own
 *  sentence about half the time, so this adds a full stop only when one is missing — and the
 *  streamer uses the same rule, so what is typed out matches the stored message exactly. */
export function ackSeparator(ack:string):string{
  return /[.!?…]$/.test(ack.trim())?' ':'. ';
}

/** A model-written question stands in for the guided one only when it is a single short
 *  question and not small talk.
 *
 *  `alreadyShown` relaxes the one cosmetic rule — the closing question mark. When the field
 *  was decided before the call, the question streams to the reporter as it is written, so it
 *  is already on their screen: swapping it for the scripted one at the last moment is a
 *  visible rewrite, and a prompt that ends in a full stop is not worth one. */
function usableQuestion(q:string):boolean{
  const t=q.trim();
  if(!t)return false;
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
/**
 * Reads a JSON array of objects out of JSON that is still arriving.
 *
 * `conflicts` is emitted before anything the reporter reads, so the flow knows a
 * contradiction is coming before it has typed a question out — see `scanStreamedString`
 * for why the same care applies here. Returns the raw element fragments decoded so far
 * and whether the array has closed.
 */
export function scanStreamedArray(buffer:string,key:string):{items:string[];closed:boolean}{
  const at=buffer.indexOf(`"${key}"`);
  if(at<0)return{items:[],closed:false};
  let i=buffer.indexOf(':',at+key.length+2);
  if(i<0)return{items:[],closed:false};
  i++;
  while(i<buffer.length&&/\s/.test(buffer[i]))i++;
  if(i>=buffer.length)return{items:[],closed:false};
  if(buffer[i]!=='[')return{items:[],closed:true};   // null, or some other type
  i++;
  let depth=1,start=i,inString=false,escaped=false;
  const items:string[]=[];
  while(i<buffer.length){
    const ch=buffer[i];
    if(inString){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch==='"')inString=false;
      i++;continue;
    }
    if(ch==='"'){inString=true;i++;continue;}
    if(ch==='['||ch==='{'){depth++;i++;continue;}
    if(ch===']'||ch==='}'){depth--;if(depth===0){items.push(buffer.slice(start,i));return{items,closed:true};}i++;continue;}
    if(ch===','&&depth===1){items.push(buffer.slice(start,i));start=i+1;i++;continue;}
    i++;
  }
  return{items:[...items,buffer.slice(start)],closed:false};
}

/** Parses one streamed `conflicts` fragment. A half-written element is dropped rather
 *  than shown: a partial contradiction is worse than no contradiction. */
function parseConflictFragments(fragments:string[]):{field:string;earlier:string;now:string}[]{
  const out:{field:string;earlier:string;now:string}[]=[];
  for(const fragment of fragments){
    const trimmed=fragment.trim();
    if(!trimmed.startsWith('{')||!trimmed.endsWith('}'))continue;
    try{
      const o=obj(JSON.parse(trimmed));
      const field=typeof o.field==='string'?o.field:'';
      const earlier=typeof o.earlier==='string'?o.earlier:'';
      const now=typeof o.now==='string'?o.now:'';
      if(field&&earlier)out.push({field,earlier,now});
    }catch{/* a fragment that is not whole JSON yet */}
  }
  return out;
}

export function mergeProposedTurn({fieldKey,question,options,proposed,lastAssistantMessage}:{
  fieldKey:string;
  question:string;
  options?:{label:string;value:string}[];
  proposed:ProposedTurn;
  lastAssistantMessage?:string;
}):{question:string;options?:{label:string;value:string}[]}{
  const canonical=options||[];
  const pickerTurn=fieldKey.includes('Lookup');
  let text=question;
  let opts=options;

  // Its question stands in only when it is asking for the field the flow actually chose.
  // Text the reporter has already watched being typed is kept as-is. Nothing is streamed
  // that has not passed its check first, so honouring it here cannot smuggle anything in —
  // and it is the only way the bubble never rewrites itself.
  if(proposed.shownQuestion&&!pickerTurn&&proposed.question?.trim()){
    text=proposed.question.trim();
  }else if(!pickerTurn&&proposed.nextField===fieldKey&&proposed.question&&usableQuestion(proposed.question)){
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
  // Skip the ack if it duplicates the previous assistant message — that is what produces
  // the robotic "Noted, bed bugs were found on the studio floor" echo on consecutive turns.
  let ack=proposed.shownAck?.trim()||(proposed.ack&&usableAck(proposed.ack)?proposed.ack.trim():'');
  if(ack&&lastAssistantMessage){
    const ackNorm=ack.toLowerCase().replace(/[^a-z0-9]/g,'');
    const lastNorm=lastAssistantMessage.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(ackNorm===lastNorm||lastNorm.includes(ackNorm))ack='';
  }
  if(ack)text=ack+ackSeparator(ack)+text;
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
  classFormat: "the class format or session type involved — only when a real class was affected, never for a maintenance fault",
  trainer: "the trainer who was teaching",
  isImmediateDanger: "whether anyone is in immediate danger right now",
  reportedBy: "who reported this: staff noticed it, a member told them, a colleague flagged it, or a walkthrough raised it",
  itemDescription: "what item is missing, for a lost property report",
  lastSeen: "where the missing item was last seen",
  channelOfIssue: "where a member interaction happened (front desk, phone, WhatsApp, email, social media)",
  bikeNumber: "the number of the PowerCycle / Stages bike, when the report names one (\"cycle no 6\", \"bike 12\") — store just the number",
  cycleIssueType: "what is actually wrong with the bike, in the reporter's own words or as a known Stages SC3 symptom",
  cyclePart: "which part of the bike is affected",
  cycleFirstOrRecurring: "whether this is the first time it has happened on this bike",
  cycleReporterAction: "what the reporter did when they noticed it (took the bike out of rotation, flagged it, and so on)",
  cycleSeverity: "how severe the bike fault is: critical if a rider could be hurt (a pedal that can detach, a scraping flywheel), high if the bike cannot be ridden safely, medium if it degrades the session",
  memberImpact: "whether any member's session or experience was affected by this",
  impactedMembers: "which members were affected, if the reporter names them",
};

/**
 * Pull facts from every substantive message before treating it as the answer to the
 * previous prompt. Staff routinely answer a different, more important detail in the
 * same breath ("Strength Lab, this morning") than the one Iris last asked for. The
 * old order turned that into, for example, a member name and then asked the same
 * location question again.
 */
function applyMessageFacts(c:Record<string,unknown>,raw:string,priorField?:string){
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

  // Read the bike number off the message, not off a question asked later.
  if(!c.bikeNumber){const bike=extractBikeNumber(raw);if(bike)c.bikeNumber=bike;}

  // When it happened is captured once. It used to be re-derived from every message, so an
  // answer to an unrelated question could move the date — and because "Yesterday" begins
  // with the letters y-e-s, any reply that opened with "Yes" moved it to yesterday.
  if(context.incidentAt&&!c.incidentAt)c.incidentAt=context.incidentAt;
  else if(!c.incidentAt||priorField==='incidentAt'){
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
  // A maintenance fault is not a class, even when the word for the room reads like one:
  // "cycle" in a broken-bike report was matched to the "Studio PowerCycle" class format,
  // which put a class on the ticket, renamed it, and logged the fault as having happened
  // during that class. A class stays only when a real session has been linked to it.
  if(isFacilityCat&&!c.momenceSessionId&&c.classFormat)delete c.classFormat;
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
  // "Cycle studio" and "PowerCycle Studio" are one room. Resolving the alias here keeps a
  // single spelling on the ticket no matter which one was offered, tapped or typed.
  if(key==='area'){const alias=AREA_ALIASES[t];if(alias&&values.includes(alias))return alias;}
  // The affirmation must be the whole word. Matching a bare /^yes/ also matched
  // "Yesterday", which turned every "Yes" into a date: answering "Yes, blocking now"
  // rewrote when-it-happened and the ticket was filed as yesterday's.
  if(/^(yes|yeah|yep|yup|y|correct|true)\b/.test(t)){const hit=values.find(v=>/^yes\b/i.test(v));if(hit)return hit;}
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

/** The closed value list for a field, when the field has one; undefined for free text.
 *
 *  This is what lets the model fill slots on every turn instead of only the first: it may
 *  propose a value, but only one the rest of the system can read back. Routing, SLA rules,
 *  dedup and every report compare these by exact value, so an unmatched suggestion is
 *  dropped rather than written onto the ticket as prose. A field with no list keeps the
 *  reporter's own words. */
function canonicalValues(key:string,c:Record<string,unknown>,cfg:{taxonomy:Record<string,string[]>;studios:string[];formats:string[];trainers:string[]}):readonly string[]|undefined{
  switch(key){
    case 'category': return Object.keys(cfg.taxonomy);
    case 'subcategory': return cfg.taxonomy[String(c.category)]||[];
    case 'studio': return cfg.studios;              // never written from the model; listed for completeness
    case 'incidentAt': return OCCURRED_OPTIONS;
    case 'area': return studioAreasFor(typeof c.studio==='string'?c.studio:undefined);
    case 'systemName': return SYSTEMS;
    case 'classFormat': return cfg.formats;
    case 'trainer': return cfg.trainers;
    case 'reportedBy': return REPORTED_BY_OPTIONS;
    case 'isClassImpacted': return ['Yes, blocking now','Not yet, but it will be','No, comfort / back-office only'];
    case 'isImmediateDanger': return ['Yes — happening now','No, but it needs urgent attention'];
    case 'alreadyReported': return ['Yes','Not yet'];
    case 'lastSeen': return ['Locker','Studio floor','Lounge','Valet','Boutique','Changing room'];
    case 'channelOfIssue': return ['Front desk','Phone','WhatsApp','Email','Social media'];
    case 'cycleFirstOrRecurring': return ['First time','Recurring — happened before','Not sure'];
    case 'memberImpact': return MEMBER_IMPACT_OPTIONS;
    default: return undefined;                       // bikeNumber, cycleIssueType, cyclePart, impact…
  }
}

/** The listed values closest to an answer that matched none of them.
 *
 *  An answer that lands on nothing used to be discarded in silence and the same question
 *  came back, so the reporter typed it again. Offering the near misses turns that into a
 *  correction: one tap, and the field is right. */
function nearestValues(raw:string,values:readonly string[],limit=4):string[]{
  const t=raw.trim().toLowerCase();if(!t||!values.length)return [];
  const words=new Set(t.split(/[^a-z0-9]+/).filter(w=>w.length>2));
  const scored=values.map(v=>{
    const lower=v.toLowerCase();
    let score=lower.split(/[^a-z0-9]+/).filter(w=>w.length>2&&words.has(w)).length;
    if(lower.includes(t)||t.includes(lower))score+=2;
    return {value:v,score};
  }).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);
  const picked=scored.length?scored.map(s=>s.value):values.slice(0,limit);
  return picked.slice(0,limit);
}

/** The bike number is in the opening sentence more often than not ("cycle no 6 broke"), so
 *  read it instead of asking for it again. The trailing guard stops a class duration
 *  ("cycle 45 min") from being filed as bike #45. */
function extractBikeNumber(text:string):string|undefined{
  const m=text.toLowerCase().match(/\b(?:bike|cycle|powercycle)\b(?:\s*(?:no\.?|number|num|#))?\s*(\d{1,2})\b(?!\s*(?:min|mins|minute|minutes|pax|people|members|riders))/);
  if(m)return m[1];
  const hash=text.match(/#\s*(\d{1,2})\b/);
  return hash?hash[1]:undefined;
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
  /** Anything on the floor that can disrupt a class, not only the two maintenance
   *  categories: a dead mic costs a class its session exactly as a broken bike does. */
  const isFault=isMaintenance||isTech;
  
  // Skip "already reported?" if they explicitly said they just noticed it — clearly not already logged
  const isStudioReport=c.reportedBy===REPORTED_BY_OPTIONS[0];
  const skipDuplicateCheck=isStudioReport&&c.incidentAt==='Earlier today';
  
  // URGENCY CHECK: If this is blocking RIGHT NOW or needs urgent attention, skip optional dedup question
  const isUrgent=c.isClassImpacted==='Yes, blocking now'||c.isImmediateDanger==='Yes — happening now'||c.isImmediateDanger==='No, but it needs urgent attention';
  
  // For maintenance/facilities: ask location, then impact, skip dedup if urgent
  // Only the rooms this studio actually has. The full list put Kwality-only rooms
  // ("Brain Cell", "His Space") on offer at every site, so a Bandra ticket could be filed
  // against a room that does not exist there.
  if(isMaintenance&&!c.area)return{key:'area',prompt:'Where in the studio is this?',values:studioAreasFor(typeof c.studio==='string'?c.studio:undefined)};
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
  const areaText=String(c.area||'');
  const areaCanon=AREA_ALIASES[areaText.trim().toLowerCase()]||areaText;
  const isCycleRelated=isMaintenance&&(/\b(bike|cycle|powercycle|power cycle|spin|pedal|flywheel|resistance|crank|handlebar|fitloc|console|saddle|belt|sprint\s?shift)\b/i.test(String(c.description||''))||/powercycle|cycle studio/i.test(areaCanon)||/powercycle/i.test(String(c.classFormat||'')));
  if(isCycleRelated){
    if(!c.bikeNumber)return{key:'bikeNumber',prompt:'Which bike number is this about? (e.g. Bike #3, Bike 7)',values:[]};
    if(!c.cycleIssueType){
      // Auto-match from description if possible. The list is not the vocabulary — a symptom
      // in the reporter's own words is kept as they wrote it, and only the parts the
      // playbook can name are filled in from it.
      const desc=String(c.description||'').toLowerCase();
      const autoMatch=STAGES_SC3_TROUBLESHOOTING.find(t=>t.keywords.some(kw=>desc.includes(kw)));
      // Recognising the fault only settles that one question. It used to end the whole bike
      // intake, so a fault named up front was filed without ever asking whether it had
      // happened before or whether the bike had been taken out of rotation.
      if(autoMatch){c.cycleIssueType=autoMatch.symptom;applyCycleSeverity(c);}
      else return{key:'cycleIssueType',prompt:'What exactly is the issue with this bike?',values:STAGES_SC3_TROUBLESHOOTING.map(t=>t.symptom)};
    }
    applyCycleSeverity(c);
    if(!c.cyclePart)return{key:'cyclePart',prompt:'Which part of the bike is affected?',values:STAGES_SC3_PARTS.map(p=>p.name)};
    if(!c.cycleFirstOrRecurring)return{key:'cycleFirstOrRecurring',prompt:'Is this the first time this has happened on this bike, or has it happened before?',values:['First time','Recurring \u2014 happened before','Not sure']};
    if(!c.cycleReporterAction)return{key:'cycleReporterAction',prompt:'What did you do when you noticed it?',values:['Took bike out of rotation','Flagged it but class continued','Member reported mid-class','Noticed during setup/walkthrough']};
  }

  // Who it affected, as distinct from who reported it. Maintenance tickets were forced to
  // "no member involved" before anyone could be asked, so a fault that cost a full class
  // their session was filed with nobody on it.
  if(isFault&&saysYes(String(c.isClassImpacted))&&!c.memberImpact)
    return{key:'memberImpact',prompt:'Did any member lose part of their session because of this?',values:[...MEMBER_IMPACT_OPTIONS]};
  if(isFault&&String(c.memberImpact).startsWith('Yes')&&!c.impactedMembers){
    const roster=sessionRoster(c);
    return{key:'impactedMembers',prompt:roster.length?'Who was affected? Tap a name, or type them all.':'Who was affected? Names if you have them.',values:roster};
  }

  return null;
}

/** Records the playbook severity and the affected part for whatever the symptom now is.
 *  A symptom the playbook does not list keeps the reporter's wording and is left unscored:
 *  inventing a part from free text is how a technician is sent out with the wrong tool. */
function applyCycleSeverity(c:Record<string,unknown>){
  const symptom=String(c.cycleIssueType||'').trim().toLowerCase();
  if(!symptom)return;
  const match=STAGES_SC3_TROUBLESHOOTING.find(t=>t.symptom.toLowerCase()===symptom);
  if(!match){if(!c.cycleSeverity)c.cycleSeverity='unscored';return;}
  c.cycleSeverity=match.severity;
  if(!c.cyclePart)c.cyclePart=STAGES_SC3_PARTS.find(p=>p.id===match.partId)?.name;
}

/** The members booked into the linked Momence class, most recently checked-in first.
 *  `/sessions/{id}/bookings` is already fetched when a session is picked and stored on the
 *  session context — it was simply never read, so the people affected by a mid-class fault
 *  were known to the system and unused. */
function sessionRoster(c:Record<string,unknown>):string[]{
  const ctx=obj(c.sessionContext);
  const bookings=Array.isArray(ctx.bookings)?ctx.bookings as unknown[]:[];
  const names=bookings
    .filter(b=>!obj(b).cancelledAt)
    .map(b=>String(obj(obj(b).member).name||'').trim())
    .filter(n=>n.length>1);
  return [...new Set(names)].slice(0,6);
}

/** "Yes, blocking now", "Yes — happening now", "Yes — members were affected": every
 *  affirmation in the intake is a full sentence, so matching on equality misses them. */
function saysYes(value:string):boolean{
  return /^\s*yes\b/i.test(value||'');
}

/** The first contradiction worth stopping the intake for: one on a field the ticket
 *  actually stores, whose two answers really differ, and that the reporter has not already
 *  settled. `now` falls back to what the flow just bound, so a conflict that names the
 *  field without repeating the answer still works. */
/** One line on what the equipment register already knows, shown while the fault is being
 *  reported — the moment it can still change what the reporter decides to do. */
export function buildAssetNote(c:Record<string,unknown>):string|undefined{
  const name=typeof c.assetName==='string'?c.assetName:'';
  if(!name)return undefined;
  const status=String(c.assetStatus||'in-service');
  const faults=Number(c.assetFaults||0);
  const faults30=Number(c.assetFaults30||0);
  const open=Number(c.assetOpenFaults||0);
  const when=String(c.assetLastFaultAt||'');
  const whenLabel=when?new Date(when).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'}):'';
  const parts:string[]=[];
  if(status!=='in-service')parts.push(`${name} is ${status.replace(/-/g,' ')}`);
  if(faults>0){
    parts.push(faults===1
      ? `1 fault on record${whenLabel?` (${whenLabel})`:''}`
      : `${faults} faults on record${faults30>1?`, ${faults30} in the last 30 days`:''}${whenLabel?`, last ${whenLabel}`:''}`);
  }
  if(open>0)parts.push(`${open} still open${c.assetLastTicket?` (${c.assetLastTicket})`:''}`);
  if(!parts.length)parts.push(`${name} — no faults on record`);
  return parts.join(' · ');
}

export function firstConflict(proposed:ProposedTurn,c:Record<string,unknown>):{field:string;earlier:string;now:string}|undefined{
  const settled=obj(c._clarified);
  for(const entry of proposed.conflicts||[]){
    const field=String(entry?.field||'');
    const earlier=String(entry?.earlier||'').trim();
    const now=(String(entry?.now||'').trim())||String(c[field]||'').trim();
    if(!field||!earlier||!now)continue;
    if(!FIELD_KEYS.includes(field))continue;
    if(earlier.toLowerCase()===now.toLowerCase())continue;
    if(settled[field])continue;
    return {field,earlier,now};
  }
  return undefined;
}

/** The intake answers that belong on the ticket. Undefined keys are dropped so the
 *  stored JSON stays readable. */
function intakeAnswers(c:Record<string,unknown>){
  const out:Record<string,unknown>={reportedBy:c.reportedBy,sessionContext:c.sessionContext,area:c.area,systemName:c.systemName,isClassImpacted:c.isClassImpacted,isImmediateDanger:c.isImmediateDanger,alreadyReported:c.alreadyReported,itemDescription:c.itemDescription,lastSeen:c.lastSeen,channelOfIssue:c.channelOfIssue,occurredAt:occurredAtIso(c.incidentAt),bikeNumber:c.bikeNumber,cycleIssueType:c.cycleIssueType,cyclePart:c.cyclePart,cycleSeverity:c.cycleSeverity,cycleFirstOrRecurring:c.cycleFirstOrRecurring,cycleReporterAction:c.cycleReporterAction,memberImpact:c.memberImpact,impactedMembers:c.impactedMembers,assetId:c.assetId,assetName:c.assetName,assetStatus:c.assetStatus};
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

/** Momence returns a full timestamp for a class that was picked out of the schedule. The
 *  intake records a phrase — "Just now", "Earlier today" — and every list, digest and
 *  recap shows that phrase, so translate rather than storing an unreadable stamp. */
function incidentAtLabelFromIso(value:string):string|undefined{
  const parsed=Date.parse(value);
  if(!Number.isFinite(parsed))return undefined;
  const hours=(Date.now()-parsed)/3600000;
  if(hours<2)return 'Just now';
  if(hours<14)return 'Earlier today';
  if(hours<36)return 'Yesterday';
  if(hours<24*5)return 'Earlier this week';
  return 'Last week';
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

function getIstFormattedTime(): { greeting: string; timeLabel: string; shiftNote: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: true,
      weekday: 'long',
    });
    const parts = formatter.formatToParts(new Date());
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const dayPart = parts.find((p) => p.type === 'dayPeriod')?.value || '';
    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const timeLabel = `${hour}${dayPart ? ` ${dayPart}` : ''}`;

    if (hour >= 5 && hour < 12) return { greeting: 'Good morning', timeLabel: `${weekday} morning`, shiftNote: 'the morning shift is underway' };
    if (hour >= 12 && hour < 17) return { greeting: 'Good afternoon', timeLabel: `${weekday} afternoon`, shiftNote: 'the afternoon floor is active' };
    if (hour >= 17 && hour < 22) return { greeting: 'Good evening', timeLabel: `${weekday} evening`, shiftNote: 'the evening sessions are running' };
    return { greeting: 'Hello', timeLabel: `${weekday} late night`, shiftNote: 'the studio is winding down' };
  } catch {
    return { greeting: 'Hello', timeLabel: 'today', shiftNote: 'the floor is live' };
  }
}

export async function irisWelcome(
  sessionId: string,
  preset?: { category?: string; subcategory?: string }
): Promise<IrisTurn> {
  const c = preset?.category ? { category: preset.category, subcategory: preset.subcategory } : {};
  const { greeting, timeLabel, shiftNote } = getIstFormattedTime();

  let message: string;
  if (preset?.category) {
    message = `${greeting}. Let's get this ${preset.category.toLowerCase()} ticket logged ${preset.subcategory ? `under ${preset.subcategory.toLowerCase()}` : ''}.\n\nTell me what happened on the floor — I'll capture the studio, area, trainer, and everything else needed to route it to the right team.`;
  } else {
    message = `${greeting} — it's ${timeLabel} and ${shiftNote}.\n\nI'm Iris. Tell me what a member flagged or what you spotted on the floor, and I'll build the ticket as we go: studio, room, trainer, category, and the right assignee. Speak naturally or type — whichever is faster.`;
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
let proposed:ProposedTurn=input.proposedTurn||{};
// Declared out here because the model is asked from two places: before the flow on the
// opening description, and after it on every later turn.
const trustModelFields=priorField==='description'||!priorField;
let askModel:(plannedField?:string)=>Promise<void>=async()=>{};const connection=await credentials('chatgpt');const key=connection._enabled==='false'?undefined:connection.api_key;let engine:'openai'|'guided'=cfg.aiEnabled&&key?'openai':'guided';let notice:string|undefined;let ai:OpenAI|undefined;
if(engine==='openai')ai=new OpenAI({apiKey:key,timeout:20000,maxRetries:1});
if(raw.startsWith('A member told me')||raw.startsWith('I noticed something')||raw.startsWith('I want to log feedback')||raw.startsWith('I want to log a compliment')){c.kind=raw.includes('compliment')?'compliment':raw.includes('feedback')?'feedback':'issue';c.reportedBy=raw.startsWith('A member told me')?REPORTED_BY_OPTIONS[1]:raw.startsWith('I noticed')?REPORTED_BY_OPTIONS[0]:REPORTED_BY_OPTIONS[2];c.description='';c._welcomeProcessed=true;if(c.kind==='compliment')c.sentiment='positive';}
else if(raw==='__accept_category__'){c._categoryConfirmed=true;}else if(raw==='__reject_category__'){delete c.category;delete c.subcategory;delete c._guess;c._categoryRejected=true;c._categoryInferred=false;c._categoryConfirmed=true;}else if(raw==='__manual_member__'){c.memberLookupDone=true;c.manualMember=true;}else if(raw==='__studio_report__'){c.memberLookupDone=true;c.memberName=c.reportedBy===REPORTED_BY_OPTIONS[1]?'Member (not named)':'Studio team observation';c.memberEmail='';c.studioReport=true;}else if(raw==='__manual_session__'){c.sessionLookupDone=true;c.manualSession=true;}else if(raw==='__hosted_class__'){c.hostedClass=true;c.classFormat=c.classFormat||'Studio Hosted Class';}else if(raw==='__manual_studio_time__'){
  // User chose to enter studio/time manually — fall through to normal processing
}
else if(raw.startsWith('__link__:')){
  // "Yes, that's the same one" — the report is folded into the ticket that is already open
  // instead of becoming a second ticket about the same fault.
  const id=Number(raw.slice('__link__:'.length));
  if(Number.isFinite(id)&&id>0){c._linkTo=id;c._dupChecked=true;}
}
else if(raw.startsWith('__new__:')){
  // "Log it separately" — still recorded as related, so the two can be read together.
  const id=Number(raw.slice('__new__:'.length));
  if(Number.isFinite(id)&&id>0){c._relatedTicketId=id;c._dupChecked=true;}
}
else if(raw===OTHER_VALUE&&priorField){
  // None of the answers on screen was theirs. The next message is the answer, taken
  // exactly as typed instead of being matched against a list it does not appear in.
  c._freeTextFor=priorField;delete c[priorField];delete c._unmatchedFor;delete c._unmatchedRaw;
}
else if(['kwality-earlier','kwality-yesterday','fort-earlier','fort-yesterday'].includes(raw)){
  // BUNDLED RESPONSE: Parse studio + incidentAt shortcut
  const parts=raw.split('-');c.studio=parts[0]==='kwality'?'Kwality House, Kemps Corner':'Fort';c.incidentAt=parts[1]==='earlier'?'Earlier today':'Yesterday';
}
else if(raw&&!raw.startsWith('__')){
// Extract cross-cutting facts first. This is deliberately before pending-field binding:
// a location/time update must not become a member name merely because Iris happened to
// be showing the member picker in the previous turn.
applyMessageFacts(c,raw,priorField);
if(typeof c._freeTextFor==='string'&&c._freeTextFor){
  // An answer given in their own words, after "Something else" — or after an answer that
  // matched nothing on the list. It is stored as typed; asking again would only lose it.
  if(FIELD_KEYS.includes(c._freeTextFor)){
    c[c._freeTextFor]=raw.slice(0,500);
    // Remember that this one was answered in their own words. The canonical checks further
    // down exist to keep an off-list value out of a field that routing reads by exact
    // match — applied to an answer the reporter was invited to type, they deleted it.
    c._freeTextFields=[...new Set([...(Array.isArray(c._freeTextFields)?c._freeTextFields.map(String):[]),c._freeTextFor])];
  }
  delete c._freeTextFor;delete c._unmatchedFor;delete c._unmatchedRaw;
}
else if(priorField===CLARIFY_FIELD){
  // Resolving a contradiction. Whichever of the two they pick, or whatever they type
  // instead, becomes the value — and that field is never contradicted a second time.
  const pending=obj(c._clarify);
  const field=typeof pending.field==='string'?pending.field:'';
  const offered=Array.isArray(pending.options)?(pending.options as unknown[]).filter((v):v is string=>typeof v==='string'&&!v.startsWith('__')):[];
  if(raw===OTHER_VALUE&&field){c._freeTextFor=field;delete c[field];}
  else if(field){
    const matched=offered.length?normalizeAnswer(field,raw,offered):undefined;
    c[field]=matched||raw.slice(0,500);
    c._clarified={...obj(c._clarified),[field]:true};
  }
  delete c._clarify;delete c._unmatchedFor;delete c._unmatchedRaw;
}
else if(priorField==='studioAndTime'){
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
  // An answer that matched nothing on a closed list used to vanish: the field stayed empty
  // and the identical question came back, so the reporter typed the same words again and
  // the field was eventually filed as "Not specified". Remember it instead, and offer the
  // near misses next turn so one tap puts it right.
  if(strict&&value===undefined&&(c[priorField]===undefined||c[priorField]===''||c[priorField]==='—')){c._unmatchedFor=priorField;c._unmatchedRaw=raw.slice(0,200);}
  else{delete c._unmatchedFor;delete c._unmatchedRaw;}
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
// Asking the model is a closure so it can run at either of two moments. On the opening
// description the facts it extracts decide which field comes next, so it must run first. On
// every later turn the next field is already settled without it — and knowing the field up
// front is what lets the whole sentence, question included, be streamed as it is written.
askModel=async(plannedField?:string)=>{ if(!ai)return; try{
  // Shared by both passes: a tool call means the model runs twice, and whatever the first
  // pass streamed is already on screen, so it must not be re-streamed or forgotten.
  let ackReleased=false,acceptedAck='',acceptedQuestion='',questionDone=false,conflictSeen=false;
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
{"conflicts":[{"field":"...","earlier":"...","now":"..."}],"turn":{"ack":"...","nextField":"...","question":"...","options":[{"label":"...","value":"..."}]},"fields":{...}}
${plannedField?`The next field is already decided: "${plannedField}" — ${FIELD_DESCRIPTIONS[plannedField]||plannedField}. Set turn.nextField to exactly that and ask for exactly that; your question is shown to the reporter as you write it, so do not change course mid-sentence.`:''}
Emit "conflicts" first, then "turn", then "fields". Conflicts come first because they are read before anything is shown to the reporter, so a question is never typed out and then withdrawn.
- conflicts: MANDATORY whenever their latest answer contradicts something already recorded — this overrides "do not change course". Compare what they just said against the description and against Current facts. Example: the opening line said "pedal came off" and they then chose "Resistance knob not engaging"; that is a conflict on cycleIssueType with earlier "pedal came off" and now "Resistance knob not engaging". Example: they said Studio 2 and now say Studio 1. Each entry is {"field":<a field name>,"earlier":<what was recorded first>,"now":<what they say now>}. A refinement, a spelling difference or extra detail is NOT a conflict. Omit the key, or return [], when nothing contradicts.
- ack: at most 14 words reacting to what they just said, and never one you have already used earlier in this conversation, in ${cfg.aiVoice?'the studio voice':'a warm, professional voice'}. No question, no sign-off, no thanks. Omit when there is nothing new to react to.
- nextField: the single most useful field still missing. These are the fields and what each one means: ${JSON.stringify(FIELD_DESCRIPTIONS)}. Never name a field already present in Current facts.
- question: one sentence, at most 22 words, asking only for nextField, ending in a question mark.
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
  let content='';
  // Tool-call deltas arrive in fragments keyed by position, so they are reassembled here.
  const slots=new Map<number,{id:string;name:string;args:string}>();
  for await(const chunk of stream){
    const d=chunk.choices[0]?.delta;
    if(d?.content){
      content+=d.content;
      // Nothing is emitted that the finished message will not contain. The acknowledgement is
      // therefore held until its closing quote, checked, and then released in one piece —
      // it is the first thing the model writes, so this still beats the rest of the turn by
      // seconds, and the client types it out. Releasing it character by character meant a
      // rejected ack had already been read, and the bubble rewrote itself.
      const ack=scanStreamedString(content,'ack');
      if(ack.closed&&!ackReleased){
        ackReleased=true;
        if(usableAck(ack.value)){acceptedAck=ack.value.trim();input.onAckDelta(acceptedAck);}
      }
      // A contradiction is written before the question, so it is known while the question is
      // still being generated. Once one is seen the question is held back: the turn the
      // reporter gets asks about the contradiction instead, and nothing is typed out and
      // then withdrawn.
      if(!conflictSeen){const seen=scanStreamedArray(content,'conflicts');if(parseConflictFragments(seen.items).length)conflictSeen=true;}
      // The question streams for real, but only when the field was settled before the call:
      // otherwise the model may be answering a different question than the one shown.
      if(plannedField&&ackReleased&&!questionDone&&!conflictSeen){
        const q=scanStreamedString(content,'question');
        if(q.value.length>acceptedQuestion.length){
          if(!acceptedQuestion&&acceptedAck)input.onAckDelta(ackSeparator(acceptedAck));
          input.onAckDelta(q.value.slice(acceptedQuestion.length));
          acceptedQuestion=q.value;
        }
        if(q.closed)questionDone=true;
      }
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
const parsedConflicts=Array.isArray(parsed.conflicts)?parsed.conflicts.map(obj):[];
proposed={
  conflicts:parsedConflicts.map(o=>({field:typeof o.field==='string'?o.field:'',earlier:typeof o.earlier==='string'?o.earlier:'',now:typeof o.now==='string'?o.now:''})),
  ack:typeof rawTurn.ack==='string'?rawTurn.ack:undefined,
  nextField:typeof rawTurn.nextField==='string'?rawTurn.nextField:undefined,
  question:acceptedQuestion||(typeof rawTurn.question==='string'?rawTurn.question:undefined),
  shownAck:acceptedAck||undefined,
  shownQuestion:Boolean(acceptedQuestion),
  options:Array.isArray(rawTurn.options)?rawTurn.options.map(obj).filter(o=>typeof o.label==='string'&&typeof o.value==='string').map(o=>({label:String(o.label).slice(0,60),value:String(o.value).slice(0,120)})).slice(0,6):undefined,
};
// The model extracts on every turn, not only on the opening description. Discarding its
// facts from turn two onwards left the regex heuristics as the only extractor, which is why
// a bike number or a symptom stated up front still had to be asked for again — and why
// every new phrasing needed a new keyword before it could be recognised at all.
// Who decides has not changed: a value it proposes still has to be one the rest of the
// system can read back, and it only ever fills a slot nobody has filled yet, so it can
// never overwrite an answer the reporter actually gave.
const fields=obj(parsed.fields);for(const[k,v]of Object.entries(fields)){if(!FIELD_KEYS.includes(k)||typeof v!=='string'||v.length>=20000)continue;
if(k==='subcategory'&&!c.category)continue;                  // a subcategory with no category cannot be validated
if(k==='description')continue;                               // the narrative is the reporter's; the model never rewrites it
if(k==='bikeNumber'&&!/^\d{1,3}$/.test(v.trim()))continue;   // a bike number is a number
if(c[k]!==undefined&&c[k]!==''&&c[k]!=='—')continue;
// A studio names a site the ticket gets routed to, so the model's answer has to resolve
// through the same alias table a typed answer does. "Studio 1" is a room, not a site:
// it resolves to nothing, the field stays empty, and the flow asks which studio it is.
// Studio is never taken from the model. Validating its answer is not enough: asked to
// place "studio 1" it returns a real site name, which passes every check and silently
// files the ticket against the wrong location. The alias match on the reporter's own
// words is the only trusted source; when that finds nothing, the flow asks.
if(k==='studio')continue;
const allowed=canonicalValues(k,c,cfg);
if(allowed&&allowed.length){const matched=normalizeAnswer(k,v,allowed);if(!matched)continue;c[k]=matched;}
else c[k]=v.slice(0,500);
if(k==='category'&&!c.category)c._categoryInferred=true;
}
}catch{engine='guided';notice='AI is unavailable right now. Your answers are saved; guided assistance is continuing.';} };
if(raw&&trustModelFields)await askModel();
}
if(c.category&&!cfg.taxonomy[String(c.category)])delete c.category;if(c.category&&c.subcategory&&!cfg.taxonomy[String(c.category)].includes(String(c.subcategory)))delete c.subcategory;
// Same contract for the two fields that steer routing and reporting: an unrecognised
// value is dropped rather than written onto the ticket unchallenged.
if(c.studio&&!cfg.studios.includes(String(c.studio))){const m=matchStudio(String(c.studio));if(m)c.studio=m;else delete c.studio;}
// A room the reporter typed because the list did not have it is kept; every other area has
// to be one the studio actually has.
const freeTextFields=new Set(Array.isArray(c._freeTextFields)?c._freeTextFields.map(String):[]);
if(c.area&&!freeTextFields.has('area')&&!STUDIO_AREAS.includes(String(c.area) as typeof STUDIO_AREAS[number]))delete c.area;
// A class format belongs on a ticket about a class. On a maintenance ticket it arrived by
// matching the word for the room — "cycle" was read as the "Studio PowerCycle" class
// format — which renamed the ticket and logged the fault as having happened during that
// class. It survives only once a Momence session has actually been linked to it.
if(['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems'].includes(String(c.category))&&!c.momenceSessionId&&c.classFormat)delete c.classFormat;
// Momence answers with a timestamp; the intake records a phrase.
if(typeof c.incidentAt==='string'&&c.incidentAt&&!OCCURRED_OPTIONS.includes(c.incidentAt as typeof OCCURRED_OPTIONS[number])){
  const label=incidentAtLabelFromIso(c.incidentAt);
  if(label)c.incidentAt=label;
}
if(!['issue','request','compliment','feedback','assessment'].includes(String(c.kind)))c.kind='issue';
if(c.memberEmail&&typeof c.memberEmail==='string'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.memberEmail))delete c.memberEmail;
defaultOperationalFields(c);
const asked=askCounts(c);
// A long conversation that still has open optional fields is a conversation that is not
// converging. Fill them in so the draft — the point of the whole exchange — is reachable.
if(input.history.filter(m=>m.role==='assistant').length>=HARD_CAP)for(const k of SKIPPABLE)if(!c[k])c[k]=SKIP_VALUE[k]||SKIPPED;
let fieldKey:string|undefined,lookup:'members'|'sessions'|undefined,question='',opts:{label:string;value:string}[]|undefined=[];let lookupFilters:{studio?:string;sessionTypes?:string[];upcoming?:boolean}|undefined;
const choose=(key:string,prompt:string,values:string[]=[])=>{fieldKey=key;question=prompt;opts=options(values);};
const classRelated=['Class Experience','Trainer Feedback','Scheduling'].includes(String(c.category));const praise=c.kind==='compliment'||c.kind==='feedback'&&c.sentiment==='positive';
// A fault that is disrupting a class has a class attached to it, even when the ticket is a
// maintenance one. The session lookup used to be gated on the category alone, so the only
// tickets that ever resolved a class were the ones already about classes — a bike failing
// mid-session was never connected to the session it broke.
if(c._momenceReady===undefined)c._momenceReady=await momenceConfigured();
const momenceReady=c._momenceReady===true;
const classDisrupted=c.isClassImpacted==='Yes, blocking now'||c.isClassImpacted==='Not yet, but it will be';
const wantsSession=Boolean(momenceReady&&classDisrupted&&!c.sessionLookupDone&&typeof c.studio==='string'&&c.studio!=='—');
const isStudioReport=c.reportedBy===REPORTED_BY_OPTIONS[0];
const isColleagueReport=c.reportedBy===REPORTED_BY_OPTIONS[2];
const isMemberReport=c.reportedBy===REPORTED_BY_OPTIONS[1];

// CONTEXT-AWARE FLOW: Skip redundant questions based on what we already know
const isFacilityCat = ['Repair and Maintenance','Studio Amenities and Facilities','Tech Issues','Operating Systems'].includes(String(c.category));
const hasMemberName = c.memberName && String(c.memberName).trim() && String(c.memberName) !== 'Studio team observation';

// Which piece of equipment this is about, and what the register already knows about it.
// "bike 6" was a string typed fresh onto every ticket, so nothing could tell a first fault
// from a fifth: resolving it to an asset is what turns "this keeps happening" into a count.
if(isFacilityCat&&!c.assetId&&c.bikeNumber&&typeof c.studio==='string'&&c.studio!=='—'){
  const ref=parseAssetReference(`bike ${c.bikeNumber}`);
  if(ref){
    const asset=await resolveAsset({studio:String(c.studio),type:ref.type,label:ref.label,area:typeof c.area==='string'?c.area:null});
    if(asset){
      c.assetId=asset.id;c.assetName=asset.name;
      // Read the history once and carry it: the note below is built from these on every
      // later turn, without another round of queries.
      const brief=await assetBrief(asset.id);
      if(brief){
        c.assetStatus=brief.asset.status;c.assetFaults=brief.faults;c.assetFaults30=brief.faultsLast30;
        c.assetOpenFaults=brief.openFaults;c.assetLastFaultAt=brief.lastFaultAt;
        c.assetLastTicket=brief.lastTicketNumber;
      }
    }
  }
}

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
else if(!c.memberLookupDone&&(isStudioReport||isColleagueReport||c.studioReport||(!isMemberReport&&!c.memberName))){
  c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
  return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
}
// Only ask member lookup if the report explicitly came from a member and we don't already have a name
else if(!c.memberLookupDone){
  if(!isMemberReport){
    c.memberLookupDone=true;c.memberName=c.memberName||'Studio team observation';c.memberEmail='';c.studioReport=true;
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
  }
  // If a member name was already extracted (even for facility issues), keep it instead of forcing lookup
  if(c.memberName&&String(c.memberName).trim()&&String(c.memberName)!=='Studio team observation'){
    c.memberLookupDone=true;c.memberEmail='';c.studioReport=false;
    return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});
  }
  fieldKey='memberLookup';
  lookup='members';
  question=`Who is this member? Search Momence, or skip if you'd rather not name them yet.`;
  opts=[{label:'Not member-specific',value:'__studio_report__'},{label:'Enter member details manually',value:'__manual_member__'}];
}
else if((classRelated||wantsSession)&&!c.sessionLookupDone){fieldKey='sessionLookup';lookup='sessions';
question=classRelated?`Which class was this? Pick the session and I'll pull in the trainer, studio and time.`:`Which class was affected? Pick it and I'll pull in the trainer and time — and who was booked in.`;
const hosted=c.hostedClass===true||c.classFormat==='Studio Hosted Class';
// The schedule defaults to classes that have already run, which is right for a class that
// is underway now and wrong for one that has not started — that one is still upcoming.
lookupFilters={studio:typeof c.studio==='string'&&c.studio!=='—'?c.studio:undefined,sessionTypes:hosted?['private']:undefined,upcoming:c.isClassImpacted==='Not yet, but it will be'};
opts=[{label:'Session not listed / enter manually',value:'__manual_session__'},...(hosted?[]:[{label:'It was a hosted / private class',value:'__hosted_class__'}])];}
else if((!c.studio||c.studio==='—')&&!c.incidentAt&&!c._bundleTried){
  fieldKey='studioAndTime';
  question=`Which studio location was this at, and when did you notice it?`;
  opts=undefined;
}
else if(!c.studio||c.studio==='—'){
  const contextNote = c.area ? `Noted for ${c.area}${c.trainer ? ` (${c.trainer}'s session)` : ''}. ` : '';
  choose('studio',contextNote+((asked.studio||0)>=2?'I can\u2019t file this without the location \u2014 which studio was it? Pick one below.':'Which studio location center was this at?'),cfg.studios);
}
else if(!c.incidentAt && c._bundleTried){
  choose('incidentAt','When did this happen?',[...OCCURRED_OPTIONS]);
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
// Every closed list carries an escape hatch. Without one the only way to answer freely is
// to type, and a typed answer that matches nothing on the list is dropped without a word.
if(fieldKey&&opts&&opts.length&&!fieldKey.includes('Lookup')&&!opts.every(o=>o.value.startsWith('__')))opts=[...opts,{label:'Something else',value:OTHER_VALUE}];
// They asked to answer in their own words: no chips, or the same list they just rejected.
if(fieldKey&&typeof c._freeTextFor==='string'&&c._freeTextFor===fieldKey){
  opts=undefined;
  question=`Go ahead — what is it, in your own words?`;
}
// They did answer, and it matched nothing. Say so, and offer the near misses instead of
// asking the identical question again until the field is filed as "Not specified".
if(fieldKey&&typeof c._unmatchedFor==='string'&&c._unmatchedFor===fieldKey){
  const listed=(opts||[]).map(o=>o.value).filter(v=>!v.startsWith('__'));
  const near=nearestValues(String(c._unmatchedRaw||''),listed);
  if(near.length){
    question=`I didn't catch "${String(c._unmatchedRaw||'').slice(0,60)}" — did you mean one of these?`;
    opts=[...near.map(v=>({label:v,value:v})),{label:'Something else',value:OTHER_VALUE}];
  }
}
if(fieldKey&&(asked[fieldKey]||0)>=ASK_LIMIT){
  if(fieldKey==='studioAndTime'){c._bundleTried=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(SKIPPABLE.has(fieldKey)){c[fieldKey]=SKIP_VALUE[fieldKey]||SKIPPED;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='confirmCategory'){c._categoryConfirmed=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='memberLookup'){c.memberLookupDone=true;c.studioReport=true;c.memberName=c.memberName||'Studio team observation';return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  if(fieldKey==='sessionLookup'){c.sessionLookupDone=true;c.manualSession=true;return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
  // Asking three times whether it is the same fault is worse than filing it — take the
  // hint, note the possible duplicate on the ticket and let a human decide.
  if(fieldKey===DUPLICATE_FIELD){c._dupChecked=true;const d=obj(c._duplicate);if(Number(d.id)>0)c._relatedTicketId=Number(d.id);return runIris({...input,message:undefined,collected:c,patch:undefined,proposedTurn:proposed});}
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
// A fault already logged at this site is worth one question before a second ticket exists.
// Asked at the very end, when the asset, the room and the category are all known — earlier
// and every AC fault at the studio looks like the same AC fault.
if(!fieldKey&&!c._dupChecked){
  const duplicate=await findDuplicate(c);
  if(duplicate){
    c._duplicate={id:duplicate.id,ticketNumber:duplicate.ticketNumber,title:duplicate.title,recurrence:duplicate.recurrence,ageLabel:duplicate.ageLabel,reasons:duplicate.reasons,status:duplicate.status,assignedStaffName:duplicate.assignedStaffName};
    fieldKey=DUPLICATE_FIELD;
    question=`This may already be logged — ${duplicate.ticketNumber} "${duplicate.title}" was opened ${duplicate.ageLabel} (${duplicate.reasons.join(', ')}). Is that the same one?`;
    opts=[
      {label:`Yes — add it to ${duplicate.ticketNumber}`,value:`__link__:${duplicate.id}`},
      {label:'No — log this separately',value:`__new__:${duplicate.id}`},
    ];
  }else c._dupChecked=true;
}
// They said it is the same fault. Nothing is written here — the route folds the report into
// the open ticket, which is where this session's writes already live.
if(!fieldKey&&Number(c._linkTo||0)>0){
  const chosen=obj(c._duplicate);
  return{sessionId:input.sessionId,message:`Adding this to ${String(chosen.ticketNumber||'the open ticket')} as report #${Number(chosen.recurrence||2)} — no second ticket will be created.`,phase:'collect',fieldKey:undefined,options:[],collected:c,assetNote:buildAssetNote(c),linkedTicket:{id:Number(c._linkTo),ticketNumber:String(chosen.ticketNumber||''),recurrence:Number(chosen.recurrence||2)},progress:{done:urgentRequired.length,total:urgentRequired.length},engine,notice};
}
let draft:AdvancedDraft|undefined;if(!fieldKey){const cf=obj(c.customFields);draft=await makeDraft({...c,description:c.description,memberName:c.memberName||'Studio team observation',memberEmail:c.memberEmail||'',kind:c.kind,source:'iris',sentiment:praise?'positive':c.sentiment||inferSentiment(String(c.description)),customFields:{...cf,...intakeAnswers(c)},preferredContact:c.preferredContact||'Internal log only',momenceContext:c.momenceContext});// The recap is the deliverable: the reporter needs to see the routing, priority and SLA the
// ticket will carry before approving it, not just be told that a ticket exists.
// Include area for facility/maintenance tickets so the exact room is visible at a glance.
const locationTail = [draft.studio, (isFacilityCat && c.area) ? String(c.area) : '', draft.incidentAt].filter(Boolean).join(' · ');
const assetLine=buildAssetNote(c);
const related=obj(c._duplicate);
const recap=['• '+draft.title,`• ${draft.category} → ${draft.subcategory}`,...(assetLine?['• '+assetLine]:[]),...(Number(c._relatedTicketId)>0?[`• Logged separately from ${String(related.ticketNumber||'an open ticket at this studio')} — the two are linked`]:[]),`• ${draft.departmentName}${draft.assignedStaffName?` · ${draft.assignedStaffName}`:''}`,`• ${draft.priority} priority${draft.resolutionRequired&&draft.slaLabel?` · ${draft.slaLabel}`:''}`,`• ${locationTail}`].join('\n');
question=(praise?'This is ready to log — no SLA or resolution is needed for a compliment.':'Here\u2019s the ticket, ready to file.')+'\n\n'+recap+'\n\nReview it, then approve when it\u2019s accurate.';}
// The acknowledgement is written once, by the model, inside the block above. A second canned
// one prefixed here is what produced "Understood. Understood, you spotted the mic issue...".

// The model already wrote this turn in the same call that read the facts, so there is no
// second round-trip here. What remains is a merge: the flow above owns WHICH field is next
// and which answers are valid, the model owns the words. Wording and chips can no longer
// drift apart, because the chips are only ever relabelled — never redefined.
// Later turns ask the model here instead, with the chosen field handed to it. By this point
// the question it writes is the question that will be shown, so it can be streamed verbatim.
// The question is only handed over when the flow's own wording is not carrying instructions.
// A picker turn's line explains what the picker does ("Pick the session and I'll pull in the
// trainer, studio and time"), so it keeps its words and takes only the acknowledgement.
if(raw&&!trustModelFields&&fieldKey)await askModel(fieldKey.includes('Lookup')?undefined:fieldKey);
// A contradiction outranks the next question. The model writes conflicts before anything
// the reporter reads, so this arrives instead of the question it was about to ask: a
// ticket filed quickly is worth nothing if it is filed wrong. Raised once per field — a
// reporter who repeats the newer answer is correcting themselves, not confused.
const conflict=firstConflict(proposed,c);
if(conflict&&fieldKey&&fieldKey!==CLARIFY_FIELD&&Number(c._clarifyCount||0)<CLARIFY_LIMIT){
  c._clarify={field:conflict.field,options:[conflict.earlier,conflict.now]};
  c._clarifyCount=Number(c._clarifyCount||0)+1;
  fieldKey=CLARIFY_FIELD;lookup=undefined;lookupFilters=undefined;
  question=`You said "${conflict.earlier}" earlier, and "${conflict.now}" just now — which one should go on the ticket?`;
  opts=[{label:conflict.now,value:conflict.now},{label:conflict.earlier,value:conflict.earlier},{label:'Neither — let me type it',value:OTHER_VALUE}];
}
if(engine==='openai'){
  const lastAssistantMessage=input.history.filter(m=>m.role==='assistant').pop()?.content;
  const merged=mergeProposedTurn({fieldKey:fieldKey||'',question,options:opts,proposed,lastAssistantMessage});
  question=merged.question;
  opts=merged.options;
}
if(c.category==='Safety and Security'&&!c._safetyShown){question='If anyone is in immediate danger, alert studio management or call 112 now. '+question;c._safetyShown=true;}

// The acknowledgement is written once, by the model, inside the block above. A second canned
// one prefixed here is what produced "Understood. Understood, you spotted the mic issue...".

c._fieldKey=fieldKey||'';
c._options=(opts||[]).map(o=>o.value);
const done=urgentRequired.filter(k=>Boolean(c[k])).length;
return{sessionId:input.sessionId,message:question,phase:draft?'draft':'collect',fieldKey,lookup,lookupFilters,options:opts,collected:c,draft,assetNote:buildAssetNote(c),progress:{done,total:urgentRequired.length},engine,notice};}
