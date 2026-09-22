import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Starts Google sign-in through Supabase. Google is configured in
 *  Supabase Dashboard > Authentication > Providers, not in this app's env. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/auth/callback", req.url).toString(),
        queryParams: { prompt: "select_account" },
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
