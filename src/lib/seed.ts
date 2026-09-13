import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import {
  appSettings,
  chatMessages,
  chatSessions,
  departments,
  staff,
  ticketActivities,
  ticketComments,
  tickets,
} from "@/db/schema";
import { DEPARTMENT_RECORDS, STAFF } from "./constants";
import { assignTicket, inferPriority, inferSeverity, slaHoursFor } from "./routing";
import { hoursFromNow, ticketNumberFor } from "./utils";

type SeedTicket = {
  title: string;
  summary: string;
  description: string;
  category: string;
  subcategory: string;
  status: string;
  studio: string;
  classFormat?: string;
  trainer?: string;
  membership?: string;
  incidentAt: string;
  memberName: string;
  memberEmail: string;
  memberPhone: string;
  source: string;
  hoursAgo: number;
  comment?: string;
};

const SAMPLE_TICKETS: SeedTicket[] = [
  {
    title: "Mic not working — Kwality House, Kemps Corner",
    summary: "Priya Mehta reported the headset cutting out mid Barre 57 this morning.",
    description:
      "During 7:30am Studio Barre 57 the trainer headset dropped twice. Members in the back row could not hear cues. Class continued with the floor speaker only.",
    category: "Tech Issues",
    subcategory: "Mic Not Working",
    status: "in_progress",
    studio: "Kwality House, Kemps Corner",
    classFormat: "Studio Barre 57",
    trainer: "Mrigakshi Jaiswal",
    membership: "Studio Annual Unlimited Membership",
    incidentAt: "Today",
    memberName: "Priya Mehta",
    memberEmail: "priya.mehta@email.com",
    memberPhone: "+919820011001",
    source: "iris",
    hoursAgo: 2,
    comment: "Spare headset pulled. Vendor booked for 5pm.",
  },
  {
    title: "Locker theft — Supreme HQ, Bandra",
    summary: "Aarav Khanna's AirPods were missing from locker 14 after PowerCycle.",
    description:
      "Member stored AirPods Pro in locker 14. Returned after class, lock was still closed but case was gone. CCTV request attached.",
    category: "Theft and Lost Items",
    subcategory: "Locker Theft",
    status: "assigned",
    studio: "Supreme HQ, Bandra",
    classFormat: "Studio PowerCycle",
    trainer: "Vivaran Dhasmana",
    membership: "Studio 10 Single Class Pack",
    incidentAt: "Today",
    memberName: "Aarav Khanna",
    memberEmail: "aarav.khanna@email.com",
    memberPhone: "+919820011002",
    source: "iris",
    hoursAgo: 4,
  },
  {
    title: "Auto-debit incorrect charge — Kenkere House",
    summary: "Ananya Rao was charged twice for Strength Lab 3 month unlimited.",
    description:
      "Razorpay shows two captures 14 minutes apart for ₹29,500. Member wants the duplicate reversed and a GST credit note.",
    category: "Tech Issues",
    subcategory: "Auto-Debit Incorrect Charges",
    status: "waiting_on_vendor",
    studio: "Kenkere House, Bengaluru",
    membership: "Strength Lab 3 months Unlimited",
    incidentAt: "Yesterday",
    memberName: "Ananya Rao",
    memberEmail: "ananya.rao@email.com",
    memberPhone: "+919845501123",
    source: "iris",
    hoursAgo: 18,
  },
  {
    title: "Class intensity too high — Courtside",
    summary: "Meher Daruwalla felt the private with Anisha spiked too quickly after travel.",
    description:
      "Member is jet-lagged and asked for a recovery-leaning private. Session still opened with Amped Up pacing. No injury, but she wants the note on file.",
    category: "Trainer Feedback",
    subcategory: "Class Intensity Too High/Low",
    status: "triaged",
    studio: "Courtside, Mumbai",
    classFormat: "Studio Private Class",
    trainer: "Anisha Shah",
    membership: "Studio Privates - Anisha x 10",
    incidentAt: "Yesterday",
    memberName: "Meher Daruwalla",
    memberEmail: "meher.d@email.com",
    memberPhone: "+919867701445",
    source: "iris",
    hoursAgo: 22,
  },
  {
    title: "AC and HVAC issues — Copper & Cloves",
    summary: "Studio floor hitting 28°C during Strength Lab. Two members left class.",
    description:
      "HVAC not cooling the main room. Front desk already called the vendor. Live classes this evening are at risk.",
    category: "Repair and Maintenance",
    subcategory: "AC and HVAC Issues",
    status: "new",
    studio: "the Studio by Copper & Cloves, Bengaluru",
    classFormat: "Studio Strength Lab (Full Body)",
    trainer: "Pushyank Nahar",
    incidentAt: "Today",
    memberName: "Kabir Menon",
    memberEmail: "kabir.menon@email.com",
    memberPhone: "+919900112233",
    source: "iris",
    hoursAgo: 1,
  },
  {
    title: "Waitlist concerns — Kwality House",
    summary: "Member sat #1 on waitlist, spot opened, no notification.",
    description:
      "Barre 57 Express 6:30pm had a cancellation at 4:10pm. Member did not receive Momence or Yellow Messenger ping and lost the spot.",
    category: "Scheduling",
    subcategory: "Waitlist Concerns",
    status: "in_progress",
    studio: "Kwality House, Kemps Corner",
    classFormat: "Studio Barre 57 Express",
    trainer: "Kajol Kanchan",
    membership: "Barre 1 month Unlimited",
    incidentAt: "Yesterday",
    memberName: "Sana Kapoor",
    memberEmail: "sana.kapoor@email.com",
    memberPhone: "+919811122233",
    source: "iris",
    hoursAgo: 28,
  },
  {
    title: "Front desk attitude — Supreme HQ",
    summary: "Member felt dismissed when asking about freeze policy.",
    description:
      "Asked about a two-week freeze before a wedding. Was told 'that's not how it works' without explanation or an Accounts handoff.",
    category: "Customer Service and Communication",
    subcategory: "Front Desk Attitude",
    status: "assigned",
    studio: "Supreme HQ, Bandra",
    membership: "Studio 3 Month Unlimited Membership",
    incidentAt: "Earlier this week",
    memberName: "Rhea Lobo",
    memberEmail: "rhea.lobo@email.com",
    memberPhone: "+919833344455",
    source: "template",
    hoursAgo: 40,
  },
  {
    title: "Brand tone consistency — Instagram",
    summary: "Reel caption used slang that doesn't match Physique 57 voice.",
    description:
      "Yesterday's Reel used 'grind till you cry'. Member (and a trainer) flagged it as off-brand versus sculpted, precise hospitality.",
    category: "Brand Feedback",
    subcategory: "Brand Tone Consistency",
    status: "resolved",
    studio: "Kwality House, Kemps Corner",
    incidentAt: "Yesterday",
    memberName: "Ishaan Verma",
    memberEmail: "ishaan.v@email.com",
    memberPhone: "+919812345678",
    source: "iris",
    hoursAgo: 30,
  },
  {
    title: "Emergency exits blocked — Kenkere House",
    summary: "Delivery cart parked across the rear emergency exit before 8am class.",
    description:
      "Water crate delivery left a trolley in front of the rear exit. Cleared after 12 minutes. Needs a vendor protocol.",
    category: "Safety and Security",
    subcategory: "Emergency Exits Blocked",
    status: "in_progress",
    studio: "Kenkere House, Bengaluru",
    incidentAt: "Today",
    memberName: "Shifa desk report",
    memberEmail: "shifa@physique57bengaluru.com",
    memberPhone: "+918000000001",
    source: "staff",
    hoursAgo: 6,
  },
  {
    title: "Steam room not working — Kwality House",
    summary: "Steam stays cold. Third report this month.",
    description: "Unit produces no steam after 15 minutes. Members using it as part of Recovery ritual.",
    category: "Studio Amenities and Facilities",
    subcategory: "Steam Room Not Working",
    status: "waiting_on_vendor",
    studio: "Kwality House, Kemps Corner",
    incidentAt: "Ongoing",
    memberName: "Natasha Singh",
    memberEmail: "natasha.singh@email.com",
    memberPhone: "+919800011122",
    source: "iris",
    hoursAgo: 54,
  },
  {
    title: "Momence class listing error — Bandra",
    summary: "Cardio Barre Plus listed as Foundations on the Friday 9am slot.",
    description:
      "Members booked expecting Foundations. Format on the floor was Cardio Barre Plus. Two newcomers left 10 minutes in.",
    category: "Operating Systems",
    subcategory: "Error in Class Listings",
    status: "assigned",
    studio: "Supreme HQ, Bandra",
    classFormat: "Studio Cardio Barre Plus",
    trainer: "Rohan Dahima",
    incidentAt: "Last week",
    memberName: "Tara Bajaj",
    memberEmail: "tara.bajaj@email.com",
    memberPhone: "+919877766655",
    source: "iris",
    hoursAgo: 80,
  },
  {
    title: "Scent sensitivities — Courtside",
    summary: "New diffuser in lounge triggered a member's asthma.",
    description: "Strong white-tea diffuser at reception. Member needed to sit outside before class.",
    category: "Miscellaneous",
    subcategory: "Scent Sensitivities",
    status: "closed",
    studio: "Courtside, Mumbai",
    incidentAt: "Last week",
    memberName: "Leela Nair",
    memberEmail: "leela.nair@email.com",
    memberPhone: "+919700011144",
    source: "template",
    hoursAgo: 120,
  },
];

let seeded = false;
let seedPromise: Promise<void> | undefined;
export async function ensureSeeded() {
  if (seeded) return;
  if (!seedPromise) seedPromise = db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(578157)`);
    const [marker] = await tx.select().from(appSettings).where(eq(appSettings.key,"workspace-initialized"));
    if (marker) return;
  const existing = await tx.select({ id: departments.id }).from(departments).limit(1);
  if (existing.length === 0) {
    await tx.insert(departments).values([...DEPARTMENT_RECORDS]).onConflictDoNothing();
  }
  const staffExisting = await tx.select({ id: staff.id }).from(staff).limit(1);
  if (staffExisting.length === 0) {
    await tx.insert(staff).values(STAFF).onConflictDoNothing();
  }
  const ticketExisting = await tx.select({ id: tickets.id }).from(tickets).limit(1);
  if (ticketExisting.length === 0) {
    for (const sample of SAMPLE_TICKETS) {
      const priority = inferPriority({
        category: sample.category,
        subcategory: sample.subcategory,
        isClassImpacted: sample.category === "Repair and Maintenance" ? "Yes" : undefined,
      });
      const assignment = assignTicket(sample.category, sample.studio);
      const slaHours = slaHoursFor(priority);
      const createdAt = new Date(Date.now() - sample.hoursAgo * 60 * 60 * 1000);
      const [row] = await tx
        .insert(tickets)
        .values({
          ticketNumber: "P57-SEED-" + crypto.randomUUID(),
          title: sample.title,
          summary: sample.summary,
          description: sample.description,
          category: sample.category,
          subcategory: sample.subcategory,
          status: sample.status,
          priority,
          severity: inferSeverity(priority),
          sentiment: "frustrated",
          studio: sample.studio,
          classFormat: sample.classFormat,
          trainer: sample.trainer,
          membership: sample.membership,
          incidentAt: sample.incidentAt,
          memberName: sample.memberName,
          memberEmail: sample.memberEmail,
          memberPhone: sample.memberPhone,
          preferredContact: "WhatsApp",
          assignedStaffId: assignment.staff.id,
          assignedStaffName: assignment.staff.name,
          assignedStaffEmail: assignment.staff.email,
          departmentId: assignment.departmentId,
          departmentName: assignment.departmentName,
          slaHours,
          slaDueAt: hoursFromNow(slaHours - sample.hoursAgo),
          source: sample.source,
          channel: sample.source === "iris" ? "chat" : "staff",
          tags: [sample.category, sample.subcategory, priority],
          customFields: { _demo: true },
          createdAt,
          updatedAt: createdAt,
          resolvedAt: sample.status === "resolved" || sample.status === "closed" ? createdAt : null,
          closedAt: sample.status === "closed" ? createdAt : null,
        })
        .returning();

      await tx
        .update(tickets)
        .set({ ticketNumber: ticketNumberFor(row.id) })
        .where(eq(tickets.id, row.id));

      await tx.insert(ticketActivities).values({
        ticketId: row.id,
        actorName: "IRIS",
        action: "created",
        detail: `Filed via ${sample.source} and assigned to ${assignment.staff.name}.`,
        createdAt,
      });
      if (sample.comment) {
        await tx.insert(ticketComments).values({
          ticketId: row.id,
          authorName: assignment.staff.name,
          authorRole: assignment.staff.role,
          body: sample.comment,
          isInternal: true,
        });
      }
    }
  }

    await tx.insert(appSettings).values({key:"workspace-initialized",value:{initialized:true}}).onConflictDoNothing();
  }).then(() => { seeded = true; }).catch(error => { seedPromise=undefined; throw error; });
  await seedPromise;
}

export async function persistSession(
  sessionId: string,
  phase: string,
  collected: Record<string, unknown>,
  draft?: Record<string, unknown> | null,
  ticket?: { id: number; ticketNumber: string } | null,
) {
  const existing = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).limit(1);
  const payload = {
    phase,
    collected,
    missing: [],
    draft: draft ?? null,
    ticketId: ticket?.id ?? null,
    ticketNumber: ticket?.ticketNumber ?? null,
    updatedAt: new Date(),
  };
  if (existing.length) {
    await db.update(chatSessions).set(payload).where(eq(chatSessions.id, sessionId));
  } else {
    await db.insert(chatSessions).values({ id: sessionId, ...payload });
  }
}

export async function persistMessage(
  sessionId: string,
  role: string,
  content: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(chatMessages).values({
    sessionId,
    role,
    content,
    meta: meta ?? null,
  });
}
