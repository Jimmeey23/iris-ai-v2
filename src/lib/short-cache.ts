/**
 * A minute-long memory for expensive read-only aggregates (the Trend dashboard and its
 * drill-downs), held in the function instance that computed them.
 *
 * Fluid compute keeps an instance warm across requests, so somebody reloading the same view,
 * switching back to a filter they just used, or two managers opening the dashboard together
 * are served from here instead of another round of grouped queries. Concurrent requests for
 * the same key share one computation. A cold instance simply computes — nothing depends on a
 * hit — and the Refresh button bypasses it.
 *
 * Keys must carry everything that changes the answer, the caller's identity included: the
 * figures are scoped to what that person may see.
 */
type Entry<T> = {at: number; value: Promise<T>};
const store = new Map<string, Entry<unknown>>();
const MAX_ENTRIES = 200;

export async function shortCache<T>(key: string, ttlMs: number, compute: () => Promise<T>, opts: {fresh?: boolean} = {}): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && !opts.fresh && now - hit.at < ttlMs) return hit.value;
  const value = compute();
  store.set(key, {at: now, value});
  // A failure is not remembered: the next request tries again.
  value.catch(() => { if (store.get(key)?.value === value) store.delete(key); });
  if (store.size > MAX_ENTRIES) {
    for (const [k, e] of store) if (now - e.at >= ttlMs || store.size > MAX_ENTRIES) store.delete(k); else break;
  }
  return value;
}

/** A stable key from a request's query string: sorted, without the cache-busting flag. */
export function queryKey(params: URLSearchParams) {
  return [...params.entries()].filter(([k]) => k !== 'fresh').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
}
