import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  tickets,
  staff,
  departments,
  ticketActivities,
  ticketLinks,
  chatSessions,
  auditLogs,
} from "@/db/schema";
import {
  ApiError,
  canEditTicketDetails,
  requireAgent,
  requireWorkspace,
  requireTicketAccess,
  requireAdmin,
  errorResponse,
  sameOrigin,
} from "@/lib/auth";
import {
  getTicketBundle,
  makeDraft,
  createTicketFromDraft,
  resolveTicket,
  assertStatusTransition,
  statusTimestamps,
  slaHoursFor,
  stripReservedFields,
} from "@/lib/tickets";
import { getConfig } from "@/lib/config";
import { emitTicketEvent } from "@/lib/ticket-events";
import { inferSeverity } from "@/lib/routing";
import { enforceRateLimit } from "@/lib/rate-limit";
import { after } from "next/server";
import { signalChanged } from "@/lib/realtime";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const actor = await requireWorkspace();
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((await ctx.params).id);
    // Ticket access is checked inside; resolution history is included for every viewer.
    // Editing remains restricted to the owner and their reporting manager.
    const bundle = await getTicketBundle(id, actor);
    if (!bundle) throw new ApiError("Ticket not found", 404);
    return Response.json(bundle);
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    await enforceRateLimit("ticketWrite");
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((await ctx.params).id);
    const b = z
      .object({
        version: z.number().int(),
        status: z
          .enum([
            "new",
            "triaged",
            "assigned",
            "in_progress",
            "waiting_on_member",
            "waiting_on_vendor",
            "resolved",
            "closed",
            "recorded",
          ])
          .optional(),
        priority: z.enum(["critical", "high", "medium", "low"]).optional(),
        assignedStaffId: z.number().int().positive().optional(),
        isEscalated: z.boolean().optional(),
        title: z.string().min(3).max(240).optional(),
        summary: z.string().min(3).max(1000).optional(),
        description: z.string().min(12).max(20000).optional(),
        requestedResolution: z.string().max(2000).optional(),
        impact: z.string().max(2000).optional(),
        memberName: z.string().min(2).max(120).optional(),
        memberEmail: z.union([z.string().email(), z.literal("")]).optional(),
        memberPhone: z.string().max(30).optional(),
        studio: z.string().min(1).max(160).optional(),
        incidentAt: z.string().min(1).max(160).optional(),
        classFormat: z.string().max(160).optional(),
        trainer: z.string().max(160).optional(),
        membership: z.string().max(200).optional(),
        preferredContact: z.string().max(50).optional(),
      })
      .parse(await req.json());
    const [[current], cfg] = await Promise.all([
      db.select().from(tickets).where(eq(tickets.id, id)),
      getConfig(),
    ]);
    if (!current) throw new ApiError("Ticket not found", 404);
    requireTicketAccess(actor, current);
    /**
     * The documented facts of the ticket: what happened, who it is about, where and when.
     *
     * These are not routing — they are the account of the incident, and the person who wrote
     * it is the person who can correct it. An administrator may edit any ticket; everybody
     * else, agents included, may edit the ones they filed. Somebody who mistyped a member's
     * phone number or left out half the story should not have to find an administrator to fix
     * their own words, which is what the old blanket rule required.
     *
     * Still refused for a ticket you merely have access to: an agent can see every ticket at
     * their studio (see `canAccessTicket`), and being able to read a colleague's report is not
     * a reason to be able to rewrite it.
     */
    const documentedFields = [
      "title",
      "summary",
      "description",
      "requestedResolution",
      "impact",
      "memberName",
      "memberEmail",
      "memberPhone",
      "studio",
      "incidentAt",
      "classFormat",
      "trainer",
      "membership",
      "preferredContact",
    ] as const;
    const editsDetails = documentedFields.some((key) => b[key] !== undefined);
    if (editsDetails && !canEditTicketDetails(actor, current))
      throw new ApiError(
        current.createdByUserId
          ? "Only the person who filed this ticket, or an administrator, can edit its details."
          : "This ticket was filed outside the workspace, so it has no author — an administrator can edit it.",
        403,
      );
    let ownerFields = {};
    if (b.assignedStaffId) {
      const [p] = await db
        .select()
        .from(staff)
        .where(and(eq(staff.id, b.assignedStaffId), eq(staff.isActive, true)));
      if (!p) throw new ApiError("Choose an active owner");
      const [d] = await db
        .select()
        .from(departments)
        .where(eq(departments.name, p.department));
      if (!d?.active) throw new ApiError("Owner department is inactive");
      ownerFields = {
        assignedStaffId: p.id,
        assignedStaffName: p.name,
        assignedStaffEmail: p.email,
        departmentId: d.id,
        departmentName: d.name,
      };
    }
    // Same rule as makeDraft: an administrator's per-subcategory SLA override wins over the
    // priority's default response target.
    const sla =
      b.priority && current.resolutionRequired
        ? (() => {
            const hours = slaHoursFor(cfg, current.category, current.subcategory, b.priority);
            return {
              slaHours: hours,
              slaDueAt: new Date(current.createdAt.getTime() + hours * 3600000),
              severity: inferSeverity(b.priority),
            };
          })()
        : b.priority
          ? { severity: inferSeverity(b.priority) }
          : {};
    const { version, status, ...fields } = b;
    const detail = Object.entries(b)
      .filter(([k]) => k !== "version")
      .map(([k, v]) => `${k}: ${v}`)
      .join(" · ");
    // Resolving and closing go through the shared resolveTicket, which enforces the resolver,
    // the private resolution record, the reopen policy and the caller's revision, and raises
    // the recurrence checks.
    if (status === "resolved" || status === "closed") {
      const { ticket, followUps } = await resolveTicket(actor, {
        ticketId: id,
        version,
        status,
        extra: { ...fields, ...ownerFields, ...sla },
        detail,
      });
      // The write landed: tell the other open boards, so a teammate sees this without
      // waiting for their poll. Advisory only — see lib/realtime.
      after(() => signalChanged("tickets"));
      return Response.json({
        ticket,
        followUpTickets: followUps.map((f) => ({ id: f.id, ticketNumber: f.ticketNumber })),
      });
    }
    if (status) await assertStatusTransition(actor, current, status, cfg);
    const result = await db.transaction(async (tx) => {
      const [t] = await tx
        .update(tickets)
        .set({
          ...fields,
          ...(status ? { status, ...statusTimestamps(current, status) } : {}),
          ...ownerFields,
          ...sla,
          version: sql`${tickets.version}+1`,
          updatedAt: new Date(),
        })
        .where(and(eq(tickets.id, id), eq(tickets.version, version)))
        .returning();
      if (!t)
        throw new ApiError(
          "This ticket changed elsewhere. Refresh before saving.",
          409,
        );
      await tx.insert(ticketActivities).values({
        ticketId: id,
        actorName: actor.name,
        action: "updated",
        detail,
      });
      // One save can legitimately be both a status change and a reassignment; each
      // gets its own event so a workflow can subscribe to either alone.
      if (status && status !== current.status)
        await emitTicketEvent(tx, {
          type: "ticket.status_changed",
          ticket: t,
          cfg,
          actor,
          changes: { status: { from: current.status, to: status } },
        });
      if (
        t.assignedStaffId !== null &&
        t.assignedStaffId !== current.assignedStaffId
      )
        await emitTicketEvent(tx, {
          type: "ticket.assigned",
          ticket: t,
          cfg,
          actor,
          changes: {
            assignedStaffId: {
              from: current.assignedStaffId,
              to: t.assignedStaffId,
            },
            assignedStaffName: {
              from: current.assignedStaffName,
              to: t.assignedStaffName,
            },
          },
        });
      return t;
    });
    // The write landed: tell the other open boards, so a teammate sees this without
    // waiting for their poll. Advisory only — see lib/realtime.
    after(() => signalChanged("tickets"));
    return Response.json({ ticket: result, followUpTickets: [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const actor = await requireAdmin();
    await enforceRateLimit("ticketWrite");
    const id = z.coerce.number().int().positive().parse((await ctx.params).id);
    const body = z
      .object({
        version: z.number().int(),
        confirmation: z.string().min(1),
      })
      .parse(await req.json());
    const [current] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!current) throw new ApiError("Ticket not found", 404);
    if (body.confirmation !== current.ticketNumber)
      throw new ApiError("Enter the ticket number exactly to confirm deletion.");

    await db.transaction(async (tx) => {
      // IRIS transcripts remain useful after a ticket is removed, but must not retain a
      // dead link to it. Everything with a declared ticket FK is removed by its cascade.
      await tx
        .update(chatSessions)
        .set({ ticketId: null, ticketNumber: null, updatedAt: new Date() })
        .where(eq(chatSessions.ticketId, id));
      const [deleted] = await tx
        .delete(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.version, body.version)))
        .returning({ id: tickets.id });
      if (!deleted)
        throw new ApiError("This ticket changed elsewhere. Refresh before deleting.", 409);
      await tx.insert(auditLogs).values({
        actorId: actor.id,
        actorName: actor.name,
        action: "ticket.deleted",
        entity: `ticket:${id}`,
        detail: {
          ticketNumber: current.ticketNumber,
          title: current.title,
          version: current.version,
        },
      });
    });
    // The write landed: tell the other open boards, so a teammate sees this without
    // waiting for their poll. Advisory only — see lib/realtime.
    after(() => signalChanged("tickets"));
    return Response.json({ ok: true, id });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request, ctx: Ctx) {
  try {
    sameOrigin(req);
    const actor = await requireAgent();
    const id = z.coerce
      .number()
      .int()
      .positive()
      .parse((await ctx.params).id);
    const b = z
      .object({
        action: z.enum(["duplicate", "link", "unlink"]),
        relatedId: z.number().int().positive().optional(),
      })
      .parse(await req.json());
    const [t] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!t) throw new ApiError("Ticket not found", 404);
    requireTicketAccess(actor, t);
    if (b.action === "duplicate") {
      // The copy is a fresh report: none of the original's internal markers (routing brief,
      // automation parentage, repeat counter, demo flag) carry over.
      const draft = await makeDraft({
        ...t,
        customFields: stripReservedFields(t.customFields || {}),
        title: "Copy · " + t.title,
        source: "manual",
        submissionKey: crypto.randomUUID(),
        memberEmail: t.memberEmail || "",
        memberPhone: t.memberPhone || undefined,
        incidentAt: t.incidentAt || "Not recorded",
        momenceMemberId: t.momenceMemberId || undefined,
        momenceSessionId: t.momenceSessionId || undefined,
        membership: t.membership || undefined,
        classFormat: t.classFormat || undefined,
        trainer: t.trainer || undefined,
        requestedResolution: t.requestedResolution || undefined,
        impact: t.impact || undefined,
        momenceContext: t.momenceContext || undefined,
        templateId: t.templateId || undefined,
        preferredContact: t.preferredContact || "Email",
        sentiment: t.sentiment || "neutral",
      });
      const copy = await createTicketFromDraft(draft);
      await db
        .insert(ticketLinks)
        .values({
          ticketId: Math.min(id, copy.id),
          relatedId: Math.max(id, copy.id),
          relation: "duplicate",
        })
        .onConflictDoNothing();
      // The write landed: tell the other open boards, so a teammate sees this without
      // waiting for their poll. Advisory only — see lib/realtime.
      after(() => signalChanged("tickets"));
      return Response.json({ ticket: copy });
    }
    if (!b.relatedId || b.relatedId === id)
      throw new ApiError("Choose a different ticket");
    const [related] = await db
      .select({
        id: tickets.id,
        assignedStaffId: tickets.assignedStaffId,
        createdByUserId: tickets.createdByUserId,
        departmentName: tickets.departmentName,
        studio: tickets.studio,
      })
      .from(tickets)
      .where(eq(tickets.id, b.relatedId));
    if (!related) throw new ApiError("Related ticket not found", 404);
    // Linking reveals one ticket from the other, so the caller must be able to open both.
    requireTicketAccess(actor, related);
    const a = Math.min(id, b.relatedId),
      r = Math.max(id, b.relatedId);
    if (b.action === "link")
      await db
        .insert(ticketLinks)
        .values({ ticketId: a, relatedId: r })
        .onConflictDoNothing();
    else
      await db
        .delete(ticketLinks)
        .where(and(eq(ticketLinks.ticketId, a), eq(ticketLinks.relatedId, r)));
    await db
      .insert(ticketActivities)
      .values({
        ticketId: id,
        actorName: actor.name,
        action: b.action,
        detail: "Ticket " + b.relatedId,
      });
    // The write landed: tell the other open boards, so a teammate sees this without
    // waiting for their poll. Advisory only — see lib/realtime.
    after(() => signalChanged("tickets"));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
