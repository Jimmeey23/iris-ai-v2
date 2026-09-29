import { NextRequest } from "next/server";
import { z } from "zod";
import catalogue from "@/lib/momence-catalogue.json";
import {
  listMomence,
  detailMomence,
  momenceConfigured,
  executeMomence,
  getAccessToken,
  momenceLocationFor,
} from "@/lib/momence";
import {
  ApiError,
  errorResponse,
  requireIntegrationAccess,
  requireWorkspace,
  sameOrigin,
} from "@/lib/auth";
import {maskDeep, piiUnlocked} from "@/lib/momence-privacy";
import {STUDIOS} from "@/lib/constants";
export const dynamic = "force-dynamic";

/**
 * Who may browse the member and sales directories in the Momence tab.
 *
 * Administrators, and nobody else — not managers. These directories are the whole member
 * base and the whole sales ledger in one scrollable list, which is a different thing from
 * the single record a person opens while working a ticket. Everyone else reaches a member
 * through a ticket instead, which is the context their work actually has.
 */
/** Commercial ledgers: administrators only, whatever anybody's department is. */
const RESTRICTED_MODULES = new Set(["sales", "memberships"]);
/** The client-servicing team work member records daily, so the member directory is theirs
 *  too — but only their own city's, enforced below rather than trusted from the request. */
const CITY_SCOPED_DEPARTMENTS = /sales|client servicing|customer service/i;
const canBrowseMemberData = (user: {role: string}) => user.role === "admin";
const canBrowseMembersInCity = (user: {role: string; department?: string | null}) =>
  user.role === "admin" || user.role === "manager" || CITY_SCOPED_DEPARTMENTS.test(user.department || "");
/** Mumbai and Bandra are one city for this purpose; Bengaluru is the other. */
const cityKey = (studio?: string | null) => (/bengaluru|bangalore/i.test(studio || "") ? "bengaluru" : "mumbai");

type Rec = { id: string; name: string; subtitle: string; kind: string; raw: Record<string, unknown> };
const pick = (r: unknown, keys: string[]) => {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
};
/** Front-line agents see only what intake needs to identify a member and fill the
 *  ticket's contact fields — not visit history, tags, notes or billing. */
const MEMBER_FIELDS = ["id", "firstName", "lastName", "email", "phoneNumber"];
const minimalMember = (r: Rec): Rec => ({ ...r, raw: pick(r.raw, MEMBER_FIELDS) });
function minimalMemberDetail<T extends { item: Rec; related: Record<string, Record<string, unknown>[]> }>(d: T): T {
  return {
    ...d,
    item: minimalMember(d.item),
    related: {
      memberships: (d.related.memberships || []).map((m) => ({
        ...pick(m, ["id", "name", "type", "startDate", "endDate", "isFrozen"]),
        membership: pick(m.membership, ["id", "name"]),
      })),
      bookings: (d.related.bookings || []).map((b) => ({
        ...pick(b, ["id", "checkedIn", "cancelledAt"]),
        session: pick(b.session, ["id", "name", "startsAt", "teacher", "inPersonLocation"]),
      })),
    },
  };
}
export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    const action = req.nextUrl.searchParams.get("action");
    const configured = await momenceConfigured(user.studio);
    if (action === "status")
      return Response.json({
        configured,
        source: configured ? "configured" : "demo",
        tools: catalogue.length,
      });
    if (action === "catalogue") return Response.json({ operations: catalogue });
    const moduleName = z
      .enum(["members", "sessions", "memberships", "studios", "sales"])
      .parse(req.nextUrl.searchParams.get("module") || "members");
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(req.nextUrl.searchParams.get("page") || 0);
    const pageSize = z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .parse(req.nextUrl.searchParams.get("pageSize") || 24);
    // Sales and membership catalogues are commercial data: managers and admins only.
    const elevated = user.role === "admin" || user.role === "manager";
    if (!elevated && (moduleName === "sales" || moduleName === "memberships"))
      throw new ApiError("A manager or administrator is required to view Momence " + moduleName + ".", 403);

    /**
     * Two very different callers share this endpoint.
     *
     * `surface=browse` is the Momence tab: a directory somebody is reading. Everything else
     * is the member and session lookup inside a ticket form, which asks for one record the
     * person is already working on and needs its contact fields to file the ticket.
     *
     * So the tab is the thing that gets locked down and masked; intake keeps working exactly
     * as before. Gating the endpoint outright would have broken ticket creation for every
     * non-sales member of staff.
     */
    const browsing = req.nextUrl.searchParams.get("surface") === "browse";
    // Only the directories holding member and commercial data are restricted. Sessions and
    // studios are the timetable — everyone on the floor needs them.
    if (browsing && RESTRICTED_MODULES.has(moduleName) && !canBrowseMemberData(user))
      throw new ApiError(
        "The Momence membership and sales directories are open to administrators only.",
        403,
      );
    if (browsing && moduleName === "members" && !canBrowseMembersInCity(user))
      throw new ApiError(
        "The Momence member directory is open to administrators and the client-servicing team.",
        403,
      );
    // Contact details are masked in the tab until somebody enters the passcode there.
    const reveal = !browsing || (await piiUnlocked(user.id));
    const shield = <T,>(payload: T): T => (reveal ? payload : (maskDeep(payload) as T));
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const detail = await detailMomence(moduleName, id, page, user.studio);
      return Response.json(
        shield(!elevated && moduleName === "members" ? minimalMemberDetail(detail) : detail),
      );
    }
    const sp = req.nextUrl.searchParams;
    // A studio name is resolved to its Momence location id server-side; a studio with no Momence
    // location resolves to undefined and the listing stays unfiltered rather than coming back empty.
    const requestedLocation = z
      .string()
      .regex(/^\d{1,18}$/)
      .optional()
      .parse(sp.get("locationId") || momenceLocationFor(sp.get("studio"))?.toString());
    /**
     * Whose city this listing may cover.
     *
     * Administrators see everything. Everyone else browsing the directory sees their own
     * city, and the restriction is applied here rather than by trusting the `studio` or
     * `locationId` the page happened to send — a query parameter is a request, not a
     * permission. A location outside their city is replaced by their own, so the tab shows
     * their city's records rather than an error.
     */
    const cityLocations = STUDIOS.filter(
      (st) => cityKey(st.name) === cityKey(user.studio) && st.momenceLocationId,
    ).map((st) => String(st.momenceLocationId));
    const cityBound = browsing && user.role !== "admin";
    const locationId = cityBound
      ? requestedLocation && cityLocations.includes(requestedLocation)
        ? requestedLocation
        : (momenceLocationFor(user.studio)?.toString() ?? cityLocations[0])
      : requestedLocation;
    const requestedTypes = [...sp.getAll("types[]"), ...sp.getAll("type")];
    const sessionTypes = z
      .array(
        z.enum([
          "private",
          "special-event",
          "special-event-new",
          "retreat",
          "fitness",
          "course",
          "course-class",
          "semester",
          "recital",
        ]),
      )
      .optional()
      .parse(requestedTypes.length ? requestedTypes : undefined);
    const listing = await listMomence(
        moduleName,
        {
          query: sp.get("q") || "",
          page,
          pageSize,
          startAfter: sp.get("startAfter") || undefined,
          startBefore: sp.get("startBefore") || undefined,
          locationId,
          sessionTypes,
          upcoming: sp.get("upcoming") === "true",
        },
        user.studio,
      );
    return Response.json(
      shield(
        !elevated && moduleName === "members"
          ? { ...listing, items: listing.items.map(minimalMember) }
          : listing,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireIntegrationAccess(true);
    const b = z
      .object({
        operationId: z.string(),
        params: z.record(z.string(), z.string()).default({}),
        body: z.unknown().optional(),
        confirmed: z.boolean().default(false),
      })
      .parse(await req.json());
    if (b.operationId === "authenticate") {
      await getAccessToken(true, user.studio);
      return Response.json({
        ok: true,
        message: "Authenticated successfully. Token is held on the server.",
      });
    }
    const result = await executeMomence(
      b.operationId,
      b.params,
      b.body,
      b.confirmed,
      user,
    );
    return Response.json({ ok: true, result });
  } catch (e) {
    return errorResponse(e);
  }
}
