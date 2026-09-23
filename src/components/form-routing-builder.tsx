"use client";
import {useEffect,useMemo,useState} from 'react';
import {ArrowDown,ArrowUp,Braces,CheckCircle2,Copy,Eye,GitBranch,GripVertical,Plus,RotateCcw,Search,Trash2} from 'lucide-react';
import {api,Badge,Field,Switch} from '@/components/ui';
import type {WorkspaceConfig} from '@/lib/settings-contract';
import {SECTION_ORDER} from '@/lib/intake/plan';

type BuilderField=WorkspaceConfig['formOverrides'][string][number];
type Staff={id:number;name:string;department:string;isActive:boolean};
type Department={id:string;name:string};
type Plan={fields:BuilderField[]};
const TYPES:BuilderField['type'][]=['text','textarea','number','url','datetime','select','multiselect','radio','lookup'];
const SECTIONS=SECTION_ORDER;
const keyFor=(c:string,s:string)=>`${c}|||${s}`;
const slug=(v:string)=>v.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,70);

export function FormRoutingBuilder({config,onChange,staff,departments,initialCategory,initialSubcategory}:{config:WorkspaceConfig;onChange:(c:WorkspaceConfig)=>void;staff:readonly Staff[];departments:readonly Department[];initialCategory?:string;initialSubcategory?:string}){
  const categories=Object.keys(config.taxonomy),firstCategory=initialCategory&&config.taxonomy[initialCategory]?initialCategory:categories[0]||'';
  const[category,setCategory]=useState(firstCategory),[sub,setSub]=useState(initialSubcategory&&config.taxonomy[firstCategory]?.includes(initialSubcategory)?initialSubcategory:config.taxonomy[firstCategory]?.[0]||'');
  const[generated,setGenerated]=useState<BuilderField[]>([]),[loadedKey,setLoadedKey]=useState(''),[selected,setSelected]=useState(0),[query,setQuery]=useState(''),[preview,setPreview]=useState(true);
  const formKey=keyFor(category,sub),overridden=Boolean(config.formOverrides[formKey]);
  const fields=config.formOverrides[formKey]||(loadedKey===formKey?generated:[]);
  const route=config.subcategoryRouting[formKey]||{departmentId:config.categoryDepartments[category]||'operations',ownerId:null,slaHours:null};
  useEffect(()=>{if(!category||!sub)return;let live=true;api<Plan>(`/api/intake?category=${encodeURIComponent(category)}&subcategory=${encodeURIComponent(sub)}&source=generated`).then(d=>{if(live){setGenerated(d.fields);setLoadedKey(keyFor(category,sub));}});return()=>{live=false};},[category,sub]);
  const loading=loadedKey!==formKey&&!config.formOverrides[formKey];
  const updateFields=(next:BuilderField[])=>onChange({...config,formOverrides:{...config.formOverrides,[formKey]:next}});
  const updateField=(patch:Partial<BuilderField>)=>updateFields(fields.map((f,i)=>i===selected?{...f,...patch}:f));
  const updateRoute=(patch:Partial<typeof route>)=>onChange({...config,subcategoryRouting:{...config.subcategoryRouting,[formKey]:{...route,...patch}}});
  const chooseCategory=(c:string)=>{setCategory(c);setSub(config.taxonomy[c]?.[0]||'');setSelected(0);};
  const add=()=>{const n=fields.length+1;const next:BuilderField={id:`custom_question_${n}`,label:'New question',type:'text',section:'Other details',required:false};updateFields([...fields,next]);setSelected(fields.length);};
  const move=(dir:-1|1)=>{const to=selected+dir;if(to<0||to>=fields.length)return;const next=[...fields];[next[selected],next[to]]=[next[to],next[selected]];updateFields(next);setSelected(to);};
  const remove=()=>{if(fields.length<=1)return;updateFields(fields.filter((_,i)=>i!==selected));setSelected(Math.max(0,selected-1));};
  const duplicate=()=>{const f=fields[selected];const copy={...f,id:`${f.id}_copy`};updateFields([...fields.slice(0,selected+1),copy,...fields.slice(selected+1)]);setSelected(selected+1);};
  const reset=()=>{const next={...config.formOverrides};delete next[formKey];onChange({...config,formOverrides:next});setSelected(0);};
  const options=(fields[selected]?.options||[]).join('\n');
  const selectedField=fields[selected];
  const filtered=fields.map((f,i)=>({f,i})).filter(({f})=>!query||`${f.label} ${f.id} ${f.section}`.toLowerCase().includes(query.toLowerCase()));
  const activeDepartment=departments.find(d=>d.id===route.departmentId)?.name;
  const routeOverridden=Boolean(config.subcategoryRouting[formKey]);
  const resetRoute=()=>{const next={...config.subcategoryRouting};delete next[formKey];onChange({...config,subcategoryRouting:next});};
  return <div className="form-builder">
    <aside className="fb-nav card">
      <div className="fb-nav-head"><Braces size={17}/><div><strong>Form directory</strong><span>{Object.values(config.taxonomy).flat().length} sub-categories</span></div></div>
      <div className="fb-category-list">{categories.map(c=><div key={c}><button className={category===c?'active':''} onClick={()=>chooseCategory(c)}><span>{c}</span><Badge>{config.taxonomy[c].length}</Badge></button>{category===c&&<div className="fb-sub-list">{config.taxonomy[c].map(s=><button key={s} className={sub===s?'active':''} onClick={()=>{setSub(s);setSelected(0)}}>{s}{config.formOverrides[keyFor(c,s)]&&<span className="fb-edited-dot" title="Customised"/>}</button>)}</div>}</div>)}</div>
    </aside>
    <main className="fb-workspace">
      <header className="fb-head card"><div><span className="eyebrow">FORM & ROUTING BUILDER</span><h2>{sub||'Choose a sub-category'}</h2><p>{category} · {fields.length} fields · {fields.filter(f=>f.required).length} required</p></div><div className="flex-row wrap">{overridden?<Badge tone="purple">Custom plan</Badge>:<Badge>Generated plan</Badge>}<button className={'btn btn-sm'+(preview?' active':'')} onClick={()=>setPreview(v=>!v)}><Eye size={13}/> Live preview</button>{overridden&&<button className="btn btn-sm" onClick={reset}><RotateCcw size={13}/> Reset</button>}</div></header>
      <section className="fb-routing card"><div className="between"><div className="fb-section-heading"><GitBranch size={16}/><div><h3>Routing & service commitment</h3><p>Override the category default for this specific member moment.</p></div></div>{routeOverridden&&<button className="btn btn-sm" onClick={resetRoute}><RotateCcw size={13}/> Use category defaults</button>}</div><div className="form-grid">
        <Field label="Owning department"><select value={route.departmentId} onChange={e=>updateRoute({departmentId:e.target.value,ownerId:null})}>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Assigned owner"><select value={route.ownerId||''} onChange={e=>updateRoute({ownerId:e.target.value?Number(e.target.value):null})}><option value="">Studio-aware automatic owner</option>{staff.filter(p=>p.isActive&&p.department===activeDepartment).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Follow-up target (hours)" hint="Leave blank to inherit the priority SLA."><input type="number" min={1} max={720} value={route.slaHours??''} placeholder="Inherit default" onChange={e=>updateRoute({slaHours:e.target.value?Number(e.target.value):null})}/></Field>
      </div></section>
      <div className={'fb-editor-layout'+(preview?' with-preview':'')}>
        <section className="fb-field-list card"><div className="fb-list-tools"><div className="search-field"><Search size={14}/><input aria-label="Search fields" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search questions…"/></div><button className="btn btn-sm btn-primary" onClick={add}><Plus size={13}/> Add</button></div>
          {loading?<p className="muted fb-loading">Loading generated plan…</p>:<div className="fb-fields">{filtered.map(({f,i})=><button key={`${f.id}-${i}`} className={selected===i?'active':''} onClick={()=>setSelected(i)}><GripVertical size={13}/><span><strong>{f.label}</strong><small>{f.section} · {f.type}{f.required?' · Required':''}</small></span>{f.conditional&&<Badge tone="blue">Conditional</Badge>}</button>)}</div>}
        </section>
        {selectedField&&<section className="fb-inspector card"><div className="fb-inspector-head"><div><span className="eyebrow">QUESTION {selected+1}</span><h3>Field settings</h3></div><div className="flex-row"><button className="icon-btn" aria-label="Move field up" onClick={()=>move(-1)}><ArrowUp size={14}/></button><button className="icon-btn" aria-label="Move field down" onClick={()=>move(1)}><ArrowDown size={14}/></button><button className="icon-btn" aria-label="Duplicate field" onClick={duplicate}><Copy size={14}/></button><button className="icon-btn danger" aria-label="Delete field" onClick={remove}><Trash2 size={14}/></button></div></div>
          <div className="form-grid"><Field label="Question label" wide><input value={selectedField.label} onChange={e=>updateField({label:e.target.value,id:selectedField.id.startsWith('custom_question_')?slug(e.target.value)||selectedField.id:selectedField.id})}/></Field><Field label="Field ID" hint="Stable API key; lowercase letters, numbers and underscores."><input value={selectedField.id} onChange={e=>updateField({id:slug(e.target.value)})}/></Field><Field label="Input type"><select value={selectedField.type} onChange={e=>updateField({type:e.target.value as BuilderField['type'],module:e.target.value==='lookup'?(selectedField.module||'member'):undefined})}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Form section" hint="Choose an existing section or type a new layout group."><input list="iris-form-sections" value={selectedField.section} onChange={e=>updateField({section:e.target.value})}/><datalist id="iris-form-sections">{[...new Set([...SECTIONS,...fields.map(f=>f.section)])].map(s=><option key={s} value={s}/>)}</datalist></Field><Field label="Helper text" wide><textarea rows={2} value={selectedField.desc||''} onChange={e=>updateField({desc:e.target.value||undefined})}/></Field><Field label="Placeholder" wide><input value={selectedField.placeholder||''} onChange={e=>updateField({placeholder:e.target.value||undefined})}/></Field></div>
          <div className="fb-switches"><Switch checked={Boolean(selectedField.required)} onChange={v=>updateField({required:v})} label="Required answer"/><Switch checked={Boolean(selectedField.conditional)} onChange={v=>updateField({conditional:v,dependsOn:v?selectedField.dependsOn:undefined,when:v?selectedField.when:undefined})} label="Conditional visibility"/></div>
          {selectedField.conditional&&<div className="form-grid fb-condition"><Field label="Show after field"><select value={selectedField.dependsOn||''} onChange={e=>updateField({dependsOn:e.target.value||undefined})}><option value="">Choose a dependency</option>{fields.filter((_,i)=>i!==selected).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></Field><Field label="Answer matches" hint="Text or pattern, e.g. Yes|Directly"><input value={selectedField.when||''} onChange={e=>updateField({when:e.target.value||undefined})} placeholder="Any answered value"/></Field></div>}
          {['select','multiselect','radio'].includes(selectedField.type)&&<Field label="Answer options" hint="One option per line." wide><textarea rows={6} value={options} onChange={e=>updateField({options:e.target.value.split('\n').map(x=>x.trim()).filter(Boolean)})}/></Field>}
          {selectedField.type==='lookup'&&<Field label="Linked record"><select value={selectedField.module||'member'} onChange={e=>updateField({module:e.target.value as 'member'|'session'|'ticket'})}><option value="member">Community member</option><option value="session">Studio session</option><option value="ticket">Existing ticket</option></select></Field>}
        </section>}
        {preview&&<aside className="fb-preview card"><div className="fb-preview-head"><div><span className="eyebrow">LIVE PREVIEW</span><h3>{sub}</h3></div><CheckCircle2 size={18}/></div>{[...new Set(fields.map(f=>f.section))].map(section=><div className="fb-preview-section" key={section}><h4>{section}</h4>{fields.filter(f=>f.section===section).map(f=><label key={f.id} className={selectedField?.id===f.id?'selected':''}><span>{f.label}{f.required&&<b> *</b>}</span>{f.type==='textarea'?<textarea rows={2} disabled placeholder={f.placeholder}/>:f.type==='select'||f.type==='radio'||f.type==='multiselect'?<select disabled><option>{f.options?.[0]||'Choose an option'}</option></select>:<input disabled type={f.type==='number'?'number':'text'} placeholder={f.placeholder}/>} {f.desc&&<small>{f.desc}</small>}</label>)}</div>)}</aside>}
      </div>
    </main>
  </div>;
}
