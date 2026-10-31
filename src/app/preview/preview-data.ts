import type { Identity } from "@/lib/auth";
import type { TicketListRecord } from "@/lib/ticket-contract";
import type { TicketDetailBundle } from "@/components/ticket-detail-controller";
import type { FollowUp } from "@/components/resolution-panel";

/**
 * Fixture data for the design preview (/preview).
 *
 * The workspace needs a Supabase session and a seeded database to open, so the
 * redesign could not be reviewed in a fresh environment at all. This file
 * fabricates a plausible Monday morning for one workspace: a handful of open
 * tickets across two studios, a few urgent ones, a resolved one and a recorded
 * compliment, so every state the design has to handle is actually on screen.
 *
 * Values are realistic on purpose — a preview full of "Ticket 1 / lorem ipsum"
 * hides exactly the problems a design review exists to catch: long titles,
 * missing owners, breached SLA clocks, two-word studio names.
 */

export const PREVIEW_USER: Identity = {
  id: 1,
  name: "Imran Shaikh",
  email: "imran@physique57india.com",
  role: "admin",
  staffId: 7,
  department: "Operations",
  studio: "Kwality House, Kemps Corner",
  studios: ["Kwality House, Kemps Corner", "Supreme HQ, Bandra"],
  avatarUrl: null,
  mustChangePassword: false,
};

const HOUR = 3_600_000;
const now = Date.now();
const ago = (hours: number) => new Date(now - hours * HOUR).toISOString();
const ahead = (hours: number) => new Date(now + hours * HOUR).toISOString();

type Seed = Partial<TicketListRecord> & Pick<TicketListRecord, "id">;

/** Fills the record's required shape with sensible defaults. */
function ticket(seed: Seed): TicketListRecord {
  const { id, ...rest } = seed;
  return {
    id,
    ticketNumber: `P57-0${2000 + seed.id}`,
    title: "Untitled ticket",
    status: "open",
    priority: "medium",
    category: "Studio Amenities and Facilities",
    subcategory: "Housekeeping & Cleaning Issues",
    studio: "Kwality House, Kemps Corner",
    memberName: "Studio team observation",
    assignedStaffId: null,
    assignedStaffName: null,
    departmentName: "Operations",
    kind: "issue",
    source: "app",
    resolutionRequired: true,
    slaDueAt: ahead(24),
    resolvedAt: null,
    closedAt: null,
    createdAt: ago(20),
    updatedAt: ago(4),
    version: 1,
    slaHours: 24,
    slaExtendedHours: null,
    slaExtendedAt: null,
    slaExtendedByName: null,
    slaExtensionReason: null,
    committedResolutionAt: null,
    isEscalated: false,
    escalatedToName: null,
    escalatedAt: null,
    additionalOwners: null,
    createdByName: "Front desk",
    recurrence: null,
    ...rest,
  } as TicketListRecord;
}

export const PREVIEW_TICKETS: TicketListRecord[] = [
  ticket({
    id: 49,
    title: "PowerCycle bike 7 pedals slip under load in Studio 2",
    status: "in_progress",
    priority: "critical",
    category: "Repair and Maintenance",
    subcategory: "PowerCycle Bike Malfunction & Repairs",
    studio: "Supreme HQ, Bandra",
    assignedStaffId: 12,
    assignedStaffName: "Rhea D'Souza",
    departmentName: "Operations",
    createdByName: "Ananya Kulkarni",
    slaDueAt: ago(3),
    createdAt: ago(29),
    updatedAt: ago(2),
  }),
  ticket({
    id: 48,
    title: "Member reported the 7:00 pm Barre class started nine minutes late",
    status: "waiting_on_member",
    priority: "high",
    category: "Trainer Feedback",
    subcategory: "Class Ending on Time",
    memberName: "Priya Menon",
    assignedStaffId: 9,
    assignedStaffName: "Farah Qureshi",
    departmentName: "Training",
    createdByName: "Front desk",
    slaDueAt: ahead(6),
    createdAt: ago(52),
    updatedAt: ago(26),
  }),
  ticket({
    id: 47,
    title: "Air conditioning in the Strength Studio is not cooling below 26°C",
    status: "open",
    priority: "high",
    category: "Repair and Maintenance",
    subcategory: "AC & Ventilation Repairs",
    studio: "Kwality House, Kemps Corner",
    departmentName: "Operations",
    slaDueAt: ahead(11),
    createdAt: ago(13),
    updatedAt: ago(13),
  }),
  ticket({
    id: 46,
    title: "Wireless microphone cuts out during announcements in Studio 1",
    status: "assigned",
    priority: "medium",
    category: "Tech Issues",
    subcategory: "Audio, Mic & Headphone Malfunction",
    assignedStaffId: 5,
    assignedStaffName: "Karan Mehta",
    departmentName: "Operations",
    slaDueAt: ahead(20),
    createdAt: ago(31),
    updatedAt: ago(18),
  }),
  ticket({
    id: 45,
    title: "Member praised the new reformer flow and the instructor's cueing",
    status: "recorded",
    priority: "low",
    category: "Class Experience",
    subcategory: "Positive Feedback",
    kind: "compliment",
    memberName: "Sneha Iyer",
    resolutionRequired: false,
    slaDueAt: null,
    resolvedAt: null,
    createdByName: "Front desk",
    createdAt: ago(40),
    updatedAt: ago(40),
  }),
  ticket({
    id: 44,
    title: "Two showers in the women's changing room have no hot water",
    status: "resolved",
    priority: "high",
    category: "Studio Amenities and Facilities",
    subcategory: "Washroom & Plumbing Repairs",
    assignedStaffId: 12,
    assignedStaffName: "Rhea D'Souza",
    departmentName: "Operations",
    slaDueAt: ago(9),
    resolvedAt: ago(11),
    createdAt: ago(70),
    updatedAt: ago(11),
  }),
];

export const PREVIEW_DIRECTORY = [
  { name: "Imran Shaikh", online: true, viewing: "Overview" },
  { name: "Rhea D'Souza", online: true, viewing: "Ticket P57-02049" },
  { name: "Farah Qureshi", online: true },
  { name: "Karan Mehta", online: false },
  { name: "Ananya Kulkarni", online: false },
];

/**
 * What the status strip shows on the overview. Same shape the API returns, so
 * the preview renders the real `StatusStrip`, including the LIVE-style badges
 * that the strip suppresses on quiet days.
 */
export const PREVIEW_STATUS = [
  { label: "Open now", value: "4 tickets", tone: "accent", badge: "Live" },
  { label: "Critical", value: "1 ticket needing attention now", tone: "red", badge: "Urgent" },
  { label: "Past target", value: "1 ticket past the resolution target", tone: "red" },
  { label: "Unassigned", value: "1 ticket waiting for an owner", tone: "amber" },
  { label: "Last 24 hours", value: "3 logged · 1 resolved", tone: "green" },
  { label: "Longest open", value: "P57-02049 — 3 days · Studio 2 mirror wall down", tone: "amber" },
];

/* ── The ticket workspace (the modal) ────────────────────────────────────────
   The most-used surface in the product, and the one the brief was written
   against: a masthead, a people strip, four tabs and one context rail. It is
   rendered here from a fixture bundle so it can be reviewed without a session.
   Every write inside it is switched off by the controller when a fixture is
   passed, so nothing here can touch a database that does not exist. */

const FOCUS_TICKET = PREVIEW_TICKETS[0];

export const PREVIEW_BUNDLE: TicketDetailBundle = {
  ticket: {
    ...FOCUS_TICKET,
    summary:
      "Member reported the saddle dropping and the pedals slipping under load on bike 7 during the 6:30 am class. Two members moved to bike 9.",
    description:
      "At around 6:34 am the member on bike 7 said the pedals slipped twice under resistance and the saddle post dropped about a centimetre. The instructor pulled the bike out of rotation and moved two members to bike 9 and bike 10.\n\nBike 7 was last serviced on 12 October. The maintenance log shows the crank was re-torqued but the pedal threads were not inspected.",
    category: "Repair and Maintenance",
    subcategory: "PowerCycle Bike Malfunction & Repairs",
    kind: "issue",
    studio: "Supreme HQ, Bandra",
    memberName: "Devika Rao",
    memberEmail: "devika.rao@example.com",
    memberPhone: "+91 98200 41122",
    incidentAt: ago(29),
    classFormat: "PowerCycle 45",
    trainer: "Karan Mehta",
    membership: "P57 Unlimited · active",
    preferredContact: "WhatsApp",
    requestedResolution:
      "Fix the bike before tomorrow's 6:30 am class, and tell the member it is sorted.",
    priority: "critical",
    severity: "high",
    sentiment: "frustrated",
    impact:
      "One bike out of rotation on a full class. Two members moved mid-session.",
    resolutionRequired: true,
    assignedStaffId: 12,
    assignedStaffName: "Rhea D'Souza",
    assignedStaffEmail: "rhea@physique57india.com",
    assignedStaffRole: "Studio Manager",
    departmentId: "operations",
    departmentName: "Operations",
    slaHours: 8,
    slaLabel: "8 hours · critical repair",
    tags: ["equipment", "powercycle", "safety"],
    opsChecklist: [
      "Take bike 7 out of rotation",
      "Book the technician",
      "Tell the member",
    ],
    memberFacingUpdate:
      "Bike 7 is out of rotation and a technician is booked for this morning.",
    internalBrief:
      "Recurring pedal slip on bike 7. Check the pedal threads this time, not just the crank torque.",
    routingReason: "Category routes equipment faults to Operations.",
    additionalOwners: [
      {
        id: 9,
        name: "Farah Qureshi",
        email: "farah@physique57india.com",
        departmentName: "Training",
      },
    ],
    customFields: { recurrenceCount: 2, recheckDay: 5 },
    source: "iris",
    status: "in_progress",
    createdAt: ago(29),
    updatedAt: ago(2),
    slaDueAt: ago(3),
    resolvedAt: null,
    closedAt: null,
    committedResolutionAt: ahead(14),
    version: 4,
    assetId: 3,
    isEscalated: true,
    escalatedToStaffId: 7,
    escalatedToName: "Imran Shaikh",
    escalatedAt: ago(2),
    slaExtendedHours: 0,
    slaExtendedAt: null,
    slaExtendedByName: null,
    slaExtensionReason: null,
    createdByUserId: 4,
    createdByName: "Ananya Kulkarni",
  },
  comments: [
    {
      id: 901,
      authorName: "Rhea D'Souza",
      authorRole: "Studio Manager",
      body: "Bike 7 is taped off and out of the class rotation. Technician booked for 10 am.",
      createdAt: ago(2),
    },
    {
      id: 902,
      authorName: "Karan Mehta",
      authorRole: "Trainer",
      body: "The saddle post dropped again after I tightened it, so it may be the collar rather than the post.",
      createdAt: ago(1),
    },
  ],
  activities: [
    {
      id: 1,
      actorName: "Ananya Kulkarni",
      action: "Logged the ticket",
      detail: "Via IRIS chat · bike 7, Studio 2",
      createdAt: ago(29),
    },
    {
      id: 2,
      actorName: "IRIS",
      action: "Routed to Operations",
      detail: "Critical repair · 8 hour target",
      createdAt: ago(29),
    },
    {
      id: 3,
      actorName: "Rhea D'Souza",
      action: "Assigned herself",
      detail: "Lead owner",
      createdAt: ago(26),
    },
    {
      id: 4,
      actorName: "IRIS",
      action: "Escalated the breach",
      detail: "Target passed 3 hours ago · Imran Shaikh notified",
      createdAt: ago(2),
    },
  ],
  similar: [
    {
      id: 31,
      ticketNumber: "P57-02031",
      title: "Bike 4 crank loose after the 7 am class",
      status: "resolved",
    },
    {
      id: 12,
      ticketNumber: "P57-02012",
      title: "Pedal thread stripped on bike 7",
      status: "closed",
    },
  ],
  linked: [
    {
      id: 12,
      ticketNumber: "P57-02012",
      title: "Pedal thread stripped on bike 7",
      status: "closed",
    },
  ],
  canResolve: true,
  canEditDetails: true,
  asset: {
    id: 3,
    name: "PowerCycle bike 7",
    assetTag: "SUP-S2-B07",
    status: "repair",
    type: "Cardio",
    studio: "Supreme HQ, Bandra",
  },
  resolution: null,
  steps: [
    {
      id: 1,
      authorName: "Rhea D'Souza",
      body: "Checked the saddle post; the collar is loose, not the post.",
      createdAt: ago(2),
    },
  ],
  followUps: [
    {
      id: 1,
      dueAt: ahead(72),
      note: "Recheck the bike after two full classes.",
      done: false,
    } as unknown as FollowUp,
  ],
  contacts: [],
  attachments: [],
  conversationAttachments: [
    {
      id: "a1",
      fileName: "bike-7-saddle.jpg",
      fileType: "image/jpeg",
      fileSize: 482_133,
    },
  ],
};
