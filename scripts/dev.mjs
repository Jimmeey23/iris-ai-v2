/**
 * Dev launcher that never fails on a busy port.
 *
 * `next dev` already falls back to the next free port, but it then refuses to
 * start when another dev server holds the lock at `<distDir>/dev/lock` — which
 * is the case for any second instance of this app. That lock is an OS-level
 * file lock scoped to the dist directory, so we give every port its own dist
 * directory: port 3000 uses `.next`, port 3001 uses `.next-3001`, and so on.
 * Each instance then holds its own lock and they coexist happily.
 *
 * Usage: `npm run dev` — or pin a starting port with `PORT=4000 npm run dev`.
 * Extra flags are forwarded: `npm run dev -- --experimental-https`.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const BASE_PORT = Number(process.env.PORT) || 3000;
/** How many ports to try before giving up. */
const MAX_ATTEMPTS = 50;
const HOST = process.env.HOSTNAME || '0.0.0.0';

/** Resolve true only if nothing is already bound to this port. */
function isFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, HOST);
  });
}

async function findPort() {
  for (let port = BASE_PORT; port < BASE_PORT + MAX_ATTEMPTS; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`No free port found between ${BASE_PORT} and ${BASE_PORT + MAX_ATTEMPTS - 1}.`);
}

const port = await findPort();
// Keep the canonical `.next` for the default port so the usual caches and
// tooling paths stay untouched; only extra instances get a suffixed directory.
const distDir = port === BASE_PORT && BASE_PORT === 3000 ? '.next' : `.next-${port}`;

if (port !== BASE_PORT) {
  console.log(`Port ${BASE_PORT} is busy — starting on ${port} (dist dir: ${distDir}).`);
}

const child = spawn(
  process.execPath,
  [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'dev', '-p', String(port), ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=4096',
      NEXT_DIST_DIR: distDir,
      PORT: String(port),
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
