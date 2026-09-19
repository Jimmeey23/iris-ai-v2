import {
  CATEGORY_DEPARTMENT,
  DEPARTMENT_RECORDS,
  PRIORITY_SLA_HOURS,
  STAFF,
  STUDIOS,
  type StaffRecord,
} from "./constants";
import type { TicketPriority } from "./types";

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
  "AC and HVAC Issues",
  "Plumbing Leaks",
  "Broken Equipment Not Repaired",
  "Mic Not Working",
  "Speakers Static Noise",
  "Studio Wi-Fi Not Working",
  "Booking System Errors",
  "Auto-Debit Incorrect Charges",
  "Incorrect Charges on Account",
  "Payment Processing Delays",
  "CCTV Malfunction",
  "Door Lock Issues",
  "Steam Room Not Working",
  "TFA Malfunction",
  "Last-minute Cancellations",
  "Class Capacity Issues",
  "Injury Prevention and Safety",
  "Unresolved Complaints",
]);

export function studioRegion(studioName?: string | null) {
  if (!studioName) return null;
  const studio = STUDIOS.find((s) => s.name === studioName);
  return studio?.region ?? null;
}

export function studioIdsFor(studioName?: string | null) {
  if (!studioName) return [] as number[];
  const studio = STUDIOS.find((s) => s.name === studioName);
  return studio ? [...studio.studioIds] : [];
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

export function slaHoursFor(priority: TicketPriority) {
  return PRIORITY_SLA_HOURS[priority] ?? 24;
}

function scoreStaff(person: StaffRecord, category: string, studioName?: string) {
  let score = 0;
  if (!person.isActive) return -1000;
  if (person.categories.includes(category)) score += 12;
  const ids = studioIdsFor(studioName);
  if (person.studioId && ids.includes(person.studioId)) score += 10;
  const region = studioRegion(studioName);
  if (region && person.location.toLowerCase().includes(region.toLowerCase())) score += 6;
  if (person.location === "India") score += 1;
  if (person.role.toLowerCase().includes("head")) score += 2;
  if (person.role.toLowerCase().includes("coordinator")) score += 3;
  if (category === "Safety and Security" && person.role === "Chief Operations Officer") score += 8;
  if (category === "Safety and Security" && person.role === "Owner") score += 4;
  if (
    (category === "Class Experience" || category === "Trainer Feedback") &&
    person.role === "Head Trainer"
  ) {
    score += 5;
  }
  return score;
}

export function assignTicket(category: string, studioName?: string) {
  const departmentId = CATEGORY_DEPARTMENT[category] ?? "operations";
  const department = DEPARTMENT_RECORDS.find((d) => d.id === departmentId);
  const ranked = [...STAFF]
    .map((person) => ({ person, score: scoreStaff(person, category, studioName) }))
    .filter((row) => row.score > 0 && row.person.categories.includes(category))
    .sort((a, b) => b.score - a.score);

  const chosen = ranked[0]?.person ?? STAFF.find((s) => s.id === 19)!;
  return {
    staff: chosen,
    departmentId,
    departmentName: department?.name ?? chosen.department,
  };
}

export function departmentName(id: string) {
  return DEPARTMENT_RECORDS.find((d) => d.id === id)?.name ?? id;
}
