/**
 * The weekly trend report as an email: a snapshot of the week just ended, what was detected in
 * it, and what to do about it.
 *
 * Pure rendering — it takes an already-computed report and narrative and returns subject, text
 * and HTML, so the layout can be tested and previewed without a database. Email has no charts
 * or grids, so the bars, tiles and tables below are built from nested tables, in the same
 * light-only palette as the other IRIS mail (lib/email-layout).
 */
import type {AnalyticsReport} from './analytics-report';
import {BRAND, FONT, MONO, bar, button, emailDocument, esc, firstName, grid, label, pill, section} from './email-layout';
import type {Narrative, When} from './trend-narrative';
import type {Finding, Tone} from './trend-patterns';

export type WeeklyReportModel = {
  /** "6 – 12 Oct 2026". */
  periodLabel: string;
  /** What this recipient is looking at: "All studios", or the studios they cover. */
  scopeLabel: string;
  report: Pick<AnalyticsReport, 'totals' | 'previous' | 'breakdowns' | 'weekly' | 'patterns' | 'insights' | 'recurrence' | 'ageing'>;
  narrative: Narrative;
  /** Link to the live Trend dashboard for the same week, or '' when the base URL is unknown. */
  dashboardUrl: string;
};

const TONE: Record<Tone, {fg: string; bg: string}> = {
  red: {fg: BRAND.red, bg: BRAND.redSoft},
  amber: {fg: BRAND.gold, bg: BRAND.goldSoft},
  green: {fg: BRAND.green, bg: BRAND.greenSoft},
  blue: {fg: BRAND.blue, bg: BRAND.blueSoft},
};
const WHEN: Record<When, {text: string; fg: string; bg: string}> = {
  now: {text: 'Now', fg: BRAND.red, bg: BRAND.redSoft},
  'this-week': {text: 'This week', fg: BRAND.gold, bg: BRAND.goldSoft},
  watch: {text: 'Watch', fg: BRAND.blue, bg: BRAND.blueSoft},
};
const KIND_LABEL: Record<Finding['kind'], string> = {
  spike: 'Spike', rise: 'Climbing', quiet: 'Gone quiet', concentration: 'Hotspot', 'breach-driver': 'SLA drag',
  'slow-lane': 'Slow lane', backlog: 'Backlog', rhythm: 'Rhythm', chronic: 'Chronic', win: 'Win',
};

const hours = (h: number | null) => (h === null ? '—' : h >= 48 ? `${Math.round(h / 24)}d` : h >= 1 ? `${Math.round(h * 10) / 10}h` : `${Math.max(1, Math.round(h * 60))}m`);
const pctOf = (n: number | null) => (n === null ? '—' : `${n}%`);

/** "▲ 12%" in the colour that says whether that direction is good news. */
function delta(now: number | null, before: number | null | undefined, goodWhenUp: boolean, points = false) {
  if (now === null || before === null || before === undefined) return '';
  const d = points ? Math.round((now - before) * 10) / 10 : before ? Math.round(((now - before) / before) * 100) : null;
  if (d === null || d === 0) return `<span style="color:${BRAND.faint};">no change</span>`;
  const good = (d > 0) === goodWhenUp;
  return `<span style="color:${good ? BRAND.green : BRAND.red};font-weight:700;">${d > 0 ? '&#9650;' : '&#9660;'} ${Math.abs(d)}${points ? ' pts' : '%'}</span>`;
}

function tile(name: string, value: string, changeHtml: string, valueColor: string = BRAND.ink) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.soft};border-radius:12px;"><tr><td style="padding:14px 14px 13px;">
    <p style="margin:0;font-family:${FONT};font-size:28px;line-height:1;font-weight:800;letter-spacing:-.03em;color:${valueColor};">${esc(value)}</p>
    <p style="margin:7px 0 0;font-family:${FONT};font-size:10.5px;line-height:1.3;letter-spacing:.1em;text-transform:uppercase;color:${BRAND.muted};font-weight:700;">${esc(name)}</p>
    <p style="margin:4px 0 0;font-family:${FONT};font-size:11.5px;line-height:1.3;color:${BRAND.faint};min-height:15px;">${changeHtml || '&nbsp;'}</p>
  </td></tr></table>`;
}

const heading = (text: string, sub?: string) =>
  `<h2 style="margin:0 0 ${sub ? 4 : 12}px;font-family:${FONT};font-size:17px;line-height:1.3;font-weight:800;letter-spacing:-.01em;color:${BRAND.ink};">${esc(text)}</h2>${sub ? `<p style="margin:0 0 14px;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};">${esc(sub)}</p>` : ''}`;

const divider = () => `<tr><td class="e-pad" style="padding:4px 36px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background:${BRAND.line};">&nbsp;</td></tr></table></td></tr>`;

/** Eight weeks of raised against resolved as paired vertical bars; the reported week is last and darker. */
function weeksChart(weekly: WeeklyRows) {
  const rows = weekly.slice(-8);
  if (rows.length < 2) return '';
  const max = Math.max(1, ...rows.flatMap(w => [w.created, w.resolved]));
  const H = 84;
  const col = (v: number, color: string) => `<td valign="bottom" width="14" style="width:14px;vertical-align:bottom;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="14"><tr><td height="${Math.max(2, Math.round((v / max) * H))}" style="height:${Math.max(2, Math.round((v / max) * H))}px;line-height:1px;font-size:0;background:${color};border-radius:3px 3px 0 0;">&nbsp;</td></tr></table></td>`;
  const last = rows.length - 1;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;"><tr><td style="padding:16px 18px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td>${label('Eight weeks: raised and resolved')}</td>
      <td align="right" style="font-family:${FONT};font-size:11px;color:${BRAND.muted};white-space:nowrap;"><span style="color:${BRAND.ink};">&#9632;</span> raised &nbsp;<span style="color:${BRAND.green};">&#9632;</span> resolved</td>
    </tr></table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px;"><tr>
      ${rows.map((w, i) => `<td align="center" valign="bottom" style="vertical-align:bottom;padding:0 2px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${col(w.created, i === last ? BRAND.ink : '#b9b6c6')}<td width="3" style="width:3px;font-size:0;">&nbsp;</td>${col(w.resolved, i === last ? BRAND.green : '#a8d6bd')}</tr></table>
        <p style="margin:5px 0 0;font-family:${FONT};font-size:10.5px;line-height:1.2;color:${i === last ? BRAND.ink : BRAND.faint};font-weight:${i === last ? 800 : 500};">${esc(shortDate(w.week))}</p>
        <p style="margin:2px 0 0;font-family:${MONO};font-size:10px;line-height:1.2;color:${BRAND.muted};">${w.created}/${w.resolved}</p>
      </td>`).join('')}
    </tr></table>
  </td></tr></table>`;
}
type WeeklyRows = WeeklyReportModel['report']['weekly'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return m ? `${d} ${MONTHS[m - 1]}` : iso; };

function actionBlock(narrative: Narrative) {
  if (!narrative.actions.length) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${narrative.actions.map((a, i) => {
    const w = WHEN[a.when];
    return `<tr><td style="padding:0 0 10px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.soft};border-radius:12px;"><tr>
      <td width="44" valign="top" style="width:44px;padding:14px 0 14px 14px;vertical-align:top;font-family:${FONT};font-size:22px;line-height:1;font-weight:800;color:${BRAND.faint};">${i + 1}</td>
      <td valign="top" style="padding:14px 16px 14px 0;">
        <p style="margin:0 0 5px;">${pill(w.text, w.fg, w.bg)}</p>
        <p style="margin:0 0 3px;font-family:${FONT};font-size:13px;line-height:1.4;font-weight:800;color:${BRAND.ink};">${esc(a.subject)}</p>
        <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.55;color:${BRAND.body};">${esc(a.text)}</p>
      </td></tr></table></td></tr>`;
  }).join('')}</table>`;
}

function patternCard(f: Finding) {
  const t = TONE[f.tone];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-left:4px solid ${t.fg};border-radius:12px;"><tr><td style="padding:14px 16px;">
    <p style="margin:0 0 6px;">${pill(KIND_LABEL[f.kind], t.fg, t.bg)}</p>
    <p style="margin:0 0 5px;font-family:${FONT};font-size:15px;line-height:1.35;font-weight:800;color:${BRAND.ink};">${esc(f.title)}</p>
    <p style="margin:0 0 8px;font-family:${FONT};font-size:13.5px;line-height:1.55;color:${BRAND.body};">${esc(f.detail)}</p>
    ${f.evidence.length ? `<p style="margin:0 0 8px;font-family:${MONO};font-size:11.5px;line-height:1.6;color:${BRAND.muted};">${f.evidence.map(esc).join(' &nbsp;&middot;&nbsp; ')}</p>` : ''}
    <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${BRAND.muted};"><strong style="color:${BRAND.ink};">Do next:</strong> ${esc(f.action)}</p>
  </td></tr></table>`;
}

function table(headers: string[], rows: string[][]) {
  const th = (h: string, i: number) => `<td ${i ? 'align="right"' : ''} style="padding:0 0 8px;font-family:${FONT};font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:800;color:${BRAND.faint};border-bottom:1px solid ${BRAND.line};">${esc(h)}</td>`;
  const td = (c: string, i: number) => `<td ${i ? 'align="right"' : ''} style="padding:9px 0;font-family:${FONT};font-size:13.5px;line-height:1.35;color:${i ? BRAND.body : BRAND.ink};font-weight:${i ? 500 : 700};border-bottom:1px solid ${BRAND.line};${i ? 'white-space:nowrap;padding-left:10px;' : ''}">${c}</td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>${headers.map(th).join('')}</tr>${rows.map(r => `<tr>${r.map(td).join('')}</tr>`).join('')}</table>`;
}

type Breakdown = WeeklyReportModel['report']['breakdowns']['studio'][number];
const slaCell = (r: Breakdown) => r.slaCompliance === null ? '—' : `<span style="color:${r.slaCompliance >= 90 ? BRAND.green : r.slaCompliance >= 75 ? BRAND.gold : BRAND.red};font-weight:700;">${r.slaCompliance}%</span>`;
const overdueCell = (n: number) => (n ? `<span style="color:${BRAND.red};font-weight:700;">${n}</span>` : '0');

export function weeklyReportEmail(m: WeeklyReportModel, recipientName?: string | null) {
  const {report: r, narrative: n} = m;
  const t = r.totals, p = r.previous;
  const first = firstName(recipientName);
  const problems = r.patterns.filter(f => f.kind !== 'win');
  const wins = r.patterns.filter(f => f.kind === 'win');
  const urgent = n.actions.some(a => a.when === 'now');
  const accent = urgent || t.breachedOpen ? BRAND.red : BRAND.gold;
  const studios = r.breakdowns.studio.filter(s => s.key !== 'No studio').slice(0, 6);
  const categories = r.breakdowns.category.slice(0, 6);
  const resolvers = r.breakdowns.owner.filter(o => o.key !== 'Unassigned' && o.resolved > 0).sort((a, b) => b.resolved - a.resolved).slice(0, 3);
  const loaded = r.breakdowns.owner.filter(o => o.key !== 'Unassigned' && o.open >= 3).sort((a, b) => b.open - a.open).slice(0, 3);
  const unassigned = r.breakdowns.owner.find(o => o.key === 'Unassigned')?.open ?? 0;
  const stale = r.ageing.filter(a => a.from >= 14).reduce((s, a) => s + a.count, 0);
  const catMax = Math.max(1, ...categories.map(c => c.total));

  const body = [
    section(`
      <p style="margin:0 0 12px;">${pill(`Week in review · ${m.periodLabel}`, accent, urgent || t.breachedOpen ? BRAND.redSoft : BRAND.goldSoft)}</p>
      <h1 class="e-h1" style="margin:0 0 12px;font-family:${FONT};font-size:27px;line-height:1.22;font-weight:800;letter-spacing:-.025em;color:${BRAND.ink};">${esc(n.headline)}</h1>
      <p style="margin:0 0 8px;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${BRAND.ink};font-weight:600;">${esc(first ? `Hello ${first},` : 'Hello,')}</p>
      <p style="margin:0;font-family:${FONT};font-size:15.5px;line-height:1.65;color:${BRAND.body};">${esc(n.summary)}</p>`),

    section(grid([
      grid([tile('Raised', String(t.all), delta(t.all, p?.all, false)), tile('Resolved', String(t.resolved), delta(t.resolved, p?.resolved, true), BRAND.green)], 2, 10, false),
      grid([tile('SLA compliance', pctOf(t.slaCompliance), delta(t.slaCompliance, p?.slaCompliance, true, true), t.slaCompliance !== null && t.slaCompliance < 75 ? BRAND.red : BRAND.ink), tile('Median to resolve', hours(t.medianResolutionHours), delta(t.medianResolutionHours, p?.medianResolutionHours, false))], 2, 10, false),
    ], 2, 10), '0 36px 8px'),
    section(grid([
      grid([tile('Open now', String(t.open), unassigned ? `${unassigned} with no owner` : ''), tile('Overdue', String(t.breachedOpen), '', t.breachedOpen ? BRAND.red : BRAND.ink)], 2, 10, false),
      grid([tile('Critical open', String(t.critical), '', t.critical ? BRAND.red : BRAND.ink), tile('Open 2+ weeks', String(stale), '', stale ? BRAND.gold : BRAND.ink)], 2, 10, false),
    ], 2, 10), '0 36px 20px'),

    r.weekly.length >= 2 ? section(weeksChart(r.weekly), '0 36px 26px') : '',

    n.actions.length ? section(heading('What to do this week', 'In order of urgency. Each answers something detected in the data below.') + actionBlock(n), '0 36px 12px') : '',

    problems.length ? divider() + section(heading('Patterns detected', `Found by comparing this week with the previous eight, and by looking at where, when and how long — not only at totals.`), '0 36px 8px')
      + problems.slice(0, 6).map(f => section(patternCard(f), '0 36px 12px')).join('') : '',

    wins.length ? section(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.greenSoft};border-radius:12px;"><tr><td style="padding:16px 18px 6px;">
      ${label('Going well', BRAND.green)}
      ${wins.map(w => `<p style="margin:0 0 10px;font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.ink};"><strong>${esc(w.title)}.</strong> <span style="color:${BRAND.body};">${esc(w.detail)}</span></p>`).join('')}
    </td></tr></table>`, '8px 36px 24px') : '',

    studios.length ? divider() + section(heading('By studio', 'Raised this week, what is still open, and how targets held.') + table(['Studio', 'Raised', 'Open', 'Overdue', 'SLA'], studios.map(s => [esc(s.key), `${s.total}${s.change !== null ? ` <span style="font-size:11px;color:${s.change > 0 ? BRAND.gold : BRAND.green};">${s.change > 0 ? '&#9650;' : '&#9660;'}${Math.abs(s.change)}%</span>` : ''}`, String(s.open), overdueCell(s.overdue), slaCell(s)])), '0 36px 26px') : '',

    categories.length ? section(heading('What the work was about') + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${categories.map(c => `<tr><td style="padding:0 0 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td style="padding:0 0 5px;font-family:${FONT};font-size:13.5px;line-height:1.35;color:${BRAND.ink};font-weight:600;">${esc(c.key)}</td>
        <td align="right" style="padding:0 0 5px 10px;font-family:${FONT};font-size:13px;white-space:nowrap;color:${BRAND.muted};"><strong style="color:${BRAND.ink};">${c.total}</strong>${c.change !== null ? ` <span style="color:${c.change > 0 ? BRAND.gold : BRAND.green};font-weight:600;">· ${c.change > 0 ? '+' : ''}${c.change}%</span>` : ''}</td>
      </tr></table>${bar(c.total / catMax, BRAND.ink)}</td></tr>`).join('')}</table>`, '0 36px 26px') : '',

    resolvers.length || loaded.length ? section(grid([
      resolvers.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;"><tr><td style="padding:16px 18px 8px;">${label('Most resolved')}${resolvers.map(o => `<p style="margin:0 0 8px;font-family:${FONT};font-size:13.5px;color:${BRAND.body};">${esc(o.key)} <strong style="float:right;color:${BRAND.green};">${o.resolved}</strong></p>`).join('')}</td></tr></table>` : '',
      loaded.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BRAND.line};border-radius:12px;"><tr><td style="padding:16px 18px 8px;">${label('Heaviest open load')}${loaded.map(o => `<p style="margin:0 0 8px;font-family:${FONT};font-size:13.5px;color:${BRAND.body};">${esc(o.key)} <strong style="float:right;color:${o.overdue ? BRAND.red : BRAND.ink};">${o.open}${o.overdue ? ` · ${o.overdue} late` : ''}</strong></p>`).join('')}</td></tr></table>` : '',
    ], 2, 12), '0 36px 26px') : '',

    m.dashboardUrl ? section(button(m.dashboardUrl, 'Open the trend dashboard'), '4px 36px 34px') : section('', '0 0 8px'),
  ].join('');

  const text = [
    `IRIS weekly trend report — ${m.periodLabel}`,
    m.scopeLabel,
    '',
    first ? `Hello ${first},` : 'Hello,',
    '',
    n.headline,
    n.summary,
    '',
    `RAISED ${t.all}${p ? ` (${p.all} the week before)` : ''} · RESOLVED ${t.resolved} · OPEN ${t.open} · OVERDUE ${t.breachedOpen} · SLA ${pctOf(t.slaCompliance)} · MEDIAN ${hours(t.medianResolutionHours)}`,
    '',
    ...(n.actions.length ? ['WHAT TO DO THIS WEEK', ...n.actions.map((a, i) => `  ${i + 1}. [${WHEN[a.when].text.toUpperCase()}] ${a.subject} — ${a.text}`), ''] : []),
    ...(problems.length ? ['PATTERNS DETECTED', ...problems.slice(0, 6).flatMap(f => [`  • ${f.title}`, `    ${f.detail}`, `    Do next: ${f.action}`]), ''] : []),
    ...(wins.length ? ['GOING WELL', ...wins.map(w => `  • ${w.title}. ${w.detail}`), ''] : []),
    ...(studios.length ? ['BY STUDIO', ...studios.map(s => `  ${s.key}: ${s.total} raised, ${s.open} open, ${s.overdue} overdue, SLA ${pctOf(s.slaCompliance)}`), ''] : []),
    m.dashboardUrl ? `Open the trend dashboard: ${m.dashboardUrl}` : '',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const html = emailDocument({
    title: `IRIS weekly trend report — ${m.periodLabel}`,
    preheader: `${t.all} raised · ${t.resolved} resolved · ${t.breachedOpen} overdue — ${n.headline}`,
    context: `Weekly report · ${m.periodLabel}`,
    accent, body, width: 680,
    footer: `Sent every Monday to IRIS administrators and managers. You are seeing ${m.scopeLabel.toLowerCase()}. Figures count tickets raised during the week; open and overdue are as of when this was sent. ${n.engine === 'model' ? 'The summary and actions were written by an AI model from the detected patterns and checked against them.' : ''}`.trim(),
  });

  return {subject: `IRIS weekly trend report — ${m.periodLabel}: ${t.all} raised, ${t.resolved} resolved`, text, html};
}
