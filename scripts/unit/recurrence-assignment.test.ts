import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {recurrenceOwner} from '../../src/lib/recurrence-assignment';
const repairOwner = {id: 7, name: 'Repair owner', email: 'repair@example.com'};
const reporter = {id: 19, name: 'Original reporter', email: 'reporter@example.com'};
describe('recurrence check assignment', () => {
  for (const kind of ['bike', 'ac'] as const) {
    it(`${kind} checks belong to the original reporter, not the repair owner`, () => {
      assert.deepEqual(recurrenceOwner(kind, repairOwner, reporter), reporter);
    });
    it(`${kind} checks with no linked reporter stay explicitly unassigned`, () => {
      const owner = recurrenceOwner(kind, repairOwner, null);
      assert.equal(owner.id, null);
      assert.equal(owner.email, null);
      assert.match(owner.name!, /original reporter/);
    });
  }
  it('microphone checks retain their original repair owner', () => {
    assert.deepEqual(recurrenceOwner('mic', repairOwner, reporter), repairOwner);
  });
});
