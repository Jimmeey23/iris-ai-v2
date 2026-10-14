import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {backlogOutlook, buildPatterns, detectBreachDrivers, detectConcentration, detectRhythm, detectSlowLanes, detectSpikes, rankFindings, toSeries} from '../../src/lib/trend-patterns';
import {factsFrom, numbersGrounded, parseNarrative, ruleNarrative, type NarrativeFacts} from '../../src/lib/trend-narrative';

const row = (key: string, o: Partial<{total: number; breached: number; resolved: number; medianHours: number | null; share: number}> = {}) =>
  ({key, total: 10, breached: 0, resolved: 5, medianHours: 10, share: 10, ...o});

describe('Spike detection', () => {
  it('flags a jump well outside the usual wobble', () => {
    const f = detectSpikes({'AC Repairs': [1, 2, 1, 2, 1, 2, 1, 2, 9]}, {dim: 'subcategory'});
    assert.equal(f.length, 1);
    assert.equal(f[0].kind, 'spike');
    assert.match(f[0].title, /AC Repairs is running/);
    assert.deepEqual(f[0].drill, {dim: 'subcategory', value: 'AC Repairs'});
  });
  it('does not flag small counts or an ordinary week', () => {
    assert.equal(detectSpikes({a: [0, 1, 0, 1, 0, 1, 0, 0, 2]}, {dim: 'category'}).length, 0);
    assert.equal(detectSpikes({a: [5, 7, 4, 6, 5, 7, 4, 6, 8]}, {dim: 'category'}).length, 0);
  });
  it('allows a noisier series more room than a flat one', () => {
    const flat = detectSpikes({a: [3, 3, 3, 3, 3, 3, 3, 3, 7]}, {dim: 'category'});
    const noisy = detectSpikes({a: [0, 8, 1, 9, 0, 7, 1, 8, 7]}, {dim: 'category'});
    assert.equal(flat.length, 1);
    assert.equal(noisy.length, 0);
  });
  it('flags three weeks of steady climb even when no week is an outlier', () => {
    const f = detectSpikes({x: [3, 4, 3, 5, 4, 4, 5, 7, 9]}, {dim: 'category'});
    assert.ok(f.some(x => x.kind === 'rise' || x.kind === 'spike'));
  });
  it('notices unusual quiet in a normally busy series', () => {
    const f = detectSpikes({x: [6, 7, 5, 6, 8, 6, 7, 6, 1]}, {dim: 'category'});
    assert.equal(f[0]?.kind, 'quiet');
  });
  it('turns bucketed rows into oldest-first series', () => {
    const s = toSeries([{key: 'a', bucket: 0, count: 5}, {key: 'a', bucket: 2, count: 1}], 4);
    assert.deepEqual(s.a, [0, 1, 0, 5]);
  });
});

describe('Concentration', () => {
  const cells = [
    {studio: 'Supreme HQ', subcategory: 'AC Repairs', category: 'Repair', count: 8},
    {studio: 'Kwality House', subcategory: 'AC Repairs', category: 'Repair', count: 1},
    {studio: 'Supreme HQ', subcategory: 'Audio Issues', category: 'Class', count: 4},
    {studio: 'Kwality House', subcategory: 'Audio Issues', category: 'Class', count: 12},
    {studio: 'Kwality House', subcategory: 'Billing', category: 'Pay', count: 10},
    {studio: 'Supreme HQ', subcategory: 'Billing', category: 'Pay', count: 5},
  ];
  it('names a studio carrying far more than its share of a sub-category', () => {
    const f = detectConcentration(cells);
    assert.equal(f.length, 1);
    assert.match(f[0].title, /Supreme HQ is behind 89% of AC Repairs/);
    assert.deepEqual(f[0].drill, {filters: {studio: 'Supreme HQ', subcategory: 'AC Repairs'}});
  });
  it('says nothing when only one studio is in scope', () => {
    assert.equal(detectConcentration(cells.filter(c => c.studio === 'Supreme HQ').map(c => ({...c, count: c.count * 3}))).length, 0);
  });
  it('says nothing when the data is too thin to compare', () => {
    assert.equal(detectConcentration(cells.map(c => ({...c, count: 1}))).length, 0);
  });
});

describe('Breach drivers and slow lanes', () => {
  it('flags what breaches more than its volume explains', () => {
    const rows = [row('Asha', {total: 10, breached: 8}), row('Ravi', {total: 40, breached: 2}), row('Mia', {total: 30, breached: 1})];
    const f = detectBreachDrivers('owner', rows);
    assert.equal(f.length, 1);
    assert.match(f[0].title, /Asha accounts for 73%/);
  });
  it('ignores the unassigned bucket and tiny totals', () => {
    assert.equal(detectBreachDrivers('owner', [row('Unassigned', {breached: 9}), row('A', {total: 3, breached: 1})]).length, 0);
  });
  it('flags a lane that is much slower than the norm', () => {
    const f = detectSlowLanes([row('Refunds', {total: 8, resolved: 6, medianHours: 90}), row('Billing', {medianHours: 20})], 24);
    assert.equal(f.length, 1);
    assert.match(f[0].title, /Refunds/);
  });
  it('needs a real gap, not just a ratio', () => {
    assert.equal(detectSlowLanes([row('Tiny', {resolved: 5, medianHours: 3})], 1).length, 0);
  });
});

describe('Backlog outlook', () => {
  const week = (n: number, created: number, resolved: number) => ({week: `2026-09-${String(n).padStart(2, '0')}`, created, resolved});
  const to = Date.UTC(2026, 9, 12, 23, 59);
  it('warns when more is raised than resolved', () => {
    const f = backlogOutlook([week(7, 20, 12), week(14, 22, 12), week(21, 24, 13), week(28, 25, 12)], 40, to);
    assert.equal(f?.id, 'backlog:growing');
    assert.match(f!.title, /growing by about 11 a week/);
  });
  it('reports a clearing queue and how long it will take', () => {
    const f = backlogOutlook([week(7, 10, 20), week(14, 10, 20), week(21, 10, 20), week(28, 10, 20)], 30, to);
    assert.equal(f?.id, 'backlog:clearing');
    assert.match(f!.title, /3 weeks/);
  });
  it('stays quiet when inflow and outflow match', () => {
    assert.equal(backlogOutlook([week(7, 10, 10), week(14, 11, 10), week(21, 10, 11), week(28, 10, 10)], 20, to), null);
  });
});

describe('Rhythm', () => {
  it('names a concentrated filing window', () => {
    const heat = [{dow: 0, hour: 9, count: 20}, {dow: 1, hour: 10, count: 15}, {dow: 2, hour: 11, count: 10}, {dow: 3, hour: 15, count: 8}, {dow: 4, hour: 18, count: 6}];
    assert.match(detectRhythm(heat)!.title, /% of tickets are filed between 9am and 12pm/);
  });
  it('needs enough tickets to mean anything', () => {
    assert.equal(detectRhythm([{dow: 0, hour: 9, count: 5}]), null);
  });
});

describe('Ranking', () => {
  const f = (id: string, kind: any, impact: number) => ({id, kind, tone: 'amber' as const, title: id, detail: '', evidence: [], action: 'x', impact});
  it('orders by impact, removes repeats and caps any one kind', () => {
    const out = rankFindings([f('a', 'spike', 50), f('a', 'spike', 50), f('b', 'spike', 60), f('c', 'spike', 40), f('d', 'spike', 30), f('e', 'win', 10)]);
    assert.deepEqual(out.map(x => x.id), ['b', 'a', 'c', 'e']);
  });
});

const facts = (): NarrativeFacts => ({
  period: 'the last 7 days', scope: 'all studios',
  totals: {raised: 42, resolved: 35, open: 18, overdue: 4, critical: 1, slaCompliance: 88.5, medianResolutionHours: 20},
  previous: {raised: 30, resolved: 33, slaCompliance: 91, medianResolutionHours: 18},
  findings: [
    {id: 'spike:subcategory:ac', kind: 'spike', tone: 'red', title: 'AC Repairs is running 4.2× its usual', detail: '9 tickets this week against 2.1 a week. Busiest earlier week had 3.', evidence: ['9 this week'], action: 'Find what the tickets share.'},
    {id: 'win:sla', kind: 'win', tone: 'green', title: 'Billing is down 40%', detail: '6 against 10.', evidence: [], action: 'Write down what changed.'},
  ],
  topCategories: [{name: 'Repair', raised: 15, changePercent: 50}], topStudios: [{name: 'Supreme HQ', raised: 20, open: 9, overdue: 3}],
});

describe('Narrative', () => {
  it('writes a complete briefing without a model', () => {
    const n = ruleNarrative(facts());
    assert.equal(n.engine, 'rules');
    assert.match(n.headline, /42 raised, 35 resolved/);
    assert.match(n.summary, /40% more than the period before/);
    assert.match(n.summary, /SLA compliance was 88.5% \(down 2.5 points\)/);
    assert.equal(n.actions.length, 1, 'no action is written for a win');
    assert.equal(n.actions[0].when, 'now');
  });
  it('accepts a model answer that stays inside the facts', () => {
    const n = parseNarrative({headline: 'AC repairs spiked this week', summary: 'Raised 42, resolved 35, with 4 overdue.', actions: [{text: 'Check what the AC tickets share.', findingIds: ['spike:subcategory:ac'], when: 'now'}]}, facts());
    assert.equal(n?.engine, 'model');
    assert.equal(n?.actions[0].subject, 'AC Repairs is running 4.2× its usual');
  });
  it('rejects an invented number', () => {
    assert.equal(parseNarrative({headline: 'h', summary: 'Raised 57 tickets.', actions: [{text: 'Do it.', findingIds: ['spike:subcategory:ac']}]}, facts()), null);
  });
  it('drops actions that cite unknown findings and rejects an answer left with none', () => {
    assert.equal(parseNarrative({headline: 'h', summary: 's', actions: [{text: 'Do it.', findingIds: ['made-up']}]}, facts()), null);
  });
  it('lets small whole numbers through as words, not claims', () => {
    assert.equal(numbersGrounded(['two studios need attention'], facts()), true);
    assert.equal(numbersGrounded(['2 studios and 77 tickets'], facts()), false);
  });
  it('builds a fact sheet from a report', () => {
    const r = {totals: {all: 5, resolved: 3, open: 2, breachedOpen: 1, critical: 0, slaCompliance: 90, medianResolutionHours: 4}, previous: null, patterns: [], breakdowns: {category: [{key: 'A', total: 5, change: null}], studio: []}} as never;
    const f = factsFrom(r, 'p', 's');
    assert.equal(f.totals.overdue, 1);
    assert.deepEqual(f.topCategories, [{name: 'A', raised: 5, changePercent: null}]);
  });
});

describe('Pattern assembly', () => {
  it('produces ranked findings from one input', () => {
    const out = buildPatterns({
      categorySeries: {}, subcategorySeries: {'AC Repairs': [1, 2, 1, 2, 1, 2, 1, 2, 9]}, studioSeries: {},
      cells: [], breakdowns: {owner: [], department: [], studio: [], category: [], subcategory: []}, categoryRows: [],
      totals: {open: 10, slaCompliance: 90, medianResolutionHours: 10}, previous: null, weekly: [], heatmap: [], recurrence: [], toMs: Date.now(),
    });
    assert.equal(out[0]?.kind, 'spike');
  });
});
