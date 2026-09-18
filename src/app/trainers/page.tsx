"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {GraduationCap,Star,Heart,TriangleAlert,ChevronRight,DownloadCloud,Loader2,Radio} from 'lucide-react';
import {Shell} from '@/components/shell';
import {api,SearchField,Badge,Loading,Empty,Modal,Avatar,useApp} from '@/components/ui';
import {TrainerReport,type Trainer} from '@/components/trainer-report';
import {relativeTime} from '@/lib/utils';

/** How often the tab asks the server to pull the form and the two Zite apps again. */
const POLL_MS=20000;

type SyncSource={label:string;id:string;imported:number;skipped:number;failed:number;unmatched:number;total:number;unmatchedStudios:string[];failures:{sourceRef:string;reason:string}[];error?:string};
type SyncResult={imported:number;skipped:number;failed:number;unmatched:number;lastSync:string;sources:SyncSource[]};

export default function TrainersPage(){
  const[trainers,setTrainers]=useState<Trainer[]>([]);
  const[sources,setSources]=useState<{label:string;count:number}[]>([]);
  const[lastSync,setLastSync]=useState<string|null>(null);
  const[q,setQ]=useState('');
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState('');
  const[activeName,setActiveName]=useState<string>();
  const[syncing,setSyncing]=useState(false);
  const[listening,setListening]=useState(true);
  const[ping,setPing]=useState('');
  const{notify,user}=useApp();
  // Which assessments were already on screen, so a submission that lands mid-session announces itself.
  const seen=useRef<Set<number>|null>(null);

  const load=()=>api<{trainers:Trainer[];sources:{label:string;count:number}[];lastSync:string|null}>('/api/trainers')
    .then(d=>{
      setTrainers(d.trainers);setSources(d.sources||[]);setLastSync(d.lastSync);
      const ids=new Set(d.trainers.flatMap(t=>t.assessments.map(a=>a.id)));
      if(seen.current){
        const fresh=[...ids].filter(id=>!seen.current!.has(id));
        if(fresh.length){
          const owner=d.trainers.find(t=>t.assessments.some(a=>a.id===fresh[0]));
          setPing(`${fresh.length} new assessment${fresh.length===1?'':'s'} received${owner?` · ${owner.name}`:''}`);
          setTimeout(()=>setPing(''),7000);
        }
      }
      seen.current=ids;
    })
    .catch(e=>setError(e.message)).finally(()=>setBusy(false));

  // The API pulls new external submissions (throttled server-side) on every read, so this poll is
  // what makes a submission to the form or either Zite app appear without a manual refresh.
  useEffect(()=>{
    void load();
    const tick=()=>{if(!document.hidden&&listening)void load();};
    const timer=setInterval(tick,POLL_MS);
    document.addEventListener('visibilitychange',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};
  },[listening]);

  /** Pulls both Fillout forms and both Zite apps in now, then refreshes the scorecards. */
  async function syncFillout(){
    setSyncing(true);
    try{
      const d=await api<SyncResult>('/api/trainer-reviews',{method:'POST',body:JSON.stringify({})});
      const broken=d.sources.find(x=>x.error);
      // A submission whose studio the workspace does not recognise is reported by name — it used
      // to be counted as "already on file", which is what made those submissions look lost.
      const unmatchedStudios=[...new Set(d.sources.flatMap(s=>s.unmatchedStudios))];
      const message=broken?`${broken.label}: ${broken.error}`
        :d.imported?`${d.imported} new assessment${d.imported===1?'':'s'} recorded${d.skipped?`, ${d.skipped} already on file`:''}.`
        :`Up to date — ${d.skipped} assessment${d.skipped===1?'':'s'} already on file.`;
      notify(broken?message:message,broken?'error':'success');
      // A row that threw on import is reported with its reason rather than silently dropped.
      const failures=d.sources.flatMap(s=>(s.failures||[]).map(f=>`${s.label}: ${f.reason}`));
      const reasons=[...new Set(failures)].slice(0,3);
      if(reasons.length)notify(`${d.failed} submission${d.failed===1?'':'s'} could not be recorded — ${reasons.join(' · ')}`,'error');
      if(unmatchedStudios.length)notify(`${d.unmatched} submission${d.unmatched===1?'':'s'} skipped — unrecognised studio: ${unmatchedStudios.join(', ')}. Add the studio in Settings, or correct the form's studio field.`,'error');
      setLastSync(d.lastSync);
      await load();
    }catch(e){notify((e as Error).message,'error');}
    finally{setSyncing(false);}
  }

  const filtered=useMemo(()=>trainers.filter(t=>!q||t.name.toLowerCase().includes(q.toLowerCase())),[trainers,q]);
  const active=useMemo(()=>trainers.find(t=>t.name===activeName),[trainers,activeName]);
  const withScores=trainers.filter(t=>t.avgScore!==null);
  const orgAvg=withScores.length?Math.round(withScores.reduce((n,t)=>n+(t.avgScore||0),0)/withScores.length):null;

  return (
    <Shell title="Trainer reviews, consolidated." eyebrow="TRAINING & QUALITY" action={
      <div className="flex-row">
        {user&&<button className="btn" disabled={syncing} onClick={()=>void syncFillout()}>{syncing?<Loader2 size={13} className="animate-spin"/>:<DownloadCloud size={14}/>}{syncing?'Syncing…':'Sync assessments'}</button>}
        <Badge tone="blue"><GraduationCap size={12}/>{trainers.length} trainers tracked</Badge>
      </div>}>
      <div className="iris-banner">
        <div className="iris-orb"><GraduationCap size={24}/></div>
        <div className="grow">
          <h2>Every assessment and every piece of feedback, in one scorecard.</h2>
          <p>Weighted evaluation scores, member compliments and logged concerns — combined per trainer so coaching conversations start from evidence.</p>
          <div className="flex-row wrap" style={{marginTop:10,gap:6}}>
            <button className="badge" onClick={()=>setListening(v=>!v)} title={listening?`Checking every ${POLL_MS/1000} seconds`:'Live updates paused'}>
              <Radio size={11} style={{color:listening?'var(--green)':'var(--muted)'}}/>{listening?'Listening for new submissions':'Live updates paused'}
            </button>
            {lastSync&&<Badge>Last synced {relativeTime(lastSync)}</Badge>}
            {sources.map(s=><Badge key={s.label}>{s.label} · {s.count}</Badge>)}
          </div>
        </div>
        {orgAvg!==null&&<Badge tone={orgAvg>=80?'green':orgAvg>=65?'amber':'red'}>Org average {orgAvg}%</Badge>}
      </div>
      {ping&&<div className="info-box pop-in" style={{marginBottom:16}}>✦ {ping}</div>}
      <div style={{marginBottom:20}}><SearchField value={q} onChange={setQ} placeholder="Find a trainer…"/></div>
      {error&&<div className="error-box">{error}</div>}
      {busy?<Loading/>:!filtered.length?<Empty art="people" title="No trainers found"/>:(
        <div className="entity-grid rise-stagger">
          {filtered.map(t=>(
            <button key={t.name} className="card entity-card" onClick={()=>setActiveName(t.name)}>
              <div className="between">
                <Avatar name={t.name} large tone={t.bandTone==='green'?'green':t.bandTone==='amber'?'amber':''}/>
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
        <Modal open onClose={()=>setActiveName(undefined)} title={active.name} description="Consolidated trainer performance report" size="wide" resetKey={active.name}>
          <TrainerReport trainer={active}/>
        </Modal>
      )}
    </Shell>
  );
}
