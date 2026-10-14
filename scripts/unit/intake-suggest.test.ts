import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {buildSuggestion, canon, keywordConfidence, levelOf} from '../../src/lib/intake/suggest';

const taxonomy = {
  'Repair and Maintenance': ['AC & Ventilation Repairs', 'Washroom & Plumbing Repairs'],
  'Class Experience': ['Studio Temperature Too Hot/Cold', 'Audio Issues'],
};
const ctx = {studios: ['Kwality House, Kemps Corner', 'Supreme HQ, Bandra'], trainers: ['Simonelle'], formats: ['Studio Barre 57']};
const text = 'AC not working in studio 1 at Kwality since morning, class was boiling';
const ac = {category: 'Repair and Maintenance', subcategory: 'AC & Ventilation Repairs'};

describe('Intake auto-classify', () => {
  it('matches labels case-insensitively and rejects anything outside the list', () => {
    assert.equal(canon(['AC & Ventilation Repairs'], ' ac & ventilation  repairs '), 'AC & Ventilation Repairs');
    assert.equal(canon(['A'], 'B'), undefined);
    assert.equal(canon(['A'], 42), undefined);
  });
  it('raises confidence when the keyword classifier agrees with the model', () => {
    const s = buildSuggestion({text, taxonomy, ctx, model: {...ac, confidence: 0.75, kind: 'issue'}});
    assert.deepEqual([s.picks[0].category, s.picks[0].subcategory], [ac.category, ac.subcategory]);
    assert.equal(s.agreed, true);
    assert.ok((s.picks[0].confidence ?? 0) >= 0.85);
    assert.equal(s.level, 'high');
    assert.equal(s.engine, 'model');
  });
  it('caps an overconfident model that a strong keyword hit contradicts', () => {
    const s = buildSuggestion({text, taxonomy, ctx, model: {category: 'Class Experience', subcategory: 'Audio Issues', confidence: 0.97}});
    assert.ok((s.picks[0].confidence ?? 1) <= 0.65);
    assert.notEqual(s.level, 'high');
    assert.ok(s.picks.some(p => p.subcategory === 'AC & Ventilation Repairs'), 'the keyword pick is offered as an alternative');
  });
  it('discards a model label that is not in the taxonomy and falls back to keywords', () => {
    const s = buildSuggestion({text, taxonomy, ctx, model: {category: 'Made Up', subcategory: 'Nope', confidence: 0.99}});
    assert.equal(s.engine, 'keywords');
    assert.equal(s.picks[0].subcategory, 'AC & Ventilation Repairs');
    assert.ok((s.picks[0].confidence ?? 1) < 0.8, 'keywords alone are never "high"');
  });
  it('returns a low, empty suggestion for text nothing matches', () => {
    const s = buildSuggestion({text: 'hello there this is vague', taxonomy, ctx});
    assert.equal(s.picks.length, 0);
    assert.equal(s.level, 'low');
  });
  it('prefills only values that exist in the workspace lists, and keeps the staff member’s own words', () => {
    const s = buildSuggestion({text, taxonomy, ctx, model: {...ac, confidence: 0.9, studio: 'Supreme HQ, Bandra', trainer: 'Nobody', class_format: 'studio barre 57'}});
    assert.equal(s.prefill.studio, 'Supreme HQ, Bandra');
    assert.equal(s.prefill.trainer, undefined);
    assert.equal(s.prefill.class_format, 'Studio Barre 57');
    assert.equal(s.prefill.summary, text);
  });
  it('infers the studio from the text when the model names none', () => {
    assert.equal(buildSuggestion({text, taxonomy, ctx}).prefill.studio, 'Kwality House, Kemps Corner');
  });
  it('lowers keyword confidence when two sub-categories are close', () => {
    const clear = keywordConfidence([{...ac, score: 20}, {...ac, subcategory: 'x', score: 5}]);
    const close = keywordConfidence([{...ac, score: 20}, {...ac, subcategory: 'x', score: 19}]);
    assert.ok(close < clear);
  });
  it('maps confidence to levels', () => {
    assert.deepEqual([levelOf(0.9), levelOf(0.6), levelOf(0.2)], ['high', 'medium', 'low']);
  });
});
