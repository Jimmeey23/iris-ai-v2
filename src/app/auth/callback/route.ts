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
    login.searchParams.set("error", "google_signin");
    return NextResponse.redirect(login);
  }
  // Creates the workspace profile on first sign-in, and returns null when the
  // account has been deactivated here.
  const profile = await profileFor(data.user);
  if (!profile) {
    await logout();
    login.searchParams.set("error", "inactive");
    return NextResponse.redirect(login);
  }
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
