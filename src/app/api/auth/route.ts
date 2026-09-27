import { z } from "zod";
import { createHash, timingSafeEqual } from "crypto";
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
  resolveProfile,
  canSelfProvision,
  allowedDomainsLabel,
  INACTIVE_MESSAGE,
  NOT_AUTHORISED_MESSAGE,
} from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureSeeded } from "@/lib/seed";
import { STUDIOS, DEPARTMENT_RECORDS } from "@/lib/constants";
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
  reportingManager: z.string().max(80).nullable().optional(),
  id: z.number().int().optional(),
  active: z.boolean().optional(),
  setupToken: z.string().max(500).optional(),
});

/** Constant-time comparison of the one-time SETUP_TOKEN. Hashing first makes the
 *  buffers equal length, so timingSafeEqual never throws and length is not leaked. */
function setupTokenMatches(supplied: string | undefined) {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || !supplied) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}


/** Supabase returns its own wording for auth failures; these are the ones users
 *  actually hit, restated in the workspace's voice. Anything else is logged
 *  server-side and answered generically, so provider internals never leak. */
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
  console.error("Supabase auth error:", message);
  throw new ApiError("Sign-in could not be completed. Please try again.", 400);
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
      // Keyed by IP and email: stops both a password spray from one address and
      // a distributed guess at one account from burning through attempts.
      await enforceRateLimit("login", `login:${clientIp(req)}:${email}`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: b.password,
      });
      if (error) authError(error.message);
      // The profile row also enforces deactivation and invitation, which
      // Supabase does not know about.
      const profile = data.user
        ? await resolveProfile(data.user)
        : ({ identity: null, reason: "not_authorised" } as const);
      if (!profile.identity) {
        await logout();
        throw new ApiError(
          profile.reason === "inactive" ? INACTIVE_MESSAGE : NOT_AUTHORISED_MESSAGE,
          403,
        );
      }
      return Response.json({ ok: true });
    }

    if (b.action === "signup") {
      if (!b.name) throw new ApiError("Please enter your full name.", 400);
      await enforceRateLimit("signup", `signup:${clientIp(req)}:${email}`);
      if (!canSelfProvision(email)) {
        throw new ApiError(
          `Sign-up is restricted to ${allowedDomainsLabel()} email addresses.`,
          403,
        );
      }
      const [existing] = await db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(eq(appUsers.email, email))
        .limit(1);
      if (existing) {
        throw new ApiError(
          "An account already exists for this email. Please sign in instead.",
          409,
        );
      }
      const service = createSupabaseAdminClient();
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password: b.password,
          email_confirm: true,
          user_metadata: { full_name: b.name },
        });
      if (createError) authError(createError.message);
      const supabaseUserId = created.user!.id;

      // Studio and department decide what this account can see, so neither is
      // taken on trust from the form: each must match a known record, and an
      // unrecognised value is rejected rather than quietly stored. The studio
      // in particular widens read access to every ticket at that location.
      const studio = b.studio?.trim() || "";
      const department = b.department?.trim() || "";
      if (!STUDIOS.some((x) => x.name === studio))
        throw new ApiError("Please choose your studio from the list.", 400);
      if (!DEPARTMENT_RECORDS.some((d) => d.name === department))
        throw new ApiError("Please choose your department from the list.", 400);
      const reportingManager = b.reportingManager?.trim() || null;

      try {
        const [u] = await db
          .insert(appUsers)
          .values({
            email,
            supabaseUserId,
            name: b.name,
            role: "agent",
            studio,
            department,
            reportingManager,
          })
          .returning({ id: appUsers.id });
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: b.password,
        });
        if (error) authError(error.message);
        await audit(
          { id: u.id, name: b.name },
          "account.created",
          "user:" + u.id,
        );
        return Response.json({ ok: true });
      } catch (e) {
        await service.auth.admin.deleteUser(supabaseUserId).catch(() => {});
        throw e;
      }
    }

    // `setup` mints the first administrator, `invite` is an administrator minting
    // someone else. Both create a confirmed Supabase user with the service key.
    const admin = b.action === "invite" ? await requireAdmin() : null;
    if (b.action === "setup") {
      // First-admin setup is otherwise a race anyone on the internet can win
      // against a fresh deployment; the one-time token proves operator intent.
      if (!process.env.SETUP_TOKEN)
        throw new ApiError(
          "Workspace setup is disabled. Set SETUP_TOKEN on the server to enable it.",
          403,
        );
      if (!setupTokenMatches(b.setupToken))
        throw new ApiError("The setup token is incorrect.", 403);
      if (await configuredUsers())
        throw new ApiError("This workspace already has an administrator.", 409);
    }

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
