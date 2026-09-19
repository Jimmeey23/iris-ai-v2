/**
 * Workspace config for the replay: no ChatGPT credential, so the deterministic branch of
 * the Iris flow runs and every question is the scripted one. Momence is reported as
 * configured so the session-lookup branch — which is gated on it — is exercised.
 */
import {DEFAULT_CONFIG, configSchema} from '@/lib/settings-contract';

export {DEFAULT_CONFIG, configSchema};
export type {WorkspaceConfig} from '@/lib/settings-contract';

export async function getConfig() { return configSchema.parse({...DEFAULT_CONFIG}); }

export async function credentials(id: string) {
  if (id === 'chatgpt') return {_enabled: 'false'} as Record<string, string>;
  if (id === 'momence') return {_enabled: 'true', access_token: 'test-token'} as Record<string, string>;
  return {} as Record<string, string>;
}

export async function getSetting() { return undefined; }
export async function audit() {}
