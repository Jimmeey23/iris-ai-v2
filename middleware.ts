import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC = ["/login", "/auth", "/api/auth", "/video", "/_next", "/favicon.ico"];

// The OAuth handshake keeps its PKCE code verifier in a cookie named with the
// same `sb-<ref>-auth-token` prefix the session uses. Refreshing the session on
// these two routes deletes that verifier whenever getUser() comes back empty,
// which leaves /auth/callback unable to exchange its code. Neither route needs a
// refreshed session, so they skip it entirely.
const OAUTH_HANDSHAKE = ["/auth/callback", "/api/auth/google"];

export async function middleware(request: NextRequest) {
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

export const config = { matcher: ["/((?!.*\\.[^/]+$).*)"] };
