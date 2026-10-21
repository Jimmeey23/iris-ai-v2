import { CATEGORY_MAP, CATEGORY_DEPARTMENT, DEPARTMENT_RECORDS } from "./constants";
import { inferPriority } from "./routing";
import { slugify } from "./utils";
import { DEFAULT_CONFIG, type WorkspaceConfig } from "./settings-contract";

/** The follow-up hours the workspace has configured — the per-subcategory override first,
 *  then the priority's response target — so the member email quotes the same number the
 *  ticket's SLA clock runs on. */
type SlaConfig = Pick<WorkspaceConfig, "responseHours" | "subcategoryRouting">;

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
  if (category === "Brand Feedback") return "clear and on-brand";
  return "warm, clear and polite";
}

/** Sub-categories that are about the studio, the team or the timetable rather than one member.
 *  Their checklist does not ask anyone to look up or reply to a member who is not there. */
const NO_MEMBER = /^(Internal Operations|Repair and Maintenance)|standard operating|vendor \/ amc|staff uniforms|fire safety|fire drills|employee security training|staff security|staff theft|theft prevention|holiday and festival|weekend vs|studio timings|schedule gaps|grid review|internal follow-up|training of|lead management|post-event lead|marketing collateral|partnership \/ collab|branded content|brand identity|brand tone/i;
export const involvesMember = (category: string, subcategory: string) =>
  !NO_MEMBER.test(category) && !NO_MEMBER.test(subcategory);

function checklist(category: string, subcategory: string) {
  const member = involvesMember(category, subcategory);
  const base = [
    ...(member ? ["Check the member's details in Momence"] : []),
    "Note the studio, the time and who was involved",
    `Send to ${DEPARTMENT_RECORDS.find((d) => d.id === CATEGORY_DEPARTMENT[category])?.name ?? "Operations"}`,
    ...(member ? ["Reply to the member the same day"] : []),
  ];
  if (category === "Scheduling") {
    return [
      ...base,
      ...(member
        ? ["Check the member's upcoming bookings in Momence", "Check capacity and waitlist for the class", "Offer two other class times before closing"]
        : ["Check bookings and waitlists for the slots affected", "Tell booked members before any change goes live"]),
      `Apply the ${subcategory.toLowerCase()} policy the same way every time`,
    ];
  }
  if (category === "Class Experience" || category === "Trainer Feedback") {
    return [
      ...base,
      "Check the class list and trainer for that class",
      "Share a coaching note with the Head Trainer — not the raw complaint",
      ...(member ? ["Check in with the member after their next class"] : []),
    ];
  }
  if (category === "Repair and Maintenance" || category === "Studio Amenities and Facilities") {
    return [
      ...base,
      ...(/standard operating|vendor \/ amc|fire safety|uniforms/i.test(subcategory)
        ? ["Attach the document, contract or checklist", "Agree an owner and a due date"]
        : ["Take a photo of the problem", "Raise a vendor job if needed", "Note whether a class is blocked", "Close only after checking it at the studio"]),
    ];
  }
  if (category === "Operating Systems" || category === "Tech Issues") {
    return [
      ...base,
      "Try it again on Momence, the POS or the app",
      "Save screenshots, error messages and times",
      "Check if other members are affected",
      "Escalate to Saachi / Shifa if a class is blocked",
    ];
  }
  if (category === "Pricing and Memberships") {
    return [
      ...base,
      ...(member ? ["Check the member's memberships and last 5 purchases in Momence"] : []),
      "Do not promise a refund before Accounts has reviewed it",
      "Note GST and payment references",
    ];
  }
  if (category === "Safety and Security") {
    return [
      "Keep it confidential — limit who can see the ticket",
      "Check whether anyone is in danger right now",
      "Tell Mitali Kumar straight away",
      "Save the CCTV footage if it is relevant",
      "Do not contact the people involved without Management",
    ];
  }
  if (category === "Theft and Lost Items") {
    return [
      ...base,
      ...(/prevention|safe storage|coffee/i.test(subcategory)
        ? ["Agree one practical change with the studio manager"]
        : ["Check lost and found and the locker area", "Pull CCTV if theft is suspected", "Note the item, brand and any marks", "Never admit liability in the first reply"]),
    ];
  }
  return [
    ...base,
    `Write a clear note on ${subcategory} that someone can act on`,
    member ? "Suggest one clear next step to the member" : "Agree an owner and a due date",
  ];
}

function fieldsFor(category: string, subcategory: string) {
  const always = ["studio", "incidentAt", ...(involvesMember(category, subcategory) ? ["memberName", "memberEmail"] : [])];
  if (["Scheduling", "Class Experience", "Trainer Feedback"].includes(category)) {
    return [...always, "classFormat", "trainer"];
  }
  if (category === "Pricing and Memberships") return [...always, "membership"];
  if (category === "Theft and Lost Items") return [...always, "itemDescription", "lastSeen"];
  if (category === "Safety and Security") return [...always, "isImmediateDanger"];
  if (category === "Repair and Maintenance" || category === "Studio Amenities and Facilities") return [...always, "area"];
  return always;
}

export function buildTemplate(
  category: string,
  subcategory: string,
  cfg?: SlaConfig,
  override?: { priority?: TicketTemplate["defaultPriority"]; slaHours?: number },
): TicketTemplate {
  const departmentId = CATEGORY_DEPARTMENT[category] ?? "operations";
  const departmentName =
    DEPARTMENT_RECORDS.find((d) => d.id === departmentId)?.name ?? "Operations";
  const priority = override?.priority ?? inferPriority({ category, subcategory });
  const slaHours =
    override?.slaHours ??
    cfg?.subcategoryRouting[category + "|||" + subcategory]?.slaHours ??
    (cfg ?? DEFAULT_CONFIG).responseHours[priority];
  const id = slugify(`${category}-${subcategory}`);

  const memberBody = `Dear {memberName},

Thank you for flagging this — I've opened a care ticket with Physique 57 India for ${subcategory.toLowerCase()} at {studio}.

What we heard
• About: ${subcategory}
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
    fields: fieldsFor(category, subcategory),
  };
}

export function allTemplates(cfg?: SlaConfig): TicketTemplate[] {
  const list: TicketTemplate[] = [];
  for (const [category, subs] of Object.entries(CATEGORY_MAP)) {
    for (const subcategory of subs) {
      list.push(buildTemplate(category, subcategory, cfg));
    }
  }
  return list;
}


