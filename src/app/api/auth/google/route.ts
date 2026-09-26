import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { allowedEmailDomains, allowedEmails } from "@/lib/auth";

/** Starts Google sign-in through Supabase. Google is configured in
 *  Supabase Dashboard > Authentication > Providers, not in this app's env. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    // `hd` only steers Google's account picker to the workspace domain; the real
    // guard is the server-side allowlist/invite check in profileFor. It is
    // dropped once individual addresses are allowlisted, because Google would
    // otherwise refuse to show those accounts at all.
    const [hd] = allowedEmails().length > 0 ? [] : allowedEmailDomains();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", req.url).toString(),
        queryParams: { prompt: "select_account", ...(hd ? { hd } : {}) },
      },
    });
    if (error || !data.url) throw error ?? new Error("no redirect url");
    return NextResponse.redirect(data.url);
  } catch {
    const login = new URL("/login", req.url);
    login.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(login);
  }
}
