import {isHostedClassTicket} from './hosted-feedback';
import {inferPriority, inferSeverity} from './routing';
import type {TicketInput} from './ticket-contract';

export const BEHAVIOR_VERSION = '2026-10-20';
export const TERMINAL_STATUSES = ['resolved', 'closed'] as const;
const terminal = (s: string) => (TERMINAL_STATUSES as readonly string[]).includes(s);
const rank = {low: 0, medium: 1, high: 2, critical: 3};
type Priority = keyof typeof rank;

/** One action/urgency decision for every input surface. Identity is never urgency. */
export function evaluateTicketPolicy(input: Pick<TicketInput, 'category'|'subcategory'|'kind'|'resolutionRequired'|'priority'|'impact'|'customFields'>, cfg: {responseHours: Record<Priority, number>; subcategoryRouting: Record<string, {slaHours?: number|null}>}) {
  const cf = input.customFields || {};
  const inferred = inferPriority({category: input.category, subcategory: input.subcategory,
    isClassImpacted: String(cf.isClassImpacted || cf.classImpact || ''),
    isImmediateDanger: String(cf.isImmediateDanger || ''), impact: input.impact,
    memberImpact: String(cf.memberImpact || ''), cycleSeverity: String(cf.cycleSeverity || cf.cycle_severity || '')});
  const safety = input.category === 'Safety and Security' || /^yes\b/i.test(String(cf.isImmediateDanger || '')) || input.impact === 'Safety concern' || String(cf.cycleSeverity || cf.cycle_severity || '') === 'critical';
  const hosted=isHostedClassTicket(input.category,input.subcategory);
  const resolutionRequired = !hosted && (safety || (input.resolutionRequired ?? !['compliment', 'assessment', 'feedback'].includes(input.kind)));
  const requested = input.priority;
  const priority: Priority = resolutionRequired ? (requested && rank[requested] > rank[inferred] ? requested : inferred) : 'low';
  const slaHours = resolutionRequired ? Math.max(12, Math.min(72, cfg.subcategoryRouting[`${input.category}|||${input.subcategory}`]?.slaHours ?? cfg.responseHours[priority])) : 0;
  return {resolutionRequired, priority, severity: inferSeverity(priority), slaHours,
    reason: safety ? 'Safety concern: immediate action required.' : resolutionRequired ? 'Action required as confirmed in this submission.' : 'Recorded for reference; no action requested.', version: BEHAVIOR_VERSION};
}

const transitions: Record<string, readonly string[]> = {
  new: ['triaged', 'assigned', 'in_progress', 'waiting_on_member', 'waiting_on_vendor', 'resolved', 'closed'],
  triaged: ['assigned', 'in_progress', 'waiting_on_member', 'waiting_on_vendor', 'resolved', 'closed'],
  assigned: ['triaged', 'in_progress', 'waiting_on_member', 'waiting_on_vendor', 'resolved', 'closed'],
  in_progress: ['assigned', 'waiting_on_member', 'waiting_on_vendor', 'resolved', 'closed'],
  waiting_on_member: ['assigned', 'in_progress', 'waiting_on_vendor', 'resolved', 'closed'],
  waiting_on_vendor: ['assigned', 'in_progress', 'waiting_on_member', 'resolved', 'closed'],
  resolved: ['closed', 'assigned', 'in_progress'], closed: ['assigned', 'in_progress'], recorded: ['new', 'assigned'],
};
export function transitionError(current: string, next: string, resolutionRequired: boolean, allowReopen: boolean) {
  if (!resolutionRequired) return next === 'recorded' || next === 'closed' ? null : 'Record-only entries must use Recorded or Closed status.';
  if (next === 'recorded') return 'Only record-only entries can use Recorded status.';
  if (current === next) return null;
  if (terminal(current) && !terminal(next) && !allowReopen) return 'Reopening resolved tickets is disabled. Create a linked ticket instead.';
  if (!transitions[current]?.includes(next)) return `Cannot change status from ${current} to ${next}.`;
  return null;
}
export function transitionTimestamps(current: {status?: string; resolvedAt: Date|null; closedAt: Date|null}, next: string, now = new Date()) {
  if (next === 'resolved') return {resolvedAt: current.resolvedAt ?? now, closedAt: null};
  if (next === 'closed') return {resolvedAt: current.status === 'recorded' ? null : current.resolvedAt ?? now, closedAt: current.closedAt ?? now};
  // Reopened work starts another active cycle, with previous times retained in activity.
  return {resolvedAt: null, closedAt: null};
}

export function defaultEntryKind(category: string, sub: string): TicketInput['kind'] {
  if(isHostedClassTicket(category,sub))return 'feedback';
  if (/compliment|appreciation|recognition|positive feedback/i.test(sub)) return 'compliment';
  if (/hosted class feedback|post.event feedback|suggestion|community events|eco.friendly|membership perks|challenges and rewards|holiday.themed/i.test(sub)) return 'feedback';
  if (category === 'Scheduling' && /change|additional|preferences|balance|request/i.test(sub)) return 'request';
  return 'issue';
}
