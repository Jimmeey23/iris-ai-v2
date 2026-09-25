import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveProfile, logout } from "@/lib/auth";

/** Exchanges the OAuth / email-confirmation code for a session cookie. Supabase
 *  redirects here after Google sign-in and after a confirmation link is clicked. */
export async function GET(req: NextRequest) {
  const login = new URL("/login", req.url);
  const code = req.nextUrl.searchParams.get("code");
  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError || !code) {
    login.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(login);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    // The reason is logged server-side only; the redirect carries a fixed code.
    console.error("exchangeCodeForSession failed:", error?.message ?? "no user returned");
    login.searchParams.set("error", "oauth_failed");
    return NextResponse.redirect(login);
  }
  // Links an invited profile or provisions one for an allowlisted domain; any
  // other Supabase account is signed straight back out. A database failure here must not escape:
  // an unhandled throw renders a blank platform error page instead of the login
  // screen, which hides the real cause from the person signing in.
  let profile;
  try {
    profile = await resolveProfile(data.user);
  } catch (err) {
    console.error("resolveProfile failed during OAuth callback", err);
    await logout();
    login.searchParams.set("error", "profile_unavailable");
    return NextResponse.redirect(login);
  }
  if (!profile.identity) {
    await logout();
    login.searchParams.set("error", profile.reason === "inactive" ? "inactive" : "not_authorised");
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
