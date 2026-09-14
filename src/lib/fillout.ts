import {createHash} from 'crypto';import {and,eq} from 'drizzle-orm';import {db} from '@/db';import {tickets} from '@/db/schema';
import {obj,arr,type JsonRecord} from './momence';import {makeDraft,createTicketFromDraft} from './tickets';import {SPECIAL_TEMPLATES} from './guided-templates';import {ApiError} from './auth';import {credentials,getConfig} from './config';
function clean(v:unknown):string{if(v==null)return'';if(Array.isArray(v))return v.map(clean).filter(Boolean).join(', ');if(typeof v==='object'){const o=obj(v);return clean(o.value??o.name??o.label??o.text??o.answer);}return String(v).trim();}
function pairs(input:unknown,depth=0):{label:string;value:string}[]{if(depth>8||!input||typeof input!=='object')return[];if(Array.isArray(input))return input.flatMap(i=>pairs(i,depth+1));const r=obj(input);const label=clean(r.name||r.label||r.title||r.question||r.id);const value=clean(r.value??r.answer??r.text);const found=label&&value?[{label,value}]:[];for(const[k,v]of Object.entries(r)){if(['value','answer','text'].includes(k))continue;if(v&&typeof v==='object')found.push(...pairs(v,depth+1));else if(!/^(id|type|created|token|secret|name|label|title|question)/i.test(k)&&v!==null)found.push({label:k,value:clean(v)});}return found;}
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const FILLOUT_API='https://api.fillout.com/v1/api';
async function filloutRequest(path:string){
  const c=await credentials('fillout');
  if(c._enabled==='false'||!c.api_key)throw new ApiError('Connect Fillout in Integrations to pull historic submissions.',503);
  const res=await fetch(FILLOUT_API+path,{headers:{Authorization:'Bearer '+c.api_key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!res.ok){const body=await res.text();let message='';try{message=clean(obj(JSON.parse(body)).message);}catch{}
    throw new ApiError(`Fillout returned ${res.status}${message?': '+message.slice(0,200):'.'}`,res.status===401||res.status===400?502:502);}
  return res.json();
}
/** Every form on the connected Fillout account, so the forms to import can be chosen by name. */
export async function listFilloutForms():Promise<{formId:string;name:string}[]>{
  const raw=await filloutRequest('/forms');
  return (Array.isArray(raw)?raw:arr(obj(raw).forms)).map(f=>{const o=obj(f);return{formId:clean(o.formId||o.id),name:clean(o.name||o.title)};}).filter(f=>f.formId);
}
/** The form ids to back-fill: `FILLOUT_FORM_ID` accepts a comma-separated list. */
export async function configuredFilloutForms():Promise<string[]>{
  const c=await credentials('fillout');
  return clean(c.form_id).split(',').map(s=>s.trim()).filter(Boolean);
}
/** Walks a form's submissions newest-first, following Fillout's page cursor. */
export async function fetchFilloutSubmissions(formId:string,limit=1000):Promise<{submissionId:string;submission:JsonRecord}[]>{
  const out:{submissionId:string;submission:JsonRecord}[]=[];
  for(let offset=0;offset<limit;offset+=150){
    const raw=obj(await filloutRequest(`/forms/${encodeURIComponent(formId)}/submissions?limit=150&offset=${offset}&sort=desc`));
    const rows=arr(raw.responses);
    for(const r of rows){const o=obj(r);const id=clean(o.submissionId||o.id);if(id)out.push({submissionId:id,submission:o});}
    if(rows.length<150||out.length>=limit)break;
  }
  return out.slice(0,limit);
}
/**
 * Pulls historic submissions for the given forms and files each one through the same
 * importer the live webhook uses, so back-filled assessments are identical to webhook ones
 * and land in the trainer reviews tab. Already-imported submissions are skipped by their
 * `fillout:<formId>:<submissionId>` source ref. One bad submission never aborts the run —
 * its reason is reported so the form or field map can be corrected.
 */
export async function backfillFillout(formIds?:string[],templateId?:string){
  const forms=formIds?.length?formIds:await configuredFilloutForms();
  if(!forms.length)throw new ApiError('No Fillout form IDs are configured. Set FILLOUT_FORM_ID to a comma-separated list, or pass the forms to import.');
  const summary=[];
  for(const formId of forms){
    let imported=0,skipped=0;const failures:{submissionId:string;reason:string}[]=[];
    let submissions:{submissionId:string;submission:JsonRecord}[]=[];
    try{submissions=await fetchFilloutSubmissions(formId);}
    catch(e){summary.push({formId,imported:0,skipped:0,total:0,failures:[{submissionId:'—',reason:e instanceof Error?e.message:'Could not read submissions'}]});continue;}
    for(const {submissionId,submission} of submissions){
      try{
        const result=await importFillout({formId,submissionId,submission,templateId});
        if(result.duplicate)skipped++;else imported++;
      }catch(e){failures.push({submissionId,reason:e instanceof Error?e.message:'Import failed'});}
    }
    summary.push({formId,imported,skipped,total:submissions.length,failures});
  }
  return{forms:summary,imported:summary.reduce((n,f)=>n+f.imported,0),skipped:summary.reduce((n,f)=>n+f.skipped,0),failed:summary.reduce((n,f)=>n+f.failures.length,0)};
}
export async function importFillout(raw:unknown){const envelope=obj(raw);const submission=obj(envelope.submission||obj(envelope.data).submission||envelope.data||raw);const submissionId=clean(envelope.submissionId||submission.submissionId||submission.id);const formId=clean(envelope.formId||submission.formId);if(!submissionId||!formId)throw new ApiError('Fillout formId and exact submissionId are required.');const sourceRef=`fillout:${formId}:${submissionId}`;const[exists]=await db.select({id:tickets.id,ticketNumber:tickets.ticketNumber}).from(tickets).where(eq(tickets.sourceRef,sourceRef));if(exists)return{created:false,duplicate:true,ticket:exists};
const answers=pairs(submission);const find=(pattern:RegExp)=>answers.find(a=>pattern.test(a.label))?.value||'';const c=await credentials('fillout');const cfg=await getConfig();const templateId=clean(envelope.templateId)||'trainer-assessment-0';const template=SPECIAL_TEMPLATES.find(t=>t.id===templateId&&t.kind==='assessment');if(!template)throw new ApiError('Select a valid trainer assessment template.');let mapping:Record<string,string>={};if(c.field_map){try{mapping=JSON.parse(c.field_map);}catch{throw new ApiError('Fillout field map must be valid JSON.');}}
const trainer=find(/^(instructor|trainer)( name| assessed)?$/i)||find(/trainer|instructor/i);if(!trainer)throw new ApiError('A trainer name was not found in the submission.');const studioRaw=find(/studio|location/i);const studio=cfg.studios.find(s=>norm(s)===norm(studioRaw))||cfg.studios.find(s=>studioRaw.length>4&&norm(s).includes(norm(studioRaw)));if(!studio)throw new ApiError('Submission studio does not match a configured studio.');
const custom:Record<string,unknown>={fillout:{formId,submissionId,answers},sourceWorkflow:'Iris Ai trainer assessment',scoreScale:c.score_scale||'5'};
for(const field of template.fields){const label=mapping[field.id]||field.label;let answer=answers.find(a=>norm(a.label)===norm(label))?.value;if(field.id==='evaluator')answer=answer||find(/evaluator|assessor|reviewed by/i)||'Not provided in form';if(field.type==='rating'){if(answer===undefined)throw new ApiError(`Missing score for "${field.label}". Map this field in Fillout configuration.`);const number=Number(answer.match(/-?\d+(\.\d+)?/)?.[0]);if(!Number.isFinite(number))throw new ApiError(`Invalid score for ${field.label}`);const score=c.score_scale==='weight'?number/Number(field.weight||5)*5:number;if(score<0||score>5)throw new ApiError(`${field.label} exceeds the configured score scale.`);custom[field.id]=Math.round(score*100)/100;}else custom[field.id]=answer||find(field.id==='strengths'?/strength|positive/i:field.id==='improvements'?/improvement|focus/i:/coaching|action plan|goals/i)||'Not provided in form';}
const feedback=find(/feedback|comments|observations/i);const description=feedback.length>=12?feedback:`Instructor assessment for ${trainer}, submitted through Fillout. Review the scorecard and original answer labels for the recorded details.`;
const draft=await makeDraft({title:`${template.title} · ${trainer}`,description,category:template.category,subcategory:template.subcategory,kind:'assessment',studio,trainer,classFormat:find(/class type|class format/i)||undefined,memberName:find(/evaluator|assessor/i)||'Fillout assessment',memberEmail:'',incidentAt:clean(submission.submissionTime||submission.createdAt)||new Date().toISOString(),source:'fillout',preferredContact:'No follow-up needed',templateId:template.id,customFields:custom,submissionKey:sourceRef,sentiment:'neutral'});const ticket=await createTicketFromDraft(draft,'fillout','form',{sourceRef});return{created:true,ticket:{id:ticket.id,ticketNumber:ticket.ticketNumber},evaluationScore:custom.evaluationScore};}
