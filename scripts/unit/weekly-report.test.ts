import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {addDays, previousWeek, weekLabel, weekStartingOn} from '../../src/lib/week';
import {weeklyReportEmail, type WeeklyReportModel} from '../../src/lib/weekly-report-email';
import {ruleNarrative, factsFrom} from '../../src/lib/trend-narrative';
import {buildPatterns} from '../../src/lib/trend-patterns';

const ist = (ms: number) => new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'}).format(ms);

describe('Report week', () => {
  it('is the last complete Monday–Sunday week', () => {
    // Monday 12 Oct 2026, 09:00 IST: the week to report is 5–11 Oct.
    assert.deepEqual(previousWeek(Date.UTC(2026, 9, 12, 3, 30), ist), {from: '2026-10-05', to: '2026-10-11', label: '5 – 11 Oct 2026'});
    // Sunday 11 Oct is still inside the week being lived: report the one before.
    assert.equal(previousWeek(Date.UTC(2026, 9, 11, 10, 0), ist).from, '2026-09-28');
    // Wednesday: same week as the Monday before it.
    assert.equal(previousWeek(Date.UTC(2026, 9, 14, 10, 0), ist).from, '2026-10-05');
  });
  it('judges the day in the workspace timezone, not UTC', () => {
    // 23:00 UTC Sunday is already Monday 04:30 in India.
    assert.equal(previousWeek(Date.UTC(2026, 9, 11, 23, 0), ist).from, '2026-10-05');
  });
  it('labels weeks across months and years', () => {
    assert.equal(weekLabel('2026-09-28', '2026-10-04'), '28 Sep – 4 Oct 2026');
    assert.equal(weekLabel('2026-12-28', '2027-01-03'), '28 Dec 2026 – 3 Jan 2027');
    assert.equal(weekStartingOn('2026-10-05').to, '2026-10-11');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });
});

const breakdownRow = (key: string, o: Record<string, unknown> = {}) => ({key, total: 10, open: 4, resolved: 6, overdue: 1, breached: 1, critical: 0, slaCompliance: 90, medianHours: 10, previous: 8, change: 25, share: 20, ...o});

function model(): WeeklyReportModel {
  const patterns = buildPatterns({
    categorySeries: {}, subcategorySeries: {'AC & Ventilation Repairs': [1, 2, 1, 2, 1, 2, 1, 2, 9]}, studioSeries: {},
    cells: [], breakdowns: {owner: [], department: [], studio: [], category: [], subcategory: []}, categoryRows: [{key: 'Billing', total: 4, previous: 10, change: -60}],
    totals: {open: 12, slaCompliance: 88, medianResolutionHours: 20}, previous: {slaCompliance: 80, medianResolutionHours: 30}, weekly: [], heatmap: [], recurrence: [], toMs: Date.now(),
  });
  const report = {
    totals: {all: 42, open: 12, resolved: 35, recorded: 0, critical: 1, breached: 4, breachedOpen: 3, breachedResolved: 1, iris: 20, slaCompliance: 88, medianResolutionHours: 20},
    previous: {all: 30, open: 10, resolved: 28, breached: 2, tracked: 28, slaCompliance: 80, medianResolutionHours: 30},
    breakdowns: {category: [breakdownRow('Repair & Maintenance', {total: 15})], subcategory: [], studio: [breakdownRow('Supreme HQ'), breakdownRow('Kwality House', {change: -10})], department: [], owner: [breakdownRow('Asha <b>', {resolved: 9, open: 3}), breakdownRow('Unassigned', {open: 2})], trainer: [], format: [], source: []},
    weekly: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({week: `2026-08-${String(i * 3).padStart(2, '0')}`, created: 10 + i, resolved: 9 + i, breached: 1})),
    patterns, insights: [], recurrence: [],
    ageing: [{bucket: 'Over a month', from: 30, to: null, count: 2, overdue: 1}],
  } as unknown as WeeklyReportModel['report'];
  const facts = factsFrom(report as never, 'the week 5 – 11 Oct 2026', 'All studios');
  return {periodLabel: '5 – 11 Oct 2026', scopeLabel: 'All studios and departments', report, narrative: ruleNarrative(facts), dashboardUrl: 'https://iris.example/analytics?range=7'};
}

describe('Weekly report email', () => {
  const mail = weeklyReportEmail(model(), 'Jimmeey Gondaa');
  it('carries the snapshot, patterns, recommendations and a link', () => {
    assert.match(mail.subject, /5 – 11 Oct 2026: 42 raised, 35 resolved/);
    for (const needle of ['Week in review', 'What to do this week', 'Patterns detected', 'Going well', 'By studio', 'Hello Jimmeey', 'Open the trend dashboard', 'https://iris.example/analytics?range=7']) {
      assert.ok(mail.html.includes(needle), `html is missing "${needle}"`);
    }
    assert.match(mail.text, /RAISED 42 \(30 the week before\)/);
    assert.match(mail.text, /PATTERNS DETECTED/);
  });
  it('escapes names and text taken from data', () => {
    assert.ok(!mail.html.includes('Asha <b>'));
    assert.ok(mail.html.includes('Asha &lt;b&gt;'));
  });
  it('renders without a comparison period or any patterns', () => {
    const m = model();
    const bare = weeklyReportEmail({...m, report: {...m.report, previous: null, patterns: [], weekly: []}, narrative: {...m.narrative, actions: []}}, null);
    assert.ok(bare.html.includes('Hello,'));
    assert.ok(!bare.html.includes('Patterns detected'));
  });
});
