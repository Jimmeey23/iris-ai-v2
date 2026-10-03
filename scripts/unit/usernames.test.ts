/**
 * Mention handles.
 *
 * The handle is written into the text of saved comments, so the rules that matter are the
 * ones about stability and collisions: a handle that moves silently un-tags every note that
 * already used it.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {mentionsIn, pickUsername, slugUsername, usernameCandidates} from '../../src/lib/usernames';

describe('slugUsername', () => {
  it('lowercases and keeps dots, which separate first from last', () => {
    assert.equal(slugUsername('Anita.Rao'), 'anita.rao');
  });
  it('turns spaces and punctuation into a single dot', () => {
    assert.equal(slugUsername('Mrigakshi  Jaiswal'), 'mrigakshi.jaiswal');
    assert.equal(slugUsername("O'Brien-Smith"), 'o.brien.smith');
  });
  it('strips accents rather than dropping the letter', () => {
    assert.equal(slugUsername('José'), 'jose');
  });
  it('never starts or ends with a dot', () => {
    assert.equal(slugUsername('  .anita.  '), 'anita');
  });
  it('caps the length so a handle stays typeable', () => {
    assert.ok(slugUsername('a'.repeat(80)).length <= 32);
  });
});

describe('usernameCandidates', () => {
  it('prefers the email local part — what the person already answers to', () => {
    const candidates = usernameCandidates({name: 'Mrigakshi Jaiswal', email: 'mrigakshi@physique57mumbai.com'});
    assert.equal(candidates[0], 'mrigakshi');
  });
  it('offers first.last as a distinct fallback', () => {
    const candidates = usernameCandidates({name: 'Anita Rao', email: 'anita@example.com'});
    assert.ok(candidates.includes('anita.rao'), candidates.join(','));
  });
  it('falls back to the name for a role address', () => {
    const candidates = usernameCandidates({name: 'Front Desk Kwality', email: 'ops@example.com'});
    assert.ok(candidates.includes('front.desk.kwality'), candidates.join(','));
  });
});

describe('pickUsername', () => {
  it('gives the first free candidate', () => {
    assert.equal(pickUsername({name: 'Anita Rao', email: 'anita@example.com'}, new Set()), 'anita');
  });
  it('moves to first.last rather than stealing a taken handle', () => {
    assert.equal(
      pickUsername({name: 'Anita Rao', email: 'anita@example.com'}, new Set(['anita'])),
      'anita.rao',
    );
  });
  it('numbers the handle when every readable form is gone', () => {
    const taken = new Set(['anita', 'anita.rao']);
    assert.equal(pickUsername({name: 'Anita Rao', email: 'anita@example.com'}, taken), 'anita2');
  });
  it('returns null when there is nothing to build a handle from', () => {
    assert.equal(pickUsername({name: '   ', email: '@example.com'}, new Set()), null);
  });
});

describe('mentionsIn', () => {
  it('finds a handle at the start and mid-sentence', () => {
    assert.deepEqual(mentionsIn('@anita please look'), ['anita']);
    assert.deepEqual(mentionsIn('passing to @anita now'), ['anita']);
  });
  it('keeps an internal dot but drops trailing punctuation', () => {
    assert.deepEqual(mentionsIn('thanks @anita.rao.'), ['anita.rao']);
    assert.deepEqual(mentionsIn('ok @anita, done'), ['anita']);
  });
  it('does not read an email address as a mention', () => {
    assert.deepEqual(mentionsIn('write to anita@example.com'), []);
  });
  it('de-duplicates and lowercases', () => {
    assert.deepEqual(mentionsIn('@Anita and @anita'), ['anita']);
  });
  it('finds several', () => {
    assert.deepEqual(mentionsIn('@anita @pushyank over to you').sort(), ['anita', 'pushyank']);
  });
});
