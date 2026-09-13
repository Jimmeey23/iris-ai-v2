export type ExportMessage={role:'user'|'assistant';content:string};
export type ExportMeta={staffName:string;startedAt:string;ticketNumber?:string};

function stamp(iso:string){return new Date(iso).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Kolkata'});}

export function toPlainText(messages:ExportMessage[],meta:ExportMeta){
  const lines=['PHYSIQUE 57 INDIA — IRIS','Internal ticket-logging transcript','='.repeat(48),`Logged by : ${meta.staffName}`,`Started   : ${stamp(meta.startedAt)}`,meta.ticketNumber?`Ticket    : ${meta.ticketNumber}`:'','='.repeat(48),''].filter(Boolean);
  for(const m of messages)lines.push(`[${m.role==='assistant'?'IRIS':meta.staffName.toUpperCase()}]`,m.content,'');
  return lines.join('\n');
}
export function toMarkdown(messages:ExportMessage[],meta:ExportMeta){
  const out=['# Iris logging transcript','',`**Logged by:** ${meta.staffName}  `,`**Started:** ${stamp(meta.startedAt)}  `,meta.ticketNumber?`**Ticket:** ${meta.ticketNumber}  `:'','','---',''].filter(Boolean);
  for(const m of messages)out.push(`**${m.role==='assistant'?'Iris':meta.staffName}**`,'',m.content,'');
  return out.join('\n');
}
export function toJson(messages:ExportMessage[],meta:ExportMeta){
  return JSON.stringify({product:'Physique 57 India — IRIS',export:'chat-transcript',exportedAt:new Date().toISOString(),meta,messages},null,2);
}
export function downloadText(filename:string,content:string,mime='text/plain'){
  const blob=new Blob([content],{type:mime+';charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
