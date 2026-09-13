import {desc} from 'drizzle-orm';
import {db} from '@/db';
import {tickets} from '@/db/schema';
import {TRAINERS} from '@/lib/constants';
import {requireWorkspace,errorResponse} from '@/lib/auth';
export const dynamic='force-dynamic';

function performanceBand(scorePercent:number):string{
  if(scorePercent<65)return 'High coaching priority';
  if(scorePercent<80)return 'Development watch';
  return 'On-track performance';
}
function bandTone(band:string):string{return band==='On-track performance'?'green':band==='Development watch'?'amber':'red';}

export async function GET(){
  try{
    await requireWorkspace();
    const rows=await db.select().from(tickets).orderBy(desc(tickets.createdAt));
    const trainerNames=new Set<string>(TRAINERS);
    for(const t of rows)if(t.trainer)for(const name of t.trainer.split(',').map(s=>s.trim()))if(name)trainerNames.add(name);
    const profiles=[...trainerNames].sort().map(name=>{
      const related=rows.filter(t=>(t.trainer||'').split(',').map(s=>s.trim()).includes(name));
      const assessments=related.filter(t=>t.kind==='assessment').map(t=>({id:t.id,ticketNumber:t.ticketNumber,studio:t.studio,createdAt:t.createdAt.toISOString(),score:Number((t.customFields as Record<string,unknown>)?.evaluationScore)||0,evaluator:String((t.customFields as Record<string,unknown>)?.evaluator||'—'),title:t.title}));
      const feedback=related.filter(t=>t.category==='Trainer Feedback'&&t.kind!=='assessment');
      const compliments=feedback.filter(t=>t.kind==='compliment'||t.sentiment==='positive');
      const issues=feedback.filter(t=>t.kind==='issue'&&t.sentiment!=='positive');
      const avgScore=assessments.length?Math.round(assessments.reduce((n,a)=>n+a.score,0)/assessments.length):null;
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
        assessments:assessments.slice(0,10),
        recentFeedback:feedback.slice(0,8).map(t=>({id:t.id,ticketNumber:t.ticketNumber,title:t.title,subcategory:t.subcategory,sentiment:t.sentiment,status:t.status,createdAt:t.createdAt.toISOString(),kind:t.kind})),
      };
    }).sort((a,b)=>b.totalTickets-a.totalTickets);
    return Response.json({trainers:profiles});
  }catch(e){return errorResponse(e);}
}
