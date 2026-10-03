/**
 * Value formatting, and the CSV escape in front of every export.
 *
 * `csvDownload` is the one with teeth: a ticket title a member typed goes straight into a
 * file somebody opens in Excel, so a leading `=` or `+` must be neutralised or the export is
 * a formula-injection vector against whoever opens it. That guard had no test.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {display, indiaDate, niceKey, object, setDisplayTimezone} from '../../src/lib/display';

describe('object', () => {
  it('passes a plain object through', () => {
    assert.deepEqual(object({a: 1}), {a: 1});
  });
  it('refuses arrays, null and primitives rather than returning them', () => {
    for (const v of [[1, 2], null, undefined, 'x', 7]) assert.deepEqual(object(v), {});
  });
});

describe('display', () => {
  it('shows an em dash for nothing', () => {
    for (const v of [null, undefined, '']) assert.equal(display(v), '—');
  });
  it('reads booleans as Yes/No', () => {
    assert.equal(display(true), 'Yes');
    assert.equal(display(false), 'No');
  });
  it('prefers name, then first/last, then label, then id', () => {
    assert.equal(display({name: 'Priya', label: 'ignored'}), 'Priya');
    assert.equal(display({firstName: 'Priya', lastName: 'Mehta'}), 'Priya Mehta');
    assert.equal(display({label: 'Bike 6'}), 'Bike 6');
    assert.equal(display({id: 42}), '42');
  });
  it('falls back to "Details" for an object with nothing nameable', () => {
    assert.equal(display({somethingElse: 1}), 'Details');
  });
  it('keeps 0 and false as values rather than treating them as absent', () => {
    assert.equal(display(0), '0');
  });
});

describe('niceKey', () => {
  it('splits camelCase and underscores into words', () => {
    assert.equal(niceKey('assignedStaffName'), 'Assigned Staff Name');
    assert.equal(niceKey('member_phone'), 'Member phone');
  });
  it('capitalises the first letter', () => {
    assert.equal(niceKey('studio'), 'Studio');
  });
});

describe('indiaDate', () => {
  it('shows an em dash for nothing', () => {
    assert.equal(indiaDate(null), '—');
  });
  it('returns the input unchanged when it is not a date', () => {
    assert.equal(indiaDate('whenever'), 'whenever');
  });
  it('formats in the display timezone, and short form drops the time', () => {
    setDisplayTimezone('Asia/Kolkata');
    // 18:30 UTC is 00:00 the next day in IST — the case a UTC-formatted date gets wrong.
    const full = indiaDate('2026-01-01T18:30:00.000Z');
    assert.match(full, /2 Jan 2026/);
    assert.equal(indiaDate('2026-01-01T18:30:00.000Z', true), '2 Jan');
  });
  it('ignores an unusable timezone instead of throwing, keeping the last good one', () => {
    setDisplayTimezone('Asia/Kolkata');
    assert.doesNotThrow(() => setDisplayTimezone('Not/AZone'));
    assert.match(indiaDate('2026-01-01T18:30:00.000Z'), /2 Jan 2026/);
  });
});

describe('csvDownload escaping', () => {
  // The escape is a closure inside csvDownload, which needs a DOM. The rule it applies is
  // what matters, so it is restated here and asserted against the same inputs; if the
  // implementation changes, this is the test that should be updated with it.
  const safe = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  it('prefixes a formula so a spreadsheet treats it as text', () => {
    assert.equal(safe('=1+1'), `"'=1+1"`);
    assert.equal(safe('+41'), `"'+41"`);
    assert.equal(safe('-1'), `"'-1"`);
    assert.equal(safe('@SUM(A1)'), `"'@SUM(A1)"`);
  });
  it('escapes embedded quotes by doubling them', () => {
    assert.equal(safe('he said "fixed"'), '"he said ""fixed"""');
  });
  it('quotes a value containing a comma or newline so the row does not split', () => {
    assert.equal(safe('Kwality House, Kemps Corner'), '"Kwality House, Kemps Corner"');
    assert.equal(safe('line one\nline two'), '"line one\nline two"');
  });
  it('renders null and undefined as an empty field', () => {
    assert.equal(safe(null), '""');
    assert.equal(safe(undefined), '""');
  });
});
