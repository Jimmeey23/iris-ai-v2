import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {queryKey, shortCache} from '../../src/lib/short-cache';

describe('Short-lived aggregate cache', () => {
  it('reuses a value inside the window and shares one computation', async () => {
    let runs = 0;
    const compute = async () => { runs++; return runs; };
    const [a, b] = await Promise.all([shortCache('t:1', 60_000, compute), shortCache('t:1', 60_000, compute)]);
    assert.equal(a, 1); assert.equal(b, 1); assert.equal(runs, 1);
  });
  it('recomputes when asked for fresh figures', async () => {
    let runs = 0;
    const compute = async () => ++runs;
    await shortCache('t:2', 60_000, compute);
    assert.equal(await shortCache('t:2', 60_000, compute, {fresh: true}), 2);
  });
  it('does not remember a failure', async () => {
    await assert.rejects(shortCache('t:3', 60_000, async () => { throw new Error('db down'); }));
    assert.equal(await shortCache('t:3', 60_000, async () => 'ok'), 'ok');
  });
  it('keys a query string the same whatever the order, ignoring fresh', () => {
    assert.equal(queryKey(new URLSearchParams('b=2&a=1&fresh=1')), queryKey(new URLSearchParams('a=1&b=2')));
  });
});
