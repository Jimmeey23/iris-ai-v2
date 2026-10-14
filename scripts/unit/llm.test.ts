import {strict as assert} from 'node:assert';
import {beforeEach, describe, it} from 'node:test';
import {BREAKER_MS, extractJson, fallbackDecision, noteOpenAIFailure, openAIAvoided, providerOrder, resetFallbackState, toClaudeMessages, toClaudeTools, type Providers} from '../../src/lib/llm';

const both = (o: Partial<Providers> = {}): Providers => ({openai: {key: 'o', model: 'gpt'}, anthropic: {key: 'a', model: 'claude-haiku-5-5'}, fallbackEnabled: true, ...o});

describe('When OpenAI should hand over to Claude', () => {
  it('treats an empty balance as quota, even though OpenAI sends it as a 429', () => {
    assert.deepEqual(fallbackDecision({status: 429, code: 'insufficient_quota', message: 'You exceeded your current quota'}), {fallback: true, reason: 'quota'});
    assert.deepEqual(fallbackDecision({status: 429, message: 'You exceeded your current quota, please check your plan and billing details.'}), {fallback: true, reason: 'quota'});
  });
  it('separates a plain rate limit from quota', () => {
    assert.deepEqual(fallbackDecision({status: 429, message: 'Rate limit reached for requests'}), {fallback: true, reason: 'rate-limit'});
  });
  it('falls back on rejected keys, outages and timeouts', () => {
    assert.equal(fallbackDecision({status: 401}).reason, 'auth');
    assert.equal(fallbackDecision({status: 403}).reason, 'auth');
    assert.equal(fallbackDecision({status: 503}).reason, 'outage');
    assert.equal(fallbackDecision({name: 'APIConnectionTimeoutError', message: 'Request timed out.'}).reason, 'timeout');
    assert.equal(fallbackDecision({name: 'APIConnectionError', message: 'Connection error.'}).reason, 'outage');
  });
  it('does not fall back on our own mistakes', () => {
    assert.equal(fallbackDecision({status: 400, message: 'Invalid schema'}).fallback, false);
    assert.equal(fallbackDecision({status: 404}).fallback, false);
    assert.equal(fallbackDecision(new Error('boom')).fallback, false);
    assert.equal(fallbackDecision(null).fallback, false);
  });
});

describe('Provider order', () => {
  beforeEach(resetFallbackState);
  it('asks OpenAI first and keeps Claude as the backup', () => {
    assert.deepEqual(providerOrder(both()), ['openai', 'anthropic']);
  });
  it('skips OpenAI while it is known to be out of credits', () => {
    assert.deepEqual(providerOrder(both(), true), ['anthropic']);
  });
  it('never skips OpenAI when there is nothing to fall back to', () => {
    assert.deepEqual(providerOrder(both({anthropic: undefined}), true), ['openai']);
    assert.deepEqual(providerOrder(both({fallbackEnabled: false}), true), ['openai']);
  });
  it('uses a connected Claude on its own when OpenAI is not connected, even with fallback off', () => {
    assert.deepEqual(providerOrder(both({openai: undefined, fallbackEnabled: false})), ['anthropic']);
  });
  it('is empty when nothing is connected', () => {
    assert.deepEqual(providerOrder({fallbackEnabled: true}), []);
  });
  it('remembers a quota failure for minutes and an outage for less', () => {
    assert.equal(openAIAvoided(), false);
    noteOpenAIFailure('quota', 1_000);
    assert.equal(openAIAvoided(1_000 + BREAKER_MS.quota - 1), true);
    assert.equal(openAIAvoided(1_000 + BREAKER_MS.quota + 1), false);
    assert.ok(BREAKER_MS.outage < BREAKER_MS.quota);
  });
});

describe('Claude request shaping', () => {
  it('pulls JSON out of fences and chatter', () => {
    assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(extractJson('Here you go: {"a":{"b":2}} done'), '{"a":{"b":2}}');
    assert.equal(extractJson('{"a":1}'), '{"a":1}');
  });
  it('turns an OpenAI transcript with a tool round-trip into Claude messages', () => {
    const {system, messages} = toClaudeMessages([
      {role: 'system', content: 'You are Iris.'},
      {role: 'assistant', content: 'Earlier reply'},
      {role: 'user', content: 'Mic broke'},
      {role: 'assistant', content: null, tool_calls: [{id: 't1', type: 'function', function: {name: 'find_momence', arguments: '{"module":"members","query":"Asha"}'}}]},
      {role: 'tool', tool_call_id: 't1', content: '{"suggestions":[]}'},
    ]);
    assert.equal(system, 'You are Iris.');
    assert.equal(messages[0].role, 'user', 'a transcript must open with the user');
    assert.deepEqual(messages.map(m => m.role), ['user', 'assistant', 'user', 'assistant', 'user']);
    const use = (messages[3].content as {type: string; name?: string; input?: unknown}[])[0];
    assert.deepEqual([use.type, use.name, use.input], ['tool_use', 'find_momence', {module: 'members', query: 'Asha'}]);
    const result = (messages[4].content as {type: string; tool_use_id?: string}[])[0];
    assert.deepEqual([result.type, result.tool_use_id], ['tool_result', 't1']);
  });
  it('merges adjacent turns of one role', () => {
    const {messages} = toClaudeMessages([{role: 'user', content: 'a'}, {role: 'user', content: 'b'}]);
    assert.equal(messages.length, 1);
    assert.equal((messages[0].content as unknown[]).length, 2);
  });
  it('maps tool definitions to Claude\'s shape', () => {
    const t = toClaudeTools([{type: 'function', function: {name: 'find_momence', description: 'd', parameters: {type: 'object', properties: {q: {type: 'string'}}}}}]);
    assert.deepEqual(t, [{name: 'find_momence', description: 'd', input_schema: {type: 'object', properties: {q: {type: 'string'}}}}]);
  });
});
