"use client";
import * as Dialog from '@radix-ui/react-dialog';
import {useEffect,useLayoutEffect,useState,useRef,createContext,useContext,useCallback,type ReactNode} from 'react';
import {X,CheckCircle2,AlertCircle,Loader2,Search,Sun,Moon} from 'lucide-react';
import {EmptyArt,type ArtVariant} from './graphics';
import {cn,initials} from '@/lib/utils';
import type {Identity} from '@/lib/auth';
import {setDisplayTimezone} from '@/lib/display';

export async function api<T=Record<string,unknown>>(url:string,init?:RequestInit):Promise<T>{// FormData must set its own multipart Content-Type: it carries the boundary, and forcing
// application/json here makes the server's formData() parse throw.
const isForm=typeof FormData!=='undefined'&&init?.body instanceof FormData;
const res=await fetch(url,{...init,headers:{...(isForm?{}:{'Content-Type':'application/json'}),...init?.headers},cache:'no-store'});let data:unknown;try{data=await res.json();}catch{throw new Error('The server returned an unexpected response. Please retry.');}if(!res.ok){const r=data as {error?:string;details?:{path?:string[];message?:string}[]};throw new Error(r.details?.[0]?.message?`${r.details[0].path?.join('.')||'Field'}: ${r.details[0].message}`:r.error||'Request failed');}return data as T;}
type AppContextType={theme:'light'|'dark';toggleTheme:()=>void;notify:(text:string,type?:'success'|'error')=>void;user:Identity|null;setupRequired:boolean;refreshUser:()=>Promise<void>;pollSeconds:number;staleTicketDays:number;workspaceName:string;themePlaceholder?:string;view:string;setView:(view:string)=>void;openAuth:()=>void};
/** How long a toast stays up, and how long its exit animation runs. The CSS
 *  countdown bar reads `--toast-ms`, so the two can never disagree. */
const TOAST_MS=6500;
const TOAST_EXIT_MS=260;
type Toast={id:number;text:string;type:'success'|'error';leaving:boolean};
const AppContext=createContext<AppContextType|null>(null);
export function useApp(){const c=useContext(AppContext);if(!c)throw new Error('App provider missing');return c;}
export function AppProvider({children}:{children:ReactNode}){const[pollSeconds,setPollSeconds]=useState(15);const[staleTicketDays,setStaleTicketDays]=useState(3);const[workspaceName,setWorkspaceName]=useState('Physique 57 India');const[theme,setTheme]=useState<'light'|'dark'>('dark');
  // Sync the saved theme before first paint so light users never see a dark flash,
  // while the server markup always renders dark → no hydration mismatch.
  useLayoutEffect(()=>{try{const v=localStorage.getItem('iris-theme');if(v==='light'){setTheme('light');document.documentElement.dataset.theme='light';}}catch{}},[]);const[view,setViewState]=useState('list');const[user,setUser]=useState<Identity|null>(null);const[setupRequired,setSetupRequired]=useState(false);const[toasts,setToasts]=useState<Toast[]>([]);const[authOpen,setAuthOpen]=useState(false);
const notify=useCallback((text:string,type:'success'|'error'='success')=>{
    const id=Date.now()+Math.random();
    // Cap the stack at four; the oldest leaves immediately rather than piling up.
    setToasts(t=>[...t.slice(-3),{id,text,type,leaving:false}]);
    // Flag `leaving` first so the exit animation can play, then unmount once it
    // has finished. Removing straight away made toasts blink out of existence.
    window.setTimeout(()=>setToasts(t=>t.map(x=>x.id===id?{...x,leaving:true}:x)),TOAST_MS);
    window.setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),TOAST_MS+TOAST_EXIT_MS);
  },[]);
  const dismiss=useCallback((id:number)=>{
    setToasts(t=>t.map(x=>x.id===id?{...x,leaving:true}:x));
    window.setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),TOAST_EXIT_MS);
  },[]);
const refreshUser=useCallback(async()=>{try{const d=await api<{user:Identity|null;setupRequired:boolean}>('/api/auth');setUser(d.user);setSetupRequired(d.setupRequired);}catch{}},[]);
useEffect(()=>{
  // The user's explicit theme choice (once made) lives in localStorage and must
  // never be silently overwritten by a server round-trip on navigation/remount —
  // only the FIRST-EVER visit (no local value yet) may adopt the server/workspace default.
  const local=localStorage.getItem('iris-theme');
  const hasLocal=local==='light'||local==='dark';
  if(hasLocal){setTheme(local as 'light'|'dark');document.documentElement.dataset.theme=local as string;}
  void refreshUser();
  if(!hasLocal){
    void api<{theme?:'light'|'dark';view?:string}>('/api/preferences').then(p=>{
      const resolved=p.theme==='light'?'light':'dark';
      setTheme(resolved);document.documentElement.dataset.theme=resolved;localStorage.setItem('iris-theme',resolved);
      if(p.view)setViewState(p.view);
    }).catch(()=>{});
  }else{
    void api<{view?:string}>('/api/preferences').then(p=>{if(p.view)setViewState(p.view);}).catch(()=>{});
  }
},[refreshUser]);
const toggleTheme=()=>{const next=theme==='light'?'dark':'light';setTheme(next);document.documentElement.dataset.theme=next;localStorage.setItem('iris-theme',next);void api('/api/preferences',{method:'PATCH',body:JSON.stringify({theme:next})}).catch(()=>notify('Theme saved on this device; server preferences are temporarily unavailable.','error'));};
useEffect(()=>{const load=()=>{void api<{pollSeconds:number;workspaceName:string;timezone:string;staleTicketDays?:number}>('/api/settings?scope=public').then(c=>{setPollSeconds(c.pollSeconds);setWorkspaceName(c.workspaceName);setDisplayTimezone(c.timezone);if(c.staleTicketDays)setStaleTicketDays(c.staleTicketDays);}).catch(()=>{});};load();window.addEventListener('iris:settings-updated',load);return()=>window.removeEventListener('iris:settings-updated',load);},[]);
const setView=(v:string)=>{setViewState(v);void api('/api/preferences',{method:'PATCH',body:JSON.stringify({view:v})}).catch(()=>{});};
return <AppContext.Provider value={{theme,toggleTheme,notify,user,setupRequired,refreshUser,pollSeconds,staleTicketDays,workspaceName,view,setView,openAuth:()=>setAuthOpen(true)}}>{children}<AuthDialog open={authOpen} onClose={()=>setAuthOpen(false)}/><div className="toasts" role="region" aria-live="polite" aria-label="Notifications">{toasts.map(t=><div className={cn('toast',t.type,t.leaving&&'leaving')} style={{'--toast-ms':TOAST_MS+'ms'} as React.CSSProperties} key={t.id}>{t.type==='success'?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>}<span className="grow">{t.text}</span><button className="text-btn" aria-label="Dismiss notification" onClick={()=>dismiss(t.id)}><X size={14}/></button></div>)}</div></AppContext.Provider>;}
export function Modal({open,onClose,title,description,children,footer,size='normal',resetKey}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;footer?:ReactNode;size?:'normal'|'narrow'|'wide';resetKey?:string}){const scroll=useRef<HTMLDivElement>(null);useEffect(()=>{scroll.current?.scrollTo({top:0});},[open,resetKey]);useEffect(()=>{if(!open)return;const close=()=>onClose();window.addEventListener('iris:close-modals',close);return()=>window.removeEventListener('iris:close-modals',close);},[open,onClose]);return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={cn('dialog-content',size)} onEscapeKeyDown={()=>window.dispatchEvent(new Event('iris:close-modals'))}><div className="dialog-head"><div><Dialog.Title className="dialog-title">{title}</Dialog.Title><Dialog.Description className="dialog-description">{description||'IRIS workspace'}</Dialog.Description></div><Dialog.Close asChild><button className="icon-btn" aria-label="Close dialog"><X size={18}/></button></Dialog.Close></div><div className="dialog-scroll" ref={scroll}>{children}</div>{footer&&<div className="dialog-footer">{footer}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;}
export function ThemeToggle(){
  const{theme,toggleTheme}=useApp();
  // The cross-fade class is what stops a theme change from snapping every
  // surface at once. Removed on a timer so the transition never lingers on
  // normal interaction, and skipped entirely for reduced-motion users.
  const swap=()=>{
    const root=document.documentElement;
    const calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!calm&&!root.classList.contains('theme-transitioning')){
      root.classList.add('theme-transitioning');
      window.setTimeout(()=>root.classList.remove('theme-transitioning'),380);
    }
    toggleTheme();
  };
  return <button className="icon-btn" data-tip={theme==='light'?'Matte black & gold':'Light mode'} data-tip-pos="bottom" aria-label="Toggle light and dark theme" onClick={swap}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</button>;
}

/* ══════════════════════════════════════════════════════════════════════
   PRIMITIVES v2
   Additive: nothing existing has to change. Use these for new work and
   migrate opportunistically. All styling lives in the token layer of
   `globals.css`, so they re-tint with the theme for free.
   ══════════════════════════════════════════════════════════════════════ */

export type ButtonVariant='primary'|'secondary'|'soft'|'ghost'|'outline'|'danger'|'success';
export type ButtonSize='xs'|'sm'|'md'|'lg';

/**
 * The one button. Renders a `<button>`, or an `<a>` when given `href`, so a
 * navigation target never has to be faked with an onClick.
 *
 * `loading` swaps in a spinner while keeping the label's box reserved — the
 * button never changes width mid-action, which is what makes a form feel solid.
 */
export function Button({variant='secondary',size='md',loading=false,active=false,block=false,href,icon:Icon,iconRight:IconRight,className,children,...rest}:{
  variant?:ButtonVariant;size?:ButtonSize;loading?:boolean;active?:boolean;block?:boolean;
  href?:string;icon?:React.ComponentType<{size?:number|string}>;iconRight?:React.ComponentType<{size?:number|string}>;
  className?:string;children?:ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>){
  const iconSize=size==='lg'?17:size==='xs'?12:14;
  const cls=cn('btn',
    variant==='primary'&&'btn-primary',variant==='soft'&&'btn-soft',variant==='ghost'&&'btn-ghost',
    variant==='outline'&&'btn-outline',variant==='danger'&&'btn-danger',variant==='success'&&'btn-success',
    size==='lg'&&'btn-lg',size==='sm'&&'btn-sm',size==='xs'&&'btn-xs',
    active&&'active',block&&'btn-block',loading&&'is-loading',className);
  const inner=<>{Icon&&<Icon size={iconSize}/>}{children}{IconRight&&<IconRight size={iconSize}/>}</>;
  if(href&&!loading)return <a className={cls} href={href} {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
  return <button className={cls} disabled={loading||rest.disabled} aria-busy={loading||undefined} type={rest.type||'button'} {...rest}>{inner}</button>;
}

export type TabItem<T extends string>={id:T;label:ReactNode;count?:number;disabled?:boolean};

/**
 * Tabs with the semantics the seven hand-rolled tab strips in this app are
 * missing: `role="tablist"`, `aria-selected`, a roving tabindex, and
 * Arrow/Home/End navigation.
 *
 * The active indicator is one element that glides between tabs — its offset and
 * width are measured off the DOM and written to CSS variables, so the motion is
 * a transform rather than a repaint of whichever tab happens to be selected.
 */
export function Tabs<T extends string>({items,value,onChange,variant='segment',label,className,tabHint}:{
  items:TabItem<T>[];value:T;onChange:(id:T)=>void;variant?:'segment'|'underline';
  label:string;className?:string;tabHint?:string;
}){
  const listRef=useRef<HTMLDivElement>(null);
  const[thumb,setThumb]=useState({x:0,w:0});
  const measure=useCallback(()=>{
    const list=listRef.current;if(!list)return;
    const active=list.querySelector<HTMLElement>('[aria-selected="true"]');
    if(!active)return;
    setThumb(prev=>prev.x===active.offsetLeft&&prev.w===active.offsetWidth?prev:{x:active.offsetLeft,w:active.offsetWidth});
  },[]);
  useLayoutEffect(()=>{
    measure();
    const list=listRef.current;if(!list||typeof ResizeObserver==='undefined')return;
    const ro=new ResizeObserver(measure);
    ro.observe(list);
    for(const child of Array.from(list.children))ro.observe(child);
    // Fonts landing late changes every label's width; re-measure once they do.
    const fonts=(document as Document&{fonts?:FontFaceSet}).fonts;
    fonts?.ready.then(measure).catch(()=>{});
    return()=>ro.disconnect();
  },[measure,value,items]);
  /** Move selection by `delta`, skipping disabled tabs and wrapping at the ends. */
  const move=(delta:number)=>{
    const enabled=items.filter(i=>!i.disabled);
    if(!enabled.length)return;
    const at=enabled.findIndex(i=>i.id===value);
    const next=enabled[(at+delta+enabled.length)%enabled.length]!;
    onChange(next.id);
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${next.id}"]`)?.focus();
  };
  const onKey=(e:React.KeyboardEvent)=>{
    const k=e.key;
    if(k==='ArrowRight'||k==='ArrowDown'){e.preventDefault();move(1);}
    else if(k==='ArrowLeft'||k==='ArrowUp'){e.preventDefault();move(-1);}
    else if(k==='Home'){e.preventDefault();const f=items.find(i=>!i.disabled);if(f){onChange(f.id);listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${f.id}"]`)?.focus();}}
    else if(k==='End'){e.preventDefault();const l=[...items].reverse().find(i=>!i.disabled);if(l){onChange(l.id);listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${l.id}"]`)?.focus();}}
  };
  return <div className={cn('tabs',variant==='underline'?'tabs-underline':'tabs-segment',className)}
    style={{'--tab-x':thumb.x+'px','--tab-w':thumb.w+'px'} as React.CSSProperties}>
    <span className="tabs-thumb" aria-hidden="true"/>
    <div className="tabs-list" ref={listRef} role="tablist" aria-label={label} onKeyDown={onKey}>
      {items.map(item=>{
        const selected=item.id===value;
        return <button key={item.id} type="button" role="tab" data-tab-id={item.id} className="tab" id={'tab-'+item.id}
          aria-selected={selected} aria-controls={'panel-'+item.id}
          tabIndex={selected?0:-1} disabled={item.disabled}
          onClick={()=>onChange(item.id)}>{item.label}{typeof item.count==='number'&&<span className="tab-pill">{item.count}</span>}</button>;
      })}
    </div>
    {tabHint&&<span className="muted" style={{fontSize:'var(--text-3xs)',alignSelf:'center',marginLeft:10}}>{tabHint}</span>}
  </div>;
}

/** Marks the region a `Tabs` selection controls, wiring up the ARIA pair. */
export function TabPanel<T extends string>({id,children,className}:{id:T;children:ReactNode;className?:string}){
  return <div className={className} role="tabpanel" id={'panel-'+id} aria-labelledby={'tab-'+id} tabIndex={0}>{children}</div>;
}

/**
 * Tooltip by attribute. The CSS lives in the primitive layer, so this only
 * exists to keep the prop names honest at the call site and to guarantee an
 * `aria-label` alongside the visual hint — a tooltip is not an accessible name.
 */
export function Tip({text,pos='top',label,children,className}:{text:string;pos?:'top'|'bottom'|'left'|'right';label?:string;children:ReactNode;className?:string}){
  return <span className={className} data-tip={text} data-tip-pos={pos} aria-label={label||text}>{children}</span>;
}
export function Avatar({name,tone='',large=false}:{name:string;tone?:string;large?:boolean}){return <span className={cn('avatar',tone,large&&'lg')}>{initials(name||'IRIS')}</span>;}
export function Badge({children,tone='',className}:{children:ReactNode;tone?:string;className?:string}){return <span className={cn('badge',tone,className)}>{children}</span>;}
export function Status({status}:{status:string}){return <span className={cn('badge','status-'+status)}><i className="status-dot"/>{({in_progress:'In progress',waiting_on_member:'Awaiting member',waiting_on_vendor:'Awaiting vendor'} as Record<string,string>)[status]||status.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}</span>;}
export function Priority({priority}:{priority:string}){return <span className={cn('badge','priority-'+priority)}><span style={{fontSize:11}}>≋</span>{priority.replace(/^./,c=>c.toUpperCase())}</span>;}
export function SearchField({value,onChange,placeholder='Search…'}:{value:string;onChange:(value:string)=>void;placeholder?:string}){return <div className="search-input"><Search size={14}/><input value={value} placeholder={placeholder} aria-label={placeholder} onChange={e=>onChange(e.target.value)}/></div>;}
/**
 * Counts from the previously shown figure up to `value` whenever it changes, so the metric
 * cards can render instantly at zero and animate as soon as the data lands. Reduced-motion
 * users get the final figure with no animation.
 */
export function CountUp({value,format,duration=900}:{value:number;format?:(n:number)=>string;duration?:number}){
  const[shown,setShown]=useState(value);
  const from=useRef(value);
  useEffect(()=>{
    const target=Number.isFinite(value)?value:0;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){from.current=target;setShown(target);return;}
    const start=performance.now(),origin=from.current;let raf=0;
    const tick=(now:number)=>{
      const p=Math.min(1,(now-start)/duration);
      setShown(origin+(target-origin)*(1-Math.pow(1-p,3)));
      if(p<1)raf=requestAnimationFrame(tick);else from.current=target;
    };
    raf=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(raf);from.current=target;};
  },[value,duration]);
  return <>{format?format(shown):Math.round(shown).toString()}</>;
}
export function Empty({title,detail,action,art='inbox'}:{title:string;detail?:string;action?:ReactNode;art?:ArtVariant}){return <div className="empty-state"><EmptyArt variant={art}/><h3>{title}</h3>{detail&&<p>{detail}</p>}{action}</div>;}
export function Loading({rows=3,variant='block'}:{rows?:number;variant?:'block'|'list'|'card'}){
  if(variant==='list')return <div className="skeleton-list" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton-row" key={i} style={{animationDelay:(i*90)+'ms'}}><div className="skeleton sk-avatar"/><div className="grow"><div className="skeleton sk-line" style={{width:'42%'}}/><div className="skeleton sk-line sk-sm" style={{width:'68%'}}/></div><div className="skeleton sk-pill"/></div>)}</div>;
  if(variant==='card')return <div className="skeleton-cards" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton sk-card" key={i} style={{animationDelay:(i*90)+'ms'}}/>)}</div>;
  return <div className="stack" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton" key={i} style={{animationDelay:(i*90)+'ms'}}/>)}</div>;
}
/** Animated SVG progress ring — used for scores, SLA health and completeness. */
export function Switch({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label:string}){return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)} className={cn('toggle',checked&&'on')}/>;}
export function Field({label,children,hint,wide=false}:{label:string;children:ReactNode;hint?:string;wide?:boolean}){return <div className={cn('field',wide&&'wide')}><label><span>{label}</span>{children}</label>{hint&&<span className="field-hint">{hint}</span>}</div>;}
export function AuthDialog({open,onClose}:{open:boolean;onClose:()=>void}){const{setupRequired,user,refreshUser,notify}=useApp();const[email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[staffId,setStaffId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const[staff,setStaff]=useState<{id:number;name:string}[]>([]);
useEffect(()=>{if(open&&setupRequired)void api<{staff:{id:number;name:string}[]}>('/api/staff').then(d=>setStaff(d.staff)).catch(()=>{});},[open,setupRequired]);
async function submit(){setBusy(true);setError('');try{await api('/api/auth',{method:'POST',body:JSON.stringify({action:user?'logout':setupRequired?'setup':'login',email:email||undefined,password:password||undefined,name:name||undefined,staffId:staffId?Number(staffId):null})});await refreshUser();notify(user?'You have signed out.':'Welcome to your workspace.');onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
return <Modal open={open} onClose={onClose} size="narrow" title={user?'Your account':setupRequired?'Set up your workspace':'Welcome back'} description={setupRequired?'Create the first administrator to enable protected settings.':'Secure staff access · Physique 57 India'} footer={<><span className="muted" style={{fontSize:10}}>Owner-only resolutions require a linked staff account.</span><button className="btn btn-primary" onClick={()=>void submit()} disabled={busy}>{busy?<Loader2 size={15} className="animate-spin"/>:null}{user?'Sign out':setupRequired?'Create administrator':'Sign in'}</button></>}>
{user?<div className="stack"><Avatar name={user.name} large/><h3>{user.name}</h3><p className="secondary">{user.email} · {user.role}</p></div>:<form className="stack" onSubmit={e=>{e.preventDefault();void submit();}}>{setupRequired&&<Field label="Your name"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></Field>}<Field label="Work email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></Field><Field label="Password" hint="At least 12 characters."><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={setupRequired?'new-password':'current-password'}/></Field>{setupRequired&&<Field label="Link to staff profile"><select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">Administrator only</option>{staff.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}<button type="submit" hidden/></form>}{error&&<div className="error-box" style={{marginTop:15}}>{error}</div>}</Modal>;}
