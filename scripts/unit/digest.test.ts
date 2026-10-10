/**
 * The morning digest's arithmetic and its template.
 *
 * The queries themselves need a database and are covered by the integration passes; what is
 * asserted here is the part that is pure and still easy to get wrong — which IST day the mail
 * claims to describe, and whether the rendered message is safe and complete.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {digestEmail, digestInsights, istDayKey, istDayStart, type Digest, type DigestPulse} from '../../src/lib/ticket-digest';
import {ticketBcc} from '../../src/lib/ticket-emails';

describe('istDayStart', () => {
  it('is midnight India time, expressed in UTC (18:30 the previous day)', () => {
    const start = istDayStart(new Date('2026-10-03T04:00:00.000Z'));
    assert.equal(start.toISOString(), '2026-10-02T18:30:00.000Z');
  });
  it('does not roll back a day for a moment just after IST midnight', () => {
    // 18:45 UTC is 00:15 IST on the 3rd: the digest must describe the 3rd, not the 2nd.
    const start = istDayStart(new Date('2026-10-02T18:45:00.000Z'));
    assert.equal(start.toISOString(), '2026-10-02T18:30:00.000Z');
  });
  it('rolls over at the right moment, not at UTC midnight', () => {
    const before = istDayStart(new Date('2026-10-02T18:29:59.000Z'));
    const after = istDayStart(new Date('2026-10-02T18:30:01.000Z'));
    assert.equal(after.getTime() - before.getTime(), 86_400_000);
  });
});

describe('istDayKey', () => {
  it('is the IST calendar date, not the UTC instant of IST midnight', () => {
    // 02:30 UTC is 08:00 IST on the 3rd. istDayStart() is 18:30Z on the 2nd, which is why the
    // key is derived separately — the digest describes the 3rd and must say so.
    assert.equal(istDayKey(new Date('2026-10-03T02:30:00.000Z')), '2026-10-03');
  });
  it('rolls at IST midnight', () => {
    assert.equal(istDayKey(new Date('2026-10-02T18:29:00.000Z')), '2026-10-02');
    assert.equal(istDayKey(new Date('2026-10-02T18:31:00.000Z')), '2026-10-03');
  });
});

const now = new Date('2026-10-03T02:30:00.000Z');
const row = (over: Partial<Digest['buckets'][number]['rows'][number]> = {}) => ({
  id: 7,
  ticketNumber: 'P57-00007',
  title: 'Microphone not working in Studio 1',
  priority: 'high',
  status: 'assigned',
  studio: 'Kwality House, Kemps Corner',
  assignedStaffName: 'Anita Rao',
  slaDueAt: new Date('2026-10-02T12:00:00.000Z'),
  createdAt: new Date('2026-10-01T12:00:00.000Z'),
  slaExtendedByName: null,
  escalatedToName: null,
  ...over,
});

const digest = (over: Partial<Digest> = {}): Digest => ({
  asOf: istDayStart(now),
  buckets: [
    {key: 'overdue', label: 'Overdue', blurb: 'Past the follow-up target and still open.', rows: [row()]},
    {key: 'today', label: 'Due today', blurb: 'The target falls before midnight tonight.', rows: []},
    {key: 'overnight', label: 'Raised overnight', blurb: 'Filed since midnight, target still ahead.', rows: []},
    {key: 'unassigned', label: 'Waiting for an owner', blurb: 'Nobody has picked these up.', rows: []},
  ],
  totals: {open: 4, overdue: 1, dueToday: 0, overnight: 0, unassigned: 0, escalated: 1, extended: 1},
  byStudio: [{studio: 'Kwality House, Kemps Corner', open: 4, overdue: 1}],
  byOwner: [{owner: 'Anita Rao', open: 4, overdue: 1}],
  ...over,
});

describe('digestEmail', () => {
  it('leads the subject with what is wrong, not with the date alone', () => {
    const {subject} = digestEmail(digest(), now);
    assert.match(subject, /4 open, 1 overdue/);
  });
  it('says how late an overdue ticket is, in hours', () => {
    const {html, text} = digestEmail(digest(), now);
    // 2 Oct 12:00Z against 3 Oct 02:30Z is fourteen and a half hours late, floored to 14.
    assert.match(html, /14h late/);
    assert.match(text, /14h late/);
  });
  it('carries every ticket into the plain-text part too', () => {
    const {text} = digestEmail(digest(), now);
    assert.match(text, /P57-00007/);
    assert.match(text, /Anita Rao/);
    assert.match(text, /OVERDUE \(1\)/);
  });
  it('escapes ticket text rather than letting it into the markup', () => {
    const hostile = digest({
      buckets: [
        {key: 'overdue', label: 'Overdue', blurb: 'x', rows: [row({title: '<script>alert(1)</script>'})]},
        {key: 'today', label: 'Due today', blurb: 'x', rows: []},
        {key: 'overnight', label: 'Raised overnight', blurb: 'x', rows: []},
        {key: 'unassigned', label: 'Waiting for an owner', blurb: 'x', rows: []},
      ],
    });
    const {html} = digestEmail(hostile, now);
    assert.ok(!html.includes('<script>'), 'a ticket title must never reach the mail as markup');
    assert.match(html, /&lt;script&gt;/);
  });
  it('says so plainly when there is nothing open', () => {
    const quiet = digest({
      buckets: digest().buckets.map(b => ({...b, rows: []})),
      totals: {open: 0, overdue: 0, dueToday: 0, overnight: 0, unassigned: 0, escalated: 0, extended: 0},
      byStudio: [],
      byOwner: [],
    });
    const {html, subject} = digestEmail(quiet, now);
    assert.match(subject, /0 open, 0 overdue/);
    assert.match(html, /The board is clear/);
  });
  it('is a complete document, so no client has to guess at the wrapper', () => {
    const {html} = digestEmail(digest(), now);
    assert.ok(html.startsWith('<!doctype html>'));
    assert.match(html, /<\/html>$/);
  });
});

const pulse = (over: Partial<DigestPulse> = {}): DigestPulse => ({
  last24h: {raised: 7, resolved: 3, escalated: 2},
  week: {raised: 30, raisedPrev: 20, resolved: 22, onTime: 15, withTarget: 20, medianHours: 18.4},
  aging: {under1d: 3, d1to3: 4, d3to7: 2, over7d: 2},
  priorities: {critical: 1, high: 3, medium: 5, low: 2},
  categories: [{category: 'Repair and Maintenance', open: 6, overdue: 3}],
  rising: [{theme: 'Repair and Maintenance · AC and HVAC Issues', now: 6, before: 2}],
  oldest: row({ticketNumber: 'P57-00001', createdAt: new Date('2026-09-20T02:30:00.000Z')}),
  recurring: [{subject: 'Bike 6', note: '3 faults on 3 separate days — this unit is not staying fixed.', open: 1}],
  ...over,
});

describe('digest insights', () => {
  const rich = digest({
    pulse: pulse(),
    byStudio: [{studio: 'Kwality House, Kemps Corner', open: 9, overdue: 4}, {studio: 'Supreme HQ, Bandra', open: 3, overdue: 1}],
    byOwner: [{owner: 'Anita Rao', open: 7, overdue: 4}],
  });
  const insights = digestInsights(rich, now);
  it('says which way the backlog moved, with the numbers', () => {
    assert.ok(insights.some(i => i.includes('backlog grew by 4') && i.includes('7 raised, 3 resolved')), insights.join(' | '));
  });
  it('names the studio holding most of the overdue work', () => {
    assert.ok(insights.some(i => i.startsWith('Kwality House, Kemps Corner holds 4 of the 5 overdue')), insights.join(' | '));
  });
  it('reports the on-time rate and typical resolution time', () => {
    assert.ok(insights.some(i => i.startsWith('75% of tickets resolved this week met their follow-up target') && i.includes('18h')), insights.join(' | '));
  });
  it('calls out the oldest open ticket', () => {
    // A board with less going on, so the six-item cap does not crowd this line out.
    const calm = digestInsights(digest({pulse: pulse({rising: [], recurring: []})}), now);
    assert.ok(calm.some(i => i.includes('P57-00001 at 13 days')), calm.join(' | '));
  });
  it('never says more than six things', () => {
    assert.ok(insights.length <= 6);
  });
  it('renders the analysis sections when the pulse is present', () => {
    const {html, text} = digestEmail(rich, now, 'Jimmeey Gondaa');
    assert.match(html, /What stands out/);
    assert.match(html, /Last 24 hours/);
    assert.match(html, /Shape of the open board/);
    assert.match(html, /Patterns to fix at the source/);
    assert.match(html, /Good morning, Jimmeey\./);
    assert.match(text, /WHAT STANDS OUT/);
    assert.match(text, /Good morning, Jimmeey\./);
  });
  it('stays quiet on a quiet board', () => {
    const quiet = digestInsights(digest({pulse: pulse({last24h: {raised: 0, resolved: 0, escalated: 0}, week: {raised: 2, raisedPrev: 2, resolved: 1, onTime: 1, withTarget: 1, medianHours: 4}, aging: {under1d: 1, d1to3: 0, d3to7: 0, over7d: 0}, rising: [], recurring: []}), byStudio: [], byOwner: []}), now);
    assert.equal(quiet.length, 0, quiet.join(' | '));
  });
});

describe('ticketBcc', () => {
  const run = (value: string | undefined) => {
    const previous = process.env.TICKET_BCC_EMAILS;
    if (value === undefined) delete process.env.TICKET_BCC_EMAILS;
    else process.env.TICKET_BCC_EMAILS = value;
    try {
      return ticketBcc();
    } finally {
      if (previous === undefined) delete process.env.TICKET_BCC_EMAILS;
      else process.env.TICKET_BCC_EMAILS = previous;
    }
  };
  it('defaults to the workspace archive address', () => {
    assert.deepEqual(run(undefined), [{email: 'admin@physique57india.com'}]);
  });
  it('accepts a list, trimmed and lowercased', () => {
    assert.deepEqual(run('One@Example.com , two@example.com'), [
      {email: 'one@example.com'},
      {email: 'two@example.com'},
    ]);
  });
  it('switches off for a blank value rather than sending to nothing', () => {
    assert.deepEqual(run(' '), []);
  });
  it('drops anything that is not an address', () => {
    assert.deepEqual(run('not-an-address, ok@example.com'), [{email: 'ok@example.com'}]);
  });
});
