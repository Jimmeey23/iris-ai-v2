import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { db } from "@/db";
import { appUsers } from "@/db/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type Identity = {
  id: number;
  name: string;
  email: string;
  role: "agent" | "manager" | "admin";
  staffId: number | null;
  department: string | null;
  studio: string | null;
  avatarUrl: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Turns a thrown value into a response. Only ApiError messages and a one-line
 *  validation summary reach the client; anything else is logged here and answered
 *  with a generic message, so driver errors, SQL and stack detail never leak. */
export function errorResponse(error: unknown) {
  if (error instanceof ApiError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "issues" in error)
    return Response.json(
      { error: validationMessage(error) },
      { status: 400 },
    );
  console.error("Request failed:", error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}

/** First zod issue as "path: message" — enough to point at the field without
 *  echoing the whole schema back to the caller. */
export function validationMessage(error: unknown) {
  const issues = (error as { issues?: { path?: PropertyKey[]; message?: string }[] })
    .issues;
  const first = Array.isArray(issues) ? issues[0] : undefined;
  if (!first) return "Please check the highlighted fields.";
  const path = (first.path || []).map(String).join(".");
  return (path ? path + ": " : "") + (first.message || "Invalid value");
}

const PROFILE = {
  id: appUsers.id,
  name: appUsers.name,
  email: appUsers.email,
  role: appUsers.role,
  staffId: appUsers.staffId,
  department: appUsers.department,
  studio: appUsers.studio,
  avatarUrl: appUsers.avatarUrl,
  active: appUsers.active,
  supabaseUserId: appUsers.supabaseUserId,
};

function metadataName(user: User, email: string) {
  return String(
    user.user_metadata?.full_name || user.user_metadata?.name || email,
  );
}

export const NOT_AUTHORISED_MESSAGE =
  "Your account is not authorised for this workspace. Ask an administrator for an invite.";
export const INACTIVE_MESSAGE =
  "This account is not active in the workspace. Ask an administrator to restore it.";

/** Email domains whose confirmed Supabase users may self-provision an agent
 *  profile. Everyone else needs an administrator invite (an app_users row). */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "physique57india.com")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/** Human-readable list of approved domains for error copy. The allowlisted
 *  individual addresses are deliberately left out: naming them would tell an
 *  unauthorised visitor exactly which accounts to go after. */
export function allowedDomainsLabel() {
  const domains = allowedEmailDomains();
  if (domains.length === 0) return "an approved work domain";
  if (domains.length === 1) return domains[0];
  return domains.slice(0, -1).join(", ") + " or " + domains[domains.length - 1];
}

/** True when the supplied email address ends with one of the allowed domains. */
export function isAllowedEmailDomain(email: string): boolean {
  const domain = email.toLowerCase().split("@").pop() || "";
  return allowedEmailDomains().includes(domain);
}

/** Individual addresses outside the approved domains that may still
 *  self-provision — the owner's personal account, and anyone else an operator
 *  adds to ALLOWED_EMAILS. Kept separate from the domain list so widening it by
 *  one person never widens it by a whole mail domain. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "jimmeeygondaa@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The single gate for self-provisioning an agent profile: an approved domain,
 *  or a specifically allowlisted address. */
export function canSelfProvision(email: string): boolean {
  const address = email.toLowerCase();
  return allowedEmails().includes(address) || isAllowedEmailDomain(address);
}

type ProfileRow = {
  id: number;
  name: string;
  email: string;
  role: string;
  staffId: number | null;
  department: string | null;
  studio: string | null;
  avatarUrl: string | null;
  active: boolean;
  supabaseUserId: string | null;
};

export type ProfileResult =
  | { identity: Identity; reason?: undefined }
  | { identity: null; reason: "inactive" | "not_authorised" };

function toResult(row: ProfileRow | undefined): ProfileResult {
  if (!row) return { identity: null, reason: "not_authorised" };
  if (!row.active) return { identity: null, reason: "inactive" };
  const { active: _active, supabaseUserId: _link, ...identity } = row;
  return {
    identity: { ...identity, role: identity.role as Identity["role"] },
  };
}

/** Resolves the Supabase auth user to this workspace's profile row. A Supabase
 *  account alone grants nothing — anyone can create one against the project's
 *  public key. Access comes from, in order:
 *   1. a row already linked to this Supabase user id;
 *   2. an administrator-invited (or legacy) row with the same email that is not
 *      yet linked, adopted only once Supabase has confirmed the email;
 *   3. self-provisioning as an agent, only for a confirmed email whose domain is
 *      in ALLOWED_EMAIL_DOMAINS or whose address is in ALLOWED_EMAILS. */
export async function resolveProfile(user: User): Promise<ProfileResult> {
  if (!user.email) return { identity: null, reason: "not_authorised" };
  const email = user.email.toLowerCase();
  const confirmed = Boolean(user.email_confirmed_at);
  const avatarUrl = (user.user_metadata?.avatar_url as string) || null;
  const googleSub =
    user.app_metadata?.provider === "google" ? user.id : null;
  let [row] = await db
    .select(PROFILE)
    .from(appUsers)
    .where(eq(appUsers.supabaseUserId, user.id));
  if (row) {
    if (avatarUrl && !row.avatarUrl)
      [row] = await db
        .update(appUsers)
        .set({ avatarUrl })
        .where(eq(appUsers.id, row.id))
        .returning(PROFILE);
    return toResult(row);
  }
  if (!confirmed) return { identity: null, reason: "not_authorised" };
  // Adopt an invited/legacy row by email — never one already linked to a
  // different Supabase account.
  [row] = await db
    .select(PROFILE)
    .from(appUsers)
    .where(and(eq(appUsers.email, email), isNull(appUsers.supabaseUserId)));
  if (row) {
    [row] = await db
      .update(appUsers)
      .set({
        supabaseUserId: user.id,
        avatarUrl: row.avatarUrl || avatarUrl,
        googleSub: googleSub ?? undefined,
      })
      .where(and(eq(appUsers.id, row.id), isNull(appUsers.supabaseUserId)))
      .returning(PROFILE);
    return toResult(row);
  }
  if (!canSelfProvision(email))
    return { identity: null, reason: "not_authorised" };
  [row] = await db
    .insert(appUsers)
    .values({
      email,
      name: metadataName(user, email),
      supabaseUserId: user.id,
      avatarUrl,
      googleSub,
      role: "agent",
    })
    .onConflictDoNothing()
    .returning(PROFILE);
  // A concurrent first request may have won the insert; read back only a row
  // linked to this same Supabase user.
  if (!row)
    [row] = await db
      .select(PROFILE)
      .from(appUsers)
      .where(eq(appUsers.supabaseUserId, user.id));
  return toResult(row);
}

export async function profileFor(user: User): Promise<Identity | null> {
  return (await resolveProfile(user)).identity;
}

type Session =
  | { identity: Identity; reason?: undefined }
  | { identity: null; reason: "signed_out" | "inactive" | "not_authorised" };

/** One verification per request: React cache() memoises it for the lifetime of
 *  the current server request, so the several gates a route calls are free. */
const session = cache(async (): Promise<Session> => {
  const supabase = await createSupabaseServerClient();
  // getClaims() verifies the JWT signature (locally with asymmetric keys, via
  // the Auth server otherwise). getSession() does not verify and must never be
  // used for an authorisation decision. Revocation is covered by the
  // app_users.active flag, which is read on every request below.
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub;
  if (claimsError || !sub) return { identity: null, reason: "signed_out" };
  const [linked] = await db
    .select(PROFILE)
    .from(appUsers)
    .where(eq(appUsers.supabaseUserId, sub));
  if (linked) return toResult(linked);
  // Not linked yet: fetch the full user (email confirmation state, metadata)
  // from the Auth server and run the adoption / allowlist rules.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { identity: null, reason: "signed_out" };
  return resolveProfile(data.user);
});

export async function currentUser(): Promise<Identity | null> {
  return (await session()).identity;
}

/** Signed in with Supabase but without a usable workspace profile: 403 with a
 *  message the person can act on. Signed out entirely: 401. */
async function requireSession(signedOutMessage: string): Promise<Identity> {
  const s = await session();
  if (s.identity) return s.identity;
  if (s.reason === "not_authorised")
    throw new ApiError(NOT_AUTHORISED_MESSAGE, 403);
  if (s.reason === "inactive") throw new ApiError(INACTIVE_MESSAGE, 403);
  throw new ApiError(signedOutMessage, 401);
}

export async function configuredUsers() {
  return (await db.select({ id: appUsers.id }).from(appUsers).limit(1)).length > 0;
}

export async function requireAdmin() {
  const user = await requireSession("Administrator sign-in is required.");
  if (user.role !== "admin")
    throw new ApiError("Administrator sign-in is required.", 403);
  return user;
}

/** Managers and administrators — for member-data and live external actions
 *  that front-line agents should not reach. */
export async function requireManager() {
  const user = await requireSession("Sign in to your workspace account to continue.");
  if (user.role !== "admin" && user.role !== "manager")
    throw new ApiError("A manager or administrator is required for this.", 403);
  return user;
}

/** Gate for writes against records that already exist. Throws when the caller is
 *  not a signed-in agent, manager or admin. */
export async function requireAgent(): Promise<Identity> {
  const user = await requireSession(
    "Sign in to your workspace account to make this change.",
  );
  if (["admin", "manager", "agent"].includes(user.role)) return user;
  // A signed-in viewer is authenticated but not permitted, which is 403. Returning 401 for
  // them told the client to prompt for a sign-in they had already completed.
  throw new ApiError(
    "Your account has view-only access to this workspace.",
    403,
  );
}

/** Intake surfaces — logging a new ticket or review — still require a signed-in
 *  workspace account; they create records rather than mutate existing ones, so
 *  they accept any role. */
export async function intakeActor(): Promise<Identity> {
  return requireWorkspace();
}

/** Reads the signed-in identity, or null. Use when a surface legitimately serves
 *  anonymous callers. It is NOT an authorisation check — the name says so. */
export async function optionalUser(): Promise<Identity | null> {
  return currentUser();
}

/** Gate for workspace data — tickets, staff, analytics, the equipment register. */
export async function requireWorkspace(): Promise<Identity> {
  return requireSession("Sign in to your workspace account to view this.");
}

export function canAccessTicket(
  user: Identity,
  ticket: {
    assignedStaffId: number | null;
    createdByUserId?: number | null;
    departmentName?: string | null;
    studio?: string | null;
  },
) {
  if (user.role === "admin") return true;
  if (user.role === "agent")
    return (
      (user.staffId !== null && ticket.assignedStaffId === user.staffId) ||
      ticket.createdByUserId === user.id
    );
  const checks: boolean[] = [];
  if (user.department) checks.push(ticket.departmentName === user.department);
  if (user.studio) checks.push(ticket.studio === user.studio);
  return checks.length > 0 && checks.every(Boolean);
}

export function requireTicketAccess(
  user: Identity,
  ticket: {
    assignedStaffId: number | null;
    createdByUserId?: number | null;
    departmentName?: string | null;
    studio?: string | null;
  },
) {
  if (!canAccessTicket(user, ticket))
    throw new ApiError("You do not have access to this ticket.", 403);
}

export async function requireIntegrationAccess(write = false) {
  const user = await requireWorkspace();
  if (write && user.role !== "admin")
    throw new ApiError(
      "An administrator must approve live external changes.",
      403,
    );
  return user;
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}

export async function browserKey() {
  const jar = await cookies();
  let token = jar.get("iris_browser")?.value;
  if (!token) {
    token = randomBytes(24).toString("hex");
    jar.set("iris_browser", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 86400,
    });
  }
  const user = await currentUser();
  return user ? "user:" + user.id : "browser:" + digest(token);
}

/** CSRF guard for state-changing browser requests. Prefers the Origin header;
 *  when a browser omits it, falls back to Fetch Metadata (Sec-Fetch-Site). A
 *  request carrying neither is rejected — server-to-server callers (webhooks)
 *  authenticate by secret and must not call this. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host =
    request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin) {
    const site = request.headers.get("sec-fetch-site");
    if (site === "same-origin" || site === "none") return;
    throw new ApiError("Cross-origin request rejected.", 403);
  }
  if (!host) throw new ApiError("Cross-origin request rejected.", 403);
  // An opaque origin ("null", from a sandboxed frame or file:// page) is not parseable:
  // treat it as cross-origin instead of throwing a raw TypeError.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("Cross-origin request rejected.", 403);
  }
  if (originHost !== host)
    throw new ApiError("Cross-origin request rejected.", 403);
}
