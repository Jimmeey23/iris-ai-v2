"use client";
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Layers,Sparkles,ArrowUpRight,Heart,Users,Clock3,Building2,ClipboardCheck,Pause,Search,ShieldAlert,Ticket,DoorOpen,Timer,CheckCircle2,FilePenLine,Trash2,ChevronRight} from 'lucide-react';
import {Shell} from '@/components/shell';
import {SearchField,Badge,api} from '@/components/ui';
import {TicketComposer} from '@/components/ticket-composer';
import {guidedTemplates} from '@/lib/guided-templates';
import {CATEGORIES} from '@/lib/constants';
import type {GuidedTemplate} from '@/lib/ticket-contract';

const ICONS:Record<string,typeof Sparkles>={heart:Heart,users:Users,clock:Clock3,building:Building2,clipboard:ClipboardCheck,pause:Pause,shield:ShieldAlert,ticket:Ticket,door:DoorOpen};
const estimate=(t:GuidedTemplate)=>Math.max(1,Math.ceil((t.fields.length+5)/6));
type SavedDraft={id:number;title:string;templateId:string|null;category:string;subcategory:string;payload:Record<string,unknown>;updatedAt:string};

export default function TemplatesPage(){
  const[q,setQ]=useState(''),[category,setCategory]=useState('Featured'),[active,setActive]=useState<GuidedTemplate>();
  const[all,setAll]=useState(()=>guidedTemplates());
  const[drafts,setDrafts]=useState<SavedDraft[]>([]),[editing,setEditing]=useState<SavedDraft>();
  const loadDrafts=useCallback(()=>{void api<{drafts:SavedDraft[]}>('/api/drafts').then(d=>setDrafts(d.drafts)).catch(()=>{});},[]);
  useEffect(()=>{void api<{templates:GuidedTemplate[]}>('/api/templates').then(d=>setAll(d.templates)).catch(()=>{});},[]);
  useEffect(()=>{loadDrafts();},[loadDrafts]);
  const filtered=useMemo(()=>all.filter(t=>(category==='All templates'||category==='Featured'&&t.featured||category===t.category)&&(!q||(t.title+' '+t.description+' '+t.category+' '+t.subcategory).toLowerCase().includes(q.toLowerCase()))),[all,category,q]);
  const categories=['Featured','All templates',...CATEGORIES];
  return <Shell title="Start with the right questions." eyebrow="IRIS TEMPLATE LIBRARY" action={<Badge tone="blue"><Layers size={12}/>{all.length} guided templates</Badge>}>
    <section className="template-hero">
      <div className="template-hero-mark"><Layers size={24}/></div>
      <div className="grow"><span className="eyebrow">PURPOSE-BUILT MEMBER VOICE CAPTURE</span><h2>Fast to complete. Specific to the moment.</h2><p>Each template asks only what the receiving team needs, links live member or class context where relevant, and produces a review-ready ticket before anything is filed.</p></div>
      <div className="template-hero-stats"><div><strong>{all.filter(t=>t.featured).length}</strong><span>featured flows</span></div><div><strong>1–{Math.max(...all.map(estimate))}</strong><span>min typical fill</span></div><div><strong>100%</strong><span>reviewed before filing</span></div></div>
    </section>
    <section className="saved-drafts" aria-labelledby="saved-drafts-title">
      <div className="saved-drafts-head"><div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h2 id="saved-drafts-title">Saved ticket drafts</h2><p>Pause an intake and continue exactly where you left off. Drafts are visible only to your account.</p></div><div className="draft-capacity" aria-label={`${drafts.length} of 3 draft slots used`}><strong>{drafts.length}<span>/3</span></strong><small>slots used</small><div className="draft-capacity-dots">{[0,1,2].map(i=><i key={i} className={i<drafts.length?'used':''}/>)}</div></div></div>
      {drafts.length?<div className="saved-draft-grid">{drafts.map(d=><article className="saved-draft-card" key={d.id}><div className="saved-draft-icon"><FilePenLine size={17}/></div><div className="saved-draft-copy"><div className="saved-draft-meta"><span>{d.category}</span><i/> <span>{d.subcategory}</span></div><h3>{d.title}</h3><p>Last edited {new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(d.updatedAt))}</p></div><div className="saved-draft-actions"><button className="btn btn-sm" onClick={()=>{setEditing(d);setActive(all.find(t=>t.id===d.templateId));}}>Resume <ChevronRight size={13}/></button><button className="icon-btn" aria-label={`Delete ${d.title}`} onClick={()=>{if(window.confirm('Delete this saved draft?'))void api(`/api/drafts?id=${d.id}`,{method:'DELETE'}).then(loadDrafts);}}><Trash2 size={14}/></button></div></article>)}</div>:<div className="saved-drafts-empty"><FilePenLine size={18}/><span>No saved drafts yet. Open any template and choose <strong>Save draft</strong> to pause safely.</span></div>}
    </section>
    <div className="template-toolbar"><SearchField value={q} onChange={setQ} placeholder="Search a member moment, issue or workflow…"/><span className="template-result-count"><strong>{filtered.length}</strong> matching templates</span></div>
    <div className="template-category-nav" role="tablist" aria-label="Template categories">{categories.map(c=>{const n=c==='All templates'?all.length:c==='Featured'?all.filter(t=>t.featured).length:all.filter(t=>t.category===c).length;return <button key={c} role="tab" aria-selected={category===c} onClick={()=>setCategory(c)} className={'template-cat-pill'+(category===c?' active':'')} disabled={!n&&category!==c}>{c==='Featured'&&<Sparkles size={12}/>}<span>{c}</span><span className="template-cat-count">{n}</span></button>;})}</div>
    <div className="template-grid template-grid-modern rise-stagger">{filtered.map((t,i)=>{const Icon=ICONS[t.icon]||Sparkles;const required=t.fields.filter(f=>f.required).length;const sections=[...new Set(t.fields.map(f=>f.section).filter(Boolean))];return <button key={t.id} onClick={()=>{setEditing(undefined);setActive(t);}} className="card template-card template-card-modern" data-featured={t.featured||undefined}>
      <div className="template-card-top"><div className="template-icon" data-tone={i%3}><Icon size={19}/></div><div className="template-card-badges">{t.featured&&<Badge tone="purple"><Sparkles size={9}/>Featured</Badge>}{t.kind==='compliment'?<Badge tone="green">Record only</Badge>:t.kind==='assessment'?<Badge tone="purple">Scorecard</Badge>:<Badge>{t.kind}</Badge>}</div></div>
      <div><span className="template-category-label">{t.category}</span><h3>{t.title}</h3><p>{t.description}</p></div>
      <div className="template-field-preview"><span className="template-preview-label">Captures</span><div>{t.fields.slice(0,3).map(f=><span key={f.id}><CheckCircle2 size={10}/>{f.label}</span>)}{t.fields.length>3&&<span className="template-more">+{t.fields.length-3} more</span>}</div></div>
      {sections.length>0&&<div className="template-sections"><span>{sections.length} structured section{sections.length===1?'':'s'}</span><span>{sections.slice(0,2).join(' · ')}</span></div>}
      <div className="template-specs"><span><Timer size={11}/>{estimate(t)} min</span><span><CheckCircle2 size={11}/>{required} essential</span><span><Layers size={11}/>{t.fields.length} guided fields</span></div>
      <div className="template-card-action"><span>Open guided template</span><span className="template-action-icon"><ArrowUpRight size={14}/></span></div>
    </button>;})}</div>
    {!filtered.length&&<div className="empty-state"><Search size={28}/><h3>No matching templates</h3><p>Try a broader member moment or another category.</p></div>}
    {(active||editing)&&<TicketComposer open onClose={()=>{setActive(undefined);setEditing(undefined);}} template={active} initial={editing?.payload} draftId={editing?.id} onDraftsChanged={loadDrafts}/>}
  </Shell>;
}
