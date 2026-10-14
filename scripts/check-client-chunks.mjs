import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const dist = process.env.NEXT_DIST_DIR || '.next';
const hooks = ['useSettingsPageController', 'useTicketComposerController', 'useTicketDialogController', 'useIrisChatController'];
const chunks = readdirSync(join(dist, 'static/chunks')).filter((file) => file.endsWith('.js'));
const compiled = chunks.map((file) => readFileSync(join(dist, 'static/chunks', file), 'utf8'));
for (const hook of hooks) assert.ok(compiled.some((code) => code.includes(hook)), `${hook} missing from built client chunks`);
for (const route of ['dashboard', 'settings', 'templates']) {
  const html = readFileSync(join(dist, 'server/app', route + '.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]+src="\/_next\/([^"?]+\.js)/g)].map((match) => match[1]);
  assert.ok(scripts.length, `${route} has no initial scripts to inspect`);
  for (const script of scripts) {
    const code = readFileSync(join(dist, script), 'utf8');
    for (const hook of hooks) assert.ok(!code.includes(hook), `${route} eagerly includes ${hook} in ${script}`);
  }
  console.log(`${route}: heavy feature controllers deferred (${scripts.length} initial scripts checked)`);
}
