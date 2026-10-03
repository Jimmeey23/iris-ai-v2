"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {GraduationCap,Star,Heart,TriangleAlert,ChevronRight,DownloadCloud,Loader2,Radio,Settings2} from 'lucide-react';
import {Shell} from '@/components/shell';
import {api,SearchField,Badge,Loading,Empty,Modal,Avatar,useApp} from '@/components/ui';
import {TrainerReport,type Trainer} from '@/components/trainer-report';
import {relativeTime} from '@/lib/utils';
import {TrainerImg} from '@/components/ticket-art';
import {ImageStreamHero} from '@/components/image-stream-hero';
import {TRAINER_IMAGES} from '@/lib/constants';
import { IrisMarquee } from '@/components/iris-marquee';


/** How often the tab re-reads the scorecards. Each read also queues a throttled background pull
 *  of the form and the two Zite apps, whose results show up on the following read. */
const POLL_MS=60000;

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
  const[hidden,setHidden]=useState<{name:string;displayName:string;totalTickets:number}[]>([]);
  const[roster,setRoster]=useState<string[]>([]);
  const[manage,setManage]=useState<Trainer>();
  const[mergeInto,setMergeInto]=useState('');
  const[renameTo,setRenameTo]=useState('');
  const[syncing,setSyncing]=useState(false);
  const[listening,setListening]=useState(true);
  const[ping,setPing]=useState('');
  const{notify,user}=useApp();
  // Which assessments were already on screen, so a submission that lands mid-session announces itself.
  const seen=useRef<Set<number>|null>(null);

  const load=()=>api<{trainers:Trainer[];groups:{city:string;trainers:Trainer[]}[];hidden:{name:string;displayName:string;totalTickets:number}[];roster:string[];sources:{label:string;count:number}[];lastSync:string|null}>('/api/trainers')
    .then(d=>{
      setTrainers(d.trainers);setSources(d.sources||[]);setLastSync(d.lastSync);
      setHidden(d.hidden||[]);setRoster(d.roster||[]);
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

  // The API queues a pull of new external submissions (throttled server-side) after every read, so
  // this poll is what makes a submission appear without a manual refresh. It pauses while the tab
  // is hidden and catches up as soon as it is visible again.
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

  const filtered=useMemo(()=>trainers.filter(t=>!q||[t.displayName||t.name,t.primaryStudio,t.city].some(v=>(v||'').toLowerCase().includes(q.toLowerCase()))),[trainers,q]);
  /** Mumbai and Bengaluru, and nothing below that.
   *
   *  Grouping used to nest trainers under their busiest studio, which split a city's team
   *  across four headings and moved somebody the moment they covered a class elsewhere. A
   *  trainer belongs to a city; the studios they have been reviewed at are on their card. */
  const grouped=useMemo(()=>{
    const cityOrder=(city:string)=>city==='Mumbai'?0:city==='Bengaluru'?1:2;
    const byCity=new Map<string,Trainer[]>();
    for(const trainer of filtered)byCity.set(trainer.city,[...(byCity.get(trainer.city)||[]),trainer]);
    return [...byCity.entries()]
      .sort(([a],[b])=>cityOrder(a)-cityOrder(b)||a.localeCompare(b))
      .map(([city,people])=>({city,people:people.sort((a,b)=>(a.displayName||a.name).localeCompare(b.displayName||b.name))}));
  },[filtered]);

  /** Administrator corrections. Every one of these is reversible and none touches a review. */
  async function correct(body:Record<string,unknown>,message:string){
    try{
      await api('/api/trainers',{method:'PATCH',body:JSON.stringify(body)});
      notify(message,'success');
      await load();
    }catch(e){notify((e as Error).message,'error');}
  }
  async function removeReview(review:{id:number;ticketNumber:string;score:number}){
    if(!window.confirm(`Remove review ${review.ticketNumber} (${review.score||'unscored'}%)? The review and its ticket are deleted. This is recorded in the audit log and cannot be undone.`))return;
    try{
      await api(`/api/trainers?reviewId=${review.id}`,{method:'DELETE'});
      notify('Review removed.','success');
      await load();
    }catch(e){notify((e as Error).message,'error');}
  }
  const active=useMemo(()=>trainers.find(t=>t.name===activeName),[trainers,activeName]);
  const withScores=trainers.filter(t=>t.avgScore!==null);
  const orgAvg=withScores.length?Math.round(withScores.reduce((n,t)=>n+(t.avgScore||0),0)/withScores.length):null;

  return (
    <Shell title="Trainer reviews, consolidated." eyebrow="TRAINING & QUALITY" banner={<IrisMarquee page="trainers" />} action={
      <div className="flex-row">
        {user&&<button className="btn" disabled={syncing} onClick={()=>void syncFillout()}>{syncing?<Loader2 size={13} className="animate-spin"/>:<DownloadCloud size={14}/>}{syncing?'Syncing…':'Sync assessments'}</button>}
        <Badge tone="blue"><GraduationCap size={12}/>{trainers.length} trainers tracked</Badge>
      </div>}>
      {/* The corridor: every trainer portrait on file rides the two rails that
          open outward from the centred copy — the headline reads from the
          middle with the stream flowing away on both sides of it. */}
      <ImageStreamHero
        images={Object.values(TRAINER_IMAGES).map(src=>({src,alt:'Trainer portrait'}))}
        cards={9}
        speed={23}
        axis={50}
        className="tr-stream-hero"
        path={{ perspective: 26, railBirth: 15, railExit: 54, fan: 2.2, turnBirth: 10, turnExit: 32 }}
      >
        <div className="tr-stream-copy">
          <span className="eyebrow">TRAINING &amp; QUALITY</span>
          <h2>Every assessment and every piece of feedback, in one scorecard.</h2>
          <p>Weighted evaluation scores, member compliments and logged concerns — combined per trainer so coaching conversations start from evidence.</p>
          <div className="tr-stream-facts">
            <button className="badge" onClick={()=>setListening(v=>!v)} title={listening?`Checking every ${POLL_MS/1000} seconds`:'Live updates paused'}>
              <Radio size={11} style={{color:listening?'var(--green)':'var(--muted)'}}/>{listening?'Listening for new submissions':'Live updates paused'}
            </button>
            {lastSync&&<Badge>Last synced {relativeTime(lastSync)}</Badge>}
            {sources.map(s=><Badge key={s.label}>{s.label} · {s.count}</Badge>)}
            {orgAvg!==null&&<Badge tone={orgAvg>=80?'green':orgAvg>=65?'amber':'red'}>Org average {orgAvg}%</Badge>}
          </div>
        </div>
      </ImageStreamHero>
      {ping&&<div className="info-box pop-in" style={{marginBottom:16}}>✦ {ping}</div>}
      <div style={{marginBottom:20}}><SearchField value={q} onChange={setQ} placeholder="Find a trainer, studio or city…"/></div>
      {error&&<div className="error-box">{error}</div>}
      {busy?<Loading/>:!filtered.length?<Empty art="people" title="No trainers found"/>:(
        <div className="trainer-groups">
          {grouped.map(group => (
            <section className="trainer-city-group" key={group.city}>
              <header className="trainer-group-heading">
                <span>{group.city} trainers</span>
                <small>{group.people.length} {group.people.length === 1 ? 'trainer' : 'trainers'}</small>
              </header>
              <div className="entity-grid rise-stagger">
                {group.people.map(t => (
                  <div key={t.name} className="trainer-profile-card-wrap">
                    <button className="trainer-profile-card" onClick={() => setActiveName(t.name)}>
                      {/* Compact portrait row: a small framed headshot beside the name,
                          so the card leads with identity and data, not a photo wall. */}
                      <div className="trainer-profile-meta">
                        <div className="tpc-head">
                          <span className="tpc-photo">
                            <TrainerImg name={t.name} className="tpc-photo-img" fallback={
                              <Avatar name={t.displayName || t.name} large tone={t.bandTone === 'green' ? 'green' : t.bandTone === 'amber' ? 'amber' : ''}/>
                            }/>
                          </span>
                          <span className="tpc-id">
                            <h3>{t.displayName || t.name}</h3>
                            <p>{t.band || 'Awaiting a formal assessment'} · {t.studioSummary.length ? t.studioSummary.length + (t.studioSummary.length === 1 ? ' studio' : ' studios') : 'No studio on record'}</p>
                          </span>
                          {t.avgScore !== null ? <Badge tone={t.bandTone}>{t.avgScore}%</Badge> : <Badge>No assessments</Badge>}
                        </div>
                        <div className="flex-row wrap" style={{marginTop: 12, gap: 6}}>
                          <span className="tag"><Star size={10}/>{t.assessmentCount} assessments</span>
                          <span className="tag"><Heart size={10}/>{t.complimentCount} compliments</span>
                          <span className="tag"><TriangleAlert size={10}/>{t.issueCount} flagged</span>
                        </div>
                        {/* Said on the card rather than silently: a folded spelling and an
                            unresolvable first name are both things somebody should know about
                            the data they are reading. */}
                        {!!t.mergedFrom?.length && (
                          <p className="tpc-note">Also filed as {t.mergedFrom.join(', ')}</p>
                        )}
                        {!!t.ambiguousWith?.length && (
                          <p className="tpc-note tpc-note-warn">
                            “{t.name}” could be {t.ambiguousWith.join(' or ')} — kept separate until somebody says which
                          </p>
                        )}
                        <div className="entity-foot"><span>{t.totalTickets} linked tickets</span><ChevronRight size={14}/></div>
                      </div>
                    </button>
                    {user?.role === 'admin' && (
                      <button className="tpc-manage" onClick={() => {setManage(t); setMergeInto(''); setRenameTo(t.displayName || t.name);}} title="Edit this trainer card">
                        <Settings2 size={13}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          {user?.role === 'admin' && hidden.length > 0 && (
            <section className="trainer-city-group">
              <header className="trainer-group-heading">
                <span>Hidden cards</span>
                <small>{hidden.length} removed from the page · reviews still on file</small>
              </header>
              <div className="flex-row wrap" style={{gap: 8}}>
                {hidden.map(h => (
                  <button key={h.name} className="badge" onClick={() => void correct({action: 'hide', name: h.name, hidden: false}, `${h.displayName} restored.`)}>
                    {h.displayName} · {h.totalTickets} tickets · restore
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

      )}
      {active&&(
        <Modal open onClose={()=>setActiveName(undefined)} title={active.displayName||active.name} description="Consolidated trainer performance report" size="wide" resetKey={active.name}>
          <TrainerReport
            trainer={active}
            canManage={user?.role==='admin'}
            onRemoveReview={async review=>{await removeReview(review);}}
          />
        </Modal>
      )}
      {/* Administrator corrections to one card. Deliberately a separate dialog from the report:
          the report is for reading somebody's file, this is for fixing the record. */}
      {manage&&(
        <Modal open onClose={()=>setManage(undefined)} title={`Edit ${manage.displayName||manage.name}`}
          description="Corrections to how this trainer is grouped and labelled. Reviews are not affected.">
          <div className="stack" style={{gap:18}}>
            <div>
              <span className="tr-kpi-label">City</span>
              <p className="muted" style={{fontSize:12,margin:'4px 0 8px'}}>Currently {manage.city}. Trainers are grouped by city, not by studio.</p>
              <div className="flex-row" style={{gap:8}}>
                {(['Mumbai','Bengaluru'] as const).map(city=>(
                  <button key={city} className={manage.city===city?'btn-primary':'btn'} disabled={manage.city===city}
                    onClick={()=>{void correct({action:'city',name:manage.name,city},`${manage.displayName||manage.name} moved to ${city}.`);setManage(undefined);}}>
                    {city}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="tr-kpi-label">Name on the card</span>
              <p className="muted" style={{fontSize:12,margin:'4px 0 8px'}}>A correction to the label only. It does not regroup anything, and clearing it restores {manage.name}.</p>
              <div className="flex-row" style={{gap:8}}>
                <input value={renameTo} onChange={e=>setRenameTo(e.target.value)} placeholder={manage.name} style={{flex:1}}/>
                <button className="btn" onClick={()=>{void correct({action:'rename',name:manage.name,displayName:renameTo.trim()===manage.name?'':renameTo.trim()},'Name updated.');setManage(undefined);}}>Save</button>
              </div>
            </div>

            <div>
              <span className="tr-kpi-label">Merge into another trainer</span>
              <p className="muted" style={{fontSize:12,margin:'4px 0 8px'}}>
                Folds every ticket filed as “{manage.name}” into the trainer you choose. Use this for a
                spelling that is the same person, and for a first name the app could not resolve on its own.
              </p>
              <div className="flex-row" style={{gap:8}}>
                <select value={mergeInto} onChange={e=>setMergeInto(e.target.value)} style={{flex:1}}>
                  <option value="">Choose a trainer…</option>
                  {roster.filter(name=>name!==manage.name).map(name=><option key={name}>{name}</option>)}
                </select>
                <button className="btn" disabled={!mergeInto}
                  onClick={()=>{void correct({action:'merge',from:manage.name,into:mergeInto},`“${manage.name}” merged into ${mergeInto}.`);setManage(undefined);}}>
                  Merge
                </button>
              </div>
              {!!manage.mergedFrom?.length&&(
                <div className="flex-row wrap" style={{gap:6,marginTop:10}}>
                  <span className="muted" style={{fontSize:11}}>Folded in:</span>
                  {manage.mergedFrom.map(spelling=>(
                    <button key={spelling} className="badge" title="Separate this spelling again"
                      onClick={()=>{void correct({action:'unmerge',from:spelling},`“${spelling}” separated again.`);setManage(undefined);}}>
                      {spelling} · undo
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="tr-kpi-label">Remove the card</span>
              <p className="muted" style={{fontSize:12,margin:'4px 0 8px'}}>
                Takes {manage.displayName||manage.name} off this page. The {manage.assessmentCount} review{manage.assessmentCount===1?'':'s'} and
                {' '}{manage.totalTickets} linked ticket{manage.totalTickets===1?'':'s'} stay on file, and the card can be restored.
              </p>
              <button className="btn-danger-ghost"
                onClick={()=>{void correct({action:'hide',name:manage.name,hidden:true},`${manage.displayName||manage.name} hidden.`);setManage(undefined);}}>
                Hide this trainer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
