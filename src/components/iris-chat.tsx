"use client";
import {useEffect,useState,useRef} from 'react';
import {Sparkles,ArrowUp,Plus,FileCheck2,ShieldCheck,CheckCircle2,Send,ArrowUpRight,Loader2,PencilLine,LockKeyhole,Mic,Copy,Eraser,Download,ChevronDown,Volume2,VolumeX,FileText,FileJson,FileType,Image as ImageIcon} from 'lucide-react';
import {api,useApp,Modal,Field,Badge,Loading} from './ui';
import {MultiSelect} from './multi-select';
import {DraftDocument} from './ticket-composer';
import {TicketDialog} from './ticket-detail';
import {VoiceInput} from './voice-input';
import type {IrisTurn,IrisMessage} from '@/lib/iris-contract';
import type {PickerOption} from '@/lib/ticket-contract';
import {display} from '@/lib/display';
import {STUDIOS} from '@/lib/constants';
import {toPlainText,toMarkdown,toJson,downloadText} from '@/lib/chat-export';

export function IrisChat({presetCategory,presetSubcategory}:{presetCategory?:string;presetSubcategory?:string}){
  const{notify,user}=useApp();
  const[turn,setTurn]=useState<IrisTurn>();
  const[messages,setMessages]=useState<IrisMessage[]>([]);
  const[text,setText]=useState('');
  const[busy,setBusy]=useState(true);
  const[error,setError]=useState('');
  const[draftOpen,setDraftOpen]=useState(false);
  const[editOpen,setEditOpen]=useState(false);
  const[resetOpen,setResetOpen]=useState(false);
  const[exportOpen,setExportOpen]=useState(false);
  const[edits,setEdits]=useState<Record<string,string>>({});
  const[ticketId,setTicketId]=useState<number>();
  const[voiceMode,setVoiceMode]=useState(false);
  const[speaking,setSpeaking]=useState(false);
  const scroller=useRef<HTMLDivElement>(null);
  const lock=useRef(false);
  const turnRef=useRef<IrisTurn|undefined>(undefined);
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const exportRef=useRef<HTMLDivElement>(null);
  const startedAt=useRef(new Date().toISOString());

  useEffect(()=>{const v=localStorage.getItem('iris-voice-replies');if(v)setVoiceMode(v==='1');},[]);
  useEffect(()=>{
    function onDoc(e:MouseEvent){if(exportRef.current&&!exportRef.current.contains(e.target as Node))setExportOpen(false);}
    document.addEventListener('mousedown',onDoc);return()=>document.removeEventListener('mousedown',onDoc);
  },[]);

  function apply(d:IrisTurn,replace=false){
    turnRef.current=d;setTurn(d);
    localStorage.setItem('iris-conversation',d.sessionId);
    setMessages(m=>d.history||(replace?[{role:'assistant',content:d.message}]:[...m,{role:'assistant',content:d.message}]));
  }

  async function start(fresh=false){
    setBusy(true);setError('');
    try{
      const stored=!fresh&&!presetCategory?localStorage.getItem('iris-conversation'):null;
      if(stored){try{const d=await api<IrisTurn>('/api/iris/chat?sessionId='+encodeURIComponent(stored));if(d.sessionId){apply(d,true);setBusy(false);return;}}catch{localStorage.removeItem('iris-conversation');}}
      const d=await api<IrisTurn>('/api/iris/chat',{method:'POST',body:JSON.stringify({preset:presetCategory?{category:presetCategory,subcategory:presetSubcategory}:undefined})});
      apply(d,true);setText('');startedAt.current=new Date().toISOString();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  useEffect(()=>{void start();},[presetCategory,presetSubcategory]);
  useEffect(()=>{scroller.current?.scrollTo({top:scroller.current.scrollHeight,behavior:'smooth'});},[messages,busy,turn?.lookup]);

  async function speak(sentence:string){
    if(!voiceMode)return;
    try{
      setSpeaking(true);
      const res=await fetch('/api/iris/speak',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:sentence})});
      if(!res.ok){const d=await res.json().catch(()=>({}));throw new Error(d.error||'Voice reply unavailable');}
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      const audio=audioRef.current||new Audio();audioRef.current=audio;
      audio.src=url;audio.onended=()=>{setSpeaking(false);URL.revokeObjectURL(url);};
      await audio.play().catch(()=>setSpeaking(false));
    }catch(e){setSpeaking(false);notify((e as Error).message,'error');}
  }

  async function send(message?:string,label?:string,selection?:{module:'members'|'sessions';id:string},patch?:Record<string,string>,fromVoice=false){
    const current=turnRef.current;if(!current||lock.current)return;lock.current=true;setBusy(true);setError('');
    const shown=label||message;if(shown)setMessages(m=>[...m,{role:'user',content:shown}]);
    try{
      const d=await api<IrisTurn>('/api/iris/chat',{method:'POST',body:JSON.stringify({sessionId:current.sessionId,message,selection,patch})});
      apply(d);setText('');
      if(fromVoice||voiceMode)void speak(d.message);
    }catch(e){setError((e as Error).message);if(shown)setMessages(m=>m.slice(0,-1));}
    finally{setBusy(false);lock.current=false;}
  }

  async function approve(){
    if(!turn||lock.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const d=await api<{ticket:{id:number;ticketNumber:string}}>('/api/iris/approve',{method:'POST',body:JSON.stringify({sessionId:turn.sessionId})});
      const done={...turn,phase:'complete' as const,message:`${d.ticket.ticketNumber} is logged and assigned to ${turn.draft?.assignedStaffName}. You can track it from Command.`,ticket:d.ticket,options:[]};
      apply(done);setDraftOpen(false);notify(`${d.ticket.ticketNumber} created successfully.`);
      window.dispatchEvent(new Event('iris:tickets-updated'));
    }catch(e){setError((e as Error).message);}finally{setBusy(false);lock.current=false;}
  }

  function edit(){const d=turn?.draft;if(!d)return;setEdits({title:d.title,description:d.description,studio:d.studio,requestedResolution:d.requestedResolution||'',memberName:d.memberName,incidentAt:d.incidentAt,kind:d.kind});setEditOpen(true);}
  function toggleVoiceMode(){const next=!voiceMode;setVoiceMode(next);localStorage.setItem('iris-voice-replies',next?'1':'0');notify(next?'Iris will speak her replies back to you.':'Spoken replies turned off.');}

  function exportMeta(){return{staffName:user?.name||'Studio staff',startedAt:startedAt.current,ticketNumber:turn?.ticket?.ticketNumber};}
  async function copyChat(){await navigator.clipboard.writeText(toPlainText(messages,exportMeta())).then(()=>notify('Transcript copied to clipboard.')).catch(()=>notify('Clipboard access was blocked by the browser.','error'));setExportOpen(false);}
  function clearChat(){setMessages(turn?[{role:'assistant',content:turn.message}]:[]);notify('Chat view cleared — your ticket progress is unaffected.');}
  async function exportAs(kind:'txt'|'md'|'json'|'png'|'pdf'|'docx'){
    setExportOpen(false);
    const meta=exportMeta();
    try{
      if(kind==='txt')downloadText('iris-chat.txt',toPlainText(messages,meta));
      else if(kind==='md')downloadText('iris-chat.md',toMarkdown(messages,meta),'text/markdown');
      else if(kind==='json')downloadText('iris-chat.json',toJson(messages,meta),'application/json');
      else if(kind==='png'){
        const {toPng}=await import('html-to-image');
        if(!scroller.current)return;
        const dataUrl=await toPng(scroller.current,{backgroundColor:getComputedStyle(document.body).getPropertyValue('--surface')||'#131318',pixelRatio:2});
        const a=document.createElement('a');a.href=dataUrl;a.download='iris-chat.png';a.click();
      }else if(kind==='pdf'){
        const {jsPDF}=await import('jspdf');
        const doc=new jsPDF({unit:'pt'});
        const width=doc.internal.pageSize.getWidth()-72;let y=54;
        doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('IRIS — Internal Ticket Log',36,y);y+=22;
        doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text(`Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString('en-IN')}`,36,y);y+=24;
        for(const m of messages){
          doc.setFont('helvetica','bold');doc.setFontSize(10);
          const who=m.role==='assistant'?'IRIS':meta.staffName.toUpperCase();
          if(y>760){doc.addPage();y=54;}
          doc.text(who,36,y);y+=14;
          doc.setFont('helvetica','normal');
          const lines=doc.splitTextToSize(m.content,width);
          for(const line of lines){if(y>770){doc.addPage();y=54;}doc.text(line,36,y);y+=14;}
          y+=10;
        }
        doc.save('iris-chat.pdf');
      }else if(kind==='docx'){
        const {Document,Packer,Paragraph,TextRun,HeadingLevel}=await import('docx');
        const doc=new Document({sections:[{children:[
          new Paragraph({text:'IRIS — Internal Ticket Log',heading:HeadingLevel.HEADING_1}),
          new Paragraph({text:`Logged by ${meta.staffName} · ${new Date(meta.startedAt).toLocaleString('en-IN')}`}),
          new Paragraph({text:''}),
          ...messages.flatMap(m=>[new Paragraph({children:[new TextRun({text:m.role==='assistant'?'IRIS':meta.staffName.toUpperCase(),bold:true})]}),new Paragraph({text:m.content}),new Paragraph({text:''})]),
        ]}]});
        const blob=await Packer.toBlob(doc);
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='iris-chat.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      notify('Export ready.');
    }catch{notify('Export failed — please try again.','error');}
  }

  const collected=turn?.collected||{};
  const pct=turn?Math.round(turn.progress.done/turn.progress.total*100):0;
  const fieldOrder:[string,string][]=[['reportedBy','reported_by'],['kind','entry_type'],['category','category'],['subcategory','subcategory'],['memberName','logged_for'],['studio','studio'],['classFormat','class'],['trainer','trainer'],['incidentAt','when'],['impact','impact'],['requestedResolution','next_step']];

  return (
    <>
      <div className="chat-layout">
        <section className="card chat-panel">
          <div className="chat-head">
            <div className="chat-identity">
              <div className={'avatar-ring'+(speaking?' speaking':'')}>
                <img src="/images/iris-avatar.jpg" alt="Iris" />
              </div>
              <div>
                <strong>Iris</strong>
                <p>ops-intelligence.assistant</p>
              </div>
              <Badge tone={turn?.engine==='openai'?'green':'blue'}>{turn?.engine==='openai'?'OpenAI live':'Guided logic'}</Badge>
            </div>
            <div className="chat-toolbar">
              <button className={'icon-btn'+(voiceMode?' active':'')} title={voiceMode?'Voice replies on':'Voice replies off'} aria-label="Toggle spoken replies" onClick={toggleVoiceMode}>{voiceMode?<Volume2 size={15}/>:<VolumeX size={15}/>}</button>
              <button className="icon-btn" title="Copy transcript" aria-label="Copy transcript to clipboard" onClick={()=>void copyChat()}><Copy size={15}/></button>
              <button className="icon-btn" title="Clear chat view" aria-label="Clear chat view" onClick={clearChat}><Eraser size={15}/></button>
              <div style={{position:'relative'}} ref={exportRef}>
                <button className="icon-btn" title="Export chat" aria-label="Export chat" onClick={()=>setExportOpen(v=>!v)}><Download size={15}/></button>
                {exportOpen&&(
                  <div className="card" style={{position:'absolute',right:0,top:40,zIndex:20,width:190,padding:6}}>
                    {[['txt','Plain text',FileText],['md','Markdown',FileText],['json','JSON',FileJson],['png','Image (PNG)',ImageIcon],['pdf','PDF document',FileType],['docx','Word (.docx)',FileType]].map(([k,label,Icon])=>{const I=Icon as typeof FileText;return(
                      <button key={k as string} className="quick-template" style={{padding:'9px 8px'}} onClick={()=>void exportAs(k as 'txt')}><I size={14}/> <span style={{fontSize:12}}>{label as string}</span></button>
                    );})}
                  </div>
                )}
              </div>
              <button className="icon-btn" title="Start a new conversation" aria-label="Start a new conversation" onClick={()=>setResetOpen(true)}><Plus size={16}/></button>
            </div>
          </div>
          <div className="chat-scroll" ref={scroller}>
            <div className="chat-day">Internal ticket logging · Physique 57 India</div>
            {!turn&&busy?<Loading/>:messages.map((m,i)=>(
              <div className={'chat-message '+(m.role==='user'?'user':'')} key={i}>
                {m.role==='assistant'&&<span className="msg-avatar"><img src="/images/iris-avatar.jpg" alt=""/></span>}
                <div className="bubble">{m.content.startsWith('__')?'Selection made from Momence':m.content}</div>
              </div>
            ))}
            {busy&&turn&&<div className="chat-message"><span className="msg-avatar"><img src="/images/iris-avatar.jpg" alt=""/></span><div className="bubble"><span className="chat-status"><i/><i/><i/></span></div></div>}
            {!busy&&turn?.lookup&&turn.phase!=='complete'&&(
              <div style={{margin:'0 0 24px 36px'}}>
                <MultiSelect module={turn.lookup} value={[]} onChange={(opts:PickerOption[])=>{const o=opts[0];if(o)void send(undefined,o.label,{module:turn.lookup!,id:String(o.id)});}} placeholder={turn.lookup==='members'?'Search members by name, email or phone…':'Search classes by name, trainer or studio…'}/>
              </div>
            )}
            {!busy&&turn?.options.length&&turn.phase!=='complete'?(
              <div className="chat-options">
                {turn.options.map(o=><button className="btn" key={o.value} onClick={()=>void send(o.value,o.label)}>{o.label}</button>)}
              </div>
            ):null}
            {turn?.phase==='draft'&&(
              <div className="info-box" style={{margin:'0 0 20px 36px',alignItems:'center'}}>
                <FileCheck2 size={21}/>
                <div className="grow"><strong style={{fontSize:12}}>Ticket ready to review</strong><p style={{fontSize:11}}>Check the member, class, ownership and follow-up plan.</p></div>
                <button className="btn btn-primary" onClick={()=>setDraftOpen(true)}>Review draft <ArrowUpRight size={12}/></button>
              </div>
            )}
            {turn?.phase==='complete'&&turn.ticket&&(
              <div className="card card-pad" style={{marginLeft:36,background:'var(--green-bg)'}}>
                <CheckCircle2 size={25} style={{color:'var(--green)',marginBottom:12}}/>
                <h3>{turn.ticket.ticketNumber} · logged</h3>
                <p className="secondary" style={{fontSize:12,marginTop:6}}>Saved to Command with routing and a follow-up target already set.</p>
                <button className="btn" style={{marginTop:16}} onClick={()=>setTicketId(turn.ticket!.id)}>Open ticket <ArrowUpRight size={12}/></button>
              </div>
            )}
            {turn?.notice&&<div className="info-box warning" style={{marginTop:15}}>{turn.notice}</div>}
            {error&&<div className="error-box" style={{marginTop:15}}>{error}{!turn&&<button className="text-btn" onClick={()=>void start()}>Retry</button>}</div>}
          </div>
          {turn?.phase!=='complete'&&(
            <form className="chat-compose" onSubmit={e=>{e.preventDefault();if(text.trim())void send(text.trim());}}>
              <div className="compose-box">
                <textarea rows={2} aria-label="Message Iris" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(text.trim()&&!busy)void send(text.trim());}}} placeholder={turn?.lookup?'Search above, or add more detail…':turn?.phase==='draft'?'Tell Iris what to change…':'Log what you saw or what a member told you…'}/>
                <VoiceInput disabled={busy} onVoiceUsed={()=>{if(!voiceMode){setVoiceMode(true);localStorage.setItem('iris-voice-replies','1');}}} onText={v=>setText(t=>t?t+' '+v:v)}/>
                <button type="submit" className="icon-btn send" disabled={busy||!text.trim()} aria-label="Send message"><ArrowUp size={17}/></button>
              </div>
              <div className="compose-hint"><span>ENTER TO SEND · SHIFT+ENTER NEW LINE</span><span><LockKeyhole size={9} style={{display:'inline',marginRight:4}}/>NOTHING FILED WITHOUT APPROVAL</span></div>
            </form>
          )}
        </section>

        <aside className="card builder-panel">
          <div className="builder-head">
            <div className="between"><h3>Live ticket builder</h3><Badge tone="purple">SCHEMA</Badge></div>
            <p className="muted" style={{fontSize:10,marginTop:6}}>Fields populate as the conversation continues.</p>
            <div className="builder-progress">{Array.from({length:turn?.progress.total||8}).map((_,i)=><span key={i} className={i<(turn?.progress.done||0)?'done':''}/>)}</div>
          </div>
          <div className="builder-body">
            {!Object.keys(collected).some(k=>fieldOrder.some(([key])=>key===k))?(
              <div className="builder-empty">Waiting for the first details…<br/>Nothing has been captured yet.</div>
            ):fieldOrder.filter(([key])=>collected[key]!==undefined&&collected[key]!=='').map(([key,label])=>(
              <div className="builder-line" key={key}><span className="k">{label}:</span><span className="v">{display(collected[key])}</span></div>
            ))}
            {collected.category==='Safety and Security'&&(
              <div style={{marginTop:16}}>
                <span className="k mono" style={{fontSize:10}}>severity_signal</span>
                <div className="severity-meter">{[0,1,2].map(i=><span key={i} style={{background:'var(--red)'}}/>)}</div>
              </div>
            )}
          </div>
          {turn?.draft&&(
            <div className="builder-footer">
              <button className="btn btn-primary" onClick={()=>setDraftOpen(true)}><FileCheck2 size={13}/>Review complete ticket</button>
            </div>
          )}
        </aside>
      </div>

      <Modal open={draftOpen} onClose={()=>setDraftOpen(false)} title="A clean, structured ticket" description="Review every detail before approving it." size="wide" footer={<><button className="btn" onClick={edit}><PencilLine size={13}/>Edit details</button><button className="btn btn-primary" disabled={busy||turn?.phase==='complete'} onClick={()=>void approve()}>{busy?<Loader2 size={13} className="animate-spin"/>:<Send size={13}/>} {turn?.phase==='complete'?'Already logged':'Approve & log ticket'}</button></>}>{turn?.draft&&<DraftDocument draft={turn.draft} onEdit={edit}/>}</Modal>
      <Modal open={editOpen} onClose={()=>setEditOpen(false)} title="Fine-tune the details" description="Edits rebuild the draft and rerun routing." footer={<><button className="btn" onClick={()=>setEditOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={()=>{void send(undefined,'Updated the draft details.',undefined,edits).then(()=>setEditOpen(false));}}>Update draft</button></>}>
        <div className="form-grid">{Object.entries(edits).map(([k,v])=>(
          <Field key={k} label={k.replace(/([A-Z])/g,' $1')} wide={k==='description'||k==='requestedResolution'}>
            {k==='studio'?<select value={v} onChange={e=>setEdits(s=>({...s,[k]:e.target.value}))}>{STUDIOS.map(s=><option key={s.id}>{s.name}</option>)}</select>
            :k==='kind'?<select value={v} onChange={e=>setEdits(s=>({...s,[k]:e.target.value}))}>{['issue','request','compliment','feedback'].map(c=><option key={c}>{c}</option>)}</select>
            :k==='description'||k==='requestedResolution'?<textarea value={v} onChange={e=>setEdits(s=>({...s,[k]:e.target.value}))}/>
            :<input value={v} onChange={e=>setEdits(s=>({...s,[k]:e.target.value}))}/>}
          </Field>
        ))}</div>
      </Modal>
      <Modal open={resetOpen} onClose={()=>setResetOpen(false)} title="Start a fresh conversation?" description="The current conversation stays saved in the database." size="narrow" footer={<><button className="btn" onClick={()=>setResetOpen(false)}>Keep chatting</button><button className="btn btn-primary" onClick={()=>{setResetOpen(false);void start(true);}}>Start fresh</button></>}>
        <p className="secondary">Any ticket you\u2019ve already approved won\u2019t change. Iris will start a new one from a clean slate.</p>
      </Modal>
      {ticketId&&<TicketDialog open id={ticketId} onClose={()=>setTicketId(undefined)}/>}
    </>
  );
}
