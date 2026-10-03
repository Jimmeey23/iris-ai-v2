/**
 * Who may edit a ticket's documented facts.
 *
 * This is the rule behind "agents cannot edit the tickets they filed". It is asserted here
 * rather than only in the route because two places read it — the PATCH route, which enforces
 * it, and the ticket bundle, which decides whether the button is offered — and they must not
 * drift: a button that appears and then 403s is worse than no button.
 */
import {strict as assert} from 'node:assert';
import {describe, it} from 'node:test';
import {canEditTicketDetails, type Identity} from '../../src/lib/auth';

const person = (over: Partial<Identity> = {}): Identity => ({
  id: 7,
  name: 'An Associate',
  email: 'associate@physique57india.com',
  role: 'agent',
  staffId: 21,
  department: null,
  studio: 'Kwality House, Kemps Corner',
  studios: ['Kwality House, Kemps Corner'],
  avatarUrl: null,
  mustChangePassword: false,
  ...over,
});

describe('canEditTicketDetails', () => {
  it('lets an agent edit the ticket they filed — the reported bug', () => {
    assert.equal(canEditTicketDetails(person(), {createdByUserId: 7}), true);
  });
  it('refuses an agent a colleague\'s ticket, even at their own studio', () => {
    // An agent can read every ticket raised at their studio. Reading somebody's report is not
    // a reason to be able to rewrite it.
    assert.equal(canEditTicketDetails(person(), {createdByUserId: 9}), false);
  });
  it('lets an administrator edit anything', () => {
    assert.equal(canEditTicketDetails(person({role: 'admin'}), {createdByUserId: 9}), true);
    assert.equal(canEditTicketDetails(person({role: 'admin'}), {createdByUserId: null}), true);
  });
  it('does not give a manager somebody else\'s ticket', () => {
    // A manager owns routing and resolution oversight, not the reporter's account of events.
    assert.equal(canEditTicketDetails(person({role: 'manager'}), {createdByUserId: 9}), false);
  });
  it('lets a manager edit their own ticket, like anybody else', () => {
    assert.equal(canEditTicketDetails(person({role: 'manager', id: 4}), {createdByUserId: 4}), true);
  });
  it('refuses an authorless ticket to everyone but an administrator', () => {
    // Email imports, Fillout submissions and history backfills have no author to grant this to.
    for (const authorless of [{createdByUserId: null}, {createdByUserId: undefined}, {}])
      assert.equal(canEditTicketDetails(person(), authorless), false, JSON.stringify(authorless));
  });
  it('refuses a signed-out caller', () => {
    assert.equal(canEditTicketDetails(null, {createdByUserId: 7}), false);
    assert.equal(canEditTicketDetails(undefined, {createdByUserId: 7}), false);
  });
  it('does not match a different person who happens to share a staff id', () => {
    // The author is an app_users id, not a staff id; conflating them would hand the ticket to
    // whoever shares the staff row.
    assert.equal(canEditTicketDetails(person({id: 7, staffId: 21}), {createdByUserId: 21}), false);
  });
});
