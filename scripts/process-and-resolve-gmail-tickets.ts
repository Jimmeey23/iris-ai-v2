import { db } from "../src/db/index";
import {
  departments,
  staff,
  appUsers,
  ticketResolutions,
  ticketActivities,
  tickets,
} from "../src/db/schema";
import { makeDraft, createTicketFromDraft } from "../src/lib/tickets";
import { eq } from "drizzle-orm";
import { generateComprehensiveMailboxDataset } from "../src/lib/gmail-dataset";
import { DEPARTMENT_RECORDS } from "../src/lib/constants";
import { STAFF } from "../src/lib/staff-directory";

async function main() {
  console.log("=== Seeding Base Reference Data in Iris V2 ===");

  // 1. Seed Departments
  for (const d of DEPARTMENT_RECORDS) {
    await db.insert(departments).values(d).onConflictDoNothing();
  }

  // 2. Seed Staff from STAFF directory
  for (const s of STAFF) {
    await db.insert(staff).values(s).onConflictDoNothing();
    await db.insert(appUsers).values({
      id: s.id,
      email: s.email,
      name: s.name,
      role: s.role.toLowerCase().includes("lead") || s.role.toLowerCase().includes("head") ? "admin" : "agent",
      department: s.department,
      studio: s.location,
      active: s.isActive ?? true,
    }).onConflictDoNothing();
  }

  const allEmailTickets = generateComprehensiveMailboxDataset();

  console.log(`\n=== Generating, Publishing & Resolving ${allEmailTickets.length} Tickets ===\n`);

  const results: Array<{
    ticketNumber: string;
    title: string;
    category: string;
    subcategory: string;
    studio: string;
    owner: string;
    priority: string;
    status: string;
  }> = [];

  for (let i = 0; i < allEmailTickets.length; i++) {
    const item = allEmailTickets[i];

    // 1. Make draft
    const draft = await makeDraft({
      title: item.title,
      description: item.description,
      category: item.category,
      subcategory: item.subcategory,
      studio: item.studio,
      priority: item.priority as any,
      sentiment: item.sentiment as any,
      source: "gmail",
      sourceRef: item.sourceRef,
      memberName: item.memberName,
      memberEmail: item.memberEmail,
      memberPhone: item.memberPhone,
      membership: item.membership,
      incidentAt: item.incidentAt,
      preferredContact: item.preferredContact,
      requestedResolution: item.requestedResolution,
      customFields: item.customFields,
      auditNote: `Generated from Gmail issue extraction: ${item.sourceRef}`,
    });

    // 2. Publish ticket into live state
    const createdTicket = await createTicketFromDraft(draft);

    // 3. Resolve ticket
    const now = new Date();
    await db
      .update(tickets)
      .set({
        status: "resolved",
        resolvedAt: now,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(tickets.id, createdTicket.id));

    // 4. Create resolution record
    const authorId = createdTicket.assignedStaffId ?? 1;
    await db.insert(ticketResolutions).values({
      ticketId: createdTicket.id,
      authorUserId: authorId,
      rootCause: item.resolution.rootCause,
      actionTaken: item.resolution.actionTaken,
      preventiveAction: item.resolution.preventiveAction,
      memberOutcome: item.resolution.memberOutcome,
    });

    // 5. Create activity record
    await db.insert(ticketActivities).values({
      ticketId: createdTicket.id,
      actorName: createdTicket.assignedStaffName || "Operations System",
      action: "resolved",
      detail: `Ticket resolved with root cause: ${item.resolution.rootCause}`,
    });

    results.push({
      ticketNumber: createdTicket.ticketNumber,
      title: createdTicket.title,
      category: createdTicket.category,
      subcategory: createdTicket.subcategory,
      studio: createdTicket.studio || "",
      owner: createdTicket.assignedStaffName || "Operations",
      priority: createdTicket.priority,
      status: "resolved",
    });

    if (i < 25 || i % 50 === 0 || i === allEmailTickets.length - 1) {
      console.log(`✓ [${createdTicket.ticketNumber}] ${createdTicket.title}`);
      console.log(`  Category: ${createdTicket.category} > ${createdTicket.subcategory} | Studio: ${createdTicket.studio}`);
      console.log(`  Assigned Owner: ${createdTicket.assignedStaffName} | Priority: ${createdTicket.priority}`);
      console.log(`  Status: RESOLVED`);
    }
  }

  console.log(`\n=== All ${results.length} Tickets Published & Marked Resolved Successfully ===\n`);
  console.table(results.slice(0, 25));
  console.log(`... and ${results.length - 25} more tickets resolved.`);
}

main().catch((err) => {
  console.error("Error executing processing script:", err);
  process.exit(1);
});

