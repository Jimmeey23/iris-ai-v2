/**
 * The realtime signal is only useful if every ticket write sends it, and only safe if it
 * carries nothing.
 *
 * Both are properties of the source rather than of a running request, so they are asserted
 * against the files: a new mutating handler added to a ticket route is the exact mistake that
 * would leave teammates on a stale board with nobody noticing, because everything still
 * works — just a poll interval late.
 */
import {strict as assert} from 'node:assert';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it} from 'node:test';
import {REALTIME_EVENT, REALTIME_TOPIC} from '../../src/lib/realtime';

const ROOT = join(import.meta.dirname, '..', '..');
const TICKET_API = join(ROOT, 'src/app/api/tickets');
const MUTATING = ['POST', 'PATCH', 'PUT', 'DELETE'];

function routeFiles(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

/** Splits a route file into one chunk per exported handler. */
function handlers(source: string) {
  const parts = source.split(/^export async function (GET|POST|PATCH|PUT|DELETE)\b/m);
  const out: {method: string; body: string}[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push({method: parts[i], body: parts[i + 1]});
  return out;
}

describe('every mutating ticket route signals', () => {
  const files = routeFiles(TICKET_API);
  it('finds the ticket routes at all — a moved directory must fail loudly, not silently pass', () => {
    assert.ok(files.length >= 8, `only found ${files.length} route files under ${TICKET_API}`);
  });
  for (const file of files) {
    const relative = file.slice(ROOT.length + 1);
    const source = readFileSync(file, 'utf8');
    for (const handler of handlers(source)) {
      if (!MUTATING.includes(handler.method)) continue;
      it(`${relative} · ${handler.method}`, () => {
        assert.match(
          handler.body,
          /signalChanged\(/,
          `${handler.method} in ${relative} changes a ticket but never calls signalChanged. ` +
            `Add after(() => signalChanged('tickets')) beside its success response.`,
        );
      });
    }
  }
  it('attachment downloads and reads do not signal — a GET changes nothing', () => {
    for (const file of files)
      for (const handler of handlers(readFileSync(file, 'utf8')))
        if (handler.method === 'GET')
          assert.doesNotMatch(
            handler.body,
            /signalChanged\(/,
            `GET in ${file.slice(ROOT.length + 1)} signals a change it did not make.`,
          );
  });
});

describe('the broadcast carries no ticket data', () => {
  const source = readFileSync(join(ROOT, 'src/lib/realtime.ts'), 'utf8');
  it('sends only the kind and a timestamp', () => {
    const payload = /payload:\s*signal/.test(source);
    assert.ok(payload, 'the broadcast payload should be the `signal` object and nothing else');
    assert.match(source, /type Signal = \{kind: SignalKind; at: string\}/);
  });
  it('keeps the service-role key server-side: the client only ever subscribes', () => {
    const client = readFileSync(join(ROOT, 'src/components/live-signal.tsx'), 'utf8');
    assert.doesNotMatch(client, /SERVICE_ROLE|supabaseServiceRoleKey/);
    assert.match(client, new RegExp(`REALTIME_TOPIC|${REALTIME_TOPIC}`));
    assert.match(client, new RegExp(`REALTIME_EVENT|${REALTIME_EVENT}`));
  });
  it('re-fetches through the API rather than trusting the message', () => {
    const client = readFileSync(join(ROOT, 'src/components/live-signal.tsx'), 'utf8');
    // The only thing a broadcast may do is dispatch the window event the surfaces already
    // reload on. If this ever sets state from `payload`, the access rules stop applying.
    assert.match(client, /dispatchEvent\(new Event\(name\)\)/);
  });
});
