/**
 * The written briefing on top of the Trend dashboard and the weekly report: a headline, a
 * short summary and a handful of recommended actions.
 *
 * The findings (lib/trend-patterns) are computed, so they are right by construction. The model
 * is only asked to *say* them well — rank, connect and phrase — and it is held to that:
 *
 *  - it sees only a compact fact sheet, never raw tickets or member details;
 *  - every action must cite finding ids that exist, or it is dropped;
 *  - every number in its text must appear in the fact sheet, or the whole answer is discarded
 *    and the rule-based narrative below is used instead.
 *
 * So the worst case is the deterministic version, which is complete on its own: a workspace
 * with no model connected, a slow call and a model that invents a figure all end up with a
 * briefing built from the same findings.
 */
import type {AnalyticsReport} from './analytics-report';

export type When = 'now' | 'this-week' | 'watch';
export type NarrativeAction = {text: string; findingIds: string[]; when: When; subject: string};
export type Narrative = {headline: string; summary: string; actions: NarrativeAction[]; engine: 'model' | 'rules'};

export type NarrativeFacts = {
  period: string;
  scope: string;
  totals: {raised: number; resolved: number; open: number; overdue: number; critical: number; slaCompliance: number | null; medianResolutionHours: number | null};
  previous: {raised: number; resolved: number; slaCompliance: number | null; medianResolutionHours: number | null} | null;
  findings: {id: string; kind: string; tone: string; title: string; detail: string; evidence: string[]; action: string}[];
  topCategories: {name: string; raised: number; changePercent: number | null}[];
  topStudios: {name: string; raised: number; open: number; overdue: number}[];
};

const MAX_FACT_FINDINGS = 8;

export function factsFrom(r: Pick<AnalyticsReport, 'totals' | 'previous' | 'patterns' | 'breakdowns'>, period: string, scope: string): NarrativeFacts {
  const t = r.totals;
  return {
    period, scope,
    totals: {raised: t.all, resolved: t.resolved, open: t.open, overdue: t.breachedOpen, critical: t.critical, slaCompliance: t.slaCompliance, medianResolutionHours: t.medianResolutionHours},
    previous: r.previous ? {raised: r.previous.all, resolved: r.previous.resolved, slaCompliance: r.previous.slaCompliance, medianResolutionHours: r.previous.medianResolutionHours} : null,
    findings: r.patterns.slice(0, MAX_FACT_FINDINGS).map(f => ({id: f.id, kind: f.kind, tone: f.tone, title: f.title, detail: f.detail, evidence: f.evidence, action: f.action})),
    topCategories: r.breakdowns.category.slice(0, 5).map(c => ({name: c.key, raised: c.total, changePercent: c.change})),
    topStudios: r.breakdowns.studio.slice(0, 5).map(s => ({name: s.key, raised: s.total, open: s.open, overdue: s.overdue})),
  };
}

const whenOf = (f: {tone: string}): When => (f.tone === 'red' ? 'now' : f.tone === 'amber' ? 'this-week' : 'watch');
const firstSentence = (s: string) => (s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s).trim();
const changePhrase = (now: number, before: number) => {
  if (!before) return null;
  const p = Math.round(((now - before) / before) * 100);
  return p === 0 ? 'level with the period before' : `${Math.abs(p)}% ${p > 0 ? 'more' : 'fewer'} than the period before`;
};

/** The briefing without a model. Complete on its own, and the fallback for the model's. */
export function ruleNarrative(facts: NarrativeFacts): Narrative {
  const {totals: t, previous: p} = facts;
  const problems = facts.findings.filter(f => f.kind !== 'win');
  const top = problems[0];
  const win = facts.findings.find(f => f.kind === 'win');

  const lead = `${t.raised} raised, ${t.resolved} resolved`;
  const headline = top
    ? (`${lead} — ${top.title}`.length <= 120 ? `${lead} — ${top.title}` : top.title)
    : win ? `${lead} — ${win.title}` : `${lead}: a steady period`;

  const parts: string[] = [];
  const vs = p ? changePhrase(t.raised, p.raised) : null;
  parts.push(`${t.raised} tickets were raised${vs ? `, ${vs}` : ''}, and ${t.resolved} were resolved. ${t.open} ${t.open === 1 ? 'remains' : 'remain'} open${t.overdue ? `, ${t.overdue} of them overdue` : ''}.`);
  if (t.slaCompliance !== null) {
    const move = p && p.slaCompliance !== null ? Math.round((t.slaCompliance - p.slaCompliance) * 10) / 10 : null;
    parts.push(`SLA compliance was ${t.slaCompliance}%${move ? ` (${move > 0 ? 'up' : 'down'} ${Math.abs(move)} points)` : ''}.`);
  }
  if (top) parts.push(firstSentence(top.detail));
  if (win && win !== top) parts.push(`On the positive side: ${win.title.charAt(0).toLowerCase()}${win.title.slice(1)}.`);

  const actions = problems.slice(0, 5).map(f => ({text: f.action, findingIds: [f.id], when: whenOf(f), subject: f.title}));
  return {headline, summary: parts.join(' '), actions, engine: 'rules'};
}

/** The system prompt. The facts go in the user turn as JSON. */
export const NARRATIVE_PROMPT = `You write the opening briefing of a weekly operations report for the managers of Physique 57 India, a boutique fitness studio group. You are given a JSON fact sheet computed from their support tickets. Findings in it have already been detected and checked; your job is to say them well.

Rules:
- Use ONLY facts in the sheet. Never invent a number, name, cause or outcome. Every number you write must appear in the sheet; do not calculate new ones.
- Do not speculate about causes the findings do not state. Where the cause is unknown, say what to check.
- Write for a busy manager: plain, specific, no hype, no filler.

Return JSON:
- "headline": one line, at most 110 characters, the single most important thing.
- "summary": two to four sentences, at most 90 words. Volume and service level first, then what matters most.
- "actions": three to five objects {"text", "findingIds", "when"}. "text" is one imperative sentence naming who or what to look at (at most 220 characters). "findingIds" lists the ids of the findings it answers (at least one, from the sheet). "when" is "now", "this-week" or "watch". Most urgent first. Do not write an action for a finding of kind "win".`;

const NUM = /\d+(?:\.\d+)?/g;

/** Whether every figure in the model's text also appears in the fact sheet. Whole numbers up to
 *  three are let through: they are usually words ("two studios") rather than claims. */
export function numbersGrounded(texts: string[], facts: NarrativeFacts): boolean {
  const allowed = new Set(JSON.stringify(facts).match(NUM) ?? []);
  for (const t of texts) for (const n of t.match(NUM) ?? []) {
    if (allowed.has(n)) continue;
    if (/^\d$/.test(n) && Number(n) <= 3) continue;
    return false;
  }
  return true;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The model's JSON as a Narrative, or null if it cannot be trusted. */
export function parseNarrative(raw: unknown, facts: NarrativeFacts): Narrative | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ids = new Map(facts.findings.map(f => [f.id, f]));
  const headline = str(o.headline, 140);
  const summary = str(o.summary, 700);
  if (!headline || !summary) return null;
  const actions: NarrativeAction[] = [];
  for (const a of Array.isArray(o.actions) ? o.actions : []) {
    const x = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
    const text = str(x.text, 260);
    const findingIds = (Array.isArray(x.findingIds) ? x.findingIds : []).filter((i): i is string => typeof i === 'string' && ids.has(i));
    if (!text || !findingIds.length) continue;
    const f = ids.get(findingIds[0])!;
    if (f.kind === 'win') continue;
    const when: When = x.when === 'now' || x.when === 'this-week' || x.when === 'watch' ? x.when : whenOf(f);
    actions.push({text, findingIds, when, subject: f.title});
    if (actions.length >= 5) break;
  }
  if (!actions.length && facts.findings.some(f => f.kind !== 'win')) return null;
  if (!numbersGrounded([headline, summary, ...actions.map(a => a.text)], facts)) return null;
  return {headline, summary, actions, engine: 'model'};
}

/**
 * The briefing: the model's when it is connected, answers in time and stays inside the facts,
 * the rule-based one otherwise. Never throws and never waits longer than `timeoutMs`.
 */
export async function generateNarrative(facts: NarrativeFacts, timeoutMs = 15000): Promise<Narrative> {
  const rules = ruleNarrative(facts);
  // Nothing to say beyond the numbers: no model call for an empty or finding-less period.
  if (!facts.findings.length) return rules;
  try {
    const {llmJson} = await import('./llm');
    const res = await llmJson({system: NARRATIVE_PROMPT, user: JSON.stringify(facts), temperature: 0.3, maxTokens: 700, timeoutMs});
    if (!res) return rules;
    const parsed = parseNarrative(JSON.parse(res.text || '{}'), facts);
    return parsed ?? rules;
  } catch {
    return rules;
  }
}
