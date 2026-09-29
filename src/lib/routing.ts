import { DEPARTMENT_RECORDS, PRIORITY_SLA_HOURS, STUDIOS, type SlaHours } from "./constants";
import type { TicketPriority } from "./types";

/* Client-safe: the intake form imports inferPriority from here, so this module must not pull in
 * the staff directory (lib/staff-directory.ts, server-only). */

/* Sub-category tiers. Where the Support Hub plan and Iris disagreed, each sub-category carries
 * the higher of the two, so the form, the API and the filed ticket give one answer. */

const CRITICAL_SUBS = new Set([
  "Client Harassment Reports",
  "Harassment Reports",
  "Emergency Exits Blocked",
  "Panic Button Malfunction",
  "Suspicious Individuals Inside Studio",
  "Data Breach Concerns",
  "Handling of Medical Emergencies",
  "Unlocked Doors",
  "Fire Drills Not Conducted",
  "Fire Safety Compliance",
  "Staff Theft",
  "Locker Theft",
  "Stolen Personal Items",
  "Personal Safety Concerns",
  "Trespassing Concerns",
]);

const HIGH_SUBS = new Set([
  "AC & Ventilation Repairs",
  "Washroom & Plumbing Repairs",
  "PowerCycle Bike Malfunction & Repairs",
  "Resistance Bands & Small Equipment Repairs",
  "Strength Studio Equipment Repairs",
  "Audio, Mic & Headphone Malfunction",
  "Studio Lighting Malfunction & Repairs",
  "Electrical & Power Issues",
  "Mic Not Working",
  "Speakers Static Noise",
  "Studio Wi-Fi Not Working",
  "Booking System Errors",
  "Auto-Debit Incorrect Charges",
  "Incorrect Charges on Account",
  "Payment Processing Delays",
  "CCTV Malfunction",
  "Doors, Locks & Fixture Repairs",
  "Steam Room Not Working",
  "TFA Malfunction",
  "Last-minute Cancellations",
  "Class Capacity Issues",
  "Injury Prevention and Safety",
  "Unresolved Complaints",
  // Raised to the Support Hub's tier.
  "Trainer Punctuality Issues",
  "Trainer Behaviour",
  "Class Capacity & Schedule Gaps",
  "Competitor Solicitation / Client Poaching",
]);

/** Lifted above a low-tier category's baseline (the Hub files these at medium). */
const MEDIUM_SUBS = new Set(["Music Volume Issues"]);

export function studioRegion(studioName?: string | null) {
  if (!studioName) return null;
  const studio = STUDIOS.find((s) => s.name === studioName);
  return studio?.region ?? null;
}

/** Named owners per department and city. Marketing, training and operations tickets go to these
 *  people whatever the scoring below would pick; where a city has two, the one with fewer open
 *  tickets takes it. Patterns match the staff directory's display names; a city with no named
 *  owner in the directory is left empty and falls back to the department's own scoring. */
export const CITY_OWNERS: Record<string, {mumbai: RegExp[]; bengaluru: RegExp[]}> = {
  marketing: {mumbai: [/^shaina\b/i], bengaluru: [/^saachi shetty jr\b/i]},
  training: {mumbai: [/^mrigakshi\b/i, /^vivaran\b/i], bengaluru: [/^pushyank\b/i]},
  operations: {mumbai: [/^zahur\b/i], bengaluru: [/^shifa\b/i]},
};

/** Where a breached ticket goes when nobody has moved it.
 *
 * Escalation used to raise the priority and stop there, which left the same person holding
 * the ticket they had already missed the target on. These are the people who pick it up:
 * brand and marketing work goes to the marketing lead, operations to the ops manager. The
 * owner is not replaced silently — the reassignment is written to the ticket's activity. */
export const ESCALATION_OWNERS: Record<string, RegExp> = {
  marketing: /^reyna\b/i,
  operations: /^saachi shetty$/i,
  training: /^anisha\b/i,
  'sales-client-servicing': /^jimmeey\b/i,
  'customer-service': /^jimmeey\b/i,
  accounts: /^sachin\b/i,
};

/** Departments whose work is shared out in turn rather than scored.
 *
 * Sales and client servicing have no natural "right" owner for a given ticket — any associate
 * on that studio's team can take it — so the fair rule is the next person up, by who has gone
 * longest without one. Scoring by seniority, as the fallback does, sent everything to the
 * same two people. */
export const ROUND_ROBIN_DEPARTMENTS = new Set(['sales-client-servicing', 'customer-service']);
export const cityOf = (studioName?: string | null) => !studioName ? null : /bengaluru|bangalore/i.test(studioName) ? 'bengaluru' as const : 'mumbai' as const;

/** Directory ids that place a staff member at this studio. Courtside and Copper & Cloves reuse
 *  Kwality House's and Kenkere House's ids, so an id only counts for the studio that owns it (the
 *  first listed) — otherwise Kwality's team would score as on site for a Courtside ticket. */
export function studioIdsFor(studioName?: string | null) {
  const studio = studioName ? STUDIOS.find((s) => s.name === studioName) : undefined;
  if (!studio) return [] as number[];
  const owner = (id: number) => STUDIOS.find((s) => (s.studioIds as readonly number[]).includes(id))?.name;
  return studio.studioIds.filter((id) => owner(id) === studio.name) as number[];
}

const PRIORITY_RANK: Record<TicketPriority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const atLeast = (current: TicketPriority, floor: TicketPriority) =>
  PRIORITY_RANK[floor] > PRIORITY_RANK[current] ? floor : current;

/**
 * Iris and the guided templates phrase these answers as full sentences
 * ("Yes, blocking now", "Yes — happening now"), so match on the stem rather than
 * on equality: an exact `=== "Yes"` test silently stopped matching every value the
 * intake flow can actually produce, which left class impact and danger unscored.
 */
const saysYes = (value?: string) => /^\s*yes\b/i.test(value ?? "");
const willBlockSoon = (value?: string) => /^\s*not yet/i.test(value ?? "");

export function inferPriority(input: {
  category?: string;
  subcategory?: string;
  isImmediateDanger?: string;
  isClassImpacted?: string;
  impact?: string;
  /** Whether a member's session or experience was affected — "Yes — members were affected". */
  memberImpact?: string;
  /** Severity of a PowerCycle bike fault: critical where a rider could be hurt. */
  cycleSeverity?: string;
}): TicketPriority {
  // Baseline from the taxonomy alone, most severe rule last.
  let priority: TicketPriority = "medium";
  if (input.category === "Brand Feedback" || input.category === "Miscellaneous") priority = "low";
  if (input.subcategory && MEDIUM_SUBS.has(input.subcategory)) priority = "medium";
  if (input.category === "Pricing and Memberships") priority = "medium";
  if (input.category === "Theft and Lost Items") priority = "high";
  if (input.category === "Tech Issues" || input.category === "Operating Systems") priority = "high";
  if (input.subcategory && HIGH_SUBS.has(input.subcategory)) priority = "high";
  if (input.category === "Safety and Security") priority = "critical";
  if (input.subcategory && CRITICAL_SUBS.has(input.subcategory)) priority = "critical";

  // What the reporter observed can only raise the priority, never lower it — a staff
  // member calling an HVAC outage a "minor inconvenience" must not defuse the ticket,
  // and a blocked class must outrank whatever the taxonomy alone would have said.
  if (saysYes(input.isImmediateDanger)) priority = atLeast(priority, "critical");
  if (input.impact === "Safety concern") priority = atLeast(priority, "critical");
  if (saysYes(input.isClassImpacted)) priority = atLeast(priority, "high");
  if (willBlockSoon(input.isClassImpacted)) priority = atLeast(priority, "high");
  if (input.impact === "Could not proceed as normal") priority = atLeast(priority, "high");
  // A member who paid for a session they could not finish is owed a response within the
  // day, whatever the taxonomy alone would have said about a broken bike or a hot studio.
  if (saysYes(input.memberImpact)) priority = atLeast(priority, "high");
  // A bike fault that can hurt a rider — a pedal that can detach, a scraping flywheel —
  // is a safety fault, and the playbook severity is the only place that is recorded.
  if (input.cycleSeverity === "critical") priority = atLeast(priority, "critical");
  return priority;
}

export function inferSeverity(priority: TicketPriority) {
  if (priority === "critical") return "sev-1";
  if (priority === "high") return "sev-2";
  if (priority === "medium") return "sev-3";
  return "sev-4";
}

/** First-response hours for a tier. Pass the workspace's `responseHours` where it is to hand;
 *  the default table is what Settings starts from. */
export function slaHoursFor(priority: TicketPriority, hours: SlaHours = PRIORITY_SLA_HOURS) {
  return hours[priority] ?? PRIORITY_SLA_HOURS[priority];
}

export function departmentName(id: string) {
  return DEPARTMENT_RECORDS.find((d) => d.id === id)?.name ?? id;
}
