"use client";
import {useEffect,useMemo,useState} from 'react';
import {GraduationCap,Star,Heart,TriangleAlert,ChevronRight,DownloadCloud,Loader2} from 'lucide-react';
import {Shell} from '@/components/shell';
import {api,SearchField,Badge,Loading,Empty,Modal,Avatar,useApp} from '@/components/ui';
import {indiaDate} from '@/lib/display';

type Assessment={id:number;ticketNumber:string;studio:string|null;createdAt:string;score:number;evaluator:string;title:string};
type FeedbackRow={id:number;ticketNumber:string;title:string;subcategory:string;sentiment:string|null;status:string;createdAt:string;kind:string};
type Trainer={name:string;totalTickets:number;assessmentCount:number;feedbackCount:number;complimentCount:number;issueCount:number;avgScore:number|null;band:string|null;bandTone:string;latestAssessment:Assessment|null;assessments:Assessment[];recentFeedback:FeedbackRow[]};

export default function TrainersPage(){
  const[trainers,setTrainers]=useState<Trainer[]>([]);
  const[q,setQ]=useState('');
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState('');
  const[active,setActive]=useState<Trainer>();
  const[syncing,setSyncing]=useState(false);
  const{notify,user}=useApp();

  const load=()=>api<{trainers:Trainer[]}>('/api/trainers').then(d=>setTrainers(d.trainers)).catch(e=>setError(e.message)).finally(()=>setBusy(false));
  useEffect(()=>{void load();},[]);

  /** Pulls historic Fillout submissions in as assessment tickets, then refreshes the scorecards. */
  async function syncFillout(){
    setSyncing(true);
    try{
      const d=await api<{imported:number;skipped:number;failed:number;forms:{formId:string;failures:{reason:string}[]}[]}>('/api/fillout',{method:'POST',body:JSON.stringify({})});
      const reason=d.forms.flatMap(f=>f.failures).map(f=>f.reason)[0];
      notify(d.imported?`${d.imported} assessment${d.imported===1?'':'s'} imported${d.skipped?`, ${d.skipped} already on file`:''}${d.failed?`, ${d.failed} could not be read`:''}.`
        :d.skipped?`Every submission is already on file (${d.skipped}).`
        :`Nothing imported.${reason?' '+reason:''}`,d.imported||d.skipped?'success':'error');
      await load();
    }catch(e){notify((e as Error).message,'error');}
    finally{setSyncing(false);}
  }
  const filtered=useMemo(()=>trainers.filter(t=>!q||t.name.toLowerCase().includes(q.toLowerCase())),[trainers,q]);
  const withScores=trainers.filter(t=>t.avgScore!==null);
  const orgAvg=withScores.length?Math.round(withScores.reduce((n,t)=>n+(t.avgScore||0),0)/withScores.length):null;

  return (
    <Shell title="Trainer reviews, consolidated." eyebrow="TRAINING & QUALITY" action={<div className="flex-row">{user?.role==='admin'&&<button className="btn" disabled={syncing} onClick={()=>void syncFillout()}>{syncing?<Loader2 size={13} className="animate-spin"/>:<DownloadCloud size={14}/>}{syncing?'Importing…':'Import Fillout history'}</button>}<Badge tone="blue"><GraduationCap size={12}/>{trainers.length} trainers tracked</Badge></div>}>
      <div className="iris-banner">
        <div className="iris-orb"><GraduationCap size={24}/></div>
        <div className="grow">
          <h2>Every assessment and every piece of feedback, in one scorecard.</h2>
          <p>Weighted evaluation scores, member compliments and logged concerns — combined per trainer so coaching conversations start from evidence.</p>
        </div>
        {orgAvg!==null&&<Badge tone={orgAvg>=80?'green':orgAvg>=65?'amber':'red'}>Org average {orgAvg}%</Badge>}
      </div>
      <div style={{marginBottom:20}}><SearchField value={q} onChange={setQ} placeholder="Find a trainer…"/></div>
      {error&&<div className="error-box">{error}</div>}
      {busy?<Loading/>:!filtered.length?<Empty art="people" title="No trainers found"/>:(
        <div className="entity-grid rise-stagger">
          {filtered.map(t=>(
            <button key={t.name} className="card entity-card" onClick={()=>setActive(t)}>
              <div className="between">
                <Avatar name={t.name} large tone={t.bandTone==='green'?'green':t.bandTone==='amber'?'amber':t.bandTone==='red'?'':''}/>
                {t.avgScore!==null?<Badge tone={t.bandTone}>{t.avgScore}%</Badge>:<Badge>No assessments</Badge>}
              </div>
              <h3>{t.name}</h3>
              <p>{t.band||'Awaiting a formal assessment'}</p>
              <div className="flex-row wrap" style={{marginTop:12,gap:6}}>
                <span className="tag"><Star size={10}/>{t.assessmentCount} assessments</span>
                <span className="tag"><Heart size={10}/>{t.complimentCount} compliments</span>
                <span className="tag"><TriangleAlert size={10}/>{t.issueCount} flagged</span>
              </div>
              <div className="entity-foot"><span>{t.totalTickets} linked tickets</span><ChevronRight size={14}/></div>
            </button>
          ))}
        </div>
      )}
      {active&&(
        <Modal open onClose={()=>setActive(undefined)} title={active.name} description="Consolidated trainer scorecard" size="wide">
          <div className="stack">
            <div className="metric-grid" style={{marginBottom:0}}>
              <div className="card metric"><span className="metric-name">Average score</span><strong className="metric-number">{active.avgScore!==null?active.avgScore+'%':'—'}</strong><div className="metric-note">{active.band||'No assessments yet'}</div></div>
              <div className="card metric"><span className="metric-name">Assessments</span><strong className="metric-number">{active.assessmentCount}</strong></div>
              <div className="card metric"><span className="metric-name">Compliments</span><strong className="metric-number">{active.complimentCount}</strong></div>
              <div className="card metric"><span className="metric-name">Flagged issues</span><strong className="metric-number">{active.issueCount}</strong></div>
            </div>
            <section>
              <h3 style={{fontSize:14,marginBottom:12}}>Assessment history</h3>
              {active.assessments.length?(
                <div className="table-wrap"><table className="data-table"><thead><tr><th>Ticket</th><th>Studio</th><th>Evaluator</th><th>Score</th><th>Date</th></tr></thead>
                <tbody>{active.assessments.map(a=><tr key={a.id}><td className="ticket-id">{a.ticketNumber}</td><td>{a.studio||'—'}</td><td>{a.evaluator}</td><td><Badge tone={a.score>=80?'green':a.score>=65?'amber':'red'}>{a.score}%</Badge></td><td>{indiaDate(a.createdAt,true)}</td></tr>)}</tbody></table></div>
              ):<Empty art="clipboard" title="No weighted assessments logged yet" detail="Use a trainer assessment template to record one."/>}
            </section>
            <section>
              <h3 style={{fontSize:14,marginBottom:12}}>Recent feedback & compliments</h3>
              {active.recentFeedback.length?active.recentFeedback.map(f=>(
                <div className="related-ticket" key={f.id}><div><small className="muted">{f.ticketNumber} · {f.subcategory}</small><p>{f.title}</p></div><Badge tone={f.kind==='compliment'?'green':f.sentiment==='negative'?'red':''}>{f.kind==='compliment'?'Compliment':f.sentiment||'neutral'}</Badge></div>
              )):<Empty art="spark" title="No feedback logged yet"/>}
            </section>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
