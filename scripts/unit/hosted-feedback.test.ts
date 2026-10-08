import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {hostedFeedbackError} from '../../src/lib/hosted-feedback';

const validate = (rows: unknown) => hostedFeedbackError('Brand Feedback', 'Hosted Class Feedback', rows);
describe('Hosted class member comments', () => {
  it('does not block other feedback categories', () => {
    assert.equal(hostedFeedbackError('Class Experience', 'Music', undefined), null);
  });
  it('blocks an unloaded or empty roster', () => {
    assert.ok(validate(undefined)); assert.ok(validate([]));
  });
  it('requires comments for each row, including no-shows and cancellations', () => {
    assert.match(validate([{name: 'Member A', note: 'Enjoyed the session'}, {name: 'Member B', booking: 'Cancelled', note: '  '}])!, /Member B/);
    assert.match(validate([{name: 'Member A', attendance: 'No-show', note: ''}])!, /Member A/);
  });
  it('accepts documented absence without inventing member sentiment', () => {
    assert.equal(validate([{name: 'Member A', note: 'No-show; no member feedback received.'}]), null);
  });
  it('accepts the legacy composer comment format', () => {
    assert.equal(validate([{attendee: 'Member A', comments: 'Member requested a follow-up call.'}]), null);
  });
  it('blocks malformed rows and unnamed walk-ins', () => {
    assert.ok(validate([null])); assert.ok(validate([{name: ' ', note: 'Comment'}]));
  });
});
