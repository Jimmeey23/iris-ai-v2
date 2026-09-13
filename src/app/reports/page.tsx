"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {FileBarChart2,Search,Download,ChevronLeft,ChevronRight,RefreshCw,Filter,LayoutGrid} from 'lucide-react';
import {Shell} from '@/components/shell';
import {api,SearchField,Badge,Loading,Empty} from '@/components/ui';
import {STUDIOS} from '@/lib/constants';
import {csvDownload} from '@/lib/display';

type ReportMeta={id:string;name:string;description:string;group:string;columns:{key:string;label:string}[]};
type ReportData=ReportMeta&{rows:Record<string,string|number>[];total:number;page:number;pageSize:number;hasMore:boolean;metrics:{total:number;open:number;resolved:number;critical:number;avgResolutionHours:number|null}};

export default function ReportsPage(){
  const[list,setList]=useState<ReportMeta[]>([]);
  const[active,setActive]=useState<string>('');
  const[data,setData]=useState<ReportData>();
  const[q,setQ]=useState('');
  const[studio,setStudio]=useState('');
  const[priority,setPriority]=useState('');
  const[status,setStatus]=useState('');
  const[from,setFrom]=useState('');
  const[to,setTo]=useState('');
  const[search,setSearch]=useState('');
  const[page,setPage]=useState(0);
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState('');

  useEffect(()=>{void api<{reports:ReportMeta[]}>('/api/reports?list=true').then(d=>{setList(d.reports);if(d.reports.length)setActive(d.reports[0].id);}).catch(e=>setError(e.message));},[]);

  const load=useCallback(async()=>{
    if(!active)return;
    setBusy(true);setError('');
    try{
      const p=new URLSearchParams({type:active,page:String(page),pageSize:'25',search,studio,priority,status});
      if(from)p.set('from',from);if(to)p.set('to',to);
      setData(await api<ReportData>('/api/reports?'+p));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  },[active,page,search,studio,priority,status,from,to]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>setPage(0),[active,search,studio,priority,status,from,to]);

  const groups=useMemo(()=>{const g:Record<string,ReportMeta[]>={};for(const r of list){(g[r.group]=g[r.group]||[]).push(r);}return g;},[list]);
  const filteredGroups=useMemo(()=>{if(!q)return groups;const out:Record<string,ReportMeta[]>={};for(const[k,v]of Object.entries(groups)){const m=v.filter(r=>r.name.toLowerCase().includes(q.toLowerCase()));if(m.length)out[k]=m;}return out;},[groups,q]);

  function exportCsv(){
    if(!data)return;
    const header=data.columns.map(c=>c.label);
    csvDownload(data.id+'.csv',[header,...data.rows.map(r=>data.columns.map(c=>r[c.key]??''))]);
  }

  return (
    <Shell title="Reports library" eyebrow="30+ REPORT TYPES" action={<Badge tone="blue"><FileBarChart2 size={12}/>{list.length} report types</Badge>}>
      <div className="report-shell">
        <aside className="report-nav card">
          <div className="report-nav-search"><SearchField value={q} onChange={setQ} placeholder="Find a report…"/></div>
          <div className="report-nav-scroll">
            {Object.entries(filteredGroups).map(([group,reports])=>(
              <div key={group} className="report-nav-group">
                <div className="report-nav-heading">{group}</div>
                {reports.map(r=>(
                  <button key={r.id} className={'report-nav-item'+(active===r.id?' active':'')} onClick={()=>setActive(r.id)}>{r.name}</button>
                ))}
              </div>
            ))}
            {!list.length&&!error&&<div style={{padding:16}}><Loading/></div>}
          </div>
        </aside>
        <section className="stack grow">
          {error&&<div className="error-box">{error}</div>}
          {data&&(
            <>
              <div className="card card-pad">
                <div className="between wrap">
                  <div>
                    <h2 style={{fontSize:17}}>{data.name}</h2>
                    <p className="secondary" style={{fontSize:12,marginTop:5}}>{data.description}</p>
                  </div>
                  <div className="flex-row">
                    <button className="btn" onClick={()=>void load()}><RefreshCw size={13}/>Refresh</button>
                    <button className="btn btn-primary" onClick={exportCsv} disabled={!data.rows.length}><Download size={13}/>Export CSV</button>
                  </div>
                </div>
                <div className="metric-grid" style={{marginTop:18,marginBottom:0}}>
                  {[{label:'Matching tickets',value:data.metrics.total},{label:'Open',value:data.metrics.open},{label:'Resolved',value:data.metrics.resolved},{label:'Critical',value:data.metrics.critical},{label:'Avg resolution',value:data.metrics.avgResolutionHours!==null?data.metrics.avgResolutionHours+'h':'—'}].map(m=>(
                    <div className="metric" key={m.label} style={{padding:'14px 16px',border:'1px solid var(--border)',borderRadius:11,background:'var(--surface-2)'}}>
                      <span className="metric-name">{m.label}</span>
                      <strong className="metric-number" style={{fontSize:22,marginTop:6}}>{m.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="ticket-toolbar">
                  <SearchField value={search} onChange={setSearch} placeholder="Search within this report…"/>
                  <select className="filter-select" aria-label="Filter studio" value={studio} onChange={e=>setStudio(e.target.value)}><option value="">All studios</option>{STUDIOS.map(s=><option key={s.id}>{s.name}</option>)}</select>
                  <select className="filter-select" aria-label="Filter priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{['critical','high','medium','low'].map(p=><option key={p}>{p}</option>)}</select>
                  <input type="date" aria-label="From date" value={from} onChange={e=>setFrom(e.target.value)} style={{fontSize:10,padding:7,maxWidth:120}}/>
                  <input type="date" aria-label="To date" value={to} onChange={e=>setTo(e.target.value)} style={{fontSize:10,padding:7,maxWidth:120}}/>
                </div>
                {busy?<div style={{padding:20}}><Loading/></div>:!data.rows.length?<Empty title="No matching tickets" detail="Adjust the filters or date range above."/>:(
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr>{data.columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
                      <tbody>{data.rows.map((r,i)=><tr key={i}>{data.columns.map(c=><td key={c.key}>{String(r[c.key]??'—')}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )}
                <div className="table-pagination">
                  <span>{data.total?page*25+1:0}–{Math.min((page+1)*25,data.total)} of {data.total}</span>
                  <div className="pagination-controls">
                    <button disabled={!page} aria-label="Previous page" onClick={()=>setPage(p=>Math.max(0,p-1))}><ChevronLeft size={12}/></button>
                    <button disabled={!data.hasMore} aria-label="Next page" onClick={()=>setPage(p=>p+1)}><ChevronRight size={12}/></button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}
