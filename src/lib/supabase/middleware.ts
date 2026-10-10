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
  // getClaims() refreshes an expired token and verifies the JWT signature — locally
  // with asymmetric signing keys, so a page view no longer waits on a round trip to
  // the Auth server. Never trust getSession() here: it reads the cookie without
  // verifying it, which a forged cookie would pass. Revocation is still enforced by
  // lib/auth, which reads app_users.active on every request.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;
  return { response, user };
}
