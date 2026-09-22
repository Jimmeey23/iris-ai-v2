import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileFor, logout } from "@/lib/auth";

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
    console.error(
      "exchangeCodeForSession failed:",
      error?.message ?? "no user returned",
    );
    login.searchParams.set("error", "google_signin");
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
