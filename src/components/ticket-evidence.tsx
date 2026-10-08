"use client";
import {FileText, Paperclip, ArrowUpRight} from 'lucide-react';
import styles from './ticket-detail.module.css';

export type TicketEvidenceFile = {id: string; fileName: string; fileType: string; fileSize: number; url: string};
export function TicketEvidence({files}: {files: TicketEvidenceFile[]}) {
  if (!files.length) return null;
  return <section className={'td-sheet ' + styles.evidence} aria-label="Ticket attachments">
    <header><span className="td-section-icon"><Paperclip size={17}/></span><div><span className="eyebrow">SUPPORTING EVIDENCE · {files.length}</span><h3>Attachments</h3></div></header>
    <div className={styles.evidenceGrid}>{files.map(file => <article key={file.url} className={styles.evidenceFile}>
      {/^(image\/(jpeg|png|gif|webp))$/.test(file.fileType) && <a href={file.url} target="_blank" rel="noopener noreferrer" aria-label={'View ' + file.fileName}>
        {/* Authenticated API streams are intentionally used directly. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt={file.fileName} loading="lazy"/>
      </a>}

      {file.fileType.startsWith('audio/') && <audio controls preload="none" src={file.url} aria-label={file.fileName}/>}
      <a className={styles.evidenceLink} href={file.url} target="_blank" rel="noopener noreferrer"><FileText size={16}/><span><strong>{file.fileName}</strong><small>{(file.fileSize / 1024).toFixed(1)} KB · Open file</small></span><ArrowUpRight size={15}/></a>
    </article>)}</div>
  </section>;
}
