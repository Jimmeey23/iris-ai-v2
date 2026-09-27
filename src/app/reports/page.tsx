"use client";
import {useCallback,useDeferredValue,useEffect,useMemo,useRef,useState} from 'react';
import {FileBarChart2,Download,ChevronLeft,ChevronRight,RefreshCw,ChevronDown,FileSpreadsheet,FileJson,FileText,FileType,Code2,Columns3,ShieldCheck,Clock3,TriangleAlert,CheckCircle2,TrendingUp,TrendingDown,Loader2,Filter,X,ClipboardList,Gauge,Users,Smile,CalendarClock,FolderTree,Building2,MapPin,Inbox} from 'lucide-react';
import type {ComponentType} from 'react';
import {Shell} from '@/components/shell';
import {api,SearchField,Badge,Loading,Empty,Avatar,useApp,Tabs} from '@/components/ui';
import {STUDIOS,STATUS_LABELS} from '@/lib/constants';
import {exportReport,type ExportFormat,type ExportReport} from '@/lib/report-export';

type ReportMeta={id:string;name:string;description:string;group:string;columns:{key:string;label:string}[]};
type GroupMeta={id:string;label:string;blurb:string};
type ReportData=ExportReport&{group:string;total:number;page:number;pageSize:number;hasMore:boolean;trend:{date:string;label:string;created:number;resolved:number}[]};

const FORMATS:{id:ExportFormat;label:string;hint:string;icon:typeof FileText}[]=[
  {id:'xlsx',label:'Excel workbook',hint:'Data, metrics & breakdowns as sheets',icon:FileSpreadsheet},
  {id:'csv',label:'CSV',hint:'Metrics header + data rows',icon:FileText},
  {id:'pdf',label:'PDF report',hint:'Print-ready, paginated',icon:FileType},
  {id:'docx',label:'Word document',hint:'Editable narrative report',icon:FileType},
  {id:'json',label:'JSON',hint:'Full structured payload',icon:FileJson},
  {id:'html',label:'HTML page',hint:'Self-contained web report',icon:Code2},
  {id:'md',label:'Markdown',hint:'For Notion, Slack, docs',icon:FileText},
];
/** One icon per shelf — keyed by the catalogue's group id. */
const GROUP_ICONS:Record<string,ComponentType<{size?:number|string}>>={
  Operational:ClipboardList,Compliance:ShieldCheck,Performance:Gauge,People:Users,
  Sentiment:Smile,'Time-based':CalendarClock,'By category':FolderTree,
  'By department':Building2,'By studio':MapPin,'By source':Inbox,
};
/** The taxonomy shelves start collapsed — the curated six stay open. */
const DEFAULT_COLLAPSED=new Set(['By category','By department','By studio','By source']);
const dayStr=(offsetDays:number)=>{const d=new Date();d.setDate(d.getDate()+offsetDays);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const PRESETS:{id:string;label:string;from:()=>string;to:()=>string}[]=[
  {id:'today',label:'Today',from:()=>dayStr(0),to:()=>dayStr(0)},
  {id:'7d',label:'Last 7 days',from:()=>dayStr(-6),to:()=>''},
  {id:'30d',label:'Last 30 days',from:()=>dayStr(-29),to:()=>''},
  {id:'month',label:'This month',from:()=>`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`,to:()=>''},
  {id:'all',label:'All time',from:()=>'',to:()=>''},
];

export default function ReportsPage(){
  const{notify}=useApp();
  const[list,setList]=useState<ReportMeta[]>([]);const[groupList,setGroupList]=useState<GroupMeta[]>([]);
  const[active,setActive]=useState('');
  const[data,setData]=useState<ReportData>();
  const[q,setQ]=useState('');const[search,setSearch]=useState('');const[studio,setStudio]=useState('');const[priority,setPriority]=useState('');const[status,setStatus]=useState('');const[from,setFrom]=useState('');const[to,setTo]=useState('');
  const[page,setPage]=useState(0);const[pageSize,setPageSize]=useState(25);
  const[busy,setBusy]=useState(true);const[error,setError]=useState('');const[exporting,setExporting]=useState<ExportFormat|''>('');
  const[exportOpen,setExportOpen]=useState(false);const[hidden,setHidden]=useState<Set<string>>(new Set());const[colsOpen,setColsOpen]=useState(false);
  const[tab,setTab]=useState<'data'|'insights'>('insights');
  const[collapsed,setCollapsed]=useState<Set<string>>(new Set(DEFAULT_COLLAPSED));
  const deferredSearch=useDeferredValue(search);
  const menuRef=useRef<HTMLDivElement>(null);const colRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{void api<{reports:ReportMeta[];groups?:GroupMeta[]}>('/api/reports?list=true').then(d=>{setList(d.reports);setGroupList(d.groups||[]);if(d.reports.length)setActive(d.reports[0].id);}).catch(e=>setError(e.message));},[]);
  useEffect(()=>{const onDoc=(e:MouseEvent)=>{if(menuRef.current&&!menuRef.current.contains(e.target as Node))setExportOpen(false);if(colRef.current&&!colRef.current.contains(e.target as Node))setColsOpen(false);};document.addEventListener('mousedown',onDoc);return()=>document.removeEventListener('mousedown',onDoc);},[]);

  const params=useCallback((all=false)=>{const p=new URLSearchParams({type:active,page:String(page),pageSize:String(pageSize),search:deferredSearch,studio,priority,status});if(from)p.set('from',from);if(to)p.set('to',to);if(all)p.set('all','true');return p;},[active,page,pageSize,deferredSearch,studio,priority,status,from,to]);
  const load=useCallback((signal:AbortSignal)=>{if(!active)return Promise.resolve();return api<ReportData>('/api/reports?'+params(),{signal}).then(
    (d)=>{if(!signal.aborted){setData(d);setError('');setBusy(false);}},
    (e:unknown)=>{if(!signal.aborted){setError((e as Error).message);setBusy(false);}},
  );},[active,params]);
  useEffect(()=>{const ctrl=new AbortController();void load(ctrl.signal);return()=>ctrl.abort();},[load]);
  const refresh=useCallback(()=>{setBusy(true);const ctrl=new AbortController();void load(ctrl.signal);},[load]);
  const changeReport=(id:string)=>{setBusy(true);setActive(id);setPage(0);setHidden(new Set());};
  const changeFilter=(apply:()=>void)=>{setBusy(true);apply();setPage(0);};
  const clearFilters=()=>changeFilter(()=>{setSearch('');setStudio('');setPriority('');setStatus('');setFrom('');setTo('');});
  const applyPreset=(p:{from:()=>string;to:()=>string})=>changeFilter(()=>{setFrom(p.from());setTo(p.to());});

  /* Shelves in the library's curated order, searched by name and description. */
  const grouped=useMemo(()=>{
    const byGroup:Record<string,ReportMeta[]>={};
    for(const r of list)(byGroup[r.group]=byGroup[r.group]||[]).push(r);
    const meta=new Map(groupList.map(g=>[g.id,g]));
    const order=groupList.map(g=>g.id).filter(id=>byGroup[id]);
    for(const k of Object.keys(byGroup))if(!order.includes(k))order.push(k);
    return order.map(id=>({meta:meta.get(id)||{id,label:id,blurb:''},reports:byGroup[id]}));
  },[list,groupList]);
  const filteredGroups=useMemo(()=>{if(!q)return grouped;const ql=q.toLowerCase();
    return grouped.map(g=>({...g,reports:g.reports.filter(r=>r.name.toLowerCase().includes(ql)||r.description.toLowerCase().includes(ql))})).filter(g=>g.reports.length);},[grouped,q]);
  const isGroupCollapsed=(g:{meta:GroupMeta;reports:ReportMeta[]})=>!q&&collapsed.has(g.meta.id)&&!g.reports.some(r=>r.id===active);
  const toggleGroup=(id:string)=>setCollapsed(s=>{const n=new Set(s);if(n.has(id))n.delete(id);else n.add(id);return n;});
  const visibleCols=data?.columns.filter(c=>!hidden.has(c.key))||[];

  /* The applied-filter chips, so the current slice is always visible and one click away from gone. */
  const chips=useMemo(()=>{const drop=(apply:()=>void)=>()=>{setBusy(true);apply();setPage(0);};
    const c:{label:string;clear:()=>void}[]=[];
    if(search)c.push({label:`Search “${search}”`,clear:drop(()=>setSearch(''))});
    if(studio)c.push({label:studio,clear:drop(()=>setStudio(''))});
    if(status)c.push({label:STATUS_LABELS[status]||status,clear:drop(()=>setStatus(''))});
    if(priority)c.push({label:priority[0].toUpperCase()+priority.slice(1)+' priority',clear:drop(()=>setPriority(''))});
    if(from)c.push({label:`From ${from}`,clear:drop(()=>setFrom(''))});
    if(to)c.push({label:`To ${to}`,clear:drop(()=>setTo(''))});
    return c;},[search,studio,status,priority,from,to]);
  const presetActive=(p:{id:string;from:()=>string;to:()=>string})=>from===p.from()&&to===p.to();

  async function doExport(fmt:ExportFormat){
    setExportOpen(false);setExporting(fmt);
    try{const full=await api<ReportData>('/api/reports?'+params(true));await exportReport({...full,columns:full.columns.filter(c=>!hidden.has(c.key))},fmt);notify(`${full.name} exported as ${fmt.toUpperCase()} (${full.rows.length} rows).`);}
    catch(e){notify((e as Error).message,'error');}finally{setExporting('');}
  }

  const m=data?.metrics||{};
  const delta=typeof m.last7==='number'&&typeof m.prev7==='number'?(m.prev7?Math.round(((m.last7-m.prev7)/m.prev7)*100):(m.last7?100:0)):null;

  return (
    <Shell title="Reports library" eyebrow={`${list.length} REPORTS · ${grouped.length} GROUPS · 7 EXPORT FORMATS`} action={<Badge tone="blue"><FileBarChart2 size={12}/>Live data</Badge>}>
      <div className="report-shell">
        <aside className="report-nav card">
          <div className="report-nav-search"><SearchField value={q} onChange={setQ} placeholder="Find a report…"/></div>
          <div className="report-nav-scroll">
            {filteredGroups.map(g=>{const Icon=GROUP_ICONS[g.meta.id]||FolderTree;const open=!isGroupCollapsed(g);return (
              <div key={g.meta.id} className="report-nav-group">
                <button type="button" className="report-nav-heading" onClick={()=>toggleGroup(g.meta.id)} title={g.meta.blurb||g.meta.label} aria-expanded={open}>
                  <Icon size={12}/><span className="rng-label">{g.meta.label}</span>
                  <span className="rng-count">{g.reports.length}</span><ChevronRight size={12} className="rng-chevron"/>
                </button>
                {open&&g.reports.map(r=><button key={r.id} className={'report-nav-item'+(active===r.id?' active':'')} onClick={()=>changeReport(r.id)} title={r.description}>{r.name}</button>)}
              </div>);})}
            {!list.length&&!error&&<div style={{padding:16}}><Loading/></div>}
          </div>
        </aside>

        <section className="stack grow" style={{minWidth:0}}>
          {error&&<div className="error-box">{error}</div>}
          {data&&<>
            <div className="card card-pad rp-head">
              <div className="between wrap" style={{gap:14}}>
                <div style={{minWidth:0}}>
                  <div className="eyebrow">{grouped.find(g=>g.meta.id===data.group)?.meta.label||data.group}</div>
                  <h2 style={{fontSize:20,marginTop:4}}>{data.name}</h2>
                  <p className="secondary" style={{fontSize:12,marginTop:5}}>{data.description}</p>
                </div>
                <div className="flex-row">
                  <button className="btn" onClick={refresh}><RefreshCw size={13}/>Refresh</button>
                  <div style={{position:'relative'}} ref={menuRef}>
                    <button className="btn btn-primary" disabled={!!exporting||!data.total} onClick={()=>setExportOpen(v=>!v)}>{exporting?<Loader2 size={13} className="animate-spin"/>:<Download size={13}/>}{exporting?`Building ${exporting.toUpperCase()}…`:'Export'}<ChevronDown size={12}/></button>
                    {exportOpen&&<div className="card rp-export-menu">
                      <div className="rp-export-title">Export <strong>{data.total}</strong> matching rows</div>
                      {FORMATS.map(f=>{const I=f.icon;return <button key={f.id} className="rp-export-item" onClick={()=>void doExport(f.id)}><I size={15}/><span><strong>{f.label}</strong><small>{f.hint}</small></span></button>;})}
                    </div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="card rp-filters" aria-label="Report filters">
              <div className="rp-filters-top">
                <div className="flex-row" style={{gap:9,minWidth:0}}>
                  <span className="metric-icon"><Filter size={13}/></span>
                  <div style={{minWidth:0}}>
                    <strong style={{fontSize:12.5}}>Filter before you generate</strong>
                    <div className="secondary" style={{fontSize:11}}>Metrics, insights, the data table and every export respect these filters.</div>
                  </div>
                </div>
                {!!chips.length&&<button className="btn btn-sm" onClick={clearFilters}><X size={12}/>Clear all</button>}
              </div>
              <div className="rp-filters-row">
                <SearchField value={search} onChange={v=>changeFilter(()=>setSearch(v))} placeholder="Search within this report…"/>
                <select className="filter-select" aria-label="Filter studio" value={studio} onChange={e=>changeFilter(()=>setStudio(e.target.value))}><option value="">All studios</option>{STUDIOS.map(s=><option key={s.id}>{s.name}</option>)}</select>
                <select className="filter-select" aria-label="Filter status" value={status} onChange={e=>changeFilter(()=>setStatus(e.target.value))}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
                <select className="filter-select" aria-label="Filter priority" value={priority} onChange={e=>changeFilter(()=>setPriority(e.target.value))}><option value="">All priorities</option>{['critical','high','medium','low'].map(p=><option key={p}>{p}</option>)}</select>
                <div className="rp-date-group">
                  <input type="date" className="rp-date" aria-label="From date" value={from} onChange={e=>changeFilter(()=>setFrom(e.target.value))}/>
                  <span className="secondary">to</span>
                  <input type="date" className="rp-date" aria-label="To date" value={to} onChange={e=>changeFilter(()=>setTo(e.target.value))}/>
                </div>
                <div className="rp-presets" role="group" aria-label="Date range presets">
                  {PRESETS.map(p=><button key={p.id} type="button" className={'rp-preset'+(presetActive(p)?' active':'')} onClick={()=>applyPreset(p)}>{p.label}</button>)}
                </div>
              </div>
              {!!chips.length&&<div className="rp-chips">{chips.map(c=><button key={c.label} type="button" className="rp-chip" onClick={c.clear}>{c.label}<X size={11}/></button>)}</div>}
            </div>

            <div className="rp-metrics">
              {[
                {l:'Matching tickets',v:m.total,icon:FileBarChart2,tone:''},
                {l:'Open',v:m.open,icon:Clock3,tone:'amber'},
                {l:'Resolved',v:m.resolved,sub:m.resolutionRate!==undefined?`${m.resolutionRate}% rate`:'',icon:CheckCircle2,tone:'green'},
                {l:'SLA compliance',v:m.slaCompliance===null?'—':m.slaCompliance+'%',sub:m.slaBreached?`${m.slaBreached} breached`:'no breaches',icon:ShieldCheck,tone:m.slaCompliance!==null&&Number(m.slaCompliance)<80?'':'green'},
                {l:'Median resolution',v:m.medianResolutionHours===null?'—':m.medianResolutionHours+'h',sub:m.p90ResolutionHours!==null?`p90 ${m.p90ResolutionHours}h`:'',icon:Clock3,tone:'purple'},
                {l:'Critical · High',v:`${m.critical} · ${m.high}`,sub:m.escalated?`${m.escalated} escalated`:'',icon:TriangleAlert,tone:'amber'},
                {l:'Last 7 days',v:m.last7,sub:delta===null?'':`${delta>=0?'+':''}${delta}% vs prior`,icon:delta!==null&&delta<0?TrendingDown:TrendingUp,tone:delta!==null&&delta>0?'':'green'},
                {l:'Oldest open',v:m.oldestOpenAgeHours===null?'—':m.oldestOpenAgeHours+'h',icon:Clock3,tone:''},
              ].map(c=>{const I=c.icon;return <div className="card rp-metric" key={c.l}><div className="between"><span className="metric-name">{c.l}</span><span className={'metric-icon '+c.tone}><I size={13}/></span></div><strong>{String(c.v??'—')}</strong>{c.sub&&<small>{c.sub}</small>}</div>;})}
            </div>

            <div className="card">
              <div style={{padding:'0 20px'}}>
                <Tabs label="Report view" value={tab} onChange={setTab} items={[{id:'insights',label:'Insights'},{id:'data',label:'Data',count:data.total}]}/>
              </div>

              {tab==='insights'&&<div className="rp-insights">
                <div className="card chart-card rp-span2">
                  <div className="between"><h3>14-day flow</h3><div className="chart-legend"><span><i/>Created</span><span><i className="green"/>Resolved</span></div></div>
                  <Trend data={data.trend}/>
                </div>
                {(['byStatus','byPriority','byStudio','byCategory','byDepartment','bySource'] as const).map(k=>data.breakdowns[k]&&Object.keys(data.breakdowns[k]).length>0&&<Bars key={k} title={k.replace(/^by/,'By ')} values={data.breakdowns[k]} labels={k==='byStatus'?STATUS_LABELS:undefined}/>)}
                <div className="card chart-card rp-span2">
                  <div className="between"><h3>Owner leaderboard</h3><Badge>{data.owners.length} owners</Badge></div>
                  <div className="table-wrap" style={{marginTop:14}}><table className="data-table"><thead><tr><th>Owner</th><th>Total</th><th>Open</th><th>Resolved</th><th>Overdue</th><th>Resolution rate</th></tr></thead>
                    <tbody>{data.owners.slice(0,12).map(o=><tr key={o.name}><td><div className="flex-row"><Avatar name={o.name} tone="purple"/>{o.name}</div></td><td>{o.total}</td><td>{o.open}</td><td><Badge tone="green">{o.resolved}</Badge></td><td><Badge tone={o.overdue?'red':''}>{o.overdue}</Badge></td><td><div className="flex-row"><div className="progress-bar" style={{width:80,margin:0}}><span style={{width:(o.total?Math.round(o.resolved/o.total*100):0)+'%'}}/></div>{o.total?Math.round(o.resolved/o.total*100):0}%</div></td></tr>)}</tbody></table></div>
                </div>
              </div>}

              {tab==='data'&&<>
                <div className="ticket-toolbar rp-data-bar">
                  <span className="secondary" style={{fontSize:11}}>{chips.length?`${chips.length} filter${chips.length>1?'s':''} applied · `:''}{data.columns.length} columns</span>
                  <div style={{position:'relative',marginLeft:'auto'}} ref={colRef}>
                    <button className="btn btn-sm" onClick={()=>setColsOpen(v=>!v)}><Columns3 size={12}/>Columns{hidden.size?` (${hidden.size} hidden)`:''}</button>
                    {colsOpen&&<div className="card rp-export-menu" style={{width:220}}>{data.columns.map(c=><label key={c.key} className="rp-col-toggle"><input type="checkbox" checked={!hidden.has(c.key)} onChange={()=>setHidden(h=>{const n=new Set(h);if(n.has(c.key))n.delete(c.key);else n.add(c.key);return n;})}/>{c.label}</label>)}</div>}
                  </div>
                </div>
                {busy?<div style={{padding:20}}><Loading/></div>:!data.rows.length?<Empty art="search" title="No matching tickets" detail="Adjust the filters or date range above."/>:(
                  <div className="table-wrap"><table className="data-table"><thead><tr>{visibleCols.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
                    <tbody>{data.rows.map((r,i)=><tr key={i}>{visibleCols.map(c=><td key={c.key}>{cell(c.key,r[c.key])}</td>)}</tr>)}</tbody></table></div>)}
                <div className="table-pagination">
                  <div className="flex-row"><span>{data.total?page*pageSize+1:0}–{Math.min((page+1)*pageSize,data.total)} of {data.total}</span><select className="filter-select" style={{height:28,padding:'2px 22px 2px 8px'}} value={pageSize} onChange={e=>changeFilter(()=>setPageSize(Number(e.target.value)))}>{[10,25,50,100,200].map(n=><option key={n} value={n}>{n} / page</option>)}</select></div>
                  <div className="pagination-controls"><button disabled={!page} aria-label="Previous page" onClick={()=>{setBusy(true);setPage(p=>Math.max(0,p-1));}}><ChevronLeft size={12}/></button><span style={{padding:'0 8px',fontSize:11}}>Page {page+1}</span><button disabled={!data.hasMore} aria-label="Next page" onClick={()=>{setBusy(true);setPage(p=>p+1);}}><ChevronRight size={12}/></button></div>
                </div>
              </>}
            </div>
          </>}
          {!data&&!error&&<Loading/>}
        </section>
      </div>
    </Shell>
  );
}

function cell(key:string,v:string|number|undefined){
  if(v===undefined||v===null||v==='')return <span className="muted">—</span>;
  if(key==='priority')return <span className={'badge priority-'+v}>{String(v)}</span>;
  if(key==='status')return <span className={'badge status-'+v}>{STATUS_LABELS[String(v)]||String(v)}</span>;
  if(key==='ticketNumber')return <span className="ticket-id">{String(v)}</span>;
  if(/At$/.test(key)&&typeof v==='string'&&!Number.isNaN(Date.parse(v)))return new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
  return String(v);
}
function Trend({data}:{data:{label:string;created:number;resolved:number}[]}){
  const max=Math.max(1,...data.flatMap(d=>[d.created,d.resolved]));const w=560,h=140;
  const pt=(i:number,v:number)=>`${25+i/(data.length-1)*(w-40)},${15+h-(v/max*h)}`;
  const path=(k:'created'|'resolved')=>data.map((d,i)=>(i?'L':'M')+pt(i,d[k])).join(' ');
  return <svg className="chart-svg" viewBox="0 0 570 185" role="img" aria-label="Created vs resolved">
    <defs><linearGradient id="rpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".18"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>
    {[0,1,2,3].map(i=><g key={i}><line x1={25} x2={545} y1={15+i*(h/3)} y2={15+i*(h/3)}/><text x={0} y={19+i*(h/3)}>{Math.round(max*(1-i/3))}</text></g>)}
    <path d={path('created')+` L545,${15+h} L25,${15+h} Z`} fill="url(#rpFill)"/>
    <path d={path('created')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round"/>
    <path d={path('resolved')} fill="none" stroke="var(--green)" strokeWidth="2" strokeDasharray="5 4"/>
    {data.map((d,i)=><circle key={i} cx={25+i/(data.length-1)*(w-40)} cy={15+h-(d.created/max*h)} r="2.6" fill="var(--accent)"/>)}
    {data.filter((_,i)=>i%3===0||i===data.length-1).map(d=>{const i=data.indexOf(d);return <text key={d.label} x={25+i/(data.length-1)*(w-40)} y={177} textAnchor="middle">{d.label}</text>;})}
  </svg>;
}
function Bars({title,values,labels}:{title:string;values:Record<string,number>;labels?:Record<string,string>}){
  const entries=Object.entries(values).slice(0,8);const max=Math.max(1,...entries.map(e=>e[1]));const total=Object.values(values).reduce((a,b)=>a+b,0);
  return <section className="card chart-card"><div className="between"><h3 style={{fontSize:13}}>{title}</h3><small className="muted">{total}</small></div>
    <div className="report-bars" style={{marginTop:14}}>{entries.map(([k,v],i)=><div key={k}><div className="between"><span style={{fontSize:11}}>{labels?.[k]||k}</span><span className="secondary" style={{fontSize:11}}>{v} · {Math.round(v/total*100)}%</span></div><div className="progress-bar"><span style={{width:v/max*100+'%',background:i%3===1?'var(--purple)':i%3===2?'var(--green)':'var(--accent)'}}/></div></div>)}</div></section>;
}
