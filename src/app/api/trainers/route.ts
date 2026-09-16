import {desc} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {TRAINERS} from '@/lib/constants';
import {requireWorkspace,errorResponse} from '@/lib/auth';
import {syncTrainerReviewsThrottled,reviewSourceBreakdown,lastSyncAt} from '@/lib/trainer-reviews';
export const dynamic='force-dynamic';

function performanceBand(scorePercent:number):string{
  if(scorePercent<65)return 'High coaching priority';
  if(scorePercent<80)return 'Development watch';
  return 'On-track performance';
}
function bandTone(band:string):string{return band==='On-track performance'?'green':band==='Development watch'?'amber':'red';}

const str=(v:unknown)=>v==null?'':String(v).trim();
/** Criterion keys arrive as camelCase from Zite and as prose questions from Fillout. */
function prettyLabel(key:string){
  const spaced=key.replace(/^score/,'').replace(/[_-]+/g,' ').replace(/([a-z0-9])([A-Z])/g,'$1 $2').trim();
  return (spaced||key).replace(/^./,c=>c.toUpperCase());
}
/**
 * The two upstreams record a criterion on different scales — the Fillout form scores each
 * question out of 5, the Zite apps out of 10 or as a percentage — and neither sends the
 * denominator. The nearest conventional ceiling above the value is used, so every rubric row
 * can be drawn on one comparable 0-100 axis.
 */
function ceilingFor(value:number){return value<=5?5:value<=10?10:100;}

const NOISE=/^(id|submissionid|submittedat|createdat|updatedat|trainername|evaluatorname|location|sessionname|classdate|performanceband|totalscore|keystrengths|areasforimprovement|coachingactionplan|sectionnotes|evaluationscore|evaluator|sourceband|sourcelabel|sourceref|strengths|improvements|coachingplan|scorecard|fillout|sourceworkflow|scorescale|calculatedscore)$/i;

/** Splits a submission's recorded scorecard into numeric rubric rows and free-text answers. */
function readScorecard(raw:unknown){
  const card=(raw&&typeof raw==='object'&&!Array.isArray(raw))?raw as Record<string,unknown>:{};
  const rubric:{category:string;score:number;weightage:number;pct:number}[]=[];
  const answers:{label:string;value:string}[]=[];
  for(const [key,value] of Object.entries(card)){
    if(value==null||value==='')continue;
    if(NOISE.test(key.replace(/[^a-z0-9]/gi,'')))continue;
    const n=typeof value==='number'?value:Number(str(value));
    const looksScored=/score|rate|rating/i.test(key);
    if(Number.isFinite(n)&&(looksScored||typeof value==='number')){
      const weightage=ceilingFor(n);
      rubric.push({category:prettyLabel(key),score:Math.round(n*10)/10,weightage,pct:Math.round(n/weightage*100)});
    }else{
      answers.push({label:prettyLabel(key),value:typeof value==='object'?JSON.stringify(value):str(value)});
    }
  }
  return{rubric:rubric.sort((a,b)=>a.pct-b.pct),answers};
}

export async function GET(){
  try{
    await requireWorkspace();
    // Pull any new external submissions before aggregating, so the tab reflects what has been
    // submitted to the Fillout form and the two Zite apps rather than only what was logged here.
    // Throttled internally, and a source being unreachable must never blank the page.
    await syncTrainerReviewsThrottled().catch(()=>null);
    const rows=await db.select().from(tickets).orderBy(desc(tickets.createdAt));
    const trainerNames=new Set<string>(TRAINERS);
    for(const t of rows)if(t.trainer)for(const name of t.trainer.split(',').map(s=>s.trim()))if(name)trainerNames.add(name);
    const profiles=[...trainerNames].sort().map(name=>{
      const related=rows.filter(t=>(t.trainer||'').split(',').map(s=>s.trim()).includes(name));
      // The whole submission is carried through, not only its headline score — the review
      // detail view renders the rubric, the coaching notes and the original answers from here.
      const assessments=related.filter(t=>t.kind==='assessment').map(t=>{
        const cf=(t.customFields||{}) as Record<string,unknown>;
        // External submissions carry a `scorecard`; an assessment logged through a workspace
        // template records its rating fields directly on customFields, so both are read.
        const {rubric,answers}=readScorecard(cf.scorecard??cf);
        const filloutAnswers=(cf.fillout&&typeof cf.fillout==='object'
          ?(cf.fillout as {answers?:{label?:string;value?:string}[]}).answers:undefined)||[];
        for(const a of filloutAnswers){
          const label=str(a?.label),value=str(a?.value);
          if(label&&value&&!answers.some(x=>x.label.toLowerCase()===label.toLowerCase()))answers.push({label,value});
        }
        const score=Number(cf.evaluationScore)||0;
        return{
          id:t.id,ticketNumber:t.ticketNumber,studio:t.studio,createdAt:t.createdAt.toISOString(),
          submittedAt:(t.incidentAt&&!Number.isNaN(Date.parse(t.incidentAt))?new Date(t.incidentAt):t.createdAt).toISOString(),
          score,evaluator:str(cf.evaluator)||'—',title:t.title,
          band:str(cf.sourceBand)||performanceBand(score),
          bandTone:bandTone(performanceBand(score)),
          sourceLabel:str(cf.sourceLabel)||'Logged in IRIS',
          sessionName:str(cf.sessionName),
          strengths:str(cf.strengths),improvements:str(cf.improvements),coachingPlan:str(cf.coachingPlan),
          summary:t.summary,rubric,answers,
        };
      });
      const feedback=related.filter(t=>t.category==='Trainer Feedback'&&t.kind!=='assessment');
      const compliments=feedback.filter(t=>t.kind==='compliment'||t.sentiment==='positive');
      const issues=feedback.filter(t=>t.kind==='issue'&&t.sentiment!=='positive');
      const scored=assessments.filter(a=>a.score>0);
      const avgScore=scored.length?Math.round(scored.reduce((n,a)=>n+a.score,0)/scored.length):null;
      return{
        name,
        totalTickets:related.length,
        assessmentCount:assessments.length,
        feedbackCount:feedback.length,
        complimentCount:compliments.length,
        issueCount:issues.length,
        avgScore,
        band:avgScore!==null?performanceBand(avgScore):null,
        bandTone:avgScore!==null?bandTone(performanceBand(avgScore)):'',
        latestAssessment:assessments[0]||null,
        // Every review on file, newest first — the detail view needs the full history, not a page of it.
        assessments,
        recentFeedback:feedback.slice(0,8).map(t=>({id:t.id,ticketNumber:t.ticketNumber,title:t.title,subcategory:t.subcategory,sentiment:t.sentiment,status:t.status,createdAt:t.createdAt.toISOString(),kind:t.kind})),
      };
    }).sort((a,b)=>b.totalTickets-a.totalTickets);
    return Response.json({trainers:profiles,sources:await reviewSourceBreakdown().catch(()=>[]),lastSync:lastSyncAt()});
  }catch(e){return errorResponse(e);}
}
