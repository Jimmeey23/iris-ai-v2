import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUsers } from "@/db/schema";
import { ApiError, errorResponse, requireWorkspace, sameOrigin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    return Response.json({ user: await requireWorkspace() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireWorkspace();
    const b = z
      .object({
        name: z.string().min(2).max(80),
        password: z.string().min(12).max(200).optional(),
      })
      .parse(await req.json());
    if (b.password) {
      // The password lives in Supabase, not in this database.
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.updateUser({
        password: b.password,
        data: { full_name: b.name },
      });
      if (error) throw new ApiError(error.message, 400);
    }
    await db
      .update(appUsers)
      .set({ name: b.name })
      .where(eq(appUsers.id, user.id));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
