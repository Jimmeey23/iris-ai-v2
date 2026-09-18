"use client";
import {useEffect,useCallback,useState} from 'react';import {CalendarDays,Ticket,Clock3,CheckCircle2,TriangleAlert,ChevronRight,ArrowUpRight} from 'lucide-react';
import {api,Avatar,Badge,Status,Priority,useApp,Empty,CountUp} from './ui';import {relativeTime,slaState} from '@/lib/utils';import type {TicketListRecord} from '@/lib/ticket-contract';
/** Slowest acceptable refresh. The board also reloads on `iris:tickets-updated` and on tab focus. */
const POLL_FLOOR=60000;
export function useTickets(poll=true){const[tickets,setTickets]=useState<TicketListRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');const{user,pollSeconds}=useApp();const load=useCallback(async()=>{try{const d=await api<{tickets:TicketListRecord[]}>('/api/tickets');setTickets(d.tickets);setError('');}catch(e){setError((e as Error).message);}finally{setLoading(false);}},[]);useEffect(()=>{void load();
// Refresh is event-driven (`iris:tickets-updated`); the interval is only a safety net for
// changes made in another tab or by a teammate. Polling a hidden tab, or polling faster than
// POLL_FLOOR, buys nothing and is what drove the dev server into its memory-restart loop.
const tick=()=>{if(!document.hidden)void load();};
const interval=poll?setInterval(tick,Math.max(POLL_FLOOR,pollSeconds*1000)):undefined;
const onVisible=()=>{if(!document.hidden)void load();};
const handler=()=>void load();window.addEventListener('iris:tickets-updated',handler);document.addEventListener('visibilitychange',onVisible);
return()=>{clearInterval(interval);window.removeEventListener('iris:tickets-updated',handler);document.removeEventListener('visibilitychange',onVisible);};},[load,poll,user,pollSeconds]);return{tickets,loading,error,reload:load};}
function Sparkline({tickets,color}:{tickets:TicketListRecord[];color:string}){const counts=Array.from({length:7},(_,i)=>tickets.filter(t=>{const diff=Math.floor((Date.now()-new Date(t.createdAt).getTime())/86400000);return diff===6-i;}).length);const max=Math.max(1,...counts);const points=counts.map((n,i)=>`${i*12},${26-n/max*23}`).join(' ');return <svg viewBox="0 0 74 30" className="metric-spark" aria-label="Last seven days"><polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;}
export function Stats({tickets}:{tickets:TicketListRecord[]}){const open=tickets.filter(t=>!['resolved','closed','recorded'].includes(t.status));const closed=tickets.filter(t=>['resolved','closed'].includes(t.status));const urgent=open.filter(t=>['high','critical'].includes(t.priority));const cards=[{label:'Total tickets',value:tickets.length,note:'Every conversation, accounted for',icon:Ticket,tone:'',rows:tickets,color:'var(--accent)'},{label:'Active conversations',value:open.length,note:'In the hands of your team',icon:Clock3,tone:'purple',rows:open,color:'var(--purple)'},{label:'Needs attention',value:urgent.length,note:'High & critical priority',icon:TriangleAlert,tone:'amber',rows:urgent,color:'var(--amber)'},{label:'Resolved with care',value:closed.length,note:'A better member experience',icon:CheckCircle2,tone:'green',rows:closed,color:'var(--green)'}];return <div className="metric-grid">{cards.map(c=>{const Icon=c.icon;return <div className="card metric" key={c.label}><div className="between"><span className="metric-name">{c.label}</span><span className={'metric-icon '+c.tone}><Icon size={14}/></span></div><div className="between"><strong className="metric-number"><CountUp value={c.value} format={n=>Math.round(n).toString().padStart(2,'0')}/></strong><Sparkline tickets={c.rows} color={c.color}/></div><div className="metric-note">{c.tone==='green'&&<CheckCircle2 size={10}/>} {c.note}</div></div>;})}</div>;}

/** Format milliseconds into a human-readable countdown string */
function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const totalHours = Math.floor(abs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((abs % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Oversized SLA Countdown Timer — prominent display for all ticket views */
export function SlaCountdown({ticket, large=false}:{ticket:TicketListRecord; large?:boolean}){
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000); // Update every 30s
    return () => clearInterval(id);
  }, []);

  if(!ticket.resolutionRequired||!ticket.slaDueAt){
    return <div className={`sla-countdown none ${large?'sla-countdown-lg':''}`}>
      <span className="sla-countdown-value">—</span>
      <span className="sla-countdown-label">No SLA</span>
    </div>;
  }
  if(['resolved','closed'].includes(ticket.status)){
    return <div className={`sla-countdown done ${large?'sla-countdown-lg':''}`}>
      <span className="sla-countdown-value">✓</span>
      <span className="sla-countdown-label">Resolved</span>
    </div>;
  }
  const due = new Date(ticket.slaDueAt).getTime();
  const ms = due - now;
  const state = slaState(ticket.slaDueAt, ticket.status);
  const display = formatCountdown(ms);

  return <div className={`sla-countdown ${state} ${large?'sla-countdown-lg':''}`}>
    <span className="sla-countdown-value">{ms < 0 ? `−${display}` : display}</span>
    <span className="sla-countdown-label">{ms < 0 ? 'overdue' : 'remaining'}</span>
  </div>;
}

/** Legacy wrapper for backward-compat */

export function TicketTable({tickets,onSelect,selected,onToggle}:{tickets:TicketListRecord[];onSelect?:(id:number)=>void;selected?:number[];onToggle?:(id:number)=>void}){return <div className="table-wrap"><table className="data-table"><thead><tr>{onToggle&&<th style={{width:15}}/>}<th>TICKET & MEMBER</th><th>CATEGORY</th><th>STATUS</th><th>PRIORITY</th><th>OWNER</th><th style={{textAlign:'right'}}>SLA TIMER</th></tr></thead><tbody>{tickets.map(t=><tr key={t.id} onClick={()=>onSelect?onSelect(t.id):window.location.assign('/tickets/'+t.id)}>{onToggle&&<td onClick={e=>e.stopPropagation()}><input aria-label={'Select '+t.ticketNumber} type="checkbox" checked={selected?.includes(t.id)||false} onChange={()=>onToggle(t.id)}/></td>}<td><p className="ticket-name">{t.title}</p><div className="ticket-meta"><span className="ticket-id">{t.ticketNumber}</span><span>·</span><span>{t.memberName}</span><span>·</span><span>{relativeTime(t.createdAt)}</span></div></td><td><span className="category-cell" style={{display:'block'}}>{t.category}</span></td><td><Status status={t.status}/></td><td><Priority priority={t.priority}/></td><td><div className="mini-owner"><Avatar name={t.assignedStaffName||'Unassigned'} tone="purple"/><span>{t.assignedStaffName?.split(' ')[0]||'—'}</span></div></td><td><SlaCountdown ticket={t}/></td></tr>)}</tbody></table></div>;}
export function TicketCard({ticket:t,onSelect}:{ticket:TicketListRecord;onSelect?:(id:number)=>void}){return <button className="ticket-card" onClick={()=>onSelect?onSelect(t.id):window.location.assign('/tickets/'+t.id)}><div className="between"><span className="accent" style={{fontSize:10}}>{t.ticketNumber}</span><Priority priority={t.priority}/></div><h3>{t.title}</h3><p>{t.memberName} · {t.studio?.split(',')[0]}</p><div className="between" style={{marginTop:15}}><Status status={t.status}/><Avatar name={t.assignedStaffName||'Unassigned'} tone="purple"/></div><SlaCountdown ticket={t}/></button>;}
export function Kanban({tickets,onSelect}:{tickets:TicketListRecord[];onSelect?:(id:number)=>void}){const columns=[{id:'new',label:'Incoming',states:['new','triaged']},{id:'assigned',label:'Assigned',states:['assigned']},{id:'in_progress',label:'In progress',states:['in_progress']},{id:'waiting',label:'Awaiting response',states:['waiting_on_member','waiting_on_vendor']},{id:'done',label:'Completed',states:['resolved','closed','recorded']}];return <div className="kanban">{columns.map(c=>{const rows=tickets.filter(t=>c.states.includes(t.status));return <div className="kanban-column" key={c.id}><div className="kanban-head"><strong style={{fontWeight:500}}>{c.label}</strong><Badge>{rows.length}</Badge></div>{rows.map(t=><TicketCard key={t.id} ticket={t} onSelect={onSelect}/>)}{!rows.length&&<p className="muted" style={{fontSize:11,padding:15,textAlign:'center'}}>All clear here.</p>}</div>;})}</div>;}

export function filterTickets(tickets:TicketListRecord[],query:string,studio:string,priority:string,assignee:string){return tickets.filter(t=>(!studio||t.studio===studio)&&(!priority||t.priority===priority)&&(!assignee||t.assignedStaffName===assignee)&&(!query||(t.title+' '+t.memberName+' '+t.ticketNumber+' '+t.category).toLowerCase().includes(query.toLowerCase())));}

const STATUS_BUCKETS=[{id:'new',label:'New / triaged',states:['new','triaged']},{id:'active',label:'In progress',states:['assigned','in_progress']},{id:'waiting',label:'Waiting',states:['waiting_on_member','waiting_on_vendor']},{id:'done',label:'Done',states:['resolved','closed','recorded']}];
export function MatrixView({tickets,onCell}:{tickets:TicketListRecord[];onCell:(category:string,statusIds:string[])=>void}){const categories=Array.from(new Set(tickets.map(t=>t.category))).sort((a,b)=>tickets.filter(t=>t.category===b).length-tickets.filter(t=>t.category===a).length);if(!categories.length)return <Empty art="chart" title="No tickets to map yet" detail="Once tickets come in, this matrix shows category against status at a glance."/>;return <div className="table-wrap" style={{padding:'4px 20px 20px'}}><table className="matrix-table"><thead><tr><th>Category</th>{STATUS_BUCKETS.map(b=><th key={b.id} style={{textAlign:'center'}}>{b.label}</th>)}<th style={{textAlign:'center'}}>Total</th></tr></thead><tbody>{categories.map(cat=>{const rows=tickets.filter(t=>t.category===cat);return <tr key={cat}><td className="matrix-row-label">{cat}</td>{STATUS_BUCKETS.map(b=>{const count=rows.filter(t=>b.states.includes(t.status)).length;return <td key={b.id}><div className={'matrix-cell'+(count?' has-tickets':'')} onClick={()=>count&&onCell(cat,b.states)} role={count?'button':undefined} tabIndex={count?0:undefined}>{count>0&&<span className="matrix-count" style={{color:b.id==='waiting'?'var(--amber)':b.id==='done'?'var(--green)':'var(--accent)'}}>{count}</span>}</div></td>;})}<td style={{textAlign:'center'}}><strong>{rows.length}</strong></td></tr>;})}</tbody></table></div>;}

export function FeedView({tickets,onSelect}:{tickets:TicketListRecord[];onSelect:(id:number)=>void}){if(!tickets.length)return <Empty art="inbox" title="Nothing logged yet" detail="New entries will appear here the moment they're filed."/>;const sorted=[...tickets].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());let lastDay='';return <div className="feed-list">{sorted.map((t,i)=>{const day=new Date(t.createdAt).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short'});const showDay=day!==lastDay;lastDay=day;return <div key={t.id}>{showDay&&<div className="chat-day" style={{marginTop:i?18:0}}>{day}</div>}<button className="feed-item" style={{width:'100%',textAlign:'left',background:'none',border:0}} onClick={()=>onSelect(t.id)}><span className="feed-time">{new Date(t.createdAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit'})}</span><span className="feed-dot-col"><span className="feed-dot" style={t.priority==='critical'?{background:'var(--red)'}:t.priority==='high'?{background:'var(--amber)'}:undefined}/>{i<sorted.length-1&&<span className="feed-line"/>}</span><span className="feed-body"><strong>{t.ticketNumber} · {t.subcategory}</strong><p>{t.memberName} · {t.studio?.split(',')[0]} · assigned to {t.assignedStaffName||'the queue'}</p></span><Status status={t.status}/></button></div>;})}</div>;}

export function PulseStats({tickets}:{tickets:TicketListRecord[]}){const timed=tickets.filter(t=>t.resolutionRequired&&t.slaDueAt);const breached=timed.filter(t=>new Date(t.slaDueAt as string).getTime()<(t.resolvedAt?new Date(t.resolvedAt).getTime():Date.now()));const compliance=timed.length?Math.round((timed.length-breached.length)/timed.length*100):100;const resolved=tickets.filter(t=>t.resolvedAt);const durations=resolved.map(t=>Math.max(0,(new Date(t.resolvedAt as string).getTime()-new Date(t.createdAt).getTime())/3600000));const median=durations.length?[...durations].sort((a,b)=>a-b)[Math.floor(durations.length/2)]:0;const byCategory:Record<string,number>={};for(const t of tickets)byCategory[t.category]=(byCategory[t.category]||0)+1;const topCategory=Object.entries(byCategory).sort((a,b)=>b[1]-a[1])[0];const bySource:Record<string,number>={};for(const t of tickets)bySource[t.source]=(bySource[t.source]||0)+1;const irisShare=tickets.length?Math.round((bySource.iris||0)/tickets.length*100):0;return <div className="metric-grid rise-stagger">{[{label:'SLA compliance',value:<CountUp value={compliance} format={n=>Math.round(n)+'%'}/>,tone:compliance>=85?'green':compliance>=60?'amber':'',icon:CheckCircle2},{label:'Median resolution',value:median?<CountUp value={median} format={n=>n.toFixed(1)+'h'}/>:'—',tone:'purple',icon:Clock3},{label:'Top category',value:topCategory?.[0]||'—',tone:'',icon:TriangleAlert,small:true},{label:'Logged via Iris',value:<CountUp value={irisShare} format={n=>Math.round(n)+'%'}/>,tone:'amber',icon:CalendarDays}].map(m=>{const Icon=m.icon;return <div className="card metric" key={m.label}><div className="between"><span className="metric-name">{m.label}</span><span className={'metric-icon '+m.tone}><Icon size={14}/></span></div><strong className="metric-number" style={m.small?{fontSize:17,lineHeight:1.4}:undefined}>{m.value}</strong><div className="metric-note"><ArrowUpRight size={10}/> across the selected period</div></div>;})}</div>;}
