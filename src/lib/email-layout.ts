/**
 * The frame every IRIS email is drawn in: ticket notifications, the morning digest and the
 * product-feedback report.
 *
 * Email HTML is its own medium. No grid, no flexbox, no external stylesheet, and Outlook on
 * Windows renders with Word. So: tables for layout, every style inline, and a small <style>
 * block that only *improves* clients which read it (Apple Mail, iOS, Gmail apps) — chiefly
 * stacking two-column rows and widening buttons below 620px. A client that drops the block
 * still gets a correct, if roomier, message.
 *
 * Kept free of database and integration imports so any mail builder can use it.
 */

/** Light-mode IRIS palette. Most clients ignore a dark scheme, and the ones that honour it
 *  invert colours themselves, so the mail declares light only and stays predictable. */
export const BRAND = {
  ink: '#16161c',
  body: '#3b3946',
  muted: '#5f5c6d',
  faint: '#94919f',
  line: '#eae8f0',
  soft: '#f6f5fa',
  page: '#f1f0f5',
  gold: '#a8760a',
  goldSoft: '#fdf7e8',
  red: '#c0392b',
  redSoft: '#fdeeec',
  green: '#1f7a4d',
  greenSoft: '#e9f6ef',
  blue: '#2f6f9f',
  blueSoft: '#eef4fa',
};

export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c] as string);

const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|prof)\.?$/i;

/**
 * The name to greet somebody by: the first word of their directory name, without a title.
 * Null when there is nothing usable (empty, or an email address stored as the name), so the
 * caller falls back to a neutral greeting instead of "Hi admin@…".
 */
export function firstName(name?: string | null): string | null {
  const words = String(name ?? '').trim().split(/\s+/).filter(w => w && !HONORIFIC.test(w));
  const first = words[0];
  if (!first || first.includes('@')) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export const greeting = (name?: string | null) => {
  const first = firstName(name);
  return first ? `Hi ${first},` : 'Hello,';
};

/** Small uppercase label above a value or a section. */
export const label = (text: string, color: string = BRAND.faint) =>
  `<p style="margin:0 0 6px;font-family:${FONT};font-size:10.5px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;color:${color};font-weight:700;">${esc(text)}</p>`;

export const pill = (text: string, fg: string, bg: string) =>
  `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${fg};font-family:${FONT};font-size:10.5px;line-height:1.2;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;">${esc(text)}</span>`;

export const PRIORITY_TONE: Record<string, {fg: string; bg: string}> = {
  critical: {fg: '#ffffff', bg: BRAND.red},
  high: {fg: BRAND.red, bg: BRAND.redSoft},
  medium: {fg: BRAND.gold, bg: BRAND.goldSoft},
  low: {fg: BRAND.muted, bg: '#eef0f4'},
};
export const priorityPill = (priority?: string | null) => {
  if (!priority) return '';
  const tone = PRIORITY_TONE[priority.toLowerCase()] || PRIORITY_TONE.low;
  return pill(priority, tone.fg, tone.bg);
};

/** A padded content row inside the card. `e-pad` lets the stylesheet tighten it on phones. */
export const section = (inner: string, padding = '0 36px 24px') =>
  `<tr><td class="e-pad" style="padding:${padding};">${inner}</td></tr>`;

/** A bulletproof button: the colour is on the cell, so it survives clients that strip
 *  padding from links. `e-btn` makes it full width on a phone. */
export function button(href: string, text: string, color: string = BRAND.ink) {
  if (!href) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="e-btn"><tr><td align="center" style="border-radius:10px;background:${color};">
    <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;line-height:1.2;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(text)} &rarr;</a>
  </td></tr></table>`;
}

/**
 * Cells laid out `columns` to a row on desktop, one per row on a phone (unless `stack` is
 * false). Each item is already HTML. Email clients have no grid, so the rows are built here.
 */
export function grid(items: string[], columns = 2, gap = 12, stack = true) {
  const cells = items.filter(Boolean);
  if (!cells.length) return '';
  const width = Math.floor(100 / columns);
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += columns) {
    const slice = cells.slice(i, i + columns);
    while (slice.length < columns) slice.push('');
    rows.push(`<tr>${slice.map((cell, j) =>
      `<td${stack ? ' class="e-stack e-stack-gap"' : ''} width="${width}%" valign="top" style="width:${width}%;vertical-align:top;padding:0 ${j < columns - 1 ? gap / 2 : 0}px ${gap}px ${j > 0 ? gap / 2 : 0}px;">${cell}</td>`).join('')}</tr>`);
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows.join('')}</table>`;
}

/** A labelled fact: the small caps label over the value. */
export const fact = (name: string, value?: string | null, valueColor: string = BRAND.ink) =>
  value
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.soft};border-radius:10px;"><tr><td style="padding:12px 14px;">
        ${label(name)}
        <p style="margin:0;font-family:${FONT};font-size:14.5px;line-height:1.4;color:${valueColor};font-weight:600;">${esc(value)}</p>
      </td></tr></table>`
    : '';

/** A horizontal bar, drawn as two table cells, since email has no charts. `share` is 0–1. */
export function bar(share: number, color: string, track: string = BRAND.line) {
  const pct = Math.max(0, Math.min(100, Math.round(share * 100)));
  if (pct === 0) return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="6" style="height:6px;line-height:6px;font-size:0;background:${track};border-radius:3px;">&nbsp;</td></tr></table>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="${pct}%" height="6" style="width:${pct}%;height:6px;line-height:6px;font-size:0;background:${color};border-radius:3px;">&nbsp;</td>
    ${pct < 100 ? `<td height="6" style="height:6px;line-height:6px;font-size:0;background:${track};border-radius:3px;">&nbsp;</td>` : ''}
  </tr></table>`;
}

export type EmailDocument = {
  /** Shown in the tab and by some clients; not visible in the body. */
  title: string;
  /** The grey line an inbox shows after the subject. */
  preheader: string;
  /** Top-right of the masthead, e.g. "Escalation" or "Morning board · 10 Oct". */
  context: string;
  /** Colour of the strip across the top of the card. */
  accent: string;
  /** Card rows, each built with `section()`. */
  body: string;
  /** Small print under the card: why this person got it. */
  footer: string;
  /** Card width on desktop. */
  width?: number;
};

export function emailDocument({title, preheader, context, accent, body, footer, width = 600}: EmailDocument) {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0;}
  img{border:0;line-height:100%;outline:none;text-decoration:none;}
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
  @media only screen and (max-width:620px){
    .e-outer{padding:12px 8px 24px!important;}
    .e-pad{padding-left:20px!important;padding-right:20px!important;}
    .e-stack{display:block!important;width:100%!important;max-width:100%!important;}
    .e-stack-gap{padding:0 0 10px 0!important;}
    .e-h1{font-size:23px!important;line-height:1.25!important;}
    .e-hide{display:none!important;}
    .e-btn{width:100%!important;}
    .e-btn a{display:block!important;}
    .e-tile{padding:0 0 8px!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.page};">
<tr><td align="center" class="e-outer" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:${width}px;">

  <!-- wordmark -->
  <tr><td style="padding:0 4px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td style="font-family:${FONT};font-size:16px;line-height:1;font-weight:800;letter-spacing:.2em;color:${BRAND.ink};">IRIS<span style="color:${accent};">.</span></td>
      <td align="right" style="font-family:${FONT};font-size:11px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:${BRAND.faint};">${esc(context)}</td>
    </tr></table>
  </td></tr>

  <!-- card -->
  <tr><td style="background:#ffffff;border-radius:16px;border:1px solid ${BRAND.line};overflow:hidden;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:${accent};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
      <tr><td height="28" style="height:28px;line-height:28px;font-size:0;">&nbsp;</td></tr>
      ${body}
    </table>
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:22px 12px 0;" align="center">
    <p style="margin:0 0 6px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">${footer}</p>
    <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.6;color:${BRAND.faint};letter-spacing:.04em;">Physique 57 India · IRIS support workspace</p>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}
