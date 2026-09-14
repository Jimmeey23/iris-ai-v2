"use client";
/** Multi-format report exporters. Each is lazily imported so the heavy libraries
 *  (xlsx / jspdf / docx) only load when a user actually exports. */
export type ExportReport={
  id:string;name:string;description:string;generatedAt:string;
  columns:{key:string;label:string}[];rows:Record<string,string|number>[];
  metrics:Record<string,number|string|null>;breakdowns:Record<string,Record<string,number>>;
  owners:{name:string;total:number;open:number;resolved:number;overdue:number}[];
  filters:Record<string,string>;
};
export type ExportFormat='csv'|'xlsx'|'json'|'pdf'|'docx'|'md'|'html';

const nice=(k:string)=>k.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
const stamp=(iso:string)=>new Date(iso).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
function download(name:string,blob:Blob){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
const csvSafe=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
const metricRows=(r:ExportReport)=>Object.entries(r.metrics).map(([k,v])=>[nice(k),v===null?'—':String(v)]);

export async function exportReport(r:ExportReport,format:ExportFormat){
  const base=r.id+'-'+new Date().toISOString().slice(0,10);
  if(format==='csv'){
    const lines=[['IRIS Report',r.name],['Generated',stamp(r.generatedAt)],['Filters',Object.entries(r.filters).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join('; ')||'none'],[],['KEY METRICS'],...metricRows(r),[],['DATA'],r.columns.map(c=>c.label),...r.rows.map(row=>r.columns.map(c=>row[c.key]??''))];
    download(base+'.csv',new Blob(['\ufeff'+lines.map(l=>l.map(csvSafe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  }else if(format==='json'){
    download(base+'.json',new Blob([JSON.stringify({product:'Physique 57 India — IRIS',report:r},null,2)],{type:'application/json'}));
  }else if(format==='xlsx'){
    const XLSX=await import('xlsx');
    const wb=XLSX.utils.book_new();
    const data=XLSX.utils.json_to_sheet(r.rows.map(row=>Object.fromEntries(r.columns.map(c=>[c.label,row[c.key]??'']))));
    data['!cols']=r.columns.map(c=>({wch:Math.min(48,Math.max(12,c.label.length+4))}));
    XLSX.utils.book_append_sheet(wb,data,'Data');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Metric','Value'],...metricRows(r)]),'Metrics');
    for(const[key,vals]of Object.entries(r.breakdowns)){const sheet=XLSX.utils.aoa_to_sheet([[nice(key.replace(/^by/,'')),'Tickets'],...Object.entries(vals)]);XLSX.utils.book_append_sheet(wb,sheet,nice(key.replace(/^by/,'')).slice(0,30));}
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r.owners),'Owners');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Report',r.name],['Description',r.description],['Generated',stamp(r.generatedAt)],...Object.entries(r.filters).map(([k,v])=>['Filter · '+k,v||'—'])]),'About');
    XLSX.writeFile(wb,base+'.xlsx');
  }else if(format==='md'||format==='html'){
    const table=(head:string[],rows:(string|number)[][])=>format==='md'
      ?[`| ${head.join(' | ')} |`,`| ${head.map(()=>'---').join(' | ')} |`,...rows.map(rw=>`| ${rw.map(v=>String(v??'').replaceAll('|','\\|')).join(' | ')} |`)].join('\n')
      :`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(rw=>`<tr>${rw.map(v=>`<td>${String(v??'')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const h=(lvl:number,t:string)=>format==='md'?`${'#'.repeat(lvl)} ${t}\n`:`<h${lvl}>${t}</h${lvl}>`;
    const body=[h(1,r.name),format==='md'?`_${r.description}_  \nGenerated ${stamp(r.generatedAt)}\n`:`<p><em>${r.description}</em><br/>Generated ${stamp(r.generatedAt)}</p>`,
      h(2,'Key metrics'),table(['Metric','Value'],metricRows(r)),
      ...Object.entries(r.breakdowns).flatMap(([k,v])=>[h(2,nice(k.replace(/^by/,'By ')) ),table(['Value','Tickets'],Object.entries(v))]),
      h(2,'Owners'),table(['Owner','Total','Open','Resolved','Overdue'],r.owners.map(o=>[o.name,o.total,o.open,o.resolved,o.overdue])),
      h(2,`Data (${r.rows.length} rows)`),table(r.columns.map(c=>c.label),r.rows.map(row=>r.columns.map(c=>row[c.key]??'')))].join('\n\n');
    if(format==='md')download(base+'.md',new Blob([body],{type:'text/markdown'}));
    else download(base+'.html',new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${r.name}</title><style>body{font-family:-apple-system,Segoe UI,Arial;padding:32px;color:#111;max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:15px;margin-top:28px;text-transform:uppercase;letter-spacing:.08em;color:#c9902a}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #e5e5e5;padding:6px 9px;text-align:left}th{background:#f6f6f6}</style></head><body>${body}</body></html>`],{type:'text/html'}));
  }else if(format==='pdf'){
    const {jsPDF}=await import('jspdf');
    const doc=new jsPDF({unit:'pt',orientation:r.columns.length>6?'landscape':'portrait'});
    const W=doc.internal.pageSize.getWidth(),M=36;let y=48;
    const newPage=()=>{doc.addPage();y=48;};
    const ensure=(need:number)=>{if(y+need>doc.internal.pageSize.getHeight()-40)newPage();};
    doc.setFillColor(201,144,42);doc.rect(0,0,W,6,'F');
    doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text(r.name,M,y);y+=18;
    doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(90);doc.text(doc.splitTextToSize(r.description,W-M*2),M,y);y+=26;
    doc.text(`Generated ${stamp(r.generatedAt)} · IRIS · Physique 57 India`,M,y);y+=22;doc.setTextColor(20);
    const section=(title:string)=>{ensure(30);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(201,144,42);doc.text(title.toUpperCase(),M,y);doc.setTextColor(20);y+=14;doc.setDrawColor(230);doc.line(M,y-6,W-M,y-6);};
    const tableOut=(head:string[],rows:(string|number)[][],widths?:number[])=>{
      const cw=widths||head.map(()=>(W-M*2)/head.length);
      const row=(cells:(string|number)[],bold=false)=>{const lines=cells.map((c,i)=>doc.splitTextToSize(String(c??''),cw[i]-6));const hgt=Math.max(...lines.map(l=>l.length))*10+6;ensure(hgt);let x=M;doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8);if(bold){doc.setFillColor(246,246,246);doc.rect(M,y-8,W-M*2,hgt,'F');}cells.forEach((_,i)=>{doc.text(lines[i],x+3,y);x+=cw[i];});y+=hgt;};
      row(head,true);rows.forEach(rw=>row(rw));y+=10;
    };
    section('Key metrics');tableOut(['Metric','Value'],metricRows(r),[(W-M*2)*.6,(W-M*2)*.4]);
    section('Breakdowns');for(const[k,v]of Object.entries(r.breakdowns).slice(0,5)){doc.setFont('helvetica','bold');doc.setFontSize(9);ensure(20);doc.text(nice(k.replace(/^by/,'By ')),M,y);y+=12;tableOut(['Value','Tickets'],Object.entries(v).slice(0,12),[(W-M*2)*.7,(W-M*2)*.3]);}
    section('Owners');tableOut(['Owner','Total','Open','Resolved','Overdue'],r.owners.map(o=>[o.name,o.total,o.open,o.resolved,o.overdue]));
    section(`Data · ${r.rows.length} rows`);tableOut(r.columns.map(c=>c.label),r.rows.map(row=>r.columns.map(c=>row[c.key]??'')));
    const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(140);doc.text(`Page ${i} of ${pages}`,W-M,doc.internal.pageSize.getHeight()-18,{align:'right'});}
    doc.save(base+'.pdf');
  }else if(format==='docx'){
    const {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType}=await import('docx');
    const tbl=(head:string[],rows:(string|number)[][])=>new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({children:head.map(h=>new TableCell({children:[new Paragraph({children:[new TextRun({text:h,bold:true})]})]}))}),...rows.map(rw=>new TableRow({children:rw.map(v=>new TableCell({children:[new Paragraph(String(v??''))]}))}))]});
    const children:(InstanceType<typeof Paragraph>|InstanceType<typeof Table>)[]=[new Paragraph({text:r.name,heading:HeadingLevel.TITLE}),new Paragraph({children:[new TextRun({text:r.description,italics:true})]}),new Paragraph(`Generated ${stamp(r.generatedAt)} · IRIS · Physique 57 India`),new Paragraph(''),
      new Paragraph({text:'Key metrics',heading:HeadingLevel.HEADING_2}),tbl(['Metric','Value'],metricRows(r)),new Paragraph('')];
    for(const[k,v]of Object.entries(r.breakdowns)){children.push(new Paragraph({text:nice(k.replace(/^by/,'By ')),heading:HeadingLevel.HEADING_2}),tbl(['Value','Tickets'],Object.entries(v)),new Paragraph(''));}
    children.push(new Paragraph({text:'Owners',heading:HeadingLevel.HEADING_2}),tbl(['Owner','Total','Open','Resolved','Overdue'],r.owners.map(o=>[o.name,o.total,o.open,o.resolved,o.overdue])),new Paragraph(''),new Paragraph({text:`Data (${r.rows.length} rows)`,heading:HeadingLevel.HEADING_2}),tbl(r.columns.map(c=>c.label),r.rows.map(row=>r.columns.map(c=>row[c.key]??''))));
    download(base+'.docx',await Packer.toBlob(new Document({sections:[{children}]})));
  }
}
