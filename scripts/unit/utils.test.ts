/**
 * The small pure helpers every screen leans on.
 *
 * These had no coverage of any kind: `check:dashboard` exercises lib/metrics through the
 * board's aggregates, but nothing asserted the formatting and SLA-state helpers that sit in
 * front of them — and `slugify` / `ticketNumberFor` are load-bearing (a ticket number is what
 * a member is told on the phone, and a slug ends up in a template id).
 *
 * node:test rather than this repo's PASS/FAIL convention, because these are unit assertions
 * with no database, no server and no fixtures to narrate. The bespoke `check:*` scripts
 * remain the right shape for the integration passes.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {cn, initials, hoursFromNow, relativeTime, slaState, slugify, ticketNumberFor, unique} from '../../src/lib/utils';
import {maskMemberName} from '../../src/lib/tickets';

describe('cn', () => {
  it('drops falsy branches so a conditional class never renders "false"', () => {
    assert.equal(cn('a', false, null, undefined, 'b'), 'a b');
  });
  it('is empty rather than " " when everything is off', () => {
    assert.equal(cn(false, null), '');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    assert.equal(slugify('Kwality House, Kemps Corner'), 'kwality-house-kemps-corner');
  });
  it('leaves no leading or trailing hyphen', () => {
    assert.equal(slugify('  Audio / Issues!  '), 'audio-issues');
  });
  it('collapses a run of separators into one', () => {
    assert.equal(slugify('bike___6 -- fault'), 'bike-6-fault');
  });
  it('returns empty for a string with nothing sluggable in it', () => {
    assert.equal(slugify('!!!'), '');
  });
});

describe('ticketNumberFor', () => {
  it('pads to five digits', () => {
    assert.equal(ticketNumberFor(7), 'P57-00007');
  });
  it('does not truncate an id past five digits', () => {
    assert.equal(ticketNumberFor(123456), 'P57-123456');
  });
});

describe('initials', () => {
  it('takes the first two words', () => {
    assert.equal(initials('Priya Mehta Sharma'), 'PM');
  });
  it('handles a single name', () => {
    assert.equal(initials('Priya'), 'P');
  });
  it('is empty for an empty name rather than throwing', () => {
    assert.equal(initials('   '), '');
  });
});

describe('maskMemberName', () => {
  it('keeps the first name and initialises the last', () => {
    assert.equal(maskMemberName('Priya Mehta'), 'Priya M.');
  });
  it('uses the last word, not the second', () => {
    assert.equal(maskMemberName('Priya Mehta Sharma'), 'Priya S.');
  });
  it('leaves a single name alone — there is nothing to mask', () => {
    assert.equal(maskMemberName('Priya'), 'Priya');
  });
  it('falls back to "Member" rather than an empty label', () => {
    assert.equal(maskMemberName('   '), 'Member');
    assert.equal(maskMemberName(''), 'Member');
  });
});

describe('relativeTime', () => {
  const ago = (ms: number) => new Date(Date.now() - ms);
  it('reads "just now" under a minute, and for a missing value', () => {
    assert.equal(relativeTime(ago(30_000)), 'just now');
    assert.equal(relativeTime(null), 'just now');
  });
  it('steps through minutes, hours and days', () => {
    assert.equal(relativeTime(ago(5 * 60_000)), '5m ago');
    assert.equal(relativeTime(ago(3 * 3_600_000)), '3h ago');
    assert.equal(relativeTime(ago(2 * 86_400_000)), '2d ago');
  });
  it('never claims more elapsed time than has passed', () => {
    assert.equal(relativeTime(ago(90_000)), '1m ago');
    assert.equal(relativeTime(ago(45 * 60_000)), '45m ago');
    assert.equal(relativeTime(ago(23 * 3_600_000)), '23h ago');
    assert.equal(relativeTime(ago(36 * 3_600_000)), '1d ago');
  });
  it('is "just now" rather than NaN for an unparseable value', () => {
    assert.equal(relativeTime('not a date'), 'just now');
  });
  it('accepts an ISO string as well as a Date', () => {
    assert.equal(relativeTime(ago(5 * 60_000).toISOString()), '5m ago');
  });
});

describe('hoursFromNow', () => {
  it('is the given number of hours ahead', () => {
    const delta = hoursFromNow(3).getTime() - Date.now();
    assert.ok(Math.abs(delta - 3 * 3_600_000) < 1_000, String(delta));
  });
});

describe('slaState', () => {
  const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const agoHours = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  it('is ok with no due date at all', () => {
    assert.equal(slaState(null, 'open'), 'ok');
  });
  it('is ok for a ticket that is already settled, however late it was', () => {
    for (const status of ['resolved', 'closed', 'recorded'])
      assert.equal(slaState(agoHours(100), status, agoHours(200)), 'ok');
  });
  it('is breached once an open ticket is past its target', () => {
    assert.equal(slaState(agoHours(1), 'open', agoHours(25)), 'breached');
  });
  it('is ok early in the window and not ok at the end of it', () => {
    assert.equal(slaState(inHours(23), 'open', agoHours(1)), 'ok');
    assert.notEqual(slaState(inHours(1), 'open', agoHours(23)), 'ok');
  });
  it('does not throw on an unparseable date', () => {
    assert.doesNotThrow(() => slaState('not a date', 'open', 'also not a date'));
  });
});

describe('unique', () => {
  it('keeps first-seen order', () => {
    assert.deepEqual(unique(['b', 'a', 'b', 'c']), ['b', 'a', 'c']);
  });
});
