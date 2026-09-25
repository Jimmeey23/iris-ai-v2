import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tickets, ticketActivities } from '@/db/schema';
import { eq, and, sql, notInArray, desc } from 'drizzle-orm';
import { z } from 'zod';
import { requireWorkspace, errorResponse, requireAgent, requireTicketAccess, sameOrigin, ApiError } from '@/lib/auth';
import { resolveTicket, ticketScope } from '@/lib/tickets';
import { STUDIOS, STUDIO_LAYOUTS, AREA_ALIASES, type StudioRoom } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * The studio operations radar: every studio and room on the room plan, coloured by the open
 * tickets filed against it.
 *
 * Nothing here is a live sensor reading. There is no occupancy feed, thermostat, sound desk
 * or duty roster behind this deployment, so the radar reports only what the tickets say: how
 * many are open in a room, how close the tightest follow-up target is, and whether any of
 * them mention the air conditioning, the sound system or the lighting.
 */

export interface RoomDefinition {
  id: string;
  name: string;
  category: 'workout' | 'wellness' | 'amenity' | 'admin';
  /** Planned capacity from the room plan; null where the plan does not give one. */
  paxCapacity: number | null;
  description: string;
}

export interface StudioTopology {
  id: string;
  name: string;
  shortName: string;
  city: string;
  address: string;
  rooms: RoomDefinition[];
}

const ROOM_CATEGORY: Record<StudioRoom['category'], RoomDefinition['category']> = {
  studio: 'workout',
  washroom: 'wellness',
  workspace: 'admin',
  common: 'amenity',
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Every studio in STUDIOS, with its rooms from STUDIO_LAYOUTS — so a studio added to the
 *  constants (Copper & Cloves included) appears here without editing this route. */
const STUDIOS_TOPOLOGY: StudioTopology[] = STUDIOS.map((s) => ({
  id: s.id,
  name: s.name,
  shortName: s.name.split(',')[0].replace(/^the Studio by /i, '').trim(),
  city: s.city,
  address: s.address,
  rooms: (STUDIO_LAYOUTS[s.id]?.rooms || []).map((r) => ({
    id: `${s.id}-${slug(r.name)}`,
    name: r.name,
    category: ROOM_CATEGORY[r.category],
    paxCapacity: r.capacity ?? null,
    description: r.description,
  })),
}));

/** Keywords a ticket's text uses for each room on the plan, keyed by lower-case room name. */
const ROOM_KEYWORDS: Record<string, RegExp> = {
  'studio 1': /\bstudio\s*(1|one)\b/i,
  'studio 2': /\bstudio\s*(2|two)\b/i,
  'powercycle studio': /\b(power\s*cycle|spin|cycle studio|bikes?)\b/i,
  'strength studio': /\bstrength\s*(studio|lab)\b/i,
  'his space': /\bhis\s*space\b/i,
  'her space': /\bher\s*space\b/i,
  'guest washroom': /\bguest\s*washroom\b/i,
  'brain cell': /\bbrain\s*cell\b/i,
  pantry: /\bpantry\b/i,
  'lobby / reception': /\b(reception|lobby|front\s*desk)\b/i,
  'reception / lobby': /\b(reception|lobby|front\s*desk)\b/i,
  reception: /\b(reception|lobby|front\s*desk)\b/i,
  'lockers & changing': /\b(lockers?|changing)\b/i,
  washrooms: /\b(washrooms?|bathrooms?|toilets?)\b/i,
  'washroom & changing': /\b(washrooms?|bathrooms?|changing)\b/i,
  'changing area': /\b(changing|washrooms?)\b/i,
  'main studio floor': /\b(main\s*(studio\s*)?floor)\b/i,
  'member lounge': /\b(member\s*)?lounge\b/i,
};

/** Equipment families the radar flags, matched on whole words so "back", "place" or "coach"
 *  no longer read as an AC fault. */
const EQUIPMENT: Record<'ac' | 'sound' | 'lighting', RegExp> = {
  ac: /\b(ac|a\/c|hvac|aircon)\b|air ?con(ditioning|ditioner)?|\btemperature\b|\btoo (hot|cold)\b/i,
  sound: /\b(sound|audio|speakers?|music|mics?|microphones?|headsets?)\b/i,
  lighting: /\b(lights?|lighting|bulbs?)\b/i,
};

const norm = (s: string) => {
  const low = s.trim().toLowerCase();
  return (AREA_ALIASES[low] || s).trim().toLowerCase();
};

type RadarTicket = {
  id: number;
  ticketNumber: string;
  title: string;
  summary: string;
  category: string;
  subcategory: string;
  priority: string;
  severity: string;
  status: string;
  studio: string | null;
  assignedStaffName: string | null;
  departmentName: string | null;
  slaHours: number;
  slaDueAt: Date | null;
  createdAt: Date;
  impact: string | null;
  version: number;
  area: string | null;
  isClassImpacted: string | null;
};

function studioOf(t: RadarTicket): StudioTopology | undefined {
  const s = (t.studio || '').toLowerCase();
  if (!s) return undefined;
  return STUDIOS_TOPOLOGY.find((st) => s === st.name.toLowerCase())
    || STUDIOS_TOPOLOGY.find((st) => s.includes(st.shortName.toLowerCase()) || s.includes(st.id));
}

function roomOf(t: RadarTicket, studio: StudioTopology): RoomDefinition | undefined {
  if (t.area) {
    const area = norm(t.area);
    const exact = studio.rooms.find((r) => norm(r.name) === area);
    if (exact) return exact;
  }
  // The area answer first: an alias the plan spells differently ("Reception" for "Lobby / Reception") still lands.
  const text = `${t.area || ''} ${t.title} ${t.summary} ${t.subcategory}`;
  return studio.rooms.find((r) => ROOM_KEYWORDS[r.name.toLowerCase()]?.test(text));
}

function formatSlaLabel(mins: number | null): string {
  if (mins === null) return 'No follow-up target';
  if (mins < 0) {
    const abs = Math.abs(mins);
    if (abs < 60) return `Overdue by ${abs}m`;
    const hours = Math.floor(abs / 60);
    if (hours < 24) return `Overdue by ${hours}h ${abs % 60}m`;
    const days = Math.floor(hours / 24);
    // Past a month the trailing hours are noise on a card this small.
    if (days >= 30) return `Overdue by ${days}d`;
    return `Overdue by ${days}d ${hours % 24}h`;
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
    const user = await requireWorkspace();
    const { searchParams } = new URL(req.url);
    const requestedStudio = searchParams.get('studio') || STUDIOS_TOPOLOGY[0]?.id;

    // Open work only, and only tickets this caller may open — the same scope as the list.
    const activeTickets: RadarTicket[] = await db
      .select({
        id: tickets.id,
        ticketNumber: tickets.ticketNumber,
        title: tickets.title,
        summary: tickets.summary,
        category: tickets.category,
        subcategory: tickets.subcategory,
        priority: tickets.priority,
        severity: tickets.severity,
        status: tickets.status,
        studio: tickets.studio,
        assignedStaffName: tickets.assignedStaffName,
        departmentName: tickets.departmentName,
        slaHours: tickets.slaHours,
        slaDueAt: tickets.slaDueAt,
        createdAt: tickets.createdAt,
        impact: tickets.impact,
        version: tickets.version,
        area: sql<string | null>`${tickets.customFields}->>'area'`,
        isClassImpacted: sql<string | null>`${tickets.customFields}->>'isClassImpacted'`,
      })
      .from(tickets)
      .where(and(notInArray(tickets.status, ['resolved', 'closed', 'recorded']), ticketScope(user)))
      .orderBy(desc(tickets.createdAt));

    const now = Date.now();
    const placed = new Map<string, RadarTicket[]>();
    const unplaced = new Map<string, number>();
    for (const t of activeTickets) {
      const studio = studioOf(t);
      if (!studio) continue;
      const room = roomOf(t, studio);
      if (!room) { unplaced.set(studio.id, (unplaced.get(studio.id) || 0) + 1); continue; }
      placed.set(room.id, [...(placed.get(room.id) || []), t]);
    }

    const studios = STUDIOS_TOPOLOGY.map((studio) => {
      let studioCriticalCount = 0;
      let studioWarningCount = 0;
      let tightestSlaMinutes: number | null = null;

      const rooms = studio.rooms.map((room) => {
        const roomTickets = placed.get(room.id) || [];
        let status: 'optimal' | 'warning' | 'critical' = 'optimal';
        let minRemainingMinutes: number | null = null;
        let isBreached = false;

        if (roomTickets.length > 0) {
          const hasCriticalPriority = roomTickets.some(
            (t) => t.priority === 'critical' || t.severity === 'critical' || t.category === 'Safety and Security'
          );
          const hasClassImpact = roomTickets.some(
            (t) => /\b(blocking|interrupted)\b/i.test(t.impact || '') || /^yes, blocking/i.test(t.isClassImpacted || '')
          );
          for (const t of roomTickets) {
            if (!t.slaDueAt) continue;
            const mins = Math.floor((new Date(t.slaDueAt).getTime() - now) / 60000);
            if (minRemainingMinutes === null || mins < minRemainingMinutes) minRemainingMinutes = mins;
            if (mins < 0) isBreached = true;
          }
          if (isBreached || hasCriticalPriority || hasClassImpact || (minRemainingMinutes !== null && minRemainingMinutes < 60)) {
            status = 'critical';
            studioCriticalCount++;
          } else {
            status = 'warning';
            studioWarningCount++;
          }
          if (minRemainingMinutes !== null && (tightestSlaMinutes === null || minRemainingMinutes < tightestSlaMinutes)) {
            tightestSlaMinutes = minRemainingMinutes;
          }
        }

        // Open tickets that mention each equipment family — a count of reports, not a reading.
        const reported = (re: RegExp) => roomTickets.filter((t) => re.test(`${t.subcategory} ${t.title}`)).length;

        return {
          ...room,
          status,
          openTicketsCount: roomTickets.length,
          openEquipmentReports: { ac: reported(EQUIPMENT.ac), sound: reported(EQUIPMENT.sound), lighting: reported(EQUIPMENT.lighting) },
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
            // Sent back with quick_resolve so the resolve is checked against this revision.
            version: t.version,
          })),
        };
      });

      const totalRooms = rooms.length;
      const optimalRooms = rooms.filter((r) => r.status === 'optimal').length;
      const healthScore = totalRooms ? Math.round((optimalRooms / totalRooms) * 100) : 100;

      return {
        ...studio,
        healthScore,
        studioCriticalCount,
        studioWarningCount,
        tightestSlaMinutes,
        /** Open tickets at this studio that name no room on the plan. */
        unplacedTicketsCount: unplaced.get(studio.id) || 0,
        rooms,
      };
    });

    const activeStudio = studios.find((s) => s.id === requestedStudio) || studios[0];
    const criticalIncidents = activeTickets.filter((t) => t.priority === 'critical' || t.severity === 'critical').length;

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
        totalActiveIncidents: activeTickets.length,
        criticalIncidents,
        totalStudiosMonitored: studios.length,
        networkHealthScore: studios.length ? Math.round(studios.reduce((acc, s) => acc + s.healthScore, 0) / studios.length) : 100,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Resolve or dispatch from the radar. */
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireAgent();
    const { action, ticketId, note, version } = z
      .object({
        action: z.enum(['quick_resolve', 'dispatch_staff']),
        ticketId: z.coerce.number().int().positive(),
        note: z.string().max(2000).optional(),
        version: z.coerce.number().int().optional(),
      })
      .parse(await req.json());

    if (action === 'quick_resolve') {
      // Resolving from the radar is the same act as resolving from the ticket, so it goes
      // through the same resolveTicket: access, the resolver rule, the private resolution,
      // the caller's own revision and the recurrence checks.
      if (version === undefined) throw new ApiError('Refresh the radar before resolving this ticket.', 409);
      const { ticket } = await resolveTicket(user, {
        ticketId,
        version,
        status: 'resolved',
        action: 'resolved_via_ops_radar',
        detail: note || 'Resolved from the studio operations radar.',
      });
      return NextResponse.json({ success: true, message: `${ticket.ticketNumber} marked resolved.` });
    }

    // dispatch_staff
    const [ticket] = await db
      .select({ id: tickets.id, ticketNumber: tickets.ticketNumber, assignedStaffId: tickets.assignedStaffId, createdByUserId: tickets.createdByUserId, departmentName: tickets.departmentName, studio: tickets.studio })
      .from(tickets)
      .where(eq(tickets.id, ticketId));
    if (!ticket) throw new ApiError('Ticket not found', 404);
    requireTicketAccess(user, ticket);
    await db.insert(ticketActivities).values({
      ticketId,
      actorName: user.name,
      action: 'dispatched_lead',
      detail: note || 'Asked the studio team to inspect the room.',
    });
    return NextResponse.json({ success: true, message: `Studio team asked to inspect the room for ${ticket.ticketNumber}.` });
  } catch (e) {
    return errorResponse(e);
  }
}
