import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Refreshes the Supabase access token and copies the rotated cookies onto the
 *  outgoing response. Server Components cannot set cookies, so without this the
 *  session silently expires after the access token's first hour. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // getUser() revalidates the token with Supabase. Never trust getSession() here:
  // it reads the cookie without verifying it, which a forged cookie would pass.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { response, user };
}
