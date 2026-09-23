"use client";
import {useEffect,useState} from 'react';
import {Loader2,Save} from 'lucide-react';
import {Modal,api,useApp} from '@/components/ui';
import {FormRoutingBuilder} from '@/components/form-routing-builder';
import {DEPARTMENT_RECORDS,STAFF} from '@/lib/constants';
import type {WorkspaceConfig} from '@/lib/settings-contract';

type SettingsData={config:WorkspaceConfig;version:number};
export function InlineFormDesigner({open,onClose,category,subcategory,onPublished}:{open:boolean;onClose:()=>void;category:string;subcategory:string;onPublished:()=>Promise<void>|void}){
  const{notify}=useApp(),[data,setData]=useState<SettingsData>(),[config,setConfig]=useState<WorkspaceConfig>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!open)return;let live=true;api<SettingsData>('/api/settings').then(d=>{if(live){setData(d);setConfig(d.config);setError('');}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false};},[open]);
  async function publish(){if(!data||!config)return;setBusy(true);setError('');try{const r=await api<{version:number}>('/api/settings',{method:'PUT',body:JSON.stringify({config,version:data.version})});setData({config,version:r.version});notify(`${subcategory} form published permanently.`);window.dispatchEvent(new Event('iris:settings-updated'));await onPublished();onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false)}}
  const dirty=Boolean(data&&config&&JSON.stringify(data.config)!==JSON.stringify(config));
  return <Modal open={open} onClose={onClose} size="wide" title={`Design · ${subcategory}`} description="Edit the live form, its layout and routing. Nothing changes until you publish." resetKey={`${category}|${subcategory}`}
    footer={<><span className="secondary" style={{fontSize:11}}>{dirty?'Unpublished changes':'No unpublished changes'}</span><button className="btn btn-primary" disabled={!dirty||busy||!config} onClick={()=>void publish()}>{busy?<Loader2 size={14} className="animate-spin"/>:<Save size={14}/>} Publish form changes</button></>}>
    {error&&<div className="error-box" role="alert">{error}</div>}
    {!config?<div className="fb-inline-loading"><Loader2 className="animate-spin" size={20}/><span>Loading the live form configuration…</span></div>:<FormRoutingBuilder config={config} onChange={setConfig} staff={STAFF} departments={DEPARTMENT_RECORDS} initialCategory={category} initialSubcategory={subcategory}/>} 
  </Modal>;
}
