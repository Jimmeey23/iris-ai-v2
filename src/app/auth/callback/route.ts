import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileFor, logout } from "@/lib/auth";

/** Temporary: this handshake has failed for several different reasons in a row,
 *  and Vercel's runtime logs can only be tailed live, so a failure that happens
 *  while nobody is watching leaves nothing behind. Putting the reason on the
 *  redirect means one sign-in attempt is enough to diagnose it. Remove once the
 *  flow is confirmed healthy. */
async function diagnose(reason: string) {
  const jar = await cookies();
  const verifiers = jar
    .getAll()
    .map((c) => c.name)
    .filter((n) => n.includes("code-verifier"));
  return `${reason} | verifier cookies: ${verifiers.length ? verifiers.join(" ") : "NONE"}`;
}

/** Exchanges the OAuth / email-confirmation code for a session cookie. Supabase
 *  redirects here after Google sign-in and after a confirmation link is clicked. */
export async function GET(req: NextRequest) {
  const login = new URL("/login", req.url);
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) {
    login.searchParams.set("error", "google_signin");
    return NextResponse.redirect(login);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // The exchange fails for reasons the person can act on — a verifier cookie
    // dropped by the browser, a code already spent by a reload — so the reason
    // is logged rather than collapsed into one opaque message.
    const detail = await diagnose(error?.message ?? "no user returned");
    console.error("exchangeCodeForSession failed:", detail);
    login.searchParams.set("error", "google_signin");
    login.searchParams.set("detail", detail);
    return NextResponse.redirect(login);
  }
  // Creates the workspace profile on first sign-in, and returns null when the
  // account has been deactivated here. A database failure here must not escape:
  // an unhandled throw renders a blank platform error page instead of the login
  // screen, which hides the real cause from the person signing in.
  let profile;
  try {
    profile = await profileFor(data.user);
  } catch (err) {
    console.error("profileFor failed during OAuth callback", err);
    await logout();
    login.searchParams.set("error", "profile_unavailable");
    return NextResponse.redirect(login);
  }
  if (!profile) {
    await logout();
    login.searchParams.set("error", "inactive");
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
