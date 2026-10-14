import { NextRequest } from "next/server";
import { requireWorkspace, errorResponse } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics-report";
import { queryKey, shortCache } from "@/lib/short-cache";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await requireWorkspace();
    const params = req.nextUrl.searchParams;
    // A minute's reuse per person and view; the Refresh button sends `fresh` to bypass it.
    const body = await shortCache(`analytics:${user.id}:${queryKey(params)}`, 60_000, () => computeAnalytics(user, params), { fresh: params.has("fresh") });
    return Response.json(body);
  } catch (e) {
    return errorResponse(e);
  }
}
