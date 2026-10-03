import {after} from 'next/server';
import {desc,eq,isNotNull} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '@/db';
import {tickets,ticketActivities} from '@/db/schema';
import {ApiError,requireAdmin,errorResponse,sameOrigin} from '@/lib/auth';
import {syncTrainerReviewsThrottled,reviewSourceBreakdown,lastSyncAt,rememberDeletedReview} from '@/lib/trainer-reviews';
import {audit,getSetting,setSetting} from '@/lib/config';
import {CITY_ORDER,EMPTY_OVERRIDES,cityFor,displayNameFor,knownTrainerNames,resolveTrainer,type TrainerCity,type TrainerOverrides} from '@/lib/trainer-directory';
import {signalChanged} from '@/lib/realtime';

const OVERRIDES_KEY='trainers:overrides';

/** Administrator corrections to the trainer list: merges, city moves, hidden cards, renames.
 *  Stored as one settings row rather than a table — it is a handful of strings that only an
 *  administrator writes, and keeping it out of the schema means no migration to change it. */
async function readOverrides():Promise<TrainerOverrides>{
  const row=await getSetting(OVERRIDES_KEY);
  const value=(row?.value||{}) as Partial<TrainerOverrides>;
  return{
    aliases:value.aliases&&typeof value.aliases==='object'?value.aliases:{},
    cities:value.cities&&typeof value.cities==='object'?value.cities as Record<string,TrainerCity>:{},
    hidden:Array.isArray(value.hidden)?value.hidden.filter((n):n is string=>typeof n==='string'):[],
    displayNames:value.displayNames&&typeof value.displayNames==='object'?value.displayNames:{},
  };
}
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

// Trailing "1"/"2" covers Fillout's duplicated question labels, e.g. "Trainer Name (1)".
const NOISE=/^(id|submissionid|submittedat|createdat|updatedat|trainername|evaluatorname|location|sessionname|classdate|performanceband|totalscore|keystrengths|areasforimprovement|coachingactionplan|sectionnotes|evaluationscore|evaluator|sourceband|sourcelabel|sourceref|strengths|improvements|coachingplan|scorecard|fillout|sourceworkflow|scorescale|calculatedscore)\d*$/i;

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
    // The Trainers nav is admin-only (see ADMIN_ONLY in components/shell.tsx); the API matches.
    await requireAdmin();
    // Pull new external submissions from the Fillout form and the two Zite apps after the
    // response is sent, so three upstream round-trips never sit in front of the page. The
    // throttle is shared through app_settings; the next poll picks up whatever this imported.
    after(()=>syncTrainerReviewsThrottled().then(()=>undefined,()=>undefined));
    const extras=Promise.all([reviewSourceBreakdown().catch(()=>[]),lastSyncAt().catch(()=>null)]);
    const overrides=await readOverrides();
    // Only tickets that name a trainer, and only the columns the profiles read.
    const rows=await db.select({
      id:tickets.id,ticketNumber:tickets.ticketNumber,title:tickets.title,summary:tickets.summary,trainer:tickets.trainer,
      kind:tickets.kind,category:tickets.category,subcategory:tickets.subcategory,sentiment:tickets.sentiment,status:tickets.status,
      studio:tickets.studio,incidentAt:tickets.incidentAt,customFields:tickets.customFields,createdAt:tickets.createdAt,
    }).from(tickets).where(isNotNull(tickets.trainer)).orderBy(desc(tickets.createdAt));
    // One pass indexes each ticket under every trainer it names (newest first, as read), with
    // each written spelling resolved to one canonical trainer first — see lib/trainer-directory.
    // Without this, "Siddhartha" and "Siddhartha Kusuma" are two cards for one person.
    const byTrainer=new Map<string,typeof rows>(knownTrainerNames().map(name=>[name,[]]));
    /** Canonical name → the spellings that were folded into it, and whether any was ambiguous. */
    const spellings=new Map<string,Set<string>>();
    const ambiguous=new Map<string,string[]>();
    for(const t of rows)for(const written of new Set((t.trainer||'').split(',').map(s=>s.trim()).filter(Boolean))){
      const resolved=resolveTrainer(written,overrides);
      if(!resolved.name)continue;
      if(resolved.via==='ambiguous')ambiguous.set(resolved.name,resolved.candidates);
      const list=byTrainer.get(resolved.name);
      if(list)list.push(t);else byTrainer.set(resolved.name,[t]);
      if(written!==resolved.name)(spellings.get(resolved.name)??spellings.set(resolved.name,new Set()).get(resolved.name)!).add(written);
    }
    const profiles=[...byTrainer.keys()].sort().map(name=>{
      const related=byTrainer.get(name)!;
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
      const studioCounts=new Map<string,number>();
      for(const ticket of related){
        const studio=ticket.studio?.trim();
        if(studio)studioCounts.set(studio,(studioCounts.get(studio)||0)+1);
      }
      const studioSummary=[...studioCounts.entries()].map(([studio,count])=>({studio,count})).sort((a,b)=>b.count-a.count||a.studio.localeCompare(b.studio));
      const primaryStudio=studioSummary[0]?.studio||'Studio not assigned';
      // City comes from the trainer, not from whichever studio happens to have filed the most
      // tickets about them: a trainer covers several studios in their city, and a review filed
      // at a studio they were covering for a day should not move them to another city.
      const city=cityFor(name,overrides);
      return{
        name,
        displayName:displayNameFor(name,overrides),
        hidden:overrides.hidden.includes(name),
        /** Other spellings of this name found in the data and folded into this card. */
        mergedFrom:[...(spellings.get(name)??[])].sort(),
        /** Set when the name is a bare first name shared by more than one trainer: the card is
         *  kept separate and an administrator is asked to merge it deliberately. */
        ambiguousWith:ambiguous.get(name)??null,
        primaryStudio,city,studioSummary,
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
    const[sources,lastSync]=await extras;
    // Grouped for the page, and the flat list kept alongside it so nothing that reads
    // `trainers` has to change.
    const groups=CITY_ORDER.map(city=>({
      city,
      trainers:profiles.filter(p=>p.city===city&&!p.hidden),
    })).filter(group=>group.trainers.length);
    return Response.json({
      trainers:profiles.filter(p=>!p.hidden),
      groups,
      hidden:profiles.filter(p=>p.hidden).map(p=>({name:p.name,displayName:p.displayName,totalTickets:p.totalTickets})),
      roster:knownTrainerNames(),
      sources,lastSync,
    });
  }catch(e){return errorResponse(e);}
}

/**
 * Administrator corrections to the Trainers page.
 *
 * None of these touch a review. They change how the page groups and labels what is already on
 * file, which is why they live in one settings row and are all reversible:
 *
 *  - `merge`   — fold a spelling into a canonical trainer ("Chaitanya" → "Chaitanya Padhye").
 *                This is the only way an ambiguous first name is ever resolved: the app will
 *                not guess which of two trainers a bare name meant.
 *  - `city`    — move a trainer between Mumbai and Bengaluru.
 *  - `rename`  — correct the name shown on the card, without regrouping anything.
 *  - `hide`    — take a card off the page. The reviews stay on file and it can be restored.
 */
const patchSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('merge'), from: z.string().trim().min(1).max(120), into: z.string().trim().min(1).max(120)}),
  z.object({action: z.literal('unmerge'), from: z.string().trim().min(1).max(120)}),
  z.object({action: z.literal('city'), name: z.string().trim().min(1).max(120), city: z.enum(['Mumbai', 'Bengaluru'])}),
  z.object({action: z.literal('rename'), name: z.string().trim().min(1).max(120), displayName: z.string().trim().max(120)}),
  z.object({action: z.literal('hide'), name: z.string().trim().min(1).max(120), hidden: z.boolean()}),
]);

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const input = patchSchema.parse(await req.json());
    const overrides = await readOverrides();
    switch (input.action) {
      case 'merge': {
        if (input.from.toLowerCase() === input.into.toLowerCase())
          throw new ApiError('A trainer cannot be merged into themselves.');
        // Merging into a name nobody has heard of would hide the reviews behind a card that
        // never appears, so the destination has to be a trainer the page already knows.
        const known = knownTrainerNames();
        const into = known.find(name => name.toLowerCase() === input.into.toLowerCase());
        if (!into) throw new ApiError(`"${input.into}" is not a trainer on the roster.`);
        overrides.aliases = {...overrides.aliases, [input.from.toLowerCase()]: into};
        break;
      }
      case 'unmerge': {
        const {[input.from.toLowerCase()]: removed, ...rest} = overrides.aliases;
        if (!removed) throw new ApiError('That spelling is not merged into anything.');
        overrides.aliases = rest;
        break;
      }
      case 'city':
        overrides.cities = {...overrides.cities, [input.name]: input.city};
        break;
      case 'rename': {
        const next = {...overrides.displayNames};
        // An empty name is how a correction is undone, rather than a second endpoint.
        if (input.displayName) next[input.name] = input.displayName;
        else delete next[input.name];
        overrides.displayNames = next;
        break;
      }
      case 'hide':
        overrides.hidden = input.hidden
          ? [...new Set([...overrides.hidden, input.name])]
          : overrides.hidden.filter(name => name !== input.name);
        break;
    }
    await setSetting(OVERRIDES_KEY, overrides as unknown as Record<string, unknown>, actor.id);
    await audit(actor, 'trainers.' + input.action, 'trainer', input as unknown as Record<string, unknown>);
    return Response.json({ok: true, overrides});
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * `DELETE /api/trainers?reviewId=…` — removes one review from a trainer's file.
 *
 * A review is an assessment ticket, so this deletes that ticket. Administrators only, and only
 * an assessment: this must not become a way to delete an operational ticket from a page whose
 * controls are about trainers. The audit row keeps what was deleted, by whom, and when —
 * somebody's scored evaluation disappearing with no trace would be worse than keeping it.
 */
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    const reviewId = z.coerce.number().int().positive().parse(new URL(req.url).searchParams.get('reviewId'));
    const [review] = await db.select().from(tickets).where(eq(tickets.id, reviewId));
    if (!review) throw new ApiError('That review is no longer on file.', 404);
    if (review.kind !== 'assessment')
      throw new ApiError('Only a trainer review can be removed here. Use the ticket itself for anything else.', 409);
    await db.transaction(async tx => {
      await audit(
        actor,
        'trainers.review.deleted',
        'ticket:' + review.id,
        {
          ticketNumber: review.ticketNumber,
          trainer: review.trainer,
          title: review.title,
          score: (review.customFields as Record<string, unknown> | null)?.evaluationScore ?? null,
          submittedAt: review.incidentAt,
          sourceRef: review.sourceRef,
        },
      );
      // The activity row goes before the delete so the cascade takes it with the ticket: the
      // audit log is the lasting record, this is only for anyone reading the ticket in between.
      await tx.insert(ticketActivities).values({
        ticketId: review.id, actorName: actor.name, action: 'review.deleted',
        detail: `Trainer review removed by ${actor.name}.`,
      });
      await tx.delete(tickets).where(eq(tickets.id, review.id));
    });
    // Outside the transaction: the tombstone is what stops the next sync re-importing this
    // submission, and it is written even if the settings row has to be read back first.
    await rememberDeletedReview(review.sourceRef, actor.id);
    after(() => signalChanged('tickets'));
    return Response.json({ok: true, deleted: review.ticketNumber});
  } catch (e) {
    return errorResponse(e);
  }
}
