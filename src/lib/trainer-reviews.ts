import {eq,inArray} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {obj,arr} from './momence';
import {makeDraft,createTicketFromDraft} from './tickets';
import {credentials,getConfig} from './config';
import {ApiError} from './auth';

/**
 * Trainer assessments arrive from four places, all owned by the same Fillout organisation:
 * two Fillout forms (the weighted Barre assessment and the non-technical, member-facing
 * assessment), and two Zite apps (Zite is Fillout's app builder — a Zite app is a "flow",
 * not a form, so the Forms API cannot read it and its public flow API is used instead).
 *
 * Every source is normalised to one shape and filed as an `assessment` ticket, which is what
 * the trainer reviews tab and the trainer reports already aggregate. Re-running is safe:
 * each row carries a stable `sourceRef` and is skipped once imported.
 */
export type ReviewSource={id:string;kind:'fillout-form'|'zite-app';label:string};

export const TRAINER_REVIEW_SOURCES:ReviewSource[]=[
  {id:'dSw2VkfdGqus',kind:'fillout-form',label:'Training Quality Assessment — Barre'},
  {id:'syTsvPww8nus',kind:'fillout-form',label:'Training Quality Assessment — by staff'},
  {id:'srq1c6n7br',kind:'zite-app',label:'Trainer QA & Assessment — FIT & Lab'},
  {id:'pdtcpzhxas',kind:'zite-app',label:'Feedback Tracker Pro'},
];

/** Overridable with TRAINER_REVIEW_SOURCES, e.g. "fillout-form:abc123,zite-app:def456". */
export function reviewSources():ReviewSource[]{
  const raw=process.env.TRAINER_REVIEW_SOURCES?.trim();
  if(!raw)return TRAINER_REVIEW_SOURCES;
  return raw.split(',').map(part=>{
    const [kind,id,...label]=part.trim().split(':');
    const trimmed=(id||'').trim();
    return{id:trimmed,kind:kind.trim()==='fillout-form'?'fillout-form':'zite-app',
      label:label.join(':').trim()||TRAINER_REVIEW_SOURCES.find(s=>s.id===trimmed)?.label||trimmed} as ReviewSource;
  }).filter(s=>s.id);
}

export type NormalisedReview={
  sourceRef:string;sourceLabel:string;trainer:string;evaluator:string;studio:string;
  sessionName:string;at:string;score:number|null;band:string;
  strengths:string;improvements:string;coachingPlan:string;
  scorecard:Record<string,unknown>;
};

const str=(v:unknown)=>v==null?'':String(v).trim();
const ZITE_RUNNER='https://workflows.zite.com';
const FILLOUT_API='https://api.fillout.com/v1/api';

/**
 * A Zite app's assessments, read through the same public flow endpoint the app's own front-end
 * calls. `totalScore` is already a 0-100 percentage on the app's scale (its bands are
 * Exceptional 90+, Good 80-89, Average 70-79, Poor 60-69, Needs Help below 60), so it maps
 * straight onto the workspace's own 0-100 evaluation score with no rescaling.
 */
async function fetchZite(source:ReviewSource):Promise<NormalisedReview[]>{
  const res=await fetch(`${ZITE_RUNNER}/public/${encodeURIComponent(source.id)}/api/getAssessments`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({inputs:{},mode:'live'}),cache:'no-store',signal:AbortSignal.timeout(30000),
  });
  if(!res.ok)throw new ApiError(`${source.label} returned ${res.status}.`,502);
  return arr(obj(await res.json()).assessments).map(row=>{
    const r=obj(row);
    const scorecard=Object.fromEntries(Object.entries(r).filter(([k])=>k.startsWith('score')));
    const total=Number(r.totalScore);
    return{
      sourceRef:`zite:${source.id}:${str(r.id)}`,sourceLabel:source.label,
      trainer:str(r.trainerName),evaluator:str(r.evaluatorName)||'Not recorded',
      studio:str(r.location),sessionName:str(r.sessionName),
      at:str(r.classDate)||str(r.submittedAt),
      score:Number.isFinite(total)?Math.round(total):null,band:str(r.performanceBand),
      strengths:str(r.keyStrengths),improvements:str(r.areasForImprovement),coachingPlan:str(r.coachingActionPlan),
      scorecard:{...scorecard,totalScore:r.totalScore,sectionNotes:r.sectionNotes,submittedAt:r.submittedAt},
    };
  }).filter(r=>r.trainer&&r.sourceRef.split(':')[2]);
}

/**
 * Question types Fillout uses for a scored answer. The label is not a reliable signal — the
 * Barre rubric names its criteria "❖ Pre-Class Setup & Vibe" with no "rate"/"score" in the
 * text — so the question's own type decides what counts towards the evaluation score.
 */
const SCORED_TYPES=new Set(['NumberInput','StarRating','Slider','OpinionScale','ScaleRating','Rating','NumberRating','Ranking']);
/** Fillout does not send a denominator, so the nearest conventional ceiling above the value
 *  is used — the same rule the trainer reports apply when drawing a rubric row. */
const ceilingFor=(v:number)=>v<=5?5:v<=10?10:100;

/** The Fillout forms' submissions, whose scored questions are normalised to one 0-100 score. */
async function fetchFilloutForm(source:ReviewSource):Promise<NormalisedReview[]>{
  const c=await credentials('fillout');
  if(!c.api_key)throw new ApiError('Connect Fillout in Integrations to read trainer assessment submissions.',503);
  const out:NormalisedReview[]=[];
  for(let offset=0;offset<1000;offset+=150){
    const res=await fetch(`${FILLOUT_API}/forms/${encodeURIComponent(source.id)}/submissions?limit=150&offset=${offset}&sort=desc`,{
      headers:{Authorization:'Bearer '+c.api_key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(30000),
    });
    if(!res.ok)throw new ApiError(`${source.label} returned ${res.status} from Fillout.`,502);
    const rows=arr(obj(await res.json()).responses);
    for(const row of rows){
      const r=obj(row);
      const answers=arr(r.questions).map(q=>({name:str(obj(q).name),type:str(obj(q).type),value:obj(q).value}));
      const pick=(re:RegExp)=>answers.find(a=>re.test(a.name)&&a.value!=null&&str(a.value)!=='')?.value;
      // A scored question is one Fillout typed as scored, or one whose label says so. Both are
      // required: the Barre rubric only declares itself through the type, and a form that asks
      // "Rate ... on 5" as a plain input only declares itself through the label.
      const ratings=answers
        .filter(a=>typeof a.value==='number'&&(SCORED_TYPES.has(a.type)||/\brate|\bscore|rating/i.test(a.name)))
        .map(a=>Number(a.value));
      // Each question carries its own ceiling, so a 0-5 rubric and a 0-10 one average together.
      const score=ratings.length
        ?Math.round(ratings.reduce((n,v)=>n+v/ceilingFor(v),0)/ratings.length*100)
        :null;
      out.push({
        sourceRef:`fillout:${source.id}:${str(r.submissionId)}`,sourceLabel:source.label,
        trainer:str(pick(/trainer\s*name/i)||pick(/trainer|instructor/i)),
        evaluator:str(pick(/evaluated\s*by|evaluator|assessor/i))||'Not recorded',
        studio:str(pick(/center|centre|studio|location/i)),
        sessionName:str(pick(/level|class\s*(type|format|name)/i)),
        at:str(pick(/class\s*date|^date/i)||r.submissionTime),
        score,band:'',
        strengths:str(pick(/strength|what went well/i)),improvements:str(pick(/improve|development|focus/i)),
        coachingPlan:str(pick(/coaching|action plan|next steps/i)),
        scorecard:Object.fromEntries(answers.filter(a=>a.value!=null&&str(a.value)!=='').map(a=>[a.name,a.value])),
      });
    }
    if(rows.length<150)break;
  }
  return out.filter(r=>r.trainer&&r.sourceRef.split(':')[2]);
}

export async function fetchReviews(source:ReviewSource){
  return source.kind==='zite-app'?fetchZite(source):fetchFilloutForm(source);
}

let lastSync=0;let inflight:Promise<SyncResult>|undefined;
/** How stale the tab is allowed to be. Each pass is three upstream calls, so this keeps a
 *  busy page from hammering them while still reading as live. */
const SYNC_TTL_MS=20000;

export type SyncResult={imported:number;skipped:number;failed:number;unmatched:number;lastSync:string;
  sources:{label:string;id:string;imported:number;skipped:number;failed:number;unmatched:number;total:number;
    unmatchedStudios:string[];failures:{sourceRef:string;reason:string}[];error?:string}[]};

/** Files any submission not already on record. Safe to call repeatedly. */
export async function syncTrainerReviews():Promise<SyncResult>{
  const cfg=await getConfig();
  const result:SyncResult={imported:0,skipped:0,failed:0,unmatched:0,lastSync:new Date().toISOString(),sources:[]};
  for(const source of reviewSources()){
    const entry={label:source.label,id:source.id,imported:0,skipped:0,failed:0,unmatched:0,total:0,unmatchedStudios:[],failures:[]} as SyncResult['sources'][number];
    let reviews:NormalisedReview[]=[];
    try{reviews=await fetchReviews(source);}
    catch(e){entry.error=e instanceof Error?e.message:'Could not be read';result.sources.push(entry);continue;}
    entry.total=reviews.length;
    const refs=reviews.map(r=>r.sourceRef);
    const existing=refs.length?await db.select({sourceRef:tickets.sourceRef}).from(tickets).where(inArray(tickets.sourceRef,refs)):[];
    const known=new Set(existing.map(e=>e.sourceRef));
    for(const review of reviews){
      if(known.has(review.sourceRef)){entry.skipped++;continue;}
      // Rows whose studio is not one of ours are the app's own sample data, not P57 records.
      // Counted separately from duplicates: a studio label the workspace does not recognise is a
      // mapping problem to fix, and reporting it as "already on file" is what hid it before.
      const studio=cfg.studios.find(s=>s.toLowerCase()===review.studio.toLowerCase());
      if(!studio){entry.unmatched++;if(!entry.unmatchedStudios.includes(review.studio))entry.unmatchedStudios.push(review.studio||'(blank)');continue;}
      try{
        const when=review.at&&!Number.isNaN(Date.parse(review.at))?review.at:new Date().toISOString();
        const description=[review.strengths&&`Key strengths: ${review.strengths}`,
          review.improvements&&`Development areas: ${review.improvements}`,
          review.coachingPlan&&`Coaching action plan: ${review.coachingPlan}`]
          .filter(Boolean).join('\n\n')
          ||`Trainer assessment for ${review.trainer}, submitted through ${review.sourceLabel}. The full scorecard is recorded against this ticket.`;
        const draft=await makeDraft({
          title:`Trainer assessment · ${review.trainer}${review.sessionName?` · ${review.sessionName}`:''}`,
          description,category:'Trainer Feedback',subcategory:'Knowledge and Competence',kind:'assessment',
          studio,trainer:review.trainer,classFormat:review.sessionName||undefined,
          memberName:review.evaluator||'External assessment',memberEmail:'',
          incidentAt:when,source:'fillout',preferredContact:'No follow-up needed',sentiment:'neutral',
          customFields:{
            evaluator:review.evaluator,
            // Both Zite apps and this workspace express an assessment as 0-100, so the score
            // carries across unchanged and the workspace applies its own banding.
            ...(review.score!==null?{evaluationScore:review.score}:{}),
            sourceBand:review.band,sourceLabel:review.sourceLabel,sourceRef:review.sourceRef,
            sessionName:review.sessionName,strengths:review.strengths,improvements:review.improvements,
            coachingPlan:review.coachingPlan,scorecard:review.scorecard,
          },
          submissionKey:review.sourceRef,
        });
        await createTicketFromDraft(draft,'fillout','form',{sourceRef:review.sourceRef});
        entry.imported++;
      }catch(e){
        entry.failed++;
        // Without the reason a failed row is indistinguishable from one that was never there,
        // which is what made the missing assessments impossible to diagnose from the tab.
        if(entry.failures.length<10)entry.failures.push({sourceRef:review.sourceRef,reason:e instanceof Error?e.message:'Import failed'});
      }
    }
    result.imported+=entry.imported;result.skipped+=entry.skipped;result.failed+=entry.failed;result.unmatched+=entry.unmatched;
    result.sources.push(entry);
  }
  lastSync=Date.now();
  result.lastSync=new Date(lastSync).toISOString();
  return result;
}

/** When the last pass finished, for the "last synced" line on the reviews tab. */
export function lastSyncAt(){return lastSync?new Date(lastSync).toISOString():null;}

/** Sync unless a pass ran within the TTL, so the reviews tab reads live without thrashing. */
export async function syncTrainerReviewsThrottled():Promise<SyncResult|null>{
  if(Date.now()-lastSync<SYNC_TTL_MS)return null;
  if(!inflight)inflight=syncTrainerReviews().finally(()=>{inflight=undefined;});
  return inflight;
}

/** Which sources a trainer's recorded assessments came from, for the reviews tab. */
export async function reviewSourceBreakdown(){
  const rows=await db.select({customFields:tickets.customFields}).from(tickets).where(eq(tickets.kind,'assessment'));
  const counts=new Map<string,number>();
  for(const row of rows){
    const label=str(obj(row.customFields).sourceLabel)||'Logged in IRIS';
    counts.set(label,(counts.get(label)||0)+1);
  }
  return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
}
