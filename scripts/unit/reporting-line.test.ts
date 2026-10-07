import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {reportingManagerId, directReportIds, type ReportingStaff} from '../../src/lib/reporting-line';
import {canResolveTicket} from '../../src/lib/tickets';
import {canAccessTicket, type Identity} from '../../src/lib/auth';
const directory: ReportingStaff[] = [
  {id: 1, externalId: '101', name: 'Mira Shah', manager: null, isActive: true},
  {id: 2, externalId: '102', name: 'Dev Patel', manager: ' mira SHAH ', isActive: true},
  {id: 3, externalId: null, name: 'Arun Das', manager: '101', isActive: true},
  {id: 4, externalId: null, name: 'Inactive Associate', manager: 'Mira', isActive: false},
];
const actor: Identity = {id: 99, name: 'Mira Shah', email: 'mira@example.com', staffId: 1, managedStaffIds: [2, 3], role: 'manager', department: 'Training', studio: 'Bandra', studios: ['Bandra'], avatarUrl: null, mustChangePassword: false};
const ticket = {assignedStaffId: 2, studio: 'Bengaluru', departmentName: 'Operations', createdByUserId: 20};
describe('owner and reporting manager access', () => {
  it('resolves trimmed names, unique first names, staff ids and external ids', () => {
    for (const value of [' Mira Shah ', 'mira', '1', '101']) assert.equal(reportingManagerId(value, directory), 1);
    assert.deepEqual(directReportIds(1, directory), [2, 3]);
  });
  it('refuses missing, ambiguous, inactive and mismatched manager names', () => {
    const ambiguous = [...directory, {...directory[0], id: 5, name: 'Mira Rao'}];
    assert.equal(reportingManagerId('Mira', ambiguous), null);
    assert.equal(reportingManagerId('Mira Wrong', directory), null);
    assert.equal(reportingManagerId(null, directory), null);
    assert.equal(reportingManagerId('Mira Shah', [{...directory[0], isActive: false}]), null);
  });
  it('allows a direct reporting manager across department and studio boundaries', () => {
    assert.equal(canAccessTicket(actor, ticket), true);
  });
  it('allows assigned owners with a manager role outside their normal scope', () => {
    assert.equal(canAccessTicket({...actor, staffId: 2, managedStaffIds: []}, ticket), true);
  });
  it('lets both the owner and direct reporting manager resolve required tickets', async () => {
    assert.equal(await canResolveTicket(actor, 2, true), true);
    assert.equal(await canResolveTicket({...actor, staffId: 2, managedStaffIds: []}, 2, true), true);
    assert.equal(await canResolveTicket({...actor, managedStaffIds: []}, 2, true), false);
    assert.equal(await canResolveTicket(actor, 2, false), false);
    assert.equal(await canResolveTicket(actor, null, true), false);
    assert.equal(await canResolveTicket(null, 2, true), false);
  });
  it('refuses unrelated tickets and grants no blanket manager override', () => {
    assert.equal(canAccessTicket(actor, {...ticket, assignedStaffId: 50}), false);
    assert.equal(canAccessTicket({...actor, managedStaffIds: []}, ticket), false);
    assert.equal(canAccessTicket({...actor, staffId: null, managedStaffIds: []}, {...ticket, assignedStaffId: null}), false);
  });
});
