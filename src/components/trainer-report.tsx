"use client";
import {useEffect,useMemo,useState} from 'react';
import {Badge,Empty} from './ui';
import {indiaDate} from '@/lib/display';
import {getTrainerImage} from '@/lib/constants';
import {TrainerImg} from './ticket-art';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type RubricRow={category:string;score:number;weightage:number;pct:number};
export type Assessment={
  id:number;ticketNumber:string;studio:string|null;createdAt:string;submittedAt:string;
  score:number;evaluator:string;title:string;band:string;bandTone:string;sourceLabel:string;
  sessionName:string;strengths:string;improvements:string;coachingPlan:string;summary:string;
  rubric:RubricRow[];answers:{label:string;value:string}[];
};
export type FeedbackRow={id:number;ticketNumber:string;title:string;subcategory:string;sentiment:string|null;status:string;createdAt:string;kind:string};
export type Trainer={
  name:string;displayName?:string;hidden?:boolean;mergedFrom?:string[];ambiguousWith?:string[]|null;totalTickets:number;assessmentCount:number;feedbackCount:number;complimentCount:number;
  issueCount:number;avgScore:number|null;band:string|null;bandTone:string;
  primaryStudio:string;city:string;studioSummary:{studio:string;count:number}[];
  latestAssessment:Assessment|null;assessments:Assessment[];recentFeedback:FeedbackRow[];
};

const toneVar=(tone:string)=>tone==='green'?'var(--green)':tone==='amber'?'var(--amber)':tone==='red'?'var(--red)':'var(--accent)';
const scoreColor=(v:number)=>v>=80?'var(--green)':v>=65?'var(--amber)':'var(--red)';
const scoreTone=(v:number)=>v>=80?'green':v>=65?'amber':'red';

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

function Section({index,title,subtitle,action,children}:{index:string;title:string;subtitle?:string;action?:React.ReactNode;children:React.ReactNode}){
  return (
    <section className="tr-section">
      <header className="tr-section-head">
        <span className="tr-index" aria-hidden>{index}</span>
        <div style={{minWidth:0}}>
          <h3>{title}</h3>
          {subtitle&&<p>{subtitle}</p>}
        </div>
        {action&&<div style={{marginLeft:'auto'}}>{action}</div>}
      </header>
      <div className="tr-section-body">{children}</div>
    </section>
  );
}

function ScoreDial({value,size=104}:{value:number;size?:number}){
  const r=34,c=2*Math.PI*r;
  return (
    <div className="tr-dial" style={{width:size,height:size}}>
      <svg viewBox="0 0 80 80" style={{transform:'rotate(-90deg)',width:'100%',height:'100%'}}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="7"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke={scoreColor(value)} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c-Math.min(100,Math.max(0,value))/100*c}
          style={{transition:'stroke-dashoffset 1s cubic-bezier(.22,1,.36,1)'}}/>
      </svg>
      <div className="tr-dial-label"><strong>{value||'—'}</strong><span>score</span></div>
    </div>
  );
}

/** Score per assessment over time. Clicking a point loads that review into the rubric above. */
function TrendChart({points,selectedId,onSelect}:{points:{id:number;at:string;score:number}[];selectedId?:number|null;onSelect?:(id:number)=>void}){
  if(points.length<2)return <p className="muted" style={{fontSize:12,textAlign:'center',padding:'24px 0'}}>Two or more reviews are needed to plot a trend.</p>;
  const w=640,h=150,pad=22;
  const step=(w-pad*2)/(points.length-1);
  const y=(s:number)=>h-pad-s/100*(h-pad*2);
  const path=points.map((p,i)=>`${i===0?'M':'L'}${(pad+i*step).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tr-trend" role="img" aria-label="Assessment score trend">
      {[100,80,65,50].map(g=>(
        <g key={g}>
          <line x1={pad} x2={w-pad} y1={y(g)} y2={y(g)} stroke="var(--border)" strokeDasharray="3 5"/>
          <text x={2} y={y(g)+3} style={{fontSize:10,fill:'var(--muted)'}}>{g}</text>
        </g>
      ))}
      <line x1={pad} x2={w-pad} y1={y(65)} y2={y(65)} stroke="var(--red)" strokeOpacity=".45" strokeDasharray="4 3"/>
      <path d={`${path} L${(pad+(points.length-1)*step).toFixed(1)},${h-pad} L${pad},${h-pad} Z`} fill="var(--accent)" opacity=".08"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p,i)=>{
        const active=p.id===selectedId;
        return (
          <g key={p.id} onClick={()=>onSelect?.(p.id)} style={{cursor:onSelect?'pointer':undefined}}>
            <circle cx={pad+i*step} cy={y(p.score)} r={active?5:3.5} fill={active?'var(--accent)':'var(--surface)'} stroke="var(--accent)" strokeWidth="2"/>
            <text x={pad+i*step} y={y(p.score)-9} textAnchor="middle" style={{fontSize:10,fontWeight:600,fill:active?'var(--accent)':'var(--text)'}}>{p.score}</text>
            <text x={pad+i*step} y={h-5} textAnchor="middle" style={{fontSize:10,fill:'var(--muted)'}}>
              {indiaDate(p.at,true)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function RubricBar({category,score,weightage,pct}:RubricRow){
  return (
    <div>
      <div className="between" style={{alignItems:'baseline',gap:12,marginBottom:4}}>
        <span style={{fontSize:12,color:'var(--secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{category}</span>
        <span className="muted" style={{fontSize:10,flexShrink:0}}>{score}/{weightage} · {pct}%</span>
      </div>
      <div className="tr-bar"><div style={{width:`${Math.max(2,Math.min(100,pct))}%`,background:scoreColor(pct)}}/></div>
    </div>
  );
}

/** Criterion attainment against the trainer's own average — the shape of a review at a glance. */
function RadarChart({rows,benchmark,size=280}:{rows:RubricRow[];benchmark:number;size?:number}){
  if(rows.length<3)return null;
  const cx=size/2,cy=size/2,r=size*0.29,n=rows.length,gutter=52;
  const angle=(i:number)=>i/n*Math.PI*2-Math.PI/2;
  const pt=(i:number,frac:number)=>[cx+Math.cos(angle(i))*r*frac,cy+Math.sin(angle(i))*r*frac];
  const poly=(frac:(i:number)=>number)=>rows.map((_,i)=>pt(i,Math.max(0,Math.min(1,frac(i)))).join(',')).join(' ');
  // Truncated on length rather than on word count, so "Music and tempo" does not become "Music and".
  const short=(s:string)=>s.length>18?s.slice(0,17).trimEnd()+'…':s;
  // The viewBox is padded sideways so a long criterion label sitting on the left or right
  // spoke is drawn inside the box rather than clipped by it.
  return (
    <svg viewBox={`${-gutter} 0 ${size+gutter*2} ${size}`} className="tr-radar" role="img" aria-label="Rubric attainment radar">
      {[0.25,0.5,0.75,1].map(f=><polygon key={f} points={poly(()=>f)} fill="none" stroke="var(--border)"/>)}
      {rows.map((_,i)=>{const[x,y]=pt(i,1);return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)"/>;})}
      <polygon points={poly(()=>benchmark/100)} fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4"/>
      <polygon points={poly(i=>rows[i].pct/100)} fill="var(--accent)" fillOpacity=".16" stroke="var(--accent)" strokeWidth="2"/>
      {rows.map((row,i)=>{const[x,y]=pt(i,row.pct/100);return <circle key={row.category} cx={x} cy={y} r="3.5" fill={scoreColor(row.pct)} stroke="var(--surface)" strokeWidth="1.5"/>;})}
      {rows.map((row,i)=>{const[x,y]=pt(i,1.3);return (
        <text key={row.category} x={x} y={y} textAnchor="middle" dominantBaseline="middle" style={{fontSize:10,fontWeight:600,fill:'var(--muted)'}}>{short(row.category)}</text>
      );})}
    </svg>
  );
}

function KpiTile({label,value,sub,tone,pct}:{label:string;value:string;sub:string;tone?:string;pct?:number}){
  const color=tone||'var(--accent)';
  return (
    <div className="tr-kpi">
      <span className="tr-kpi-label">{label}</span>
      <strong style={{color}}>{value}</strong>
      <span className="tr-kpi-sub">{sub}</span>
      {pct!==undefined&&<span className="tr-kpi-rail"><i style={{width:`${Math.max(2,Math.min(100,pct))}%`,background:color}}/></span>}
    </div>
  );
}

/**
 * One review, in full: the score and who gave it, the coaching notes, every rubric row and
 * every answer on the original submission.
 *
 * The most recent review is rendered open, because that is the one somebody opening a trainer's
 * file came to read. Everything older is collapsed to a single line — a file with fourteen
 * reviews, each printed in full, is a document nobody scrolls to the end of — and opens on
 * click into exactly the same detail.
 */
function ReviewCard({
  review, open, onToggle, onSelect, active, latest, canManage, onDelete, deleting,
}: {
  review: Assessment;
  open: boolean;
  onToggle: () => void;
  onSelect: () => void;
  active: boolean;
  latest?: boolean;
  canManage?: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const evaluator = review.evaluator && review.evaluator !== '—' ? review.evaluator : 'Evaluator not recorded';
  return (
    <div className={'tr-review' + (active ? ' active' : '') + (open ? ' open' : '') + (latest ? ' latest' : '')}>
      <div className="tr-review-head">
        <button
          className="tr-review-score"
          style={{color: active ? 'var(--accent)' : scoreColor(review.score)}}
          onClick={onSelect}
          title="Load this review into the rubric and radar above"
        >
          {review.score ? review.score + '%' : '—'}
        </button>
        <button className="tr-review-summary" onClick={onToggle} aria-expanded={open}>
          <span className="tr-review-title">
            {latest ? 'Most recent review' : indiaDate(review.submittedAt)}
            {latest && <em> · {indiaDate(review.submittedAt)}</em>}
          </span>
          <span className="tr-review-meta">
            {evaluator} · {review.sourceLabel}
            {review.sessionName ? ' · ' + review.sessionName : ''}
            {review.studio ? ' · ' + review.studio.split(',')[0] : ''} · {review.ticketNumber}
          </span>
        </button>
        <div className="tr-review-badges">
          <Badge tone={review.bandTone}>{review.band}</Badge>
          {active && <Badge tone="blue">In report above</Badge>}
          <button className="tr-review-toggle" onClick={onToggle} aria-label={open ? 'Collapse this review' : 'Expand this review'}>
            {open ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {open && (
        <div className="tr-review-body">
          <dl className="tr-review-facts">
            <div><dt>Score</dt><dd style={{color: scoreColor(review.score)}}>{review.score ? review.score + '%' : 'Not scored'}</dd></div>
            <div><dt>Evaluated by</dt><dd>{evaluator}</dd></div>
            <div><dt>Submitted</dt><dd>{indiaDate(review.submittedAt)}</dd></div>
            <div><dt>Source</dt><dd>{review.sourceLabel}</dd></div>
            {review.sessionName && <div><dt>Session</dt><dd>{review.sessionName}</dd></div>}
            {review.studio && <div><dt>Studio</dt><dd>{review.studio}</dd></div>}
            <div><dt>Band</dt><dd>{review.band}</dd></div>
            <div><dt>Ticket</dt><dd><a href={'/tickets/' + review.id}>{review.ticketNumber} ↗</a></dd></div>
          </dl>

          {(review.strengths || review.improvements || review.coachingPlan || review.summary) && (
            <div className="tr-notes">
              {review.strengths && <div className="tr-note" style={{borderLeftColor: 'var(--green)'}}><strong>Key strengths</strong><p>{review.strengths}</p></div>}
              {review.improvements && <div className="tr-note" style={{borderLeftColor: 'var(--amber)'}}><strong>Development areas</strong><p>{review.improvements}</p></div>}
              {review.coachingPlan && <div className="tr-note" style={{borderLeftColor: 'var(--accent)'}}><strong>Coaching action plan</strong><p>{review.coachingPlan}</p></div>}
              {!review.strengths && !review.improvements && !review.coachingPlan && review.summary && (
                <div className="tr-note"><strong>Summary</strong><p>{review.summary}</p></div>
              )}
            </div>
          )}

          {review.rubric.length > 0 && (
            <div className="tr-review-rubric">
              <span className="tr-kpi-label">Scored criteria · weakest first</span>
              <div className="tr-rubric-cols">{review.rubric.map(row => <RubricBar key={row.category} {...row} />)}</div>
            </div>
          )}

          {review.answers.length > 0 && (
            <div className="tr-answers">
              <span className="tr-kpi-label">The submission as it was filled in · {review.answers.length} answers</span>
              {review.answers.map((answer, i) => (
                <div key={i}><span>{answer.label}</span><p>{answer.value || '—'}</p></div>
              ))}
            </div>
          )}

          {canManage && (
            <div className="tr-review-admin">
              <button className="btn-danger-ghost" disabled={deleting} onClick={onDelete}>
                {deleting ? 'Removing…' : 'Remove this review'}
              </button>
              <span className="muted">Deletes the review and its ticket. Recorded in the audit log; the upstream form will not re-import it.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export function TrainerReport({trainer,canManage=false,onRemoveReview}:{
  trainer:Trainer;
  /** Administrators only: shows the per-review remove control. The API enforces it too. */
  canManage?:boolean;
  /** Asked to delete one review. The page owns the confirmation and the refresh. */
  onRemoveReview?:(review:Assessment)=>Promise<void>;
}){
  // Scoped to the trainer on screen for the same reason as `openOverride`: a selection made on
  // one trainer's file must not carry into the next one.
  const [selection,setSelection]=useState<{for:string;id:number}>();
  const selectedId=selection?.for===trainer.name?selection.id:null;
  const setSelectedId=(id:number)=>setSelection({for:trainer.name,id});
  // Newest first, which is both the reading order of the history list and the order the
  // "latest" card is taken from.
  const newestFirst=useMemo(()=>[...trainer.assessments].sort((a,b)=>+new Date(b.submittedAt)-+new Date(a.submittedAt)),[trainer.assessments]);
  // Open by default: the most recent review only. Everything older stays collapsed until
  // somebody asks for it.
  //
  // Held as an override rather than as the state itself, so switching trainer does not need an
  // effect to re-seed it: with no override, the open set is derived from this trainer's own
  // latest review, which is the correct answer for whichever trainer is on screen.
  const [openOverride,setOpenOverride]=useState<{for:string;ids:Set<number>}>();
  const openIds=openOverride?.for===trainer.name
    ? openOverride.ids
    : new Set(newestFirst.slice(0,1).map(a=>a.id));
  const setOpenIds=(ids:Set<number>)=>setOpenOverride({for:trainer.name,ids});
  const [deletingId,setDeletingId]=useState<number|null>(null);
  async function removeReview(review:Assessment){
    if(!onRemoveReview)return;
    setDeletingId(review.id);
    try{await onRemoveReview(review);}finally{setDeletingId(null);}
  }
  const [rubricFilter,setRubricFilter]=useState<'all'|'strong'|'focus'>('all');
  // Read on the client after mount: "last reviewed N days ago" must not be baked into the
  // server-rendered markup, or the two disagree the moment the page is cached.
  const [now,setNow]=useState(0);
  useEffect(()=>{const id=setTimeout(()=>setNow(Date.now()),0);return()=>clearTimeout(id);},[]);

  const toggleOpen=(id:number)=>{
    const next=new Set(openIds);
    if(next.has(id))next.delete(id);else next.add(id);
    setOpenIds(next);
  };

  // Oldest first for the trend line; the history list below reverses it.
  const sorted=useMemo(()=>[...trainer.assessments].sort((a,b)=>+new Date(a.submittedAt)-+new Date(b.submittedAt)),[trainer.assessments]);
  const scored=useMemo(()=>sorted.filter(a=>a.score>0),[sorted]);
  const avg=trainer.avgScore??0;
  const latest=scored.at(-1)||sorted.at(-1)||null;
  const delta=scored.length>1?scored.at(-1)!.score-scored.at(-2)!.score:0;
  const best=scored.length?Math.max(...scored.map(a=>a.score)):0;
  const worst=scored.length?Math.min(...scored.map(a=>a.score)):0;

  const selected=useMemo(()=>trainer.assessments.find(a=>a.id===selectedId)||latest,[trainer.assessments,selectedId,latest]);
  const selectedRubric=useMemo(()=>selected?.rubric??[],[selected]);
  const filteredRubric=useMemo(()=>{
    if(rubricFilter==='strong')return selectedRubric.filter(r=>r.pct>=80);
    if(rubricFilter==='focus')return selectedRubric.filter(r=>r.pct<65);
    return selectedRubric;
  },[selectedRubric,rubricFilter]);

  /** Averaged criterion attainment across every review — the durable pattern, not one class. */
  const lifetimeRubric=useMemo(()=>{
    const map=new Map<string,{score:number;weightage:number;n:number}>();
    for(const a of trainer.assessments)for(const r of a.rubric){
      const cur=map.get(r.category)??{score:0,weightage:0,n:0};
      cur.score+=r.score;cur.weightage+=r.weightage;cur.n+=1;map.set(r.category,cur);
    }
    return [...map.entries()].map(([category,v])=>({
      category,score:Math.round(v.score/v.n*10)/10,weightage:Math.round(v.weightage/v.n*10)/10,
      pct:v.weightage>0?Math.round(v.score/v.weightage*100):0,
    })).sort((a,b)=>a.pct-b.pct);
  },[trainer.assessments]);

  const evaluators=useMemo(()=>{
    const map=new Map<string,{count:number;total:number}>();
    for(const a of trainer.assessments){
      const key=a.evaluator?.trim()||'Unattributed';
      const cur=map.get(key)??{count:0,total:0};cur.count+=1;cur.total+=a.score;map.set(key,cur);
    }
    return [...map.entries()].map(([evaluator,v])=>({evaluator,count:v.count,avg:Math.round(v.total/v.count)})).sort((a,b)=>b.count-a.count);
  },[trainer.assessments]);

  const studios=useMemo(()=>{
    const map=new Map<string,{count:number;total:number}>();
    for(const a of trainer.assessments){
      const key=a.studio?.split(',')[0].trim()||'Unspecified';
      const cur=map.get(key)??{count:0,total:0};cur.count+=1;cur.total+=a.score;map.set(key,cur);
    }
    return [...map.entries()].map(([studio,v])=>({studio,count:v.count,avg:Math.round(v.total/v.count)})).sort((a,b)=>b.count-a.count);
  },[trainer.assessments]);

  const daysSince=latest&&now?Math.floor((now-+new Date(latest.submittedAt))/86400000):null;
  const alerts:{tone:string;title:string;body:string}[]=[];
  if(latest&&latest.score>0&&latest.score<65)alerts.push({tone:'red',title:'Coaching priority',body:`The latest weighted score is ${latest.score}%, below the 65% threshold.`});
  if(delta<=-8)alerts.push({tone:'amber',title:`Down ${Math.abs(delta)} points`,body:'A regression since the previous assessment — review the weakest criteria.'});
  if(delta>=8)alerts.push({tone:'green',title:`Up ${delta} points`,body:'A clear improvement since the last review.'});
  if(trainer.issueCount>=3)alerts.push({tone:'red',title:`${trainer.issueCount} flagged concerns`,body:'Member feedback on this trainer is trending negative.'});
  if(daysSince!==null&&daysSince>90)alerts.push({tone:'amber',title:'Review overdue',body:`Last assessed ${daysSince} days ago.`});
  if(!trainer.assessments.length)alerts.push({tone:'amber',title:'Never assessed',body:'No evaluation is on file for this trainer yet.'});
  if(trainer.complimentCount>=3&&trainer.issueCount===0)alerts.push({tone:'green',title:'Consistently praised',body:`${trainer.complimentCount} compliments, no concerns logged.`});

  return (
    <div className="tr-report">
      {/* 01 — masthead */}
      <section className="tr-masthead">
        <div className="tr-portrait" data-empty={!getTrainerImage(trainer.name)}>
          <TrainerImg name={trainer.name} className="trainer-photo-lg" lazy={false} fallback={<span className="tr-portrait-initials">{trainer.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</span>}/>
        </div>
        <div className="tr-masthead-body">
          <span className="eyebrow">TRAINER PERFORMANCE REPORT</span>
          <h2>{trainer.displayName||trainer.name}</h2>
          <div className="flex-row wrap" style={{gap:6,marginTop:10}}>
            <Badge tone={trainer.bandTone}>{trainer.band||'Awaiting a formal assessment'}</Badge>
            {delta!==0&&<Badge tone={delta>0?'green':'red'}>{delta>0?'+':''}{delta} vs previous</Badge>}
            <Badge>{trainer.assessmentCount} assessments</Badge>
            <Badge>{trainer.totalTickets} linked tickets</Badge>
            {latest&&<Badge>Last reviewed {indiaDate(latest.submittedAt)}</Badge>}
          </div>
        </div>
        <ScoreDial value={avg}/>
      </section>

      <div className="tr-kpis">
        <KpiTile label="Profile average" value={trainer.avgScore!==null?trainer.avgScore+'%':'—'} sub={trainer.band||'No assessments yet'} tone={scoreColor(avg)} pct={avg}/>
        <KpiTile label="Best on record" value={best?best+'%':'—'} sub="Highest weighted result" tone="var(--green)" pct={best}/>
        <KpiTile label="Lowest on record" value={worst?worst+'%':'—'} sub="Weakest weighted result" tone="var(--red)" pct={worst}/>
        <KpiTile label="Member signal" value={`${trainer.complimentCount} / ${trainer.issueCount}`} sub="Compliments vs flagged concerns" tone="var(--accent)"/>
      </div>

      {alerts.length>0&&(
        <Section index="01" title="What needs attention" subtitle="Derived from the assessments and feedback on file">
          <div className="tr-alerts">
            {alerts.map(a=>(
              <div key={a.title} className="tr-alert" style={{borderLeftColor:toneVar(a.tone)}}>
                <strong style={{color:toneVar(a.tone)}}>{a.title}</strong>
                <p>{a.body}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 02 — trajectory */}
      <Section index="02" title="Score trajectory" subtitle="Weighted result per assessment · select a point to load it below"
        action={<Badge>{scored.length} scored reviews</Badge>}>
        <TrendChart points={scored.map(a=>({id:a.id,at:a.submittedAt,score:a.score}))} selectedId={selected?.id??null} onSelect={setSelectedId}/>
      </Section>

      {/* 03 — rubric for the selected review */}
      <Section index="03" title="Rubric attainment"
        subtitle={selected?`${indiaDate(selected.submittedAt)} · ${selected.sourceLabel} · weakest criteria first`:'No assessment selected'}
        action={selected?<Badge tone={scoreTone(selected.score)}>{selected.score}% overall</Badge>:undefined}>
        {!selectedRubric.length?(
          <Empty art="clipboard" title="No per-criterion scores on this review"
            detail="The source recorded an overall score only. The full submission is listed under assessment history below."/>
        ):(
          <div className="tr-rubric-grid">
            <div className="tr-radar-wrap">
              <RadarChart rows={selectedRubric} benchmark={avg}/>
              <div className="flex-row" style={{gap:12,fontSize:10,justifyContent:'center'}}>
                <span className="flex-row" style={{gap:4}}><i className="tr-key" style={{background:'var(--accent)'}}/>This review</span>
                <span className="flex-row" style={{gap:4}}><i className="tr-key" style={{background:'var(--muted)'}}/>Profile average ({avg}%)</span>
              </div>
            </div>
            <div style={{minWidth:0}}>
              <div className="tr-seg">
                {([['all','All'],['strong','Strong ≥80%'],['focus','Needs focus <65%']] as const).map(([k,l])=>(
                  <button key={k} data-active={rubricFilter===k} onClick={()=>setRubricFilter(k)}>{l}</button>
                ))}
              </div>
              {!filteredRubric.length?<p className="muted" style={{fontSize:12}}>No criteria match this filter.</p>:
                <div className="stack" style={{gap:12}}>{filteredRubric.map(r=><RubricBar key={r.category} {...r}/>)}</div>}
            </div>
          </div>
        )}
      </Section>

      {/* 04 — coaching notes from the selected review */}
      {selected&&(selected.strengths||selected.improvements||selected.coachingPlan||selected.summary)&&(
        <Section index="04" title="Coaching notes" subtitle={`As recorded on ${selected.ticketNumber}`}>
          <div className="tr-notes">
            {selected.strengths&&<div className="tr-note" style={{borderLeftColor:'var(--green)'}}><strong>Key strengths</strong><p>{selected.strengths}</p></div>}
            {selected.improvements&&<div className="tr-note" style={{borderLeftColor:'var(--amber)'}}><strong>Development areas</strong><p>{selected.improvements}</p></div>}
            {selected.coachingPlan&&<div className="tr-note" style={{borderLeftColor:'var(--accent)'}}><strong>Coaching action plan</strong><p>{selected.coachingPlan}</p></div>}
            {!selected.strengths&&!selected.improvements&&!selected.coachingPlan&&<div className="tr-note"><strong>Summary</strong><p>{selected.summary}</p></div>}
          </div>
        </Section>
      )}

      {/* 05 — lifetime rubric */}
      {lifetimeRubric.length>0&&(
        <Section index="05" title="Recurring strengths and levers" subtitle="Averaged across every review on file · weakest first"
          action={<Badge>{lifetimeRubric.length} criteria</Badge>}>
          <div className="tr-rubric-cols">{lifetimeRubric.map(r=><RubricBar key={r.category} {...r}/>)}</div>
        </Section>
      )}

      {/* 06 — the reviews themselves: latest in full, history collapsed */}
      <Section index="06" title="Reviews on file"
        subtitle="The most recent review in full; earlier ones collapsed — open any of them, or select a score to load it into the rubric and radar above"
        action={<Badge>{trainer.assessments.length} on file</Badge>}>
        {!trainer.assessments.length ? (
          <Empty art="clipboard" title="No assessments recorded yet" detail="Submissions to the Fillout form and the Zite assessment apps appear here automatically."/>
        ) : (
          <div className="stack" style={{gap: 10}}>
            {newestFirst.map((a, index) => (
              <ReviewCard
                key={a.id}
                review={a}
                latest={index === 0}
                open={openIds.has(a.id)}
                onToggle={() => toggleOpen(a.id)}
                onSelect={() => setSelectedId(a.id)}
                active={a.id === selected?.id}
                canManage={canManage}
                deleting={deletingId === a.id}
                onDelete={() => void removeReview(a)}
              />
            ))}
            {newestFirst.length > 1 && (
              <div className="flex-row" style={{gap: 12, justifyContent: 'flex-end'}}>
                <button className="text-btn" onClick={() => setOpenIds(new Set(newestFirst.map(a => a.id)))}>Expand every review</button>
                <button className="text-btn" onClick={() => setOpenIds(new Set(newestFirst.slice(0, 1).map(a => a.id)))}>Collapse history</button>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 07 — who is assessing, and where */}
      {(evaluators.length>0||studios.length>0)&&(
        <Section index="07" title="Evaluator and studio breakdown" subtitle="Who is assessing this trainer, and where">
          <div className="tr-split">
            <div>
              <span className="tr-kpi-label">By evaluator</span>
              {!evaluators.length?<p className="muted" style={{fontSize:12}}>No evaluations recorded yet.</p>:
                evaluators.map(r=>(
                  <div key={r.evaluator} className="tr-split-row">
                    <span>{r.evaluator}</span>
                    <span className="muted">{r.count} · <b style={{color:scoreColor(r.avg)}}>{r.avg}%</b></span>
                  </div>
                ))}
            </div>
            <div>
              <span className="tr-kpi-label">By studio</span>
              {!studios.length?<p className="muted" style={{fontSize:12}}>No evaluations recorded yet.</p>:
                studios.map(r=>(
                  <div key={r.studio} className="tr-split-row">
                    <span>{r.studio}</span>
                    <span className="muted">{r.count} · <b style={{color:scoreColor(r.avg)}}>{r.avg}%</b></span>
                  </div>
                ))}
            </div>
          </div>
        </Section>
      )}

      {/* 08 — member feedback */}
      <Section index="08" title="Member feedback and compliments" subtitle="Everything logged against this trainer outside a formal assessment"
        action={<Badge>{trainer.feedbackCount} entries</Badge>}>
        {!trainer.recentFeedback.length?<Empty art="spark" title="No feedback logged yet"/>:
          trainer.recentFeedback.map(f=>(
            <div className="related-ticket" key={f.id}>
              <div><small className="muted">{f.ticketNumber} · {f.subcategory} · {indiaDate(f.createdAt,true)}</small><p>{f.title}</p></div>
              <Badge tone={f.kind==='compliment'?'green':f.sentiment==='negative'?'red':''}>{f.kind==='compliment'?'Compliment':f.sentiment||'neutral'}</Badge>
            </div>
          ))}
      </Section>
    </div>
  );
}
