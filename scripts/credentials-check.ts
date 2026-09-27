/**
 * Integration credential precedence: what an administrator saved in Settings wins,
 * and the environment is the fallback for anything they have not filled in.
 *
 * Pure merge logic only — nothing here reads the database or decrypts anything.
 */
process.env.DATABASE_URL ||= 'postgres://check:check@127.0.0.1:5432/check';

import {ENV_FIRST_INTEGRATIONS, envCredentials, envPrefix, mergeCredentials} from '../src/lib/config';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '   got: ' + JSON.stringify(detail)); }
};
const section = (t: string) => console.log('\n' + t);

section('Environment prefixes');
check('an id maps to its upper-case prefix', envPrefix('mailtrap') === 'MAILTRAP', envPrefix('mailtrap'));
check('hyphens become underscores', envPrefix('google-sheets') === 'GOOGLE_SHEETS', envPrefix('google-sheets'));
check('chatgpt reads the conventional OPENAI names', envPrefix('chatgpt') === 'OPENAI', envPrefix('chatgpt'));

const env = {
  MAILTRAP_API_KEY: 'env-token',
  MAILTRAP_FROM_EMAIL: 'env@example.com',
  MAILTRAP_SMTP_HOST: 'live.smtp.mailtrap.io',
  N8N_WEBHOOK_URL: 'https://env.example/webhook',
  UNRELATED_KEY: 'ignored',
};

section('Reading the environment');
const mailtrapEnv = envCredentials('mailtrap', env);
check('strips the prefix and lower-cases the key', mailtrapEnv.api_key === 'env-token', mailtrapEnv);
check('keeps multi-word keys intact', mailtrapEnv.smtp_host === 'live.smtp.mailtrap.io', mailtrapEnv.smtp_host);
check('ignores other integrations', !('webhook_url' in mailtrapEnv), mailtrapEnv);
check('ignores unrelated variables', !Object.values(mailtrapEnv).includes('ignored'), mailtrapEnv);
check('an integration with nothing in the environment reads empty',
  Object.keys(envCredentials('trello', env)).length === 0, envCredentials('trello', env));

section('Precedence');
check('a saved value beats the environment',
  mergeCredentials({api_key: 'saved-token'}, mailtrapEnv).api_key === 'saved-token',
  mergeCredentials({api_key: 'saved-token'}, mailtrapEnv).api_key);
check('the environment fills a field that was never saved',
  mergeCredentials({api_key: 'saved-token'}, mailtrapEnv).from_email === 'env@example.com');
check('with nothing saved, the environment supplies everything',
  mergeCredentials({}, mailtrapEnv).api_key === 'env-token');
check('with nothing in the environment, saved values stand alone',
  mergeCredentials({api_key: 'saved-token'}, {}).api_key === 'saved-token');

section('Blank fields fall back rather than blanking');
check('an empty saved field falls back to the environment',
  mergeCredentials({api_key: ''}, mailtrapEnv).api_key === 'env-token',
  mergeCredentials({api_key: ''}, mailtrapEnv).api_key);
check('a whitespace-only saved field falls back too',
  mergeCredentials({api_key: '   '}, mailtrapEnv).api_key === 'env-token');
check('a blank field with no environment value stays absent',
  mergeCredentials({api_key: ''}, {}).api_key === undefined,
  mergeCredentials({api_key: ''}, {}).api_key);
check('a non-string saved value is ignored',
  mergeCredentials({api_key: 42 as unknown as string}, mailtrapEnv).api_key === 'env-token');

section('Momence: the environment wins');
const momenceEnv = {username: 'env-user', password: 'env-pass', username_blr: 'env-blr'};
check('only momence is env-first',
  [...ENV_FIRST_INTEGRATIONS].join(',') === 'momence', [...ENV_FIRST_INTEGRATIONS]);
check('the environment overrides a saved value',
  mergeCredentials({username: 'ui-user'}, momenceEnv, true, true).username === 'env-user',
  mergeCredentials({username: 'ui-user'}, momenceEnv, true, true).username);
check('a saved field the environment does not set still applies',
  mergeCredentials({client_id: 'ui-client'}, momenceEnv, true, true).client_id === 'ui-client');
check('the separate BLR credentials come through the same prefix',
  envCredentials('momence', {MOMENCE_USERNAME_BLR: 'blr-user'}).username_blr === 'blr-user',
  envCredentials('momence', {MOMENCE_USERNAME_BLR: 'blr-user'}));
check('every other integration stays settings-first',
  mergeCredentials({api_key: 'saved-token'}, mailtrapEnv, true, false).api_key === 'saved-token');

section('The enabled flag');
check('comes from the database row', mergeCredentials({}, mailtrapEnv, false)._enabled === 'false');
check('an enabled row reads true', mergeCredentials({}, mailtrapEnv, true)._enabled === 'true');
check('an integration with no row defaults to enabled', mergeCredentials({}, mailtrapEnv)._enabled === 'true');
check('the environment cannot forge the flag',
  mergeCredentials({}, {...mailtrapEnv, _enabled: 'true'}, false)._enabled === 'false',
  mergeCredentials({}, {...mailtrapEnv, _enabled: 'true'}, false)._enabled);
check('an env-first integration cannot forge the flag either',
  mergeCredentials({}, {_enabled: 'true'}, false, true)._enabled === 'false');
check('a saved field cannot forge the flag',
  mergeCredentials({_enabled: 'true'}, mailtrapEnv, false)._enabled === 'false');

section('Fallback only for credential failures');
// Imported lazily: integrations.ts pulls in the database module graph.
const {CREDENTIAL_FAILURE} = require('../src/lib/integrations') as {CREDENTIAL_FAILURE: RegExp};
const retries = (m: string) => CREDENTIAL_FAILURE.test(m);
for (const m of [
  'Provider returned 401. Check credentials, permissions and payload.',
  'Provider returned 403: forbidden',
  'Provider returned 400: invalid api key',
  'Verified sender email is required.',
  'Google token refresh failed. Check OAuth credentials and granted scopes.',
  'Unauthorized',
]) check(`retries on: ${m.slice(0, 44)}`, retries(m), m);
for (const m of [
  'Provider returned 502. Check credentials, permissions and payload.',
  'Provider returned 500',
  'The operation was aborted due to timeout',
  'fetch failed',
  'Integration disabled. Enable it before retrying.',
  'Provider returned 429',
]) check(`does NOT retry on: ${m.slice(0, 40)}`, !retries(m), m);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
