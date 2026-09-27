import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  tickets,
  staff,
  departments,
  ticketActivities,
  ticketLinks,
} from "@/db/schema";
import {
  ApiError,
  requireAgent,
  requireWorkspace,
  requireTicketAccess,
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
    // Access is checked inside, before any private read; the resolution workspace is only
    // included for the assigned owner or their reporting manager.
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
        description: z.string().min(12).max(20000).optional(),
        requestedResolution: z.string().max(2000).optional(),
      })
      .parse(await req.json());
    const [[current], cfg] = await Promise.all([
      db.select().from(tickets).where(eq(tickets.id, id)),
      getConfig(),
    ]);
    if (!current) throw new ApiError("Ticket not found", 404);
    requireTicketAccess(actor, current);
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
    return Response.json({ ticket: result, followUpTickets: [] });
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
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
