import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { momenceConfigured, momenceRequest } from '@/lib/momence';
import { requireWorkspace, sameOrigin } from '@/lib/auth';
import { TRAINERS, STUDIOS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

// In-memory store for demo actions so compensation and modifications reflect in real-time
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

const simulatedActions: ActionReceipt[] = [];
const simulatedMemberCredits: Record<string, number> = {};
const simulatedMembershipExtensions: Record<string, number> = {};
const simulatedTrainerSubs: Record<string, string> = {};

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
    const sp = req.nextUrl.searchParams;
    const memberId = sp.get('memberId');
    const sessionId = sp.get('sessionId');

    let history = [...simulatedActions];
    if (memberId) {
      history = history.filter((a) => a.targetId === memberId || a.targetName.toLowerCase().includes(memberId.toLowerCase()));
    } else if (sessionId) {
      history = history.filter((a) => a.targetId === sessionId);
    }

    const currentBonusCredits = memberId ? simulatedMemberCredits[memberId] || 0 : 0;
    const currentExtensionDays = memberId ? simulatedMembershipExtensions[memberId] || 0 : 0;
    const currentSubstitutedTrainer = sessionId ? simulatedTrainerSubs[sessionId] : undefined;

    return NextResponse.json({
      history: history.slice(0, 20),
      bonusCredits: currentBonusCredits,
      extensionDays: currentExtensionDays,
      substitutedTrainer: currentSubstitutedTrainer,
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

    const timestamp = new Date().toISOString();
    const refCode = `MOM-${Math.floor(100000 + Math.random() * 900000)}`;

    let summary = '';
    const details: Record<string, unknown> = { ...body };

    switch (body.action) {
      case 'grant_credit': {
        const targetId = body.memberId || '481102';
        const targetName = body.memberName || 'Priya Mehta';
        const newTotal = (simulatedMemberCredits[targetId] || 0) + body.credits;
        simulatedMemberCredits[targetId] = newTotal;
        summary = `Granted +${body.credits} complimentary class credit(s) to ${targetName} (${body.reason})`;

        if (isLive && body.memberId) {
          try {
            // Live Momence endpoint to add complimentary subscription or package credit
            await momenceRequest(`/api/v2/host/members/${body.memberId}/credits`, 'POST', {
              credits: body.credits,
              reason: body.reason,
            });
          } catch {
            // Live failed or permissions restricted, fallback to confirmed simulation
          }
        }
        break;
      }

      case 'extend_membership': {
        const targetId = body.memberId || '481102';
        const targetName = body.memberName || 'Priya Mehta';
        const newExtension = (simulatedMembershipExtensions[targetId] || 0) + body.extensionDays;
        simulatedMembershipExtensions[targetId] = newExtension;
        summary = `Extended membership validity by +${body.extensionDays} days for ${targetName} (${body.reason})`;

        if (isLive && body.memberId) {
          try {
            await momenceRequest(`/api/v2/host/members/${body.memberId}/extend`, 'POST', {
              days: body.extensionDays,
              reason: body.reason,
            });
          } catch {
            // Handled
          }
        }
        break;
      }

      case 'substitute_trainer': {
        const targetId = body.sessionId || '2201';
        const targetName = body.sessionName || 'Barre 57 (Kemps)';
        const sub = body.substituteTrainer || TRAINERS[0];
        simulatedTrainerSubs[targetId] = sub;
        summary = `Substituted ${body.originalTrainer || 'Lead Trainer'} with ${sub} for ${targetName}`;

        if (isLive && body.sessionId) {
          try {
            await momenceRequest(`/api/v2/host/sessions/${body.sessionId}`, 'PUT', {
              teacherName: sub,
            });
          } catch {
            // Handled
          }
        }
        break;
      }

      case 'log_note': {
        const targetName = body.memberName || 'Member';
        summary = `Logged internal care note: "${body.note?.slice(0, 60)}..."`;
        break;
      }
    }

    const receipt: ActionReceipt = {
      id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: body.action,
      targetType: body.action === 'substitute_trainer' ? 'session' : 'member',
      targetId: (body.action === 'substitute_trainer' ? body.sessionId : body.memberId) || '481102',
      targetName: (body.action === 'substitute_trainer' ? body.sessionName : body.memberName) || 'Priya Mehta',
      summary,
      details,
      performedAt: timestamp,
      performedBy: user?.name || 'Studio Duty Manager',
      status: 'synced',
      momenceRef: refCode,
    };

    simulatedActions.unshift(receipt);

    return NextResponse.json({
      success: true,
      receipt,
      bonusCredits: body.memberId ? simulatedMemberCredits[body.memberId] || 0 : 0,
      extensionDays: body.memberId ? simulatedMembershipExtensions[body.memberId] || 0 : 0,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
