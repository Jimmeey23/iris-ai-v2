"use client";
import Link from 'next/link';import {useEffect,useMemo,useState} from 'react';import {Plus,Sparkles,ArrowUpRight,ChevronRight,ChevronLeft,CalendarDays,LayoutGrid,List,Columns3,Grid2x2,Rss,SlidersHorizontal,Download,BookmarkPlus,TriangleAlert,Clock3,ArrowRight,Users,RefreshCw,Save} from 'lucide-react';
import {Shell} from './shell';import {useTickets,Stats,PulseStats,TicketTable,Kanban,TicketCard,MatrixView,FeedView,filterTickets} from './tickets-board';import {TicketDialog} from './ticket-detail';import {TicketComposer} from './ticket-composer';import {api,useApp,Badge,SearchField,Loading,Empty,Modal,Field} from './ui';
import {STUDIOS,CATEGORIES,STATUS_LABELS} from '@/lib/constants';import {SPECIAL_TEMPLATES} from '@/lib/guided-templates';import type {GuidedTemplate} from '@/lib/ticket-contract';import {slaState} from '@/lib/utils';import {csvDownload} from '@/lib/display';

const QUICK_TEMPLATES=['membership-freeze','member-class-experience','member-compliment'].map(id=>SPECIAL_TEMPLATES.find(t=>t.id===id)).filter((t):t is GuidedTemplate=>Boolean(t));

export function CommandCenter({directory=false}:{directory?:boolean}){
  const{tickets,loading,error,reload}=useTickets();
  const{user,view,setView,notify}=useApp();
  const[q,setQ]=useState(''),[studio,setStudio]=useState(''),[priority,setPriority]=useState(''),[status,setStatus]=useState(''),[category,setCategory]=useState(''),[statusBucket,setStatusBucket]=useState<string[]>([]),[tab,setTab]=useState('all'),[advanced,setAdvanced]=useState(false),[range,setRange]=useState('all'),[page,setPage]=useState(0);
  const[detail,setDetail]=useState<number>(),[create,setCreate]=useState(false),[template,setTemplate]=useState<GuidedTemplate>(),[selected,setSelected]=useState<number[]>([]),[bulk,setBulk]=useState(false),[bulkStatus,setBulkStatus]=useState('in_progress'),[busy,setBusy]=useState(false);
  const[saved,setSaved]=useState<Record<string,string>[]>([]),[saveOpen,setSaveOpen]=useState(false),[saveName,setSaveName]=useState('');

  useEffect(()=>{void api<{savedFilters?:Record<string,string>[]}>('/api/preferences').then(p=>setSaved(p.savedFilters||[])).catch(()=>{});},[]);
  useEffect(()=>setPage(0),[q,studio,priority,status,category,tab,range]);

  const timeFiltered=tickets.filter(t=>range==='all'||Date.now()-new Date(t.createdAt).getTime()<Number(range)*86400000);
  const open=timeFiltered.filter(t=>!['resolved','closed','recorded'].includes(t.status));
  const urgent=open.filter(t=>['critical','high'].includes(t.priority));
  const slaRisk=open.filter(t=>slaState(t.slaDueAt,t.status)!=='ok');
  const mine=timeFiltered.filter(t=>Boolean(user?.staffId)&&t.assignedStaffId===user?.staffId);
  const feedback=timeFiltered.filter(t=>['compliment','feedback','assessment'].includes(t.kind));
  const filtered=useMemo(()=>filterTickets(timeFiltered,q,studio,priority,'').filter(t=>(!status||t.status===status)&&(!category||t.category===category)&&(!statusBucket.length||statusBucket.includes(t.status))&&(tab==='all'||tab==='attention'&&urgent.some(u=>u.id===t.id)||tab==='mine'&&mine.some(m=>m.id===t.id)||tab==='feedback'&&feedback.some(m=>m.id===t.id)||tab==='sla'&&slaRisk.some(m=>m.id===t.id))),[timeFiltered,q,studio,priority,status,category,statusBucket,tab,urgent,mine,feedback]);
  const pageSize=7,pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,pageCount-1);
  const rows=filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize);

  function reset(){setQ('');setStudio('');setPriority('');setStatus('');setCategory('');setStatusBucket([]);setTab('all');}
  function exportTickets(){csvDownload('iris-tickets.csv',[['Ticket','Title','Logged for','Category','Subcategory','Studio','Status','Priority','Owner','Department','SLA due','Created'],...filtered.map(t=>[t.ticketNumber,t.title,t.memberName,t.category,t.subcategory,t.studio,t.status,t.priority,t.assignedStaffName,t.departmentName,t.slaDueAt,t.createdAt])]);notify('Filtered ticket report exported.');}
  async function saveView(){if(!saveName.trim())return;const list=[...saved,{name:saveName.trim(),q,studio,priority,status,category,tab,range,view}];try{await api('/api/preferences',{method:'PATCH',body:JSON.stringify({savedFilters:list})});setSaved(list);setSaveOpen(false);setSaveName('');notify('Your view is saved for future sessions.');}catch(e){notify((e as Error).message,'error');}}
  async function applyBulk(){setBusy(true);const outcomes=await Promise.allSettled(selected.map(id=>{const t=tickets.find(t=>t.id===id);return api('/api/tickets/'+id,{method:'PATCH',body:JSON.stringify({status:bulkStatus,version:t?.version})});}));const success=outcomes.filter(o=>o.status==='fulfilled').length;notify(`${success} ticket${success===1?'':'s'} updated${success<selected.length?`; ${selected.length-success} could not be changed (permissions or concurrent edits).`:'.'}`,success<selected.length?'error':'success');setSelected([]);setBulk(false);setBusy(false);await reload();}
  function openMatrixCell(cat:string,states:string[]){setCategory(cat);setStatusBucket(states);setView('list');setTab('all');}

  const workspace=(
    <section className="card tickets-panel">
      <div className="section-head">
        <div className="tickets-title"><h2>{directory?'All logged tickets':'Ticket workspace'}</h2><span className="small-counter">{filtered.length}</span></div>
        <div className="flex-row">
          <button className="icon-btn" title="Save current filters" aria-label="Save view" onClick={()=>setSaveOpen(true)}><BookmarkPlus size={14}/></button>
          <div className="view-switch">
            <button aria-label="List view" title="List view" className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={14}/></button>
            <button aria-label="Board view" title="Board view" className={view==='board'?'active':''} onClick={()=>setView('board')}><Columns3 size={14}/></button>
            <button aria-label="Card view" title="Card view" className={view==='cards'?'active':''} onClick={()=>setView('cards')}><LayoutGrid size={14}/></button>
            <button aria-label="Matrix view" title="Category × status matrix" className={view==='matrix'?'active':''} onClick={()=>setView('matrix')}><Grid2x2 size={14}/></button>
            <button aria-label="Feed view" title="Chronological feed" className={view==='feed'?'active':''} onClick={()=>setView('feed')}><Rss size={14}/></button>
          </div>
        </div>
      </div>
      <div className="workspace-tabs">{[{id:'all',name:'All tickets',count:timeFiltered.length},{id:'attention',name:'Needs attention',count:urgent.length},{id:'mine',name:'Assigned to me',count:mine.length},{id:'feedback',name:'Feedback',count:feedback.length},{id:'sla',name:'SLA at risk',count:slaRisk.length}].map(t=><button key={t.id} className={tab===t.id?'active':''} onClick={()=>setTab(t.id)}>{t.name}<span>{t.count}</span></button>)}</div>
      <div className="ticket-toolbar">
        <SearchField value={q} onChange={setQ} placeholder="Search tickets or names…"/>
        <select className="filter-select" aria-label="Filter studio" value={studio} onChange={e=>setStudio(e.target.value)}><option value="">All studios</option>{STUDIOS.map(s=><option key={s.id}>{s.name}</option>)}</select>
        <button className={'btn btn-sm'+(advanced?' btn-soft':'')} onClick={()=>setAdvanced(v=>!v)}><SlidersHorizontal size={12}/>Filters</button>
        <button className="icon-btn" aria-label="Export tickets" title="Export filtered tickets" onClick={exportTickets}><Download size={13}/></button>
      </div>
      {advanced&&<div className="ticket-toolbar" style={{background:'var(--surface-2)'}}>
        <select className="filter-select" aria-label="Filter status" value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
        <select className="filter-select" aria-label="Filter priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{['critical','high','medium','low'].map(p=><option key={p}>{p}</option>)}</select>
        <select className="filter-select" aria-label="Filter category" value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
        <button className="text-btn" onClick={reset}>Reset</button>
      </div>}
      {statusBucket.length>0&&<div className="ticket-toolbar" style={{background:'var(--accent-soft)'}}><Badge tone="blue">Matrix filter: {category} · {statusBucket.map(s=>STATUS_LABELS[s]).join(', ')}</Badge><button className="text-btn" onClick={()=>{setStatusBucket([]);setCategory('');}}>Clear</button></div>}
      {saved.length>0&&<div className="ticket-toolbar"><span className="eyebrow">SAVED VIEWS</span>{saved.map((s,i)=><button className="btn btn-sm" key={i} onClick={()=>{setQ(s.q||'');setStudio(s.studio||'');setPriority(s.priority||'');setStatus(s.status||'');setCategory(s.category||'');setTab(s.tab||'all');setRange(s.range||'all');setView(s.view||'list');}}>{s.name}</button>)}</div>}
      {selected.length>0&&<div className="ticket-toolbar" style={{background:'var(--accent-soft)'}}><Badge tone="blue">{selected.length} selected</Badge><button className="btn btn-sm" onClick={()=>setBulk(true)}>Update status</button><button className="text-btn" onClick={()=>setSelected([])}>Clear selection</button></div>}
      {loading?<div style={{padding:20}}><Loading/></div>
        :error?<div className="error-box" style={{margin:20}}>{error}<button className="text-btn" onClick={()=>void reload()}>Retry</button></div>
        :!filtered.length?<Empty art="search" title={tab==='mine'&&!user?'Sign in for your personal queue':'All clear here'} detail={tab==='mine'&&!user?'Link your staff profile to see assigned tickets.':'No tickets match these filters.'} action={<button className="btn" onClick={reset}>Show all tickets</button>}/>
        :view==='board'?<Kanban tickets={filtered} onSelect={setDetail}/>
        :view==='matrix'?<MatrixView tickets={filtered} onCell={openMatrixCell}/>
        :view==='feed'?<FeedView tickets={filtered} onSelect={setDetail}/>
        :view==='cards'?<div className="ticket-cards-grid rise-stagger">{rows.map(t=><TicketCard key={t.id} ticket={t} onSelect={setDetail}/>)}</div>
        :<TicketTable tickets={rows} onSelect={setDetail} selected={selected} onToggle={id=>setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}/>}
      {!['board','matrix','feed'].includes(view)&&<div className="table-pagination"><span>{filtered.length?currentPage*pageSize+1:0}–{Math.min((currentPage+1)*pageSize,filtered.length)} of {filtered.length} tickets</span><div className="pagination-controls"><button disabled={!currentPage} aria-label="Previous ticket page" onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft size={12}/></button>{Array.from({length:Math.min(pageCount,4)},(_,i)=><button key={i} className={currentPage===i?'active':''} onClick={()=>setPage(i)}>{i+1}</button>)}<button disabled={currentPage>=pageCount-1} aria-label="Next ticket page" onClick={()=>setPage(p=>p+1)}><ChevronRight size={12}/></button></div></div>}
    </section>
  );

  return (
    <Shell title={directory?'Every ticket, one shared log.':'The team\u2019s ops log.'} eyebrow={directory?'TICKET DIRECTORY':'INTERNAL OPERATIONS'} action={<div className="flex-row"><select className="btn" aria-label="Reporting date range" value={range} onChange={e=>setRange(e.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select><button className="btn btn-primary" onClick={()=>setCreate(true)}><Plus size={14}/>Log a ticket</button></div>}>
      {!directory&&<div className="cc-overview">
        <div className="iris-banner">
          <span className="iris-banner-shine" aria-hidden="true"/>
          <div className="iris-orb"><Sparkles size={24}/></div>
          <div className="grow"><div className="flex-row"><h2>Saw something? Heard something? Tell Iris.</h2><Badge tone="blue">AI ASSISTANT</Badge></div><p>Log it in your own words — Iris classifies it, links the right member or class, and routes it to the right desk with a follow-up target.</p></div>
          <Link className="btn btn-primary" href="/iris">Log with Iris <ArrowUpRight size={14}/></Link>
        </div>
        <Stats tickets={timeFiltered}/>
        <div style={{marginTop:16}}><PulseStats tickets={timeFiltered}/></div>
      </div>}
      <div className={(!directory&&view==='list'?'overview-grid':'')+(!directory?' cc-overview':'')} style={{marginTop:!directory?22:0}}>
        {workspace}
        {!directory&&view==='list'&&<aside className="sidebar-widgets">
          <section className="card insights-widget">
            <h3><Sparkles size={15} className="accent"/>Iris intelligence <Badge tone="purple">LIVE</Badge></h3>
            <p className="sub">Small signals. Meaningful action.</p>
            <div className="insight-line"><div className="insight-icon"><TriangleAlert size={13}/></div><div><strong>{slaRisk.length} ticket{slaRisk.length===1?'':'s'} need a timely follow-up</strong><p>{slaRisk.length?'Bring at-risk and overdue tickets to the top of the team\u2019s list.':'Every follow-up target is currently on track.'}</p><button className="text-btn" style={{fontSize:10,marginTop:7}} onClick={()=>{setTab('sla');setAdvanced(true);}}>Review priority tickets <ArrowRight size={11}/></button></div></div>
            <div className="insight-line"><div className="insight-icon" style={{color:'var(--accent)',background:'var(--accent-soft)'}}><Users size={13}/></div><div><strong>{new Set(open.filter(t=>t.assignedStaffId).map(t=>t.assignedStaffId)).size} people carrying the load</strong><p>Tickets are matched automatically to the right department and studio owner.</p></div></div>
            <div className="insight-footer"><span>Based on your live ticket data</span><RefreshCw size={11}/></div>
          </section>
          <section className="card studio-pulse">
            <div className="between"><h3>Studio pulse</h3><Link className="text-btn" href="/radar">Ops Radar <ArrowUpRight size={14}/></Link></div>
            <p className="muted" style={{fontSize:10,marginTop:5}}>Active tickets across your studios · Live Radar</p>
            {STUDIOS.map((s,i)=>{const count=open.filter(t=>t.studio===s.name).length;return <div className="studio-row" key={s.id}><div className="between"><span>{s.name.split(',')[0].replace('the Studio by ','')}</span><strong>{count}</strong></div><div className="progress-bar"><span style={{width:(open.length?count/open.length*100:0)+'%',background:i%2?'var(--purple)':'var(--accent)'}}/></div></div>;})}
          </section>
          <section className="card quick-templates">
            <div className="between"><h3>A head start</h3><Link href="/templates" className="text-btn" style={{fontSize:10}}>View all <ChevronRight size={11}/></Link></div>
            {QUICK_TEMPLATES.map(t=><button className="quick-template" key={t.id} onClick={()=>setTemplate(t)}><div className="quick-template-icon"><CalendarDays size={14}/></div><div className="grow"><strong>{t.title}</strong><p>Guided template</p></div><ChevronRight size={12} className="muted"/></button>)}
          </section>
        </aside>}
      </div>

      {detail&&<TicketDialog open id={detail} onClose={()=>setDetail(undefined)} onUpdated={()=>void reload()}/>}
      <TicketComposer open={create} onClose={()=>setCreate(false)} onCreated={id=>{void reload();setDetail(id);}}/>
      {template&&<TicketComposer open template={template} onClose={()=>setTemplate(undefined)} onCreated={id=>{void reload();setDetail(id);}}/>}
      <Modal open={saveOpen} onClose={()=>setSaveOpen(false)} title="Save this view" description="Keep your filters and layout for your next visit." size="narrow" footer={<><span className="muted" style={{fontSize:11}}>Private to your workspace identity</span><button className="btn btn-primary" disabled={!saveName.trim()} onClick={()=>void saveView()}><Save size={13}/>Save view</button></>}><Field label="View name"><input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="e.g. Bandra · high priority"/></Field></Modal>
      <Modal open={bulk} onClose={()=>setBulk(false)} title="Update selected tickets" description={`${selected.length} tickets selected. Changes are individually checked for permissions and conflicts.`} size="narrow" footer={<><button className="btn" onClick={()=>setBulk(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={()=>void applyBulk()}>Apply changes</button></>}><Field label="Move to status"><select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>{['triaged','assigned','in_progress','waiting_on_member','waiting_on_vendor'].map(k=><option key={k} value={k}>{STATUS_LABELS[k]}</option>)}</select></Field></Modal>
    </Shell>
  );
}
