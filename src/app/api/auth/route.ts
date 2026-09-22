import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { appUsers, staff } from "@/db/schema";
import {
  ApiError,
  currentUser,
  configuredUsers,
  requireAdmin,
  logout,
  errorResponse,
  sameOrigin,
} from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureSeeded } from "@/lib/seed";
import { audit } from "@/lib/config";

export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["login", "signup", "setup", "invite", "logout", "update"]),
  email: z.string().email().optional(),
  password: z.string().min(12).max(200).optional(),
  name: z.string().min(2).max(80).optional(),
  staffId: z.number().int().positive().nullable().optional(),
  role: z.enum(["admin", "manager", "agent"]).optional(),
  department: z.string().max(100).nullable().optional(),
  studio: z.string().max(120).nullable().optional(),
  id: z.number().int().optional(),
  active: z.boolean().optional(),
});

/** Supabase returns its own wording for auth failures; these are the ones users
 *  actually hit, restated in the workspace's voice. Anything else is passed
 *  through so a misconfiguration is not hidden behind a generic message. */
function authError(message: string): never {
  if (/invalid login credentials/i.test(message))
    throw new ApiError("Email or password is incorrect.", 401);
  if (/email not confirmed/i.test(message))
    throw new ApiError(
      "Confirm your email address first — check your inbox for the link we sent.",
      403,
    );
  if (/already registered|already been registered/i.test(message))
    throw new ApiError("An account already exists for this email address.", 409);
  if (/rate limit|too many/i.test(message))
    throw new ApiError("Too many attempts. Please wait a minute and try again.", 429);
  throw new ApiError(message, 400);
}

export async function GET() {
  try {
    await ensureSeeded();
    return Response.json({
      user: await currentUser(),
      setupRequired: !(await configuredUsers()),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await ensureSeeded();
    const b = input.parse(await req.json());
    const supabase = await createSupabaseServerClient();

    if (b.action === "logout") {
      await logout();
      return Response.json({ ok: true });
    }

    if (b.action === "update") {
      const admin = await requireAdmin();
      if (!b.id) throw new ApiError("User id required");
      if (
        b.id === admin.id &&
        (b.active === false || (b.role && b.role !== "admin"))
      )
        throw new ApiError("You cannot remove your own administrator access.");
      const [profile] = b.staffId
        ? await db.select().from(staff).where(eq(staff.id, b.staffId))
        : [];
      const [updated] = await db
        .update(appUsers)
        .set({
          role: b.role,
          staffId: b.staffId,
          department:
            b.department !== undefined ? b.department : profile?.department,
          studio: b.studio !== undefined ? b.studio : profile?.location,
          active: b.active,
        })
        .where(eq(appUsers.id, b.id))
        .returning({
          supabaseUserId: appUsers.supabaseUserId,
          active: appUsers.active,
        });
      // Deactivating must also revoke the Supabase session, or the user keeps a
      // valid access token until it expires. Banning does both.
      if (b.active !== undefined && updated?.supabaseUserId) {
        const service = createSupabaseAdminClient();
        await service.auth.admin.updateUserById(updated.supabaseUserId, {
          ban_duration: b.active ? "none" : "876000h",
        });
        if (!b.active) await service.auth.admin.signOut(updated.supabaseUserId);
      }
      await audit(admin, "access.updated", "user:" + b.id);
      return Response.json({ ok: true });
    }

    if (!b.email || !b.password)
      throw new ApiError(
        "Email and a password of at least 12 characters are required.",
      );
    const email = b.email.toLowerCase().trim();

    if (b.action === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: b.password,
      });
      if (error) authError(error.message);
      // The profile row also enforces deactivation, which Supabase does not know about.
      const user = await currentUser();
      if (!user) {
        await logout();
        throw new ApiError(
          "This account is not active in the workspace. Ask an administrator to restore it.",
          403,
        );
      }
      return Response.json({ ok: true });
    }

    if (b.action === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: b.password,
        options: {
          data: { full_name: b.name || email },
          emailRedirectTo: new URL("/auth/callback", req.url).toString(),
        },
      });
      if (error) authError(error.message);
      // Supabase returns an identity-less user when the email is already taken,
      // rather than an error, so that signup cannot be used to enumerate accounts.
      if (data.user && data.user.identities?.length === 0)
        return Response.json({ ok: true, confirmationRequired: true });
      const confirmationRequired = !data.session;
      if (!confirmationRequired) await currentUser();
      return Response.json({ ok: true, confirmationRequired });
    }

    // `setup` mints the first administrator, `invite` is an administrator minting
    // someone else. Both create a confirmed Supabase user with the service key.
    const admin = b.action === "invite" ? await requireAdmin() : null;
    if (b.action === "setup" && (await configuredUsers()))
      throw new ApiError("This workspace already has an administrator.", 409);

    const service = createSupabaseAdminClient();
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password: b.password,
        email_confirm: true,
        user_metadata: { full_name: b.name || email },
      });
    if (createError) authError(createError.message);
    const supabaseUserId = created.user!.id;

    try {
      const user = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(578100)`);
        if (
          b.action === "setup" &&
          (await tx.select({ id: appUsers.id }).from(appUsers).limit(1)).length
        )
          throw new ApiError(
            "This workspace already has an administrator.",
            409,
          );
        const [u] = await tx
          .insert(appUsers)
          .values({
            email,
            supabaseUserId,
            name: b.name || email,
            staffId: b.staffId,
            role:
              b.action === "setup" ? "admin" : b.action === "invite" ? b.role || "agent" : "agent",
            department: b.action === "invite" ? b.department : null,
            studio: b.action === "invite" ? b.studio : null,
          })
          .returning({ id: appUsers.id });
        return u;
      });

      if (b.action === "setup") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: b.password,
        });
        if (error) authError(error.message);
      }
      await audit(
        admin || { id: user.id, name: b.name || email },
        "account.created",
        "user:" + user.id,
      );
      return Response.json({ ok: true });
    } catch (e) {
      // Do not leave an orphaned Supabase account behind if the profile row fails.
      await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
