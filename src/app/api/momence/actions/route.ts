import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { momenceConfigured, momenceRequest } from '@/lib/momence';
import { requireWorkspace, sameOrigin } from '@/lib/auth';

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

const performedActions: ActionReceipt[] = [];
const grantedCredits: Record<string, number> = {};
const membershipExtensions: Record<string, number> = {};
const trainerSubstitutions: Record<string, string> = {};

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
    const memberId = sp.get('memberId');
    const sessionId = sp.get('sessionId');

    let history = [...performedActions];
    if (memberId) {
      history = history.filter((a) => a.targetId === memberId || a.targetName.toLowerCase().includes(memberId.toLowerCase()));
    } else if (sessionId) {
      history = history.filter((a) => a.targetId === sessionId);
    }

    const currentBonusCredits = memberId ? grantedCredits[memberId] || 0 : 0;
    const currentExtensionDays = memberId ? membershipExtensions[memberId] || 0 : 0;
    const currentSubstitutedTrainer = sessionId ? trainerSubstitutions[sessionId] : undefined;

    return NextResponse.json({
      live,
      history: live ? history.slice(0, 20) : [],
      bonusCredits: live ? currentBonusCredits : 0,
      extensionDays: live ? currentExtensionDays : 0,
      substitutedTrainer: live ? currentSubstitutedTrainer : undefined,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireWorkspace();
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
        grantedCredits[body.memberId] = (grantedCredits[body.memberId] || 0) + body.credits;
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
        membershipExtensions[body.memberId] = (membershipExtensions[body.memberId] || 0) + body.extensionDays;
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
        trainerSubstitutions[body.sessionId] = body.substituteTrainer;
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

    const receipt: ActionReceipt = {
      id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: body.action,
      targetType: body.action === 'substitute_trainer' ? 'session' : 'member',
      targetId: (body.action === 'substitute_trainer' ? body.sessionId : body.memberId) || '',
      targetName: (body.action === 'substitute_trainer' ? body.sessionName : body.memberName) || '',
      summary,
      details,
      performedAt: timestamp,
      performedBy: user?.name || 'Studio Duty Manager',
      status: 'synced',
      momenceRef,
    };

    performedActions.unshift(receipt);

    return NextResponse.json({
      success: true,
      receipt,
      bonusCredits: body.memberId ? grantedCredits[body.memberId] || 0 : 0,
      extensionDays: body.memberId ? membershipExtensions[body.memberId] || 0 : 0,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
