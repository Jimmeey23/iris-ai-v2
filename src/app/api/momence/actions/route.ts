import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { momenceActionReceipts } from '@/db/schema';
import { momenceConfigured, momenceRequest } from '@/lib/momence';
import { errorResponse, requireAgent, requireWorkspace, sameOrigin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Receipts for actions that Momence actually accepted. Nothing is recorded here unless the
// live call succeeded, because a receipt is the only evidence staff get that a member really
// received their credit — a simulated one is worse than no receipt at all.
interface ActionReceipt {
  id: string;
  action: 'grant_credit' | 'extend_membership' | 'substitute_trainer' | 'log_note';
  targetType: 'member' | 'session';
  targetId: string;
  targetName: string;
  summary: string;
  details: Record<string, unknown>;
  performedAt: string;
  performedBy: string;
  status: 'synced' | 'pending';
  momenceRef: string;
}

/**
 * Receipts live in the database.
 *
 * They were four module-scope collections: an array of receipts and three running totals.
 * That meant a receipt written by one user was visible to every other user sharing the
 * process, the totals were wrong the moment a second instance served a request, and the
 * whole lot vanished on restart — taking with it the only evidence staff had that a
 * member's credit was actually applied.
 *
 * The running totals are no longer stored at all. They are derived from the receipts, which
 * is where the information already was; keeping a second copy is how the two disagree.
 */
async function recentReceipts(filter: {memberId?: string; sessionId?: string}) {
  const where = filter.memberId
    ? and(eq(momenceActionReceipts.targetType, 'member'), eq(momenceActionReceipts.targetId, filter.memberId))
    : filter.sessionId
      ? and(eq(momenceActionReceipts.targetType, 'session'), eq(momenceActionReceipts.targetId, filter.sessionId))
      : undefined;
  const rows = await db
    .select()
    .from(momenceActionReceipts)
    .where(where)
    .orderBy(desc(momenceActionReceipts.performedAt))
    .limit(20);
  return rows.map((r): ActionReceipt => ({
    id: r.id,
    action: r.action as ActionReceipt['action'],
    targetType: r.targetType as ActionReceipt['targetType'],
    targetId: r.targetId,
    targetName: r.targetName,
    summary: r.summary,
    details: r.details,
    performedAt: r.performedAt.toISOString(),
    performedBy: r.performedBy,
    status: r.status as ActionReceipt['status'],
    momenceRef: r.momenceRef,
  }));
}

/** Totals added up from the receipts themselves, so they cannot drift from the evidence. */
async function memberTotals(memberId: string) {
  const [row] = await db
    .select({
      credits: sql<number>`coalesce(sum((${momenceActionReceipts.details}->>'credits')::int) filter (where ${momenceActionReceipts.action} = 'grant_credit'), 0)::int`,
      days: sql<number>`coalesce(sum((${momenceActionReceipts.details}->>'extensionDays')::int) filter (where ${momenceActionReceipts.action} = 'extend_membership'), 0)::int`,
    })
    .from(momenceActionReceipts)
    .where(and(eq(momenceActionReceipts.targetType, 'member'), eq(momenceActionReceipts.targetId, memberId)));
  return {credits: Number(row?.credits) || 0, days: Number(row?.days) || 0};
}

async function currentSubstitute(sessionId: string) {
  const [row] = await db
    .select({details: momenceActionReceipts.details})
    .from(momenceActionReceipts)
    .where(and(
      eq(momenceActionReceipts.targetType, 'session'),
      eq(momenceActionReceipts.targetId, sessionId),
      eq(momenceActionReceipts.action, 'substitute_trainer'),
    ))
    .orderBy(desc(momenceActionReceipts.performedAt))
    .limit(1);
  const name = row?.details?.substituteTrainer;
  return typeof name === 'string' ? name : undefined;
}

/** Momence's own id for the change, so the receipt points at something real. */
function refOf(res: unknown): string {
  const r = (res && typeof res === 'object' ? res : {}) as Record<string, unknown>;
  const id = r.id ?? r.referenceId ?? (r.data && typeof r.data === 'object' ? (r.data as Record<string, unknown>).id : undefined);
  return id === undefined || id === null ? '' : String(id);
}

const ActionSchema = z.object({
  action: z.enum(['grant_credit', 'extend_membership', 'substitute_trainer', 'log_note']),
  memberId: z.string().optional(),
  memberName: z.string().optional(),
  sessionId: z.string().optional(),
  sessionName: z.string().optional(),
  studio: z.string().optional(),
  credits: z.number().int().min(1).max(10).default(1),
  reason: z.string().default('Service Recovery / AC Disruption'),
  extensionDays: z.number().int().min(1).max(90).default(7),
  substituteTrainer: z.string().optional(),
  originalTrainer: z.string().optional(),
  note: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireWorkspace();
    const live = await momenceConfigured();
    const sp = req.nextUrl.searchParams;
    const memberId = sp.get('memberId') || undefined;
    const sessionId = sp.get('sessionId') || undefined;

    if (!live) {
      return NextResponse.json({live, history: [], bonusCredits: 0, extensionDays: 0, substitutedTrainer: undefined});
    }

    const [history, totals, substitutedTrainer] = await Promise.all([
      recentReceipts({memberId, sessionId}),
      memberId ? memberTotals(memberId) : Promise.resolve({credits: 0, days: 0}),
      sessionId ? currentSubstitute(sessionId) : Promise.resolve(undefined),
    ]);

    return NextResponse.json({
      live,
      history,
      bonusCredits: totals.credits,
      extensionDays: totals.days,
      substitutedTrainer,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    // This grants credits and extends memberships in the live Momence account. Reading the
    // receipts is a workspace matter; writing to a member's billing is not.
    const user = await requireAgent();
    const body = ActionSchema.parse(await req.json());
    const isLive = await momenceConfigured();
    // Without a live connection there is no member to credit and no session to change.
    // Recording a receipt anyway told staff a compensation had been applied when nothing
    // had left this process.
    if (!isLive) {
      return NextResponse.json(
        { error: 'Momence is not connected. Connect it in Integrations before running member actions.' },
        { status: 409 }
      );
    }

    const timestamp = new Date().toISOString();

    let summary = '';
    let momenceRef = '';
    const details: Record<string, unknown> = { ...body };

    switch (body.action) {
      case 'grant_credit': {
        if (!body.memberId) return NextResponse.json({ error: 'Select a Momence member before granting credit.' }, { status: 400 });
        const targetName = body.memberName || `Member ${body.memberId}`;
        // The live call is the action. If it throws, the error reaches the user rather than
        // being swallowed into a receipt that claims success.
        const res = await momenceRequest(`/api/v2/host/members/${body.memberId}/credits`, 'POST', {
          credits: body.credits,
          reason: body.reason,
        });
        momenceRef = refOf(res);
        summary = `Granted +${body.credits} complimentary class credit(s) to ${targetName} (${body.reason})`;
        break;
      }

      case 'extend_membership': {
        if (!body.memberId) return NextResponse.json({ error: 'Select a Momence member before extending a membership.' }, { status: 400 });
        const targetName = body.memberName || `Member ${body.memberId}`;
        const res = await momenceRequest(`/api/v2/host/members/${body.memberId}/extend`, 'POST', {
          days: body.extensionDays,
          reason: body.reason,
        });
        momenceRef = refOf(res);
        summary = `Extended membership validity by +${body.extensionDays} days for ${targetName} (${body.reason})`;
        break;
      }

      case 'substitute_trainer': {
        if (!body.sessionId) return NextResponse.json({ error: 'Select a Momence session before substituting a trainer.' }, { status: 400 });
        if (!body.substituteTrainer) return NextResponse.json({ error: 'Choose the substitute trainer.' }, { status: 400 });
        const targetName = body.sessionName || `Session ${body.sessionId}`;
        const res = await momenceRequest(`/api/v2/host/sessions/${body.sessionId}`, 'PUT', {
          teacherName: body.substituteTrainer,
        });
        momenceRef = refOf(res);
        summary = `Substituted ${body.originalTrainer || 'the scheduled trainer'} with ${body.substituteTrainer} for ${targetName}`;
        break;
      }

      case 'log_note': {
        if (!body.memberId) return NextResponse.json({ error: 'Select a Momence member before logging a note.' }, { status: 400 });
        if (!body.note?.trim()) return NextResponse.json({ error: 'Write the note before saving it.' }, { status: 400 });
        const res = await momenceRequest(`/api/v2/host/members/${body.memberId}/notes`, 'POST', { note: body.note });
        momenceRef = refOf(res);
        summary = `Logged internal care note on ${body.memberName || `member ${body.memberId}`}: "${body.note.slice(0, 60)}"`;
        break;
      }
    }

    const targetType: ActionReceipt['targetType'] = body.action === 'substitute_trainer' ? 'session' : 'member';
    const targetId = (body.action === 'substitute_trainer' ? body.sessionId : body.memberId) || '';
    const receipt: ActionReceipt = {
      id: `rcpt-${randomUUID()}`,
      action: body.action,
      targetType,
      targetId,
      targetName: (body.action === 'substitute_trainer' ? body.sessionName : body.memberName) || '',
      summary,
      details,
      performedAt: timestamp,
      performedBy: user?.name || 'Studio Duty Manager',
      status: 'synced',
      momenceRef,
    };

    // Written only after the live call returned, so a receipt always stands for a change
    // Momence actually accepted.
    await db.insert(momenceActionReceipts).values({
      id: receipt.id,
      action: receipt.action,
      targetType: receipt.targetType,
      targetId: receipt.targetId,
      targetName: receipt.targetName,
      summary: receipt.summary,
      details,
      studio: body.studio ?? null,
      performedBy: receipt.performedBy,
      performedByUserId: user?.id ?? null,
      status: receipt.status,
      momenceRef,
    });

    const totals = body.memberId ? await memberTotals(body.memberId) : {credits: 0, days: 0};

    return NextResponse.json({
      success: true,
      receipt,
      bonusCredits: totals.credits,
      extensionDays: totals.days,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
