import { isOpen, slaWindowState } from "./metrics";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}


export function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/** Clock state of a follow-up target. "soon" starts when less than the workspace's
 *  `slaWarningPercent` of the created→due window is left (see lib/metrics.ts); pass
 *  `createdAt` so the window is known. */
export function slaState(dueAt?: string | Date | null, status?: string, createdAt?: string | Date | null) {
  if (!dueAt || (status && !isOpen({status}))) return "ok" as const;
  const due = typeof dueAt === "string" ? Date.parse(dueAt) : dueAt.getTime();
  const start = createdAt ? (typeof createdAt === "string" ? Date.parse(createdAt) : createdAt.getTime()) : NaN;
  return slaWindowState(Number.isNaN(due) ? null : due, Number.isNaN(start) ? null : start);
}

/** Elapsed time, floored at every step. Rounding overstated the age of everything: a comment
 *  30 seconds old read "1m ago" even though the branch above it exists to say "just now", and
 *  45 minutes read "1h ago" — on a board where an hour is the difference between inside and
 *  outside an SLA window, the label must never claim more elapsed time than has passed. */
export function relativeTime(value?: string | Date | null) {
  if (!value) return "just now";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ticketNumberFor(id: number) {
  return `P57-${String(id).padStart(5, "0")}`;
}


export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

