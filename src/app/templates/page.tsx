"use client";
import {useEffect,useMemo,useState} from 'react';
import {Layers,Sparkles,ArrowUpRight,Heart,Users,Clock3,Building2,ClipboardCheck,Pause,Search,ShieldAlert,Ticket,DoorOpen,Timer,CheckCircle2} from 'lucide-react';
import {Shell} from '@/components/shell';
import {SearchField,Badge,api} from '@/components/ui';
import {TicketComposer} from '@/components/ticket-composer';
import {guidedTemplates} from '@/lib/guided-templates';
import {CATEGORIES} from '@/lib/constants';
import type {GuidedTemplate} from '@/lib/ticket-contract';

const ICONS:Record<string,typeof Sparkles>={heart:Heart,users:Users,clock:Clock3,building:Building2,clipboard:ClipboardCheck,pause:Pause,shield:ShieldAlert,ticket:Ticket,door:DoorOpen};
const estimate=(t:GuidedTemplate)=>Math.max(1,Math.ceil((t.fields.length+5)/6));

export default function TemplatesPage(){
  const[q,setQ]=useState(''),[category,setCategory]=useState('Featured'),[active,setActive]=useState<GuidedTemplate>();
  const[all,setAll]=useState(()=>guidedTemplates());
  useEffect(()=>{void api<{templates:GuidedTemplate[]}>('/api/templates').then(d=>setAll(d.templates)).catch(()=>{});},[]);
  const filtered=useMemo(()=>all.filter(t=>(category==='All templates'||category==='Featured'&&t.featured||category===t.category)&&(!q||(t.title+' '+t.description+' '+t.category+' '+t.subcategory).toLowerCase().includes(q.toLowerCase()))),[all,category,q]);
  const categories=['Featured','All templates',...CATEGORIES];
  return <Shell title="Start with the right questions." eyebrow="IRIS TEMPLATE LIBRARY" action={<Badge tone="blue"><Layers size={12}/>{all.length} guided templates</Badge>}>
    <section className="template-hero">
      <div className="template-hero-mark"><Layers size={24}/></div>
      <div className="grow"><span className="eyebrow">PURPOSE-BUILT MEMBER VOICE CAPTURE</span><h2>Fast to complete. Specific to the moment.</h2><p>Each template asks only what the receiving team needs, links live member or class context where relevant, and produces a review-ready ticket before anything is filed.</p></div>
      <div className="template-hero-stats"><div><strong>{all.filter(t=>t.featured).length}</strong><span>featured flows</span></div><div><strong>1–{Math.max(...all.map(estimate))}</strong><span>min typical fill</span></div><div><strong>100%</strong><span>reviewed before filing</span></div></div>
    </section>
    <div className="template-toolbar"><SearchField value={q} onChange={setQ} placeholder="Search a member moment, issue or workflow…"/><span className="template-result-count"><strong>{filtered.length}</strong> matching templates</span></div>
    <div className="template-category-nav" role="tablist" aria-label="Template categories">{categories.map(c=><button key={c} role="tab" aria-selected={category===c} onClick={()=>setCategory(c)} className={'btn btn-sm'+(category===c?' active':'')}>{c==='Featured'&&<Sparkles size={12}/>} {c}</button>)}</div>
    <div className="template-grid template-grid-modern rise-stagger">{filtered.map((t,i)=>{const Icon=ICONS[t.icon]||Sparkles;const required=t.fields.filter(f=>f.required).length;return <button key={t.id} onClick={()=>setActive(t)} className="card template-card template-card-modern" data-featured={t.featured||undefined}>
      <div className="template-card-top"><div className="template-icon" data-tone={i%3}><Icon size={19}/></div><div className="template-card-badges">{t.featured&&<Badge tone="purple"><Sparkles size={9}/>Featured</Badge>}{t.kind==='compliment'?<Badge tone="green">Record only</Badge>:t.kind==='assessment'?<Badge tone="purple">Scorecard</Badge>:<Badge>{t.kind}</Badge>}</div></div>
      <div><span className="template-category-label">{t.category}</span><h3>{t.title}</h3><p>{t.description}</p></div>
      <div className="template-specs"><span><Timer size={11}/>{estimate(t)} min</span><span><CheckCircle2 size={11}/>{required} essential</span><span><Layers size={11}/>{t.fields.length} guided fields</span></div>
      <div className="template-card-action"><span>Open guided template</span><span className="template-action-icon"><ArrowUpRight size={14}/></span></div>
    </button>;})}</div>
    {!filtered.length&&<div className="empty-state"><Search size={28}/><h3>No matching templates</h3><p>Try a broader member moment or another category.</p></div>}
    {active&&<TicketComposer open onClose={()=>setActive(undefined)} template={active}/>}
  </Shell>;
}
