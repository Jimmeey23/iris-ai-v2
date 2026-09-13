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

export function inferPriority(input: {
  category?: string;
  subcategory?: string;
  isImmediateDanger?: string;
  isClassImpacted?: string;
}): TicketPriority {
  if (input.isImmediateDanger === "Yes") return "critical";
  if (input.subcategory && CRITICAL_SUBS.has(input.subcategory)) return "critical";
  if (input.category === "Safety and Security") return "critical";
  if (input.subcategory && HIGH_SUBS.has(input.subcategory)) return "high";
  if (input.isClassImpacted === "Yes") return "high";
  if (input.category === "Theft and Lost Items") return "high";
  if (input.category === "Tech Issues" || input.category === "Operating Systems") return "high";
  if (input.category === "Pricing and Memberships") return "medium";
  if (input.category === "Brand Feedback") return "low";
  if (input.category === "Miscellaneous") return "low";
  return "medium";
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
