/** Branded, ready-to-send HTML email templates. Kept dependency-free (inline CSS)
 *  so they render consistently across Gmail, Outlook and mobile mail clients. */
const PRIORITY_COLORS:Record<string,string>={critical:'#e5484d',high:'#f5a524',medium:'#3b82f6',low:'#12b76a'};

function shell(preheader:string,body:string){
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0b0b0d;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0d;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#131318;border-radius:16px;overflow:hidden;border:1px solid #2c2d38;">
<tr><td style="padding:28px 32px;background:linear-gradient(135deg,#c9902a,#ffd166);">
<div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#161206;letter-spacing:-0.5px;">IRIS <span style="font-weight:400;opacity:.75;">· Physique 57 India</span></div>
</td></tr>
<tr><td style="padding:32px;color:#f4f2ec;">${body}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #2c2d38;color:#8d8a9a;font-size:11px;">This is an automated notification from the IRIS internal operations workspace. Please do not reply directly to this email.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

export function assignmentEmailHtml(t:{ticketNumber:string;title:string;summary:string;category:string;subcategory:string;priority:string;studio?:string|null;memberName:string;departmentName:string;assignedStaffName:string;slaLabel:string;description:string;requestedResolution?:string|null}){
  const color=PRIORITY_COLORS[t.priority]||'#3b82f6';
  const body=`
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c9902a;font-weight:700;margin-bottom:10px;">New ticket assigned to you</div>
<h1 style="margin:0 0 14px;font-size:22px;color:#f4f2ec;font-family:Georgia,serif;">${escapeHtml(t.title)}</h1>
<div style="margin-bottom:20px;">
<span style="display:inline-block;background:${color}22;color:${color};font-size:11px;font-weight:700;padding:4px 10px;border-radius:6px;margin-right:6px;text-transform:uppercase;">${escapeHtml(t.priority)}</span>
<span style="display:inline-block;background:#22232b;color:#b3b0bf;font-size:11px;font-weight:600;padding:4px 10px;border-radius:6px;">${escapeHtml(t.category)} · ${escapeHtml(t.subcategory)}</span>
</div>
<p style="font-size:13px;line-height:1.7;color:#b3b0bf;margin:0 0 20px;">${escapeHtml(t.summary)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#191a20;border-radius:10px;margin-bottom:20px;">
<tr><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#8d8a9a;width:40%;">Ticket</td><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#f4f2ec;font-weight:600;">${escapeHtml(t.ticketNumber)}</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#8d8a9a;">Studio</td><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#f4f2ec;">${escapeHtml(t.studio||'—')}</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#8d8a9a;">Logged for</td><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#f4f2ec;">${escapeHtml(t.memberName)}</td></tr>
<tr><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#8d8a9a;">Department</td><td style="padding:14px 18px;border-bottom:1px solid #2c2d38;font-size:12px;color:#f4f2ec;">${escapeHtml(t.departmentName)}</td></tr>
<tr><td style="padding:14px 18px;font-size:12px;color:#8d8a9a;">Follow-up target</td><td style="padding:14px 18px;font-size:12px;color:#f4f2ec;font-weight:600;">${escapeHtml(t.slaLabel)}</td></tr>
</table>
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8d8a9a;font-weight:700;margin-bottom:8px;">What was logged</div>
<p style="font-size:13px;line-height:1.7;color:#b3b0bf;margin:0 0 20px;white-space:pre-wrap;">${escapeHtml(t.description).slice(0,600)}</p>
${t.requestedResolution?`<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8d8a9a;font-weight:700;margin-bottom:8px;">Requested outcome</div><p style="font-size:13px;line-height:1.7;color:#b3b0bf;margin:0 0 20px;">${escapeHtml(t.requestedResolution)}</p>`:''}
<div style="margin-top:8px;"><a href="#" style="display:inline-block;background:linear-gradient(135deg,#c9902a,#ffd166);color:#161206;font-weight:700;font-size:13px;padding:12px 22px;border-radius:9px;text-decoration:none;">Open ${escapeHtml(t.ticketNumber)} in IRIS</a></div>
<p style="font-size:11px;color:#666;margin-top:22px;">Assigned to ${escapeHtml(t.assignedStaffName)} · Sign in to the IRIS workspace to review the full brief and resolution workspace.</p>`;
  return shell(`${t.ticketNumber} — ${t.title}`,body);
}

export function digestEmailHtml(rows:{ticketNumber:string;title:string;priority:string;status:string}[],staffName:string){
  const items=rows.map(r=>`<tr><td style="padding:10px 14px;border-bottom:1px solid #2c2d38;font-size:12px;color:#f4f2ec;">${escapeHtml(r.ticketNumber)}</td><td style="padding:10px 14px;border-bottom:1px solid #2c2d38;font-size:12px;color:#b3b0bf;">${escapeHtml(r.title)}</td><td style="padding:10px 14px;border-bottom:1px solid #2c2d38;font-size:11px;color:${PRIORITY_COLORS[r.priority]||'#b3b0bf'};text-transform:uppercase;font-weight:700;">${escapeHtml(r.priority)}</td></tr>`).join('');
  const body=`<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#c9902a;font-weight:700;margin-bottom:10px;">Your open tickets</div>
<h1 style="margin:0 0 16px;font-size:20px;color:#f4f2ec;font-family:Georgia,serif;">Hi ${escapeHtml(staffName)}, here\u2019s what\u2019s open</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#191a20;border-radius:10px;overflow:hidden;">
<tr><th style="text-align:left;padding:10px 14px;font-size:10px;color:#8d8a9a;text-transform:uppercase;">Ticket</th><th style="text-align:left;padding:10px 14px;font-size:10px;color:#8d8a9a;text-transform:uppercase;">Title</th><th style="text-align:left;padding:10px 14px;font-size:10px;color:#8d8a9a;text-transform:uppercase;">Priority</th></tr>
${items}
</table>`;
  return shell('Your open ticket digest',body);
}

function escapeHtml(s:string){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
