import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Static files (anything with a file extension, e.g. /icon.svg) never reach the
// proxy at all: the matcher below excludes them, so they need no entry here.
const PUBLIC = ["/login", "/auth", "/api/auth", "/video", "/_next"];

// The OAuth handshake keeps its PKCE code verifier in a cookie named with the
// same `sb-<ref>-auth-token` prefix the session uses. Refreshing the session on
// these two routes deletes that verifier whenever getUser() comes back empty,
// which leaves /auth/callback unable to exchange its code. Neither route needs a
// refreshed session, so they skip it entirely.
const OAUTH_HANDSHAKE = ["/auth/callback", "/api/auth/google"];

// Next.js 16 renamed the `middleware` file convention to `proxy`; behaviour is
// unchanged. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
  if (OAUTH_HANDSHAKE.includes(path)) return NextResponse.next();
  let session: Awaited<ReturnType<typeof updateSession>>;
  try {
    session = await updateSession(request);
  } catch {
    // Supabase is not configured yet. Let public routes through so the login
    // page can render its own error rather than redirect-looping.
    if (isPublic || path.startsWith("/api/")) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (isPublic) return session.response;
  // API routes answer for themselves with a 401 and a JSON body; redirecting them
  // to the login page would hand a fetch() an HTML document instead of an error.
  if (!session.user && !path.startsWith("/api/"))
    return NextResponse.redirect(new URL("/login", request.url));
  return session.response;
}

// API routes are excluded as well: every one of them that needs a session verifies it
// itself through lib/auth (and refreshes the cookie there — Route Handlers can write
// cookies), and answers for itself with a 401. Running the proxy in front of them too
// doubled the invocations of every poll for no change in behaviour.
export const config = { matcher: ["/((?!api/|.*\\.[^/]+$).*)"] };
