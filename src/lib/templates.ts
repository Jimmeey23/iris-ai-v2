import { CATEGORY_MAP, CATEGORY_DEPARTMENT, DEPARTMENT_RECORDS } from "./constants";
import { inferPriority, slaHoursFor } from "./routing";
import { slugify } from "./utils";

export type TicketTemplate = {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  audience: string;
  defaultPriority: "low" | "medium" | "high" | "critical";
  slaHours: number;
  departmentId: string;
  departmentName: string;
  tags: string[];
  memberSubject: string;
  memberBody: string;
  internalTitle: string;
  internalBody: string;
  opsChecklist: string[];
  irisPrompt: string;
  fields: string[];
};

function voiceFor(category: string) {
  if (category === "Safety and Security") return "calm, urgent, discreet";
  if (category === "Theft and Lost Items") return "empathetic and precise";
  if (category === "Trainer Feedback" || category === "Class Experience") {
    return "warm, specific, never gossipy";
  }
  if (category === "Pricing and Memberships") return "clear, numbers-first, no jargon";
  if (category === "Brand Feedback") return "editorial and on-brand";
  return "polished boutique hospitality";
}

function checklist(category: string, subcategory: string) {
  const base = [
    "Confirm member identity against Momence",
    "Log studio, timestamp, and people involved",
    `Route to ${DEPARTMENT_RECORDS.find((d) => d.id === CATEGORY_DEPARTMENT[category])?.name ?? "Operations"}`,
    "Send a same-day acknowledgement to the member",
  ];
  if (category === "Scheduling") {
    return [
      ...base,
      "Pull the member's upcoming bookings in Momence",
      "Check capacity / waitlist on the requested session",
      "Offer two alternative slots before closing",
      `Apply the ${subcategory.toLowerCase()} policy consistently`,
    ];
  }
  if (category === "Class Experience" || category === "Trainer Feedback") {
    return [
      ...base,
      "Pull the class roster and trainer for the cited session",
      "Share a coaching note with the Head Trainer — not the raw complaint",
      "Follow up with the member after the next class they take",
    ];
  }
  if (category === "Repair and Maintenance" || category === "Studio Amenities and Facilities") {
    return [
      ...base,
      "Photograph / log the asset if on-site",
      "Create or attach a vendor job if needed",
      "Note whether a live class is blocked",
      "Close only after a studio walkthrough",
    ];
  }
  if (category === "Operating Systems" || category === "Tech Issues") {
    return [
      ...base,
      "Reproduce on Momence / POS / app",
      "Capture screenshots, error codes, timestamps",
      "Check if other members are impacted",
      "Escalate to Saachi / Shifa if class-blocking",
    ];
  }
  if (category === "Pricing and Memberships") {
    return [
      ...base,
      "Pull bought memberships and last 5 sales in Momence",
      "Do not promise a refund before Accounts review",
      "Document GST / gateway references",
    ];
  }
  if (category === "Safety and Security") {
    return [
      "Treat as confidential — limit thread access",
      "Confirm whether anyone is in immediate danger",
      "Notify Mitali Kumar immediately",
      "Preserve CCTV window if relevant",
      "Do not contact alleged parties without Management",
    ];
  }
  if (category === "Theft and Lost Items") {
    return [
      ...base,
      "Check lost-and-found and locker area",
      "Pull CCTV window if theft is alleged",
      "Log item description, brand, distinguishing marks",
      "Never admit liability in the first reply",
    ];
  }
  return [
    ...base,
    `Capture a ready-to-action note for ${subcategory}`,
    "Propose one concrete next step to the member",
  ];
}

function fieldsFor(category: string) {
  const always = ["studio", "incidentAt", "memberName", "memberEmail"];
  if (["Scheduling", "Class Experience", "Trainer Feedback"].includes(category)) {
    return [...always, "classFormat", "trainer"];
  }
  if (category === "Pricing and Memberships") return [...always, "membership"];
  if (category === "Theft and Lost Items") return [...always, "itemDescription", "lastSeen"];
  if (category === "Safety and Security") return [...always, "isImmediateDanger"];
  return always;
}

export function buildTemplate(category: string, subcategory: string): TicketTemplate {
  const departmentId = CATEGORY_DEPARTMENT[category] ?? "operations";
  const departmentName =
    DEPARTMENT_RECORDS.find((d) => d.id === departmentId)?.name ?? "Operations";
  const priority = inferPriority({ category, subcategory });
  const slaHours = slaHoursFor(priority);
  const id = slugify(`${category}-${subcategory}`);

  const memberBody = `Dear {memberName},

Thank you for flagging this — I've opened a care ticket with Physique 57 India for ${subcategory.toLowerCase()} at {studio}.

What we heard
• ${subcategory} under ${category}
• Studio: {studio}
• When: {incidentAt}

What happens next
A specialist from ${departmentName} owns this now. You'll hear from us within ${slaHours === 1 ? "one hour" : `${slaHours} hours`} with a concrete next step. If anything changes in the meantime, reply to this thread or tell IRIS.

With care,
IRIS
Physique 57 India Member Care`;

  const internalBody = `INTERNAL TICKET — READY TO POST

Category: ${category}
Subcategory: ${subcategory}
Studio: {studio}
Member: {memberName} · {memberEmail} · {memberPhone}
Momence ID: {momenceMemberId}
When: {incidentAt}
Class / trainer: {classFormat} · {trainer}
Membership: {membership}

Narrative
{narrative}

Requested resolution
{requestedResolution}

Routing
Owner: {assignee}
Department: ${departmentName}
Priority: ${priority.toUpperCase()} · SLA ${slaHours}h
Voice: ${voiceFor(category)}

Do not
• Promise refunds, comps, or trainer discipline in the first reply
• Discuss other members by name
• Close without a member-facing update`;

  return {
    id,
    category,
    subcategory,
    title: `${subcategory}`,
    audience: departmentName,
    defaultPriority: priority,
    slaHours,
    departmentId,
    departmentName,
    tags: [category, subcategory, departmentName, priority],
    memberSubject: `We've received your note about ${subcategory.toLowerCase()}`,
    memberBody,
    internalTitle: `${subcategory} — {studio}`,
    internalBody,
    opsChecklist: checklist(category, subcategory),
    irisPrompt: `The member needs help with ${subcategory} (${category}). Collect missing studio, timing, and identity, then draft a precise ticket.`,
    fields: fieldsFor(category),
  };
}

export function allTemplates(): TicketTemplate[] {
  const list: TicketTemplate[] = [];
  for (const [category, subs] of Object.entries(CATEGORY_MAP)) {
    for (const subcategory of subs) {
      list.push(buildTemplate(category, subcategory));
    }
  }
  return list;
}

export function templateById(id: string) {
  return allTemplates().find((t) => t.id === id) ?? null;
}

export function templatesFor(category?: string) {
  const all = allTemplates();
  if (!category || category === "all") return all;
  return all.filter((t) => t.category === category);
}
