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

export function slaState(dueAt?: string | Date | null, status?: string) {
  if (!dueAt || status === "resolved" || status === "closed") return "ok" as const;
  const due = typeof dueAt === "string" ? new Date(dueAt) : dueAt;
  const ms = due.getTime() - Date.now();
  if (ms < 0) return "breached" as const;
  if (ms < 2 * 60 * 60 * 1000) return "soon" as const;
  return "ok" as const;
}

export function relativeTime(value?: string | Date | null) {
  if (!value) return "just now";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function ticketNumberFor(id: number) {
  return `P57-${String(id).padStart(5, "0")}`;
}


export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

