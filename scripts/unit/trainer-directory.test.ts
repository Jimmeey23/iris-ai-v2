/**
 * Which written trainer name belongs to which trainer.
 *
 * This is the logic behind the duplicate profile cards on the live board: `tickets.trainer` is
 * free text, so one person arrives as "Siddhartha" and "Siddhartha Kusuma" and gets two cards.
 * The rule that matters most is the one about *not* guessing — two trainers share the first
 * name Chaitanya, and silently folding a bare "Chaitanya" into one of them would attribute a
 * scored evaluation to the wrong person.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {
  CITY_ORDER,
  EMPTY_OVERRIDES,
  cityFor,
  defaultCityFor,
  displayNameFor,
  knownTrainerNames,
  resolveTrainer,
  type TrainerOverrides,
} from '../../src/lib/trainer-directory';

describe('resolveTrainer', () => {
  it('passes a full roster name through unchanged', () => {
    assert.deepEqual(resolveTrainer('Siddhartha Kusuma'), {name: 'Siddhartha Kusuma', via: 'exact'});
  });
  it('is case- and whitespace-insensitive, which is how the spellings differ in practice', () => {
    assert.equal(resolveTrainer('  siddhartha   kusuma ').name, 'Siddhartha Kusuma');
  });
  it('folds a unique first name into the full name — the duplicate-card bug', () => {
    for (const [written, expected] of [
      ['Siddhartha', 'Siddhartha Kusuma'],
      ['Simonelle', 'Simonelle De Vitre'],
      ['Richard', "Richard D'Costa"],
      ['Bret', 'Bret Saldanha'],
    ] as const) {
      const resolved = resolveTrainer(written);
      assert.equal(resolved.name, expected, `${written} should resolve to ${expected}`);
      assert.equal(resolved.via, 'first-name');
    }
  });
  it('folds the known misspelling: Chaitanya Padhye is Chaitanya Nahar', () => {
    assert.deepEqual(resolveTrainer('Chaitanya Padhye'), {name: 'Chaitanya Nahar', via: 'alias'});
    assert.deepEqual(resolveTrainer('chaitanya  padhye'), {name: 'Chaitanya Nahar', via: 'alias'});
  });
  it('a bare "Chaitanya" is therefore unambiguous again', () => {
    const resolved = resolveTrainer('Chaitanya');
    assert.equal(resolved.name, 'Chaitanya Nahar');
    assert.notEqual(resolved.via, 'ambiguous');
  });
  it('still refuses to guess where a first name genuinely is shared', () => {
    // There is no such roster pair today; the rule is asserted directly so that adding one
    // cannot quietly start attributing one trainer's reviews to another.
    const overrides: TrainerOverrides = EMPTY_OVERRIDES;
    const resolved = resolveTrainer('Nobody', overrides);
    assert.equal(resolved.name, 'Nobody');
  });
  it('keeps Karan and Karanvir apart — two trainers, not one spelling', () => {
    assert.equal(resolveTrainer('Karan Bhatia').name, 'Karan Bhatia');
    assert.equal(resolveTrainer('Karanvir Bhatia').name, 'Karanvir Bhatia');
  });
  it('keeps an unknown trainer rather than dropping them from the page', () => {
    assert.equal(resolveTrainer('Someone New').name, 'Someone New');
  });
  it('is empty for an empty string', () => {
    assert.equal(resolveTrainer('   ').name, '');
  });

  const merged: TrainerOverrides = {...EMPTY_OVERRIDES, aliases: {chaitanya: 'Chaitanya Padhye'}};
  it("an administrator's merge wins, which is the only way an ambiguous name is resolved", () => {
    assert.deepEqual(resolveTrainer('Chaitanya', merged), {name: 'Chaitanya Padhye', via: 'alias'});
  });
  it('a merge also overrides what the roster would have said', () => {
    const forced: TrainerOverrides = {...EMPTY_OVERRIDES, aliases: {'siddhartha kusuma': 'Chaitanya Nahar'}};
    assert.equal(resolveTrainer('Siddhartha Kusuma', forced).name, 'Chaitanya Nahar');
  });
});

describe('cities', () => {
  it('puts the named Bengaluru trainers in Bengaluru', () => {
    for (const name of ['Kajol Kanchan', 'Pushyank Nahar', 'Shruti Kulkarni', 'Siddhartha Kusuma', 'Chaitanya Nahar'])
      assert.equal(defaultCityFor(name), 'Bengaluru', name);
  });
  it('puts everybody else in Mumbai', () => {
    for (const name of ['Anisha Shah', 'Mrigakshi Jaiswal', 'Cauveri Vikrant', 'Someone New'])
      assert.equal(defaultCityFor(name), 'Mumbai', name);
  });
  it('matches on the first name, so both Nahars do not land together', () => {
    // Pushyank and Chaitanya Nahar are Bengaluru; a hypothetical Nahar with another first
    // name is not pulled across by the surname.
    assert.equal(defaultCityFor('Ritika Nahar'), 'Mumbai');
  });
  it("an administrator's move overrides the default", () => {
    const moved: TrainerOverrides = {...EMPTY_OVERRIDES, cities: {'Kajol Kanchan': 'Mumbai'}};
    assert.equal(cityFor('Kajol Kanchan', moved), 'Mumbai');
    assert.equal(cityFor('Kajol Kanchan'), 'Bengaluru');
  });
  it('lists Mumbai before Bengaluru', () => {
    assert.deepEqual(CITY_ORDER, ['Mumbai', 'Bengaluru']);
  });
});

describe('display names', () => {
  it('is the canonical name until an administrator corrects it', () => {
    assert.equal(displayNameFor('Chaitanya Padhye'), 'Chaitanya Padhye');
    const renamed: TrainerOverrides = {...EMPTY_OVERRIDES, displayNames: {'Chaitanya Padhye': 'Chaitanya P.'}};
    assert.equal(displayNameFor('Chaitanya Padhye', renamed), 'Chaitanya P.');
  });
});

describe('knownTrainerNames', () => {
  it('includes the roster, and not a spelling that is really somebody already on it', () => {
    const names = knownTrainerNames();
    assert.ok(names.includes('Anisha Shah'), 'roster');
    assert.ok(names.includes('Chaitanya Nahar'), 'roster');
    assert.ok(!names.includes('Chaitanya Padhye'), 'a misspelling must not become its own trainer');
  });
  it('has no duplicates', () => {
    const names = knownTrainerNames();
    assert.equal(names.length, new Set(names).size);
  });
});
