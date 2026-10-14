/**
 * Pattern detection for the Trend dashboard and the weekly report.
 *
 * The existing insights compare this period with the last one. That finds what moved; it
 * cannot tell a normal Tuesday from a spike, notice that one studio is behind most of a
 * sub-category, or see that the queue is growing even though no single number looks bad.
 * These detectors read a longer baseline and the shape of the data instead:
 *
 *  - **spike / rise / quiet** — this week against the previous eight, scaled by how much that
 *    series normally wobbles (a count of 4 means more for a series that is always 1 or 2).
 *  - **concentration** — one studio carrying far more than its share of a sub-category.
 *  - **breach driver** — what accounts for more SLA breaches than its volume explains.
 *  - **slow lane** — where resolution takes much longer than everywhere else.
 *  - **backlog outlook** — whether the queue is growing or clearing, and how fast.
 *  - **rhythm** — when the work arrives.
 *  - **chronic** — the same fault coming back (from lib/recurrence).
 *  - **win** — what improved, because a report that only lists problems stops being read.
 *
 * Everything here is pure: no database, no network. The thresholds are deliberately
 * conservative — a detector that fires on noise teaches people to ignore all of them — and
 * they are covered by tests so a tweak is a visible decision.
 */
import type {BreakdownRow, DrillDim} from './analytics-intel';
import type {Cluster} from './recurrence';

export type Drill = {dim: DrillDim; value: string} | {ids: number[]} | {filters: Partial<Record<DrillDim, string>>};
export type FindingKind = 'spike' | 'rise' | 'quiet' | 'concentration' | 'breach-driver' | 'slow-lane' | 'backlog' | 'rhythm' | 'chronic' | 'win';
export type Tone = 'red' | 'amber' | 'green' | 'blue';

export type Finding = {
  /** Stable across loads for the same finding, so a narrative can cite it. */
  id: string;
  kind: FindingKind;
  tone: Tone;
  title: string;
  detail: string;
  /** Short facts behind the claim, shown as chips. */
  evidence: string[];
  /** The one thing to do about it. */
  action: string;
  /** 0–100: how much this deserves attention, for ranking only. */
  impact: number;
  /** Weekly counts, oldest first, for a sparkline. */
  series?: number[];
  drill?: Drill;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const hoursLabel = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.round(h)}h` : `${Math.max(1, Math.round(h * 60))}m`);

/* ---------------------------------------------------------------------------------------- *
 * Spikes, sustained rises and unusual quiet
 * ---------------------------------------------------------------------------------------- */

/** Weekly counts per key, oldest first; the last value is the week being judged. */
export type WeeklySeries = Record<string, number[]>;

/** Rows of {key, bucket, count} where bucket 0 is the latest week, into oldest-first arrays. */
export function toSeries(rows: {key: string; bucket: number; count: number}[], buckets: number): WeeklySeries {
  const out: WeeklySeries = {};
  for (const r of rows) {
    const i = buckets - 1 - Number(r.bucket);
    if (i < 0 || i >= buckets) continue;
    (out[r.key] ||= new Array(buckets).fill(0))[i] += Number(r.count);
  }
  return out;
}

const DIM_ACTION: Record<string, {spike: string; rise: string}> = {
  category: {
    spike: 'Read this week\'s tickets side by side before more arrive: one studio, one asset or one change usually explains a jump, and fixing that is cheaper than closing each ticket.',
    rise: 'Name an owner for the theme now. A steady climb is cheaper to stop in week three than in week eight.',
  },
  subcategory: {
    spike: 'Find what the tickets share — a studio, an asset, a time, a trainer — and fix that once, rather than answering each report separately.',
    rise: 'Assign one person to the theme and ask what changed three weeks ago: a schedule, a supplier, a policy, a system update.',
  },
  studio: {
    spike: 'Call the studio lead: has something changed locally — staffing, a schedule, equipment, a renovation? Then look at which categories drive it.',
    rise: 'Ask the studio lead what has changed since the climb began, and whether they have the cover they need.',
  },
};

export type SpikeOpts = {dim: 'category' | 'subcategory' | 'studio'; label?: string};

export function detectSpikes(series: WeeklySeries, opts: SpikeOpts): Finding[] {
  const out: Finding[] = [];
  const act = DIM_ACTION[opts.dim];
  for (const [key, s] of Object.entries(series)) {
    if (s.length < 5) continue;
    const base = s.slice(0, -1);
    const cur = s[s.length - 1];
    const avg = mean(base);
    // A series that normally wobbles by 3 needs a bigger jump to mean anything; a flat series
    // of zeros and ones is judged on the Poisson floor, so 0→2 is noise and 1→6 is not.
    const scale = Math.max(sd(base), Math.sqrt(Math.max(avg, 0.5)), 0.8);
    const z = (cur - avg) / scale;
    const drill: Drill = {dim: opts.dim, value: key};
    const id = `${opts.dim}:${slug(key)}`;
    const peak = Math.max(...base);
    if (z >= 2.2 && cur >= 3 && cur - avg >= 2) {
      const times = avg > 0 ? round1(cur / avg) : null;
      out.push({
        id: `spike:${id}`, kind: 'spike', tone: z >= 3.5 || cur >= avg * 3 ? 'red' : 'amber',
        title: times ? `${key} is running ${times}× its usual` : `${key} jumped from nothing to ${cur}`,
        detail: `${cur} tickets this week against ${round1(avg)} a week over the previous ${base.length}. The busiest earlier week had ${peak}.`,
        evidence: [`${cur} this week`, `usual ${round1(avg)}/wk`, `earlier peak ${peak}`],
        action: act.spike, impact: clamp(35 + z * 8 + cur * 1.5), series: s, drill,
      });
      continue;
    }
    const n = s.length;
    if (cur >= 4 && s[n - 1] > s[n - 2] && s[n - 2] > s[n - 3] && s[n - 3] > s[n - 4] && cur - s[n - 4] >= 3) {
      out.push({
        id: `rise:${id}`, kind: 'rise', tone: 'amber',
        title: `${key} has risen three weeks running`,
        detail: `${s.slice(n - 4).join(' → ')} tickets a week. No single week is an outlier, but the direction has not broken.`,
        evidence: [`${s[n - 4]} → ${cur} over 3 weeks`, `usual ${round1(avg)}/wk`],
        action: act.rise, impact: clamp(30 + (cur - s[n - 4]) * 5 + cur), series: s, drill,
      });
      continue;
    }
    if (avg >= 4 && cur <= avg * 0.3) {
      out.push({
        id: `quiet:${id}`, kind: 'quiet', tone: 'blue',
        title: `${key} has gone unusually quiet`,
        detail: `${cur} this week against a usual ${round1(avg)}. That is good if something was fixed; if not, check the reports are still being filed.`,
        evidence: [`${cur} this week`, `usual ${round1(avg)}/wk`],
        action: 'Confirm it is a fix rather than a reporting gap — ask the owner what changed.', impact: clamp(15 + avg), series: s, drill,
      });
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------------------- *
 * Concentration: one studio carrying far more than its share of a sub-category
 * ---------------------------------------------------------------------------------------- */

export type Cell = {studio: string; subcategory: string; category: string; count: number};

export function detectConcentration(cells: Cell[]): Finding[] {
  const grand = cells.reduce((a, c) => a + c.count, 0);
  const studios = new Map<string, number>();
  const subs = new Map<string, {total: number; category: string}>();
  for (const c of cells) {
    studios.set(c.studio, (studios.get(c.studio) || 0) + c.count);
    const s = subs.get(c.subcategory) || {total: 0, category: c.category};
    s.total += c.count; subs.set(c.subcategory, s);
  }
  // With one studio in scope everything is "concentrated" there; the comparison is meaningless.
  if (grand < 20 || [...studios.keys()].filter(k => k !== 'No studio').length < 2) return [];
  const out: Finding[] = [];
  for (const c of cells) {
    if (c.studio === 'No studio') continue;
    const sub = subs.get(c.subcategory)!;
    if (c.count < 3 || sub.total < 5) continue;
    const share = c.count / sub.total;
    const expected = (studios.get(c.studio) || 0) / grand;
    const lift = expected > 0 ? share / expected : 0;
    if (share < 0.5 || lift < 1.8) continue;
    out.push({
      id: `concentration:${slug(c.studio)}:${slug(c.subcategory)}`, kind: 'concentration', tone: lift >= 3 ? 'red' : 'amber',
      title: `${c.studio} is behind ${pct(share)} of ${c.subcategory}`,
      detail: `${c.count} of ${sub.total} ${c.subcategory} tickets came from ${c.studio}, which raises ${pct(expected)} of all tickets — ${round1(lift)}× its share. That points at the place, not the problem in general.`,
      evidence: [`${c.count} of ${sub.total}`, `${pct(share)} vs ${pct(expected)} expected`],
      action: `Send someone to ${c.studio} to look at the cause on the ground (equipment age, last service, room, cover) instead of treating these as separate tickets.`,
      impact: clamp(30 + lift * 8 + c.count * 2), drill: {filters: {studio: c.studio, subcategory: c.subcategory}},
    });
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, 4);
}

/* ---------------------------------------------------------------------------------------- *
 * SLA breach drivers and slow lanes
 * ---------------------------------------------------------------------------------------- */

type Row = Pick<BreakdownRow, 'key' | 'total' | 'breached' | 'resolved' | 'medianHours' | 'share'>;

const DRIVER_ACTION: Record<string, string> = {
  owner: 'Look at this person\'s queue with them: is it too much work, unclear priorities, or tickets that belong elsewhere? Rebalance before the next breach.',
  department: 'Review triage and staffing for this department — breaches clustering here usually mean the work arrives faster than it is picked up.',
  studio: 'Ask the studio lead where tickets stall (waiting on a vendor, an approval, or nobody noticing) and remove that step.',
  category: 'Check whether the target for this category is realistic. If it is, find the step where tickets wait; if not, reset the target so a breach means something.',
};

export function detectBreachDrivers(dim: 'owner' | 'department' | 'studio' | 'category', rows: Row[]): Finding[] {
  const usable = rows.filter(r => r.key !== 'Unassigned' && r.key !== 'No studio' && r.key !== 'Unrouted');
  const totalBreached = usable.reduce((a, r) => a + r.breached, 0);
  const totalVolume = usable.reduce((a, r) => a + r.total, 0);
  if (totalBreached < 5 || totalVolume < 15) return [];
  const out: Finding[] = [];
  for (const r of usable) {
    if (r.breached < 3) continue;
    const breachShare = r.breached / totalBreached;
    const volumeShare = r.total / totalVolume;
    const lift = volumeShare > 0 ? breachShare / volumeShare : 0;
    if (breachShare < 0.25 || lift < 1.5) continue;
    out.push({
      id: `breach-driver:${dim}:${slug(r.key)}`, kind: 'breach-driver', tone: breachShare >= 0.4 ? 'red' : 'amber',
      title: `${r.key} accounts for ${pct(breachShare)} of missed targets`,
      detail: `${r.breached} of ${totalBreached} SLA breaches, from ${pct(volumeShare)} of the tickets — ${round1(lift)}× what its volume explains.`,
      evidence: [`${r.breached} of ${totalBreached} breaches`, `${pct(volumeShare)} of volume`],
      action: DRIVER_ACTION[dim], impact: clamp(35 + breachShare * 50 + lift * 4), drill: {dim, value: r.key},
    });
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, 2);
}

export function detectSlowLanes(rows: Row[], overallMedianHours: number | null): Finding[] {
  if (!overallMedianHours || overallMedianHours <= 0) return [];
  const out: Finding[] = [];
  for (const r of rows) {
    if (r.medianHours === null || r.resolved < 3 || r.total < 4) continue;
    const ratio = r.medianHours / overallMedianHours;
    if (ratio < 2 || r.medianHours - overallMedianHours < 12) continue;
    out.push({
      id: `slow-lane:${slug(r.key)}`, kind: 'slow-lane', tone: 'amber',
      title: `${r.key} takes ${hoursLabel(r.medianHours)} to resolve`,
      detail: `Median ${hoursLabel(r.medianHours)} across ${r.resolved} resolved tickets, against ${hoursLabel(overallMedianHours)} overall — ${round1(ratio)}× slower than the norm.`,
      evidence: [`median ${hoursLabel(r.medianHours)}`, `${round1(ratio)}× overall`],
      action: 'Find the step where these tickets wait — a vendor, an approval, a missing owner — and agree a standard fix path so the common case does not need a decision.',
      impact: clamp(25 + ratio * 6 + r.resolved), drill: {dim: 'subcategory', value: r.key},
    });
  }
  return out.sort((a, b) => b.impact - a.impact).slice(0, 2);
}

/* ---------------------------------------------------------------------------------------- *
 * Backlog outlook
 * ---------------------------------------------------------------------------------------- */

export type WeekRow = {week: string; created: number; resolved: number};

/** Whether the queue is growing or clearing, from the last four complete weeks. */
export function backlogOutlook(weekly: WeekRow[], open: number, toMs: number): Finding | null {
  // The latest bucket is usually part-way through; judging a half-week against whole ones
  // would always read as "clearing".
  const complete = weekly.filter(w => new Date(w.week + 'T00:00:00Z').getTime() + 7 * 864e5 <= toMs + 864e5);
  const recent = complete.slice(-4);
  if (recent.length < 3 || open < 3) return null;
  const created = mean(recent.map(w => w.created));
  const resolved = mean(recent.map(w => w.resolved));
  const net = created - resolved;
  const evidence = [`raised ${round1(created)}/wk`, `resolved ${round1(resolved)}/wk`, `${open} open now`];
  if (net >= 1.5) {
    return {
      id: 'backlog:growing', kind: 'backlog', tone: net / Math.max(open, 1) > 0.15 ? 'red' : 'amber',
      title: `The queue is growing by about ${Math.round(net)} a week`,
      detail: `Over the last ${recent.length} full weeks ${round1(created)} tickets were raised and ${round1(resolved)} resolved each week. At that pace ${open} open becomes about ${Math.round(open + net * 4)} in a month.`,
      evidence, action: 'Either add resolving capacity where the work lands, or cut the inflow at its source (see the spikes and concentrations above). Waiting does not clear a queue that grows every week.',
      impact: clamp(40 + net * 4 + (net / Math.max(open, 1)) * 60), series: recent.map(w => w.created - w.resolved), drill: undefined,
    };
  }
  if (net <= -1.5) {
    const weeks = Math.max(1, Math.ceil(open / -net));
    return {
      id: 'backlog:clearing', kind: 'backlog', tone: 'green',
      title: `The queue is clearing — about ${weeks} week${weeks === 1 ? '' : 's'} to empty at this pace`,
      detail: `${round1(resolved)} resolved a week against ${round1(created)} raised, so open work is shrinking by about ${Math.round(-net)} a week.`,
      evidence, action: 'Hold the pace. Use the headroom on the oldest open tickets rather than the newest.',
      impact: clamp(20 + -net * 2), series: recent.map(w => w.created - w.resolved),
    };
  }
  return null;
}

/* ---------------------------------------------------------------------------------------- *
 * Rhythm
 * ---------------------------------------------------------------------------------------- */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const clock = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

/** The busiest three-hour window and the busiest day, from tickets filed live in the app. */
export function detectRhythm(heat: {dow: number; hour: number; count: number}[]): Finding | null {
  const total = heat.reduce((a, h) => a + h.count, 0);
  if (total < 20) return null;
  const byHour = new Array(24).fill(0);
  const byDay = new Array(7).fill(0);
  for (const h of heat) { byHour[h.hour] += h.count; byDay[h.dow] += h.count; }
  let best = 0, at = 0;
  for (let h = 0; h < 24; h++) {
    const w = byHour[h] + byHour[(h + 1) % 24] + byHour[(h + 2) % 24];
    if (w > best) { best = w; at = h; }
  }
  const share = best / total;
  if (share < 0.35) return null;
  const day = byDay.indexOf(Math.max(...byDay));
  const dayShare = byDay[day] / total;
  return {
    id: 'rhythm:window', kind: 'rhythm', tone: 'blue',
    title: `${pct(share)} of tickets are filed between ${clock(at)} and ${clock((at + 3) % 24)}`,
    detail: `${DAYS[day]} is the heaviest day (${pct(dayShare)} of the week). Tickets filed in that window wait for whoever is on, so response depends on cover at that hour.`,
    evidence: [`${best} of ${total} tickets`, `${DAYS[day]} busiest`],
    action: `Make sure someone with authority to assign is watching the board from ${clock(at)}, and schedule the daily queue check just after it.`,
    impact: clamp(10 + share * 40),
  };
}

/* ---------------------------------------------------------------------------------------- *
 * Chronic faults and wins
 * ---------------------------------------------------------------------------------------- */

export function chronicFindings(clusters: Cluster[]): Finding[] {
  return clusters.filter(c => c.severity !== 'watch').slice(0, 3).map(c => ({
    id: `chronic:${c.id}`, kind: 'chronic' as const, tone: c.severity === 'critical' ? 'red' as const : 'amber' as const,
    title: `${c.subject} keeps coming back`,
    detail: c.note,
    evidence: [`${c.count} reports on ${c.days} days`, c.everyDays ? `about every ${Math.round(c.everyDays)} days` : '', c.open ? `${c.open} open` : ''].filter(Boolean),
    action: c.action, impact: clamp((c.severity === 'critical' ? 70 : 50) + c.count * 2 + c.open * 3), drill: {ids: c.ticketIds},
  }));
}

export type WinInput = {
  category: Pick<BreakdownRow, 'key' | 'total' | 'previous' | 'change'>[];
  totals: {slaCompliance: number | null; medianResolutionHours: number | null};
  previous: {slaCompliance: number | null; medianResolutionHours: number | null} | null;
};

export function detectWins(d: WinInput): Finding[] {
  const out: Finding[] = [];
  for (const r of d.category) {
    if (r.previous >= 5 && r.change !== null && r.change <= -30) {
      out.push({
        id: `win:category:${slug(r.key)}`, kind: 'win', tone: 'green', title: `${r.key} is down ${Math.abs(r.change)}%`,
        detail: `${r.total} tickets against ${r.previous} the period before.`, evidence: [`${r.total} vs ${r.previous}`],
        action: 'Find out what changed and write it down, so it is repeated and not just enjoyed.', impact: clamp(15 + Math.abs(r.change) / 4),
        drill: {dim: 'category', value: r.key},
      });
    }
  }
  const p = d.previous;
  if (p && d.totals.slaCompliance !== null && p.slaCompliance !== null && d.totals.slaCompliance - p.slaCompliance >= 5) {
    out.push({
      id: 'win:sla', kind: 'win', tone: 'green', title: `SLA compliance is up ${round1(d.totals.slaCompliance - p.slaCompliance)} points`,
      detail: `${d.totals.slaCompliance}% against ${p.slaCompliance}% the period before.`, evidence: [`${d.totals.slaCompliance}% now`, `${p.slaCompliance}% before`],
      action: 'Tell the team — and note which owners or departments moved most.', impact: 30,
    });
  }
  if (p && d.totals.medianResolutionHours && p.medianResolutionHours && d.totals.medianResolutionHours <= p.medianResolutionHours * 0.8 && p.medianResolutionHours - d.totals.medianResolutionHours >= 2) {
    out.push({
      id: 'win:speed', kind: 'win', tone: 'green', title: `Tickets are closing faster — median ${hoursLabel(d.totals.medianResolutionHours)}`,
      detail: `Down from ${hoursLabel(p.medianResolutionHours)} the period before.`, evidence: [`${hoursLabel(d.totals.medianResolutionHours)} now`, `${hoursLabel(p.medianResolutionHours)} before`],
      action: 'Keep whatever changed; check it is not coming at the cost of re-opened tickets.', impact: 28,
    });
  }
  return out.slice(0, 3);
}

/* ---------------------------------------------------------------------------------------- *
 * Assembly
 * ---------------------------------------------------------------------------------------- */

export type PatternInput = {
  categorySeries: WeeklySeries;
  subcategorySeries: WeeklySeries;
  studioSeries: WeeklySeries;
  cells: Cell[];
  breakdowns: {owner: Row[]; department: Row[]; studio: Row[]; category: Row[]; subcategory: Row[]};
  categoryRows: WinInput['category'];
  totals: WinInput['totals'] & {open: number};
  previous: WinInput['previous'];
  weekly: WeekRow[];
  heatmap: {dow: number; hour: number; count: number}[];
  recurrence: Cluster[];
  toMs: number;
};

const MAX_PER_KIND = 3;
const MAX_FINDINGS = 12;

/** Ranks by impact, drops repeats, and keeps any one kind from crowding out the rest. */
export function rankFindings(all: Finding[]): Finding[] {
  const seen = new Set<string>();
  const perKind: Record<string, number> = {};
  const out: Finding[] = [];
  for (const f of [...all].sort((a, b) => b.impact - a.impact)) {
    if (seen.has(f.id)) continue;
    if ((perKind[f.kind] || 0) >= MAX_PER_KIND) continue;
    seen.add(f.id);
    perKind[f.kind] = (perKind[f.kind] || 0) + 1;
    out.push(f);
    if (out.length >= MAX_FINDINGS) break;
  }
  return out;
}

export function buildPatterns(d: PatternInput): Finding[] {
  const all: Finding[] = [
    ...detectSpikes(d.subcategorySeries, {dim: 'subcategory'}),
    ...detectSpikes(d.categorySeries, {dim: 'category'}),
    ...detectSpikes(d.studioSeries, {dim: 'studio'}),
    ...detectConcentration(d.cells),
    ...detectBreachDrivers('owner', d.breakdowns.owner),
    ...detectBreachDrivers('department', d.breakdowns.department),
    ...detectBreachDrivers('studio', d.breakdowns.studio),
    ...detectSlowLanes(d.breakdowns.subcategory.length ? d.breakdowns.subcategory : d.breakdowns.category, d.totals.medianResolutionHours),
    ...chronicFindings(d.recurrence),
    ...detectWins({category: d.categoryRows, totals: d.totals, previous: d.previous}),
  ];
  const backlog = backlogOutlook(d.weekly, d.totals.open, d.toMs);
  if (backlog) all.push(backlog);
  const rhythm = detectRhythm(d.heatmap);
  if (rhythm) all.push(rhythm);
  return rankFindings(all);
}
