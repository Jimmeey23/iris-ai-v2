"use client";
import {useEffect,useState} from 'react';
import {ClipboardList,Plus,Trash2,Loader2,ExternalLink,Search} from 'lucide-react';
import {Shell} from '@/components/shell';
import {api,Badge,Field,Modal,Loading,Empty,SearchField,useApp} from '@/components/ui';
import {FilloutEmbed} from '@/components/fillout-embed';
import type {EmbeddedForm} from '@/lib/forms';

const RUBRICS=['General','Barre','powerCycle','Strength Lab','Yoga','Mat 57','HIIT'];

function AddFormModal({open,onClose,onAdded}:{open:boolean;onClose:()=>void;onAdded:()=>void}){
  const[name,setName]=useState(''),[template,setTemplate]=useState('General'),[blurb,setBlurb]=useState(''),[icon,setIcon]=useState('▤'),[embedCode,setEmbedCode]=useState('');
  const[busy,setBusy]=useState(false),[error,setError]=useState('');
  const{notify}=useApp();

  async function submit(){
    setError('');
    if(!name.trim())return setError('Give the form a name.');
    if(!embedCode.trim())return setError('Paste the form’s embed code, share link or id.');
    setBusy(true);
    try{
      await api('/api/forms',{method:'POST',body:JSON.stringify({name,template,blurb,icon,embedCode})});
      notify(`${name.trim()} added to the forms board.`);
      setName('');setBlurb('');setEmbedCode('');setIcon('▤');setTemplate('General');
      onAdded();
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a form" description="Embed any Fillout form or Zite app alongside the built-in four." size="narrow"
      footer={<><span className="muted" style={{fontSize:10}}>The id and runtime are read from whatever you paste.</span><div className="flex-row"><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={()=>void submit()}>{busy?<Loader2 size={13} className="animate-spin"/>:<Plus size={13}/>}Add form</button></div></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Form name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Yoga assessment"/></Field>
          <Field label="Rubric"><select value={template} onChange={e=>setTemplate(e.target.value)}>{RUBRICS.map(r=><option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Card icon" hint="A single character shown on the card."><input value={icon} onChange={e=>setIcon(e.target.value)} maxLength={4}/></Field>
          <Field label="Blurb" hint="Optional one-line description."><input value={blurb} onChange={e=>setBlurb(e.target.value)} placeholder="What this form captures"/></Field>
          <Field label="Embed code, share link or form id" wide hint="Accepts a full Fillout/Zite snippet, a fillout.com link, or a bare id.">
            <textarea rows={4} className="code-editor" value={embedCode} onChange={e=>setEmbedCode(e.target.value)} placeholder={'<div data-fillout-id="abc123" …></div>'}/>
          </Field>
        </div>
        {error&&<div className="error-box">{error}</div>}
      </div>
    </Modal>
  );
}

export default function FormsPage(){
  const[forms,setForms]=useState<EmbeddedForm[]>([]);
  const[active,setActive]=useState<EmbeddedForm>();
  const[q,setQ]=useState('');
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState('');
  const[addOpen,setAddOpen]=useState(false);
  const{user,notify}=useApp();

  const load=()=>api<{forms:EmbeddedForm[]}>('/api/forms')
    .then(d=>{setForms(d.forms);setActive(a=>d.forms.find(f=>f.key===a?.key)||d.forms[0]);})
    .catch(e=>setError((e as Error).message))
    .finally(()=>setBusy(false));
  useEffect(()=>{void load();},[]);

  async function remove(form:EmbeddedForm){
    try{
      await api('/api/forms?key='+encodeURIComponent(form.key),{method:'DELETE'});
      notify(`${form.name} removed from the board.`);
      await load();
    }catch(e){notify((e as Error).message,'error');}
  }

  const filtered=forms.filter(f=>!q||(f.name+' '+f.blurb+' '+f.template).toLowerCase().includes(q.toLowerCase()));

  return (
    <Shell title="Fill it in where the work happens." eyebrow="EVALUATION FORMS" action={<div className="flex-row">{user?.role==='admin'&&<button className="btn" onClick={()=>setAddOpen(true)}><Plus size={14}/>Add form</button>}<Badge tone="blue"><ClipboardList size={12}/>{forms.length} forms</Badge></div>}>
      <div className="iris-banner">
        <div className="iris-orb"><ClipboardList size={23}/></div>
        <div className="grow">
          <h2>Every assessment form, embedded right here.</h2>
          <p>Pick a card and fill the form in place — no tab-switching, no copied links. Submissions flow back through the same import that feeds the trainer scorecards, so what you record here shows up on <strong>Trainer reviews</strong>.</p>
        </div>
        <Badge tone="purple">Fillout &amp; Zite</Badge>
      </div>

      <div className="between" style={{marginBottom:20}}>
        <SearchField value={q} onChange={setQ} placeholder="Find a form…"/>
        <span className="muted" style={{fontSize:11,whiteSpace:'nowrap'}}>{filtered.length} of {forms.length}</span>
      </div>

      {error&&<div className="error-box">{error}</div>}
      {busy?<Loading variant="card"/>:!filtered.length?(
        <Empty art="clipboard" title="No matching forms" detail="Try a broader search, or add a form with its embed code."/>
      ):(
        <div className="entity-grid rise-stagger" style={{marginBottom:24}}>
          {filtered.map(f=>(
            <button key={f.key} className={'card entity-card form-card'+(active?.key===f.key?' active':'')} onClick={()=>setActive(f)}>
              <div className="between">
                <span className="form-card-icon">{f.icon}</span>
                <Badge tone={f.apiPollable?'green':''}>{f.apiPollable?'API + webhook':'Webhook'}</Badge>
              </div>
              <h3>{f.name}</h3>
              <p>{f.blurb||'No description'}</p>
              <div className="entity-foot">
                <span className="tag">{f.template}</span>
                {f.custom&&user?.role==='admin'&&(
                  <span role="button" tabIndex={0} className="icon-btn sm" aria-label={'Remove '+f.name}
                    onClick={e=>{e.stopPropagation();void remove(f);}}
                    onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void remove(f);}}}><Trash2 size={13}/></span>
                )}
              </div>
            </button>
          ))}
          {user?.role==='admin'&&(
            <button className="card entity-card form-card-add" onClick={()=>setAddOpen(true)}>
              <span className="form-card-icon accent"><Plus size={18}/></span>
              <h3>Add a form</h3>
              <p>Paste a Fillout or Zite embed code to put it on this board.</p>
            </button>
          )}
        </div>
      )}

      {active&&(
        <section className="card">
          <div className="between card-pad" style={{paddingBottom:14,marginBottom:0}}>
            <div>
              <h3 style={{fontSize:15}}>{active.name}</h3>
              <p className="muted" style={{fontSize:11.5,marginTop:3}}>{active.blurb||'Fill this form in and submit — it files straight into the workspace.'}</p>
            </div>
            <div className="flex-row">
              <Badge>{active.template}</Badge>
              <span title={active.apiPollable?'Polled from the Fillout submissions API':'Delivered by webhook or the Zite flow reader only'}><Badge tone={active.apiPollable?'green':''}>{active.apiPollable?'API + webhook':'Webhook'}</Badge></span>
              <a className="icon-btn" href={`https://forms.fillout.com/t/${active.embedId}`} target="_blank" rel="noreferrer" aria-label="Open this form in a new tab"><ExternalLink size={14}/></a>
            </div>
          </div>
          <FilloutEmbed key={active.embedId} embedId={active.embedId} kind={active.embedKind} height={active.height}/>
        </section>
      )}

      <AddFormModal open={addOpen} onClose={()=>setAddOpen(false)} onAdded={()=>{setAddOpen(false);void load();}}/>
    </Shell>
  );
}
