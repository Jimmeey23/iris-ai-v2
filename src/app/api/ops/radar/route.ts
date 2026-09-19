import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tickets, ticketActivities, ticketResolutions } from '@/db/schema';
import { eq, and, sql, notInArray, desc } from 'drizzle-orm';
import { z } from 'zod';
import { requireWorkspace, errorResponse, requireAgent, sameOrigin, ApiError } from '@/lib/auth';
import { canResolveTicket } from '@/lib/tickets';

export const dynamic = 'force-dynamic';

export interface RoomDefinition {
  id: string;
  name: string;
  category: 'workout' | 'wellness' | 'amenity' | 'admin';
  paxCapacity: number;
  currentPax: number;
  activeTrainer?: string;
  activeClass?: string;
  ambientTemp: number; // in Celsius
  acStatus: 'optimal' | 'calibrating' | 'service_required';
  soundStatus: 'optimal' | 'glitch' | 'offline';
  lightingStatus: 'optimal' | 'dimmed' | 'fault';
  gridArea?: string;
}

export interface StudioTopology {
  id: string;
  name: string;
  shortName: string;
  city: string;
  address: string;
  leadManager: string;
  contactNumber: string;
  rooms: RoomDefinition[];
}

export const STUDIOS_TOPOLOGY: StudioTopology[] = [
  {
    id: 'kwality',
    name: 'Kwality House, Kemps Corner',
    shortName: 'Kemps Corner',
    city: 'Mumbai',
    address: 'Kwality House, August Kranti Marg, Kemps Corner, Mumbai 400036',
    leadManager: 'Zahur Shaikh',
    contactNumber: '+91 98201 57571',
    rooms: [
      {
        id: 'studio-1',
        name: 'Studio 1',
        category: 'workout',
        paxCapacity: 22,
        currentPax: 18,
        activeTrainer: 'Rohan Dahl',
        activeClass: 'Barre 57 (Signature)',
        ambientTemp: 21.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'studio-2',
        name: 'Studio 2',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 11,
        activeTrainer: 'Tanya Sharma',
        activeClass: 'Studio FIT & Sculpt',
        ambientTemp: 22.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'powercycle',
        name: 'PowerCycle Studio',
        category: 'workout',
        paxCapacity: 10,
        currentPax: 9,
        activeTrainer: 'Kajol Tanna',
        activeClass: 'PowerCycle Ride 45',
        ambientTemp: 20.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'strength',
        name: 'Strength Studio',
        category: 'workout',
        paxCapacity: 7,
        currentPax: 6,
        activeTrainer: 'Mihir Jani',
        activeClass: 'Strength Lab (Upper)',
        ambientTemp: 21.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'his-space',
        name: 'His Space',
        category: 'wellness',
        paxCapacity: 8,
        currentPax: 2,
        ambientTemp: 23.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'her-space',
        name: 'Her Space',
        category: 'wellness',
        paxCapacity: 14,
        currentPax: 5,
        ambientTemp: 22.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'guest-washroom',
        name: 'GUEST WASHROOM',
        category: 'wellness',
        paxCapacity: 3,
        currentPax: 1,
        ambientTemp: 23.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'brain-cell',
        name: 'Brain Cell',
        category: 'admin',
        paxCapacity: 6,
        currentPax: 4,
        ambientTemp: 22.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'pantry',
        name: 'Pantry',
        category: 'amenity',
        paxCapacity: 5,
        currentPax: 2,
        ambientTemp: 23.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'reception',
        name: 'Reception / lobby',
        category: 'amenity',
        paxCapacity: 15,
        currentPax: 7,
        ambientTemp: 22.8,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
    ],
  },
  {
    id: 'supreme',
    name: 'Supreme HQ, Bandra',
    shortName: 'Bandra HQ',
    city: 'Mumbai',
    address: 'Supreme HQ, 14th Road, Bandra West, Mumbai 400050',
    leadManager: 'Ananya Roy',
    contactNumber: '+91 98201 57572',
    rooms: [
      {
        id: 'bandra-studio-1',
        name: 'Studio 1',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 12,
        activeTrainer: 'Anushka Sen',
        activeClass: 'Barre 57 (Classic)',
        ambientTemp: 21.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'bandra-studio-2',
        name: 'Studio 2',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 10,
        activeTrainer: 'Atulan Purohit',
        activeClass: 'Cardio Barre Extreme',
        ambientTemp: 21.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'bandra-cycle',
        name: 'PowerCycle Studio',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 13,
        activeTrainer: 'Kajol Tanna',
        activeClass: 'PowerCycle Rhythm',
        ambientTemp: 19.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'bandra-reception',
        name: 'Reception / lobby',
        category: 'amenity',
        paxCapacity: 12,
        currentPax: 4,
        ambientTemp: 22.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'bandra-lockers',
        name: 'Lockers & Changing',
        category: 'wellness',
        paxCapacity: 16,
        currentPax: 6,
        ambientTemp: 23.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'bandra-washrooms',
        name: 'Washrooms',
        category: 'wellness',
        paxCapacity: 6,
        currentPax: 2,
        ambientTemp: 23.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
    ],
  },
  {
    id: 'kenkere',
    name: 'Kenkere House, Bengaluru',
    shortName: 'Indiranagar',
    city: 'Bengaluru',
    address: 'Kenkere House, 12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru 560038',
    leadManager: 'Kavita Hegde',
    contactNumber: '+91 80 4120 5757',
    rooms: [
      {
        id: 'kenkere-studio-1',
        name: 'Studio 1',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 9,
        activeTrainer: 'Drishti Amin',
        activeClass: 'Barre 57 (Foundations)',
        ambientTemp: 22.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'kenkere-studio-2',
        name: 'Studio 2',
        category: 'workout',
        paxCapacity: 13,
        currentPax: 8,
        activeTrainer: 'Siddharth Rao',
        activeClass: 'Studio Strength Lab',
        ambientTemp: 21.8,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'kenkere-reception',
        name: 'Reception / lobby',
        category: 'amenity',
        paxCapacity: 10,
        currentPax: 3,
        ambientTemp: 23.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'kenkere-changing',
        name: 'Washroom & Changing',
        category: 'wellness',
        paxCapacity: 10,
        currentPax: 4,
        ambientTemp: 23.2,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
    ],
  },
  {
    id: 'courtside',
    name: 'Courtside, Mumbai',
    shortName: 'Courtside',
    city: 'Mumbai',
    address: 'Courtside Sports & Fitness Arena, Mumbai',
    leadManager: 'Vikram Mehta',
    contactNumber: '+91 98201 57573',
    rooms: [
      {
        id: 'courtside-main',
        name: 'Main studio floor',
        category: 'workout',
        paxCapacity: 20,
        currentPax: 14,
        activeTrainer: 'Priya Dave',
        activeClass: 'Barre Cardio Boost',
        ambientTemp: 21.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'courtside-reception',
        name: 'Reception / lobby',
        category: 'amenity',
        paxCapacity: 8,
        currentPax: 2,
        ambientTemp: 22.5,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
      {
        id: 'courtside-lounge',
        name: 'Member lounge',
        category: 'amenity',
        paxCapacity: 10,
        currentPax: 5,
        ambientTemp: 23.0,
        acStatus: 'optimal',
        soundStatus: 'optimal',
        lightingStatus: 'optimal',
      },
    ],
  },
];

/** Matches a ticket to a studio room based on studio matching and area/text keywords */
function isTicketInRoom(ticket: Record<string, unknown>, studioId: string, roomName: string): boolean {
  const tStudio = String(ticket.studio || '').toLowerCase();
  const studioDef = STUDIOS_TOPOLOGY.find((s) => s.id === studioId);
  if (!studioDef) return false;

  const studioMatched =
    tStudio.includes(studioId) ||
    tStudio.includes(studioDef.shortName.toLowerCase()) ||
    tStudio.includes(studioDef.name.toLowerCase().split(',')[0]);

  if (!studioMatched) {
    // Unique room fallback: His Space, Her Space, Brain Cell, Pantry strictly at Kwality
    if (studioId === 'kwality') {
      const roomLower = roomName.toLowerCase();
      if (['his space', 'her space', 'guest washroom', 'brain cell', 'pantry'].includes(roomLower)) {
        const text = `${ticket.title} ${ticket.description} ${JSON.stringify(ticket.customFields || {})}`.toLowerCase();
        if (text.includes(roomLower)) return true;
      }
    }
    return false;
  }

  const cf = (ticket.customFields || {}) as Record<string, unknown>;
  const rawArea = String(cf.area || '').toLowerCase();
  const targetArea = roomName.toLowerCase();

  if (rawArea && (rawArea === targetArea || rawArea.includes(targetArea) || targetArea.includes(rawArea))) {
    return true;
  }

  // Check title, description, summary
  const bodyText = `${ticket.title} ${ticket.summary} ${ticket.description}`.toLowerCase();
  if (targetArea.includes('studio 1') && /\b(studio\s*1|studio\s*one)\b/.test(bodyText)) return true;
  if (targetArea.includes('studio 2') && /\b(studio\s*2|studio\s*two)\b/.test(bodyText)) return true;
  if (targetArea.includes('powercycle') && /\b(powercycle|spin|cycle)\b/.test(bodyText)) return true;
  if (targetArea.includes('strength') && /\b(strength\s*studio|strength\s*lab)\b/.test(bodyText)) return true;
  if (targetArea.includes('his space') && /\bhis\s*space\b/.test(bodyText)) return true;
  if (targetArea.includes('her space') && /\bher\s*space\b/.test(bodyText)) return true;
  if (targetArea.includes('guest washroom') && /\bguest\s*washroom\b/.test(bodyText)) return true;
  if (targetArea.includes('brain cell') && /\bbrain\s*cell\b/.test(bodyText)) return true;
  if (targetArea.includes('pantry') && /\bpantry\b/.test(bodyText)) return true;
  if (targetArea.includes('reception') && /\b(reception|lobby|front\s*desk)\b/.test(bodyText)) return true;
  if (targetArea.includes('lockers') && /\b(lockers?|changing)\b/.test(bodyText)) return true;
  if (targetArea.includes('washrooms') && /\b(washrooms?|bathrooms?)\b/.test(bodyText)) return true;

  return false;
}

function formatSlaLabel(mins: number | null): string {
  if (mins === null) return 'No active SLA';
  if (mins < 0) {
    const abs = Math.abs(mins);
    if (abs < 60) return `OVERDUE by ${abs}m`;
    const hours = Math.floor(abs / 60);
    if (hours < 24) return `OVERDUE by ${hours}h ${abs % 60}m`;
    const days = Math.floor(hours / 24);
    // Past a month the trailing hours are noise on a card this small.
    if (days >= 30) return `OVERDUE by ${days}d`;
    return `OVERDUE by ${days}d ${hours % 24}h`;
  }
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  const days = Math.floor(hours / 24);
  if (days >= 30) return `${days}d left`;
  return `${days}d ${hours % 24}h left`;
}

export async function GET(req: NextRequest) {
  try {
    await requireWorkspace();
    const { searchParams } = new URL(req.url);
    const requestedStudio = searchParams.get('studio') || 'kwality';

    // Fetch active (non-resolved, non-closed) tickets
    const activeTickets = await db
      .select()
      .from(tickets)
      .where(notInArray(tickets.status, ['resolved', 'closed']))
      .orderBy(desc(tickets.createdAt));

    const now = Date.now();

    // Map studios with dynamic incident states
    const studios = STUDIOS_TOPOLOGY.map((studio) => {
      let studioCriticalCount = 0;
      let studioWarningCount = 0;
      let tightestSlaMinutes: number | null = null;

      const rooms = studio.rooms.map((room) => {
        // Find tickets matching this room
        const roomTickets = activeTickets.filter((t) =>
          isTicketInRoom(t as unknown as Record<string, unknown>, studio.id, room.name)
        );

        let status: 'optimal' | 'warning' | 'critical' = 'optimal';
        let minRemainingMinutes: number | null = null;
        let isBreached = false;

        if (roomTickets.length > 0) {
          // Check for critical flags
          const hasCriticalPriority = roomTickets.some(
            (t) => t.priority === 'critical' || t.severity === 'critical' || t.category === 'Safety and Security'
          );
          const hasClassImpact = roomTickets.some(
            (t) =>
              t.impact?.toLowerCase().includes('blocking') ||
              t.impact?.toLowerCase().includes('interrupted') ||
              (t.customFields && (t.customFields as Record<string, unknown>).isClassImpacted === 'Yes, blocking now')
          );

          // Calculate SLAs
          for (const t of roomTickets) {
            if (t.slaDueAt) {
              const due = new Date(t.slaDueAt).getTime();
              const mins = Math.floor((due - now) / 60000);
              if (minRemainingMinutes === null || mins < minRemainingMinutes) {
                minRemainingMinutes = mins;
              }
              if (mins < 0) isBreached = true;
            }
          }

          if (isBreached || hasCriticalPriority || hasClassImpact || (minRemainingMinutes !== null && minRemainingMinutes < 60)) {
            status = 'critical';
            studioCriticalCount++;
          } else {
            status = 'warning';
            studioWarningCount++;
          }

          if (minRemainingMinutes !== null) {
            if (tightestSlaMinutes === null || minRemainingMinutes < tightestSlaMinutes) {
              tightestSlaMinutes = minRemainingMinutes;
            }
          }
        }

        // Adjust environmental sensors if incident is active
        let ambientTemp = room.ambientTemp;
        let acStatus = room.acStatus;
        let soundStatus = room.soundStatus;
        let lightingStatus = room.lightingStatus;

        for (const t of roomTickets) {
          const sub = (t.subcategory || '').toLowerCase();
          const title = (t.title || '').toLowerCase();
          if (sub.includes('ac') || sub.includes('temperature') || title.includes('ac')) {
            ambientTemp = 26.4;
            acStatus = status === 'critical' ? 'service_required' : 'calibrating';
          }
          if (sub.includes('sound') || sub.includes('mic') || title.includes('sound') || title.includes('mic')) {
            soundStatus = status === 'critical' ? 'offline' : 'glitch';
          }
          if (sub.includes('light') || title.includes('light')) {
            lightingStatus = status === 'critical' ? 'fault' : 'dimmed';
          }
        }

        return {
          ...room,
          ambientTemp,
          acStatus,
          soundStatus,
          lightingStatus,
          status,
          openTicketsCount: roomTickets.length,
          minRemainingMinutes,
          isBreached,
          slaLabel: formatSlaLabel(minRemainingMinutes),
          tickets: roomTickets.map((t) => ({
            id: t.id,
            ticketNumber: t.ticketNumber,
            title: t.title,
            summary: t.summary,
            category: t.category,
            subcategory: t.subcategory,
            priority: t.priority,
            severity: t.severity,
            status: t.status,
            assignedStaffName: t.assignedStaffName,
            departmentName: t.departmentName,
            slaHours: t.slaHours,
            slaDueAt: t.slaDueAt,
            createdAt: t.createdAt,
            impact: t.impact,
          })),
        };
      });

      const totalRooms = rooms.length;
      const optimalRooms = rooms.filter((r) => r.status === 'optimal').length;
      const healthScore = Math.round((optimalRooms / totalRooms) * 100);

      return {
        ...studio,
        healthScore,
        studioCriticalCount,
        studioWarningCount,
        tightestSlaMinutes,
        rooms,
      };
    });

    const activeStudio = studios.find((s) => s.id === requestedStudio) || studios[0];

    // Global studio metrics
    const totalActiveIncidents = activeTickets.length;
    const criticalIncidents = activeTickets.filter(
      (t) => t.priority === 'critical' || t.severity === 'critical'
    ).length;

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      activeStudio,
      allStudiosSummary: studios.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        city: s.city,
        healthScore: s.healthScore,
        criticalCount: s.studioCriticalCount,
        warningCount: s.studioWarningCount,
        tightestSlaMinutes: s.tightestSlaMinutes,
      })),
      globalRadar: {
        totalActiveIncidents,
        criticalIncidents,
        totalStudiosMonitored: studios.length,
        networkHealthScore: Math.round(
          studios.reduce((acc, s) => acc + s.healthScore, 0) / studios.length
        ),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** 1-Click Fast Resolution or Dispatch from the Operations Radar */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireAgent();
    const { action, ticketId, note } = z
      .object({
        action: z.enum(['quick_resolve', 'dispatch_staff']),
        ticketId: z.coerce.number().int().positive(),
        note: z.string().max(2000).optional(),
      })
      .parse(await req.json());

    if (action === 'quick_resolve') {
      // This route used to set status directly, skipping every guard the ticket
      // PATCH route enforces. Resolving from the radar is the same act as
      // resolving from the ticket, so it answers to the same rules: only the
      // owner, their manager or an admin, only with the private resolution
      // filled in, and only against the revision the caller last saw.
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId));
      if (!ticket) throw new ApiError('Ticket not found', 404);
      if (ticket.resolutionRequired) {
        if (!(await canResolveTicket(user, ticket.assignedStaffId, ticket.resolutionRequired)))
          throw new ApiError('Only the assigned owner, their reporting manager or an administrator may resolve this ticket.', 403);
        const [r] = await db.select().from(ticketResolutions).where(eq(ticketResolutions.ticketId, ticketId));
        if (!r?.actionTaken.trim() || !r.memberOutcome.trim())
          throw new ApiError('Complete the private resolution action and outcome before resolving from the radar.');
      }
      const now = new Date();
      const [updated] = await db
        .update(tickets)
        .set({ status: 'resolved', resolvedAt: now, updatedAt: now, version: sql`${tickets.version}+1` })
        .where(and(eq(tickets.id, ticketId), eq(tickets.version, ticket.version)))
        .returning();
      if (!updated) throw new ApiError('This ticket changed elsewhere. Refresh before resolving.', 409);

      await db.insert(ticketActivities).values({
        ticketId,
        actorName: user.name,
        action: 'resolved_via_ops_radar',
        detail: note || 'Resolved directly from Live Studio Operations Radar & Heatmap.',
        createdAt: now,
      });

      return NextResponse.json({ success: true, message: `Ticket #${ticketId} marked resolved.` });
    }

    if (action === 'dispatch_staff') {
      const now = new Date();
      await db.insert(ticketActivities).values({
        ticketId,
        actorName: user.name,
        action: 'dispatched_lead',
        detail: note || 'Dispatched on-site operations duty officer to inspect room.',
        createdAt: now,
      });

      return NextResponse.json({ success: true, message: 'On-site officer dispatched.' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
