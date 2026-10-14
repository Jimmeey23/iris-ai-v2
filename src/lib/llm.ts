/**
 * One place that talks to a language model, with Claude Haiku as the backup for OpenAI.
 *
 * OpenAI stays the primary. When it cannot serve a request — the account is out of credits, the
 * key was revoked, it is rate-limited, down or timing out — the same request goes to Claude
 * instead, so intake classification, drafting, the trend briefing and Iris's chat keep working
 * rather than silently degrading to the keyword and rule fallbacks.
 *
 * Rules that keep it safe to leave on:
 *  - **Only errors that another provider could fix trigger it.** A 400 is our bug and would fail
 *    on Claude too; those are thrown, not retried elsewhere.
 *  - **Credits do not come back on their own, so neither do retries.** After a quota or auth
 *    failure OpenAI is skipped for five minutes (one minute for a rate limit or outage), so a
 *    drained account costs one slow request, not one per ticket.
 *  - **Opt-out.** Settings → Iris intelligence has a switch. With it off, or no Anthropic key,
 *    behaviour is exactly what it was.
 *  - **Only what OpenAI alone can do stays on OpenAI**: speech, transcription and image
 *    generation have no Claude equivalent here.
 */
import OpenAI from 'openai';

export type Provider = 'openai' | 'anthropic';
export type FallbackReason = 'quota' | 'auth' | 'rate-limit' | 'outage' | 'timeout';
export type LlmResult = {text: string; provider: Provider; model: string; fellBack: boolean; reason?: FallbackReason};

export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* ---------------------------------------------------------------------------------------- *
 * Deciding when to fall back
 * ---------------------------------------------------------------------------------------- */

type ErrLike = {status?: number; code?: string | null; type?: string | null; name?: string; message?: string; error?: {code?: string; type?: string; message?: string}};

/** Whether `err` is one a different provider could get past, and why. Pure. */
export function fallbackDecision(err: unknown): {fallback: boolean; reason?: FallbackReason} {
  const e = (err && typeof err === 'object' ? err : {}) as ErrLike;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const code = String(e.code ?? e.error?.code ?? e.type ?? e.error?.type ?? '').toLowerCase();
  const text = `${e.message ?? ''} ${e.error?.message ?? ''}`.toLowerCase();
  // OpenAI reports an empty balance as 429 `insufficient_quota`, which looks like a rate limit
  // but will not clear by waiting; Anthropic's equivalent is a 400 about the credit balance.
  if (code.includes('insufficient_quota') || code.includes('billing') || /exceeded your current quota|insufficient[_ ]quota|credit balance|billing|out of credits|hard limit/.test(text)) return {fallback: true, reason: 'quota'};
  if (status === 401 || status === 403 || status === 402) return {fallback: true, reason: 'auth'};
  if (status === 429) return {fallback: true, reason: 'rate-limit'};
  if (status !== undefined && status >= 500) return {fallback: true, reason: 'outage'};
  if (/timeout|timed out|abort/.test(`${e.name ?? ''} ${text}`)) return {fallback: true, reason: 'timeout'};
  if (status === undefined && /connection|fetch failed|econnreset|enotfound|econnrefused|socket/.test(`${e.name ?? ''} ${text}`)) return {fallback: true, reason: 'outage'};
  return {fallback: false};
}

/** How long OpenAI is skipped after failing for `reason`. */
export const BREAKER_MS: Record<FallbackReason, number> = {quota: 5 * 60_000, auth: 5 * 60_000, 'rate-limit': 60_000, outage: 60_000, timeout: 30_000};

let openaiDownUntil = 0;
let lastFallback: {at: number; reason: FallbackReason} | null = null;

export function noteOpenAIFailure(reason: FallbackReason, now = Date.now()) {
  openaiDownUntil = now + BREAKER_MS[reason];
  lastFallback = {at: now, reason};
}
export const openAIAvoided = (now = Date.now()) => now < openaiDownUntil;
/** For tests and the health endpoint. */
export const fallbackState = () => ({avoidingOpenAI: openAIAvoided(), lastFallback});
export function resetFallbackState() { openaiDownUntil = 0; lastFallback = null; }

/* ---------------------------------------------------------------------------------------- *
 * What is configured
 * ---------------------------------------------------------------------------------------- */

export type Providers = {openai?: {key: string; model: string}; anthropic?: {key: string; model: string}; fallbackEnabled: boolean};

/** The connected providers, as saved in Integrations or supplied by the deployment. */
export async function providers(): Promise<Providers> {
  const {credentials, getConfig} = await import('./config');
  const [cfg, oa, an] = await Promise.all([getConfig(), credentials('chatgpt'), credentials('anthropic')]);
  const usable = (c: Record<string, string>) => c.api_key && c._enabled !== 'false' ? c.api_key : undefined;
  const openaiKey = cfg.aiEnabled ? usable(oa) : undefined;
  const anthropicKey = cfg.aiEnabled ? usable(an) : undefined;
  return {
    openai: openaiKey ? {key: openaiKey, model: cfg.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini'} : undefined,
    anthropic: anthropicKey ? {key: anthropicKey, model: an.model || DEFAULT_CLAUDE_MODEL} : undefined,
    fallbackEnabled: cfg.aiFallback !== false,
  };
}

/** Whether Claude may answer a request now: connected, and either allowed as a fallback or the only model. */
export async function claudeReady(): Promise<boolean> {
  const p = await providers();
  return Boolean(p.anthropic && (p.fallbackEnabled || !p.openai));
}

/** Whether any model can be asked. With OpenAI absent, a connected Claude is used on its own. */
export const anyProvider = (p: Providers) => Boolean(p.openai || p.anthropic);

/** The order to try providers in: OpenAI first unless it is being avoided, and Claude after it
 *  only when fallback is on — or on its own when OpenAI is not connected at all. */
export function providerOrder(p: Providers, avoidOpenAI = openAIAvoided()): Provider[] {
  const order: Provider[] = [];
  const claude = p.anthropic && (p.fallbackEnabled || !p.openai);
  if (p.openai && !(avoidOpenAI && claude)) order.push('openai');
  if (claude) order.push('anthropic');
  return order;
}

/* ---------------------------------------------------------------------------------------- *
 * Anthropic
 * ---------------------------------------------------------------------------------------- */

export class AnthropicError extends Error {
  constructor(message: string, public status?: number, public code?: string) { super(message); this.name = 'AnthropicError'; }
}

type ClaudeBlock = {type: 'text'; text: string} | {type: 'tool_use'; id: string; name: string; input: unknown} | {type: 'tool_result'; tool_use_id: string; content: string};
export type ClaudeMessage = {role: 'user' | 'assistant'; content: string | ClaudeBlock[]};
export type ClaudeTool = {name: string; description?: string; input_schema: Record<string, unknown>};

async function claudeCall(a: {key: string; model: string; system?: string; messages: ClaudeMessage[]; tools?: ClaudeTool[]; maxTokens: number; temperature?: number; timeoutMs: number}) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {'x-api-key': a.key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json'},
    body: JSON.stringify({model: a.model, max_tokens: a.maxTokens, ...(a.system ? {system: a.system} : {}), messages: a.messages, ...(a.temperature !== undefined ? {temperature: a.temperature} : {}), ...(a.tools?.length ? {tools: a.tools} : {})}),
    signal: AbortSignal.timeout(a.timeoutMs),
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({})) as {content?: ClaudeBlock[]; error?: {type?: string; message?: string}};
  if (!res.ok) throw new AnthropicError(body.error?.message || `Anthropic returned ${res.status}`, res.status, body.error?.type);
  return body.content ?? [];
}

/** The JSON object inside a model's reply, tolerating code fences and a sentence of preamble. */
export function extractJson(text: string): string {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

/** A one-token request that proves the key and model work, for the Integrations "Test" button. */
export async function anthropicPing(key: string, model = DEFAULT_CLAUDE_MODEL) {
  await claudeCall({key, model, messages: [{role: 'user', content: 'ping'}], maxTokens: 8, timeoutMs: 15000});
  return {authenticated: true, model, message: `Claude (${model}) answered. It will be used when OpenAI is unavailable.`};
}

/* ---------------------------------------------------------------------------------------- *
 * JSON completions: classify, draft, briefing
 * ---------------------------------------------------------------------------------------- */

export type JsonRequest = {system: string; user: string; maxTokens?: number; temperature?: number; timeoutMs?: number};

async function viaOpenAI(p: NonNullable<Providers['openai']>, r: JsonRequest) {
  const client = new OpenAI({apiKey: p.key, timeout: r.timeoutMs ?? 15000, maxRetries: 0});
  const res = await client.chat.completions.create({
    model: p.model, temperature: r.temperature ?? 0, response_format: {type: 'json_object'}, max_completion_tokens: r.maxTokens ?? 800,
    messages: [{role: 'system', content: r.system}, {role: 'user', content: r.user}],
  });
  return res.choices[0]?.message?.content || '{}';
}

async function viaClaude(p: NonNullable<Providers['anthropic']>, r: JsonRequest) {
  const blocks = await claudeCall({
    key: p.key, model: p.model, maxTokens: r.maxTokens ?? 800, temperature: r.temperature ?? 0, timeoutMs: r.timeoutMs ?? 15000,
    system: `${r.system}\n\nRespond with one JSON object and nothing else: no prose before or after, no code fences.`,
    messages: [{role: 'user', content: r.user}],
  });
  return extractJson(blocks.filter((b): b is {type: 'text'; text: string} => b.type === 'text').map(b => b.text).join(''));
}

/**
 * A JSON completion from the first provider that can serve it. Returns null when no model is
 * connected (callers keep their own non-AI path); throws only if every provider tried failed.
 */
export async function llmJson(r: JsonRequest): Promise<LlmResult | null> {
  const p = await providers();
  const order = providerOrder(p);
  if (!order.length) return null;
  let failure: unknown;
  let reason: FallbackReason | undefined;
  for (const provider of order) {
    try {
      if (provider === 'openai') return {text: await viaOpenAI(p.openai!, r), provider, model: p.openai!.model, fellBack: false};
      return {text: await viaClaude(p.anthropic!, r), provider, model: p.anthropic!.model, fellBack: Boolean(p.openai), reason};
    } catch (err) {
      failure = err;
      const d = fallbackDecision(err);
      if (provider === 'openai') {
        if (!d.fallback || !p.anthropic || !(p.fallbackEnabled)) throw err;
        reason = d.reason;
        noteOpenAIFailure(d.reason!);
        console.warn(JSON.stringify({level: 'warn', source: 'llm.fallback', from: 'openai', to: 'anthropic', reason: d.reason}));
      }
    }
  }
  throw failure;
}

/* ---------------------------------------------------------------------------------------- *
 * Tool-using chat: Iris
 * ---------------------------------------------------------------------------------------- */

type OaMessage = {role: string; content?: unknown; tool_calls?: {id: string; type?: string; function?: {name: string; arguments: string}}[]; tool_call_id?: string};
export type OaTool = {type: 'function'; function: {name: string; description?: string; parameters?: Record<string, unknown>}};
export type ToolCall = {id: string; type: 'function'; function: {name: string; arguments: string}};

const asText = (c: unknown) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (x && typeof x === 'object' && 'text' in x ? String((x as {text: unknown}).text) : '')).join('') : '');

/** An OpenAI chat transcript (system, user, assistant with tool calls, tool results) as Claude messages. Pure. */
export function toClaudeMessages(messages: OaMessage[]): {system: string; messages: ClaudeMessage[]} {
  const system = messages.filter(m => m.role === 'system').map(m => asText(m.content)).join('\n\n');
  const out: ClaudeMessage[] = [];
  const push = (role: 'user' | 'assistant', blocks: ClaudeBlock[]) => {
    const last = out[out.length - 1];
    // Claude wants strictly alternating turns; adjacent ones of a role are one turn.
    if (last && last.role === role) last.content = [...(typeof last.content === 'string' ? [{type: 'text' as const, text: last.content}] : last.content), ...blocks];
    else out.push({role, content: blocks});
  };
  for (const m of messages) {
    if (m.role === 'user') { const t = asText(m.content); if (t) push('user', [{type: 'text', text: t}]); }
    else if (m.role === 'assistant') {
      const blocks: ClaudeBlock[] = [];
      const t = asText(m.content);
      if (t) blocks.push({type: 'text', text: t});
      for (const tc of m.tool_calls ?? []) {
        let input: unknown = {};
        try { input = JSON.parse(tc.function?.arguments || '{}'); } catch { /* a malformed call is sent as empty */ }
        blocks.push({type: 'tool_use', id: tc.id, name: tc.function?.name ?? '', input});
      }
      if (blocks.length) push('assistant', blocks);
    } else if (m.role === 'tool' && m.tool_call_id) push('user', [{type: 'tool_result', tool_use_id: m.tool_call_id, content: asText(m.content)}]);
  }
  // A transcript must open with the user; history trimmed mid-conversation may not.
  if (out[0]?.role !== 'user') out.unshift({role: 'user', content: '(Earlier conversation omitted.)'});
  return {system, messages: out};
}

export const toClaudeTools = (tools: OaTool[]): ClaudeTool[] => tools.map(t => ({name: t.function.name, description: t.function.description, input_schema: t.function.parameters ?? {type: 'object', properties: {}}}));

/** One Iris pass on Claude, returned in the shape the OpenAI pass produces. */
export async function claudePass(a: {messages: OaMessage[]; tools?: OaTool[]; maxTokens?: number; timeoutMs?: number}): Promise<{content: string; toolCalls: ToolCall[]}> {
  const p = (await providers()).anthropic;
  if (!p) throw new AnthropicError('Claude is not connected.');
  const {system, messages} = toClaudeMessages(a.messages);
  const blocks = await claudeCall({
    key: p.key, model: p.model, maxTokens: a.maxTokens ?? 1200, temperature: 0.3, timeoutMs: a.timeoutMs ?? 25000, messages, tools: a.tools?.length ? toClaudeTools(a.tools) : undefined,
    system: `${system}\n\nWhen you are not calling a tool, respond with one JSON object and nothing else: no prose, no code fences.`,
  });
  const toolCalls = blocks.filter((b): b is Extract<ClaudeBlock, {type: 'tool_use'}> => b.type === 'tool_use').map(b => ({id: b.id, type: 'function' as const, function: {name: b.name, arguments: JSON.stringify(b.input ?? {})}}));
  const text = blocks.filter((b): b is {type: 'text'; text: string} => b.type === 'text').map(b => b.text).join('');
  return {content: toolCalls.length ? text : extractJson(text), toolCalls};
}

/** Whether Iris may use Claude for this pass after OpenAI failed with `err`. Records the failure. */
export async function shouldUseClaude(err: unknown): Promise<boolean> {
  const d = fallbackDecision(err);
  if (!d.fallback) return false;
  const p = await providers();
  if (!p.anthropic || !p.fallbackEnabled) return false;
  noteOpenAIFailure(d.reason!);
  console.warn(JSON.stringify({level: 'warn', source: 'llm.fallback', from: 'openai', to: 'anthropic', reason: d.reason, via: 'iris'}));
  return true;
}
