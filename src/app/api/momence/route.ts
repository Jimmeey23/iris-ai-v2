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
export const dynamic = "force-dynamic";

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
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const detail = await detailMomence(moduleName, id, page, user.studio);
      return Response.json(
        !elevated && moduleName === "members" ? minimalMemberDetail(detail) : detail,
      );
    }
    const sp = req.nextUrl.searchParams;
    // A studio name is resolved to its Momence location id server-side; a studio with no Momence
    // location resolves to undefined and the listing stays unfiltered rather than coming back empty.
    const locationId = z
      .string()
      .regex(/^\d{1,18}$/)
      .optional()
      .parse(sp.get("locationId") || momenceLocationFor(sp.get("studio"))?.toString());
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
      !elevated && moduleName === "members"
        ? { ...listing, items: listing.items.map(minimalMember) }
        : listing,
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
