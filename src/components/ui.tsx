"use client";
import * as Dialog from '@radix-ui/react-dialog';
import {useEffect,useLayoutEffect,useState,useRef,createContext,useContext,useCallback,type ReactNode} from 'react';
import {X,CheckCircle2,AlertCircle,Loader2,Search,Sun,Moon} from 'lucide-react';
import {EmptyArt,type ArtVariant} from './graphics';
import {cn,initials} from '@/lib/utils';
import type {Identity} from '@/lib/auth';
import {setDisplayTimezone} from '@/lib/display';

export async function api<T=Record<string,unknown>>(url:string,init?:RequestInit):Promise<T>{const res=await fetch(url,{...init,headers:{'Content-Type':'application/json',...init?.headers},cache:'no-store'});let data:unknown;try{data=await res.json();}catch{throw new Error('The server returned an unexpected response. Please retry.');}if(!res.ok){const r=data as {error?:string;details?:{path?:string[];message?:string}[]};throw new Error(r.details?.[0]?.message?`${r.details[0].path?.join('.')||'Field'}: ${r.details[0].message}`:r.error||'Request failed');}return data as T;}
type AppContextType={theme:'light'|'dark';toggleTheme:()=>void;notify:(text:string,type?:'success'|'error')=>void;user:Identity|null;setupRequired:boolean;refreshUser:()=>Promise<void>;pollSeconds:number;workspaceName:string;themePlaceholder?:string;view:string;setView:(view:string)=>void;openAuth:()=>void};
const AppContext=createContext<AppContextType|null>(null);
export function useApp(){const c=useContext(AppContext);if(!c)throw new Error('App provider missing');return c;}
export function AppProvider({children}:{children:ReactNode}){const[pollSeconds,setPollSeconds]=useState(15);const[workspaceName,setWorkspaceName]=useState('Physique 57 India');const[theme,setTheme]=useState<'light'|'dark'>('dark');
  // Sync the saved theme before first paint so light users never see a dark flash,
  // while the server markup always renders dark → no hydration mismatch.
  useLayoutEffect(()=>{try{const v=localStorage.getItem('iris-theme');if(v==='light'){setTheme('light');document.documentElement.dataset.theme='light';}}catch{}},[]);const[view,setViewState]=useState('list');const[user,setUser]=useState<Identity|null>(null);const[setupRequired,setSetupRequired]=useState(false);const[toasts,setToasts]=useState<{id:number;text:string;type:'success'|'error'}[]>([]);const[authOpen,setAuthOpen]=useState(false);
const notify=useCallback((text:string,type:'success'|'error'='success')=>{const id=Date.now()+Math.random();setToasts(t=>[...t.slice(-3),{id,text,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),6500);},[]);
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
useEffect(()=>{const load=()=>{void api<{pollSeconds:number;workspaceName:string;timezone:string}>('/api/settings?scope=public').then(c=>{setPollSeconds(c.pollSeconds);setWorkspaceName(c.workspaceName);setDisplayTimezone(c.timezone);}).catch(()=>{});};load();window.addEventListener('iris:settings-updated',load);return()=>window.removeEventListener('iris:settings-updated',load);},[]);
const setView=(v:string)=>{setViewState(v);void api('/api/preferences',{method:'PATCH',body:JSON.stringify({view:v})}).catch(()=>{});};
return <AppContext.Provider value={{theme,toggleTheme,notify,user,setupRequired,refreshUser,pollSeconds,workspaceName,view,setView,openAuth:()=>setAuthOpen(true)}}>{children}<AuthDialog open={authOpen} onClose={()=>setAuthOpen(false)}/><div className="toasts" aria-live="polite">{toasts.map(t=><div className={cn('toast',t.type)} key={t.id}>{t.type==='success'?<CheckCircle2 size={17}/>:<AlertCircle size={17}/>}<span className="grow">{t.text}</span><button className="text-btn muted" aria-label="Dismiss notification" onClick={()=>setToasts(s=>s.filter(x=>x.id!==t.id))}><X size={14}/></button></div>)}</div></AppContext.Provider>;}
export function Modal({open,onClose,title,description,children,footer,size='normal',resetKey}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;footer?:ReactNode;size?:'normal'|'narrow'|'wide';resetKey?:string}){const scroll=useRef<HTMLDivElement>(null);useEffect(()=>{scroll.current?.scrollTo({top:0});},[open,resetKey]);useEffect(()=>{if(!open)return;const close=()=>onClose();window.addEventListener('iris:close-modals',close);return()=>window.removeEventListener('iris:close-modals',close);},[open,onClose]);return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="dialog-overlay"/><Dialog.Content className={cn('dialog-content',size)} onEscapeKeyDown={()=>window.dispatchEvent(new Event('iris:close-modals'))}><div className="dialog-head"><div><Dialog.Title className="dialog-title">{title}</Dialog.Title><Dialog.Description className="dialog-description">{description||'IRIS workspace'}</Dialog.Description></div><Dialog.Close asChild><button className="icon-btn" aria-label="Close dialog"><X size={18}/></button></Dialog.Close></div><div className="dialog-scroll" ref={scroll}>{children}</div>{footer&&<div className="dialog-footer">{footer}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>;}
export function ThemeToggle(){const{theme,toggleTheme}=useApp();return <button className="icon-btn" title={theme==='light'?'Switch to matte black & gold':'Switch to light mode'} aria-label="Toggle light and dark theme" onClick={toggleTheme}>{theme==='light'?<Moon size={17}/>:<Sun size={17}/>}</button>;}
export function Avatar({name,tone='',large=false}:{name:string;tone?:string;large?:boolean}){return <span className={cn('avatar',tone,large&&'lg')}>{initials(name||'IRIS')}</span>;}
export function Badge({children,tone='',className}:{children:ReactNode;tone?:string;className?:string}){return <span className={cn('badge',tone,className)}>{children}</span>;}
export function Status({status}:{status:string}){return <span className={cn('badge','status-'+status)}><i className="status-dot"/>{({in_progress:'In progress',waiting_on_member:'Awaiting member',waiting_on_vendor:'Awaiting vendor'} as Record<string,string>)[status]||status.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}</span>;}
export function Priority({priority}:{priority:string}){return <span className={cn('badge','priority-'+priority)}><span style={{fontSize:11}}>≋</span>{priority.replace(/^./,c=>c.toUpperCase())}</span>;}
export function SearchField({value,onChange,placeholder='Search…'}:{value:string;onChange:(value:string)=>void;placeholder?:string}){return <div className="search-input"><Search size={14}/><input value={value} placeholder={placeholder} aria-label={placeholder} onChange={e=>onChange(e.target.value)}/></div>;}
export function Empty({title,detail,action,art='inbox'}:{title:string;detail?:string;action?:ReactNode;art?:ArtVariant}){return <div className="empty-state"><EmptyArt variant={art}/><h3>{title}</h3>{detail&&<p>{detail}</p>}{action}</div>;}
export function Loading({rows=3,variant='block'}:{rows?:number;variant?:'block'|'list'|'card'}){
  if(variant==='list')return <div className="skeleton-list" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton-row" key={i} style={{animationDelay:(i*90)+'ms'}}><div className="skeleton sk-avatar"/><div className="grow"><div className="skeleton sk-line" style={{width:'42%'}}/><div className="skeleton sk-line sk-sm" style={{width:'68%'}}/></div><div className="skeleton sk-pill"/></div>)}</div>;
  if(variant==='card')return <div className="skeleton-cards" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton sk-card" key={i} style={{animationDelay:(i*90)+'ms'}}/>)}</div>;
  return <div className="stack" aria-label="Loading" aria-busy="true">{Array.from({length:rows}).map((_,i)=><div className="skeleton" key={i} style={{animationDelay:(i*90)+'ms'}}/>)}</div>;
}
/** Animated SVG progress ring — used for scores, SLA health and completeness. */
export function ProgressRing({value,size=56,stroke=5,tone,label}:{value:number;size?:number;stroke?:number;tone?:string;label?:string}){
  const r=(size-stroke)/2, c=2*Math.PI*r, pct=Math.max(0,Math.min(100,value));
  return <span className="progress-ring" style={{width:size,height:size,color:tone}} role="img" aria-label={label||`${pct}%`}>
    <svg width={size} height={size}><circle cx={size/2} cy={size/2} r={r} strokeWidth={stroke} className="pr-track"/>
    <circle cx={size/2} cy={size/2} r={r} strokeWidth={stroke} className="pr-value" strokeDasharray={c} strokeDashoffset={c-(pct/100)*c} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/></svg>
    <b>{Math.round(pct)}<i>%</i></b></span>;
}
export function Switch({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label:string}){return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={()=>onChange(!checked)} className={cn('toggle',checked&&'on')}/>;}
export function Field({label,children,hint,wide=false}:{label:string;children:ReactNode;hint?:string;wide?:boolean}){return <div className={cn('field',wide&&'wide')}><label><span>{label}</span>{children}</label>{hint&&<span className="field-hint">{hint}</span>}</div>;}
export function AuthDialog({open,onClose}:{open:boolean;onClose:()=>void}){const{setupRequired,user,refreshUser,notify}=useApp();const[email,setEmail]=useState(''),[name,setName]=useState(''),[password,setPassword]=useState(''),[staffId,setStaffId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');const[staff,setStaff]=useState<{id:number;name:string}[]>([]);
useEffect(()=>{if(open&&setupRequired)void api<{staff:{id:number;name:string}[]}>('/api/staff').then(d=>setStaff(d.staff)).catch(()=>{});},[open,setupRequired]);
async function submit(){setBusy(true);setError('');try{await api('/api/auth',{method:'POST',body:JSON.stringify({action:user?'logout':setupRequired?'setup':'login',email:email||undefined,password:password||undefined,name:name||undefined,staffId:staffId?Number(staffId):null})});await refreshUser();notify(user?'You have signed out.':'Welcome to your workspace.');onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
return <Modal open={open} onClose={onClose} size="narrow" title={user?'Your account':setupRequired?'Set up your workspace':'Welcome back'} description={setupRequired?'Create the first administrator to enable protected settings.':'Secure staff access · Physique 57 India'} footer={<><span className="muted" style={{fontSize:10}}>Owner-only resolutions require a linked staff account.</span><button className="btn btn-primary" onClick={()=>void submit()} disabled={busy}>{busy?<Loader2 size={15} className="animate-spin"/>:null}{user?'Sign out':setupRequired?'Create administrator':'Sign in'}</button></>}>
{user?<div className="stack"><Avatar name={user.name} large/><h3>{user.name}</h3><p className="secondary">{user.email} · {user.role}</p></div>:<form className="stack" onSubmit={e=>{e.preventDefault();void submit();}}>{setupRequired&&<Field label="Your name"><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></Field>}<Field label="Work email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></Field><Field label="Password" hint="At least 12 characters."><input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={setupRequired?'new-password':'current-password'}/></Field>{setupRequired&&<Field label="Link to staff profile"><select value={staffId} onChange={e=>setStaffId(e.target.value)}><option value="">Administrator only</option>{staff.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}<button type="submit" hidden/></form>}{error&&<div className="error-box" style={{marginTop:15}}>{error}</div>}</Modal>;}
