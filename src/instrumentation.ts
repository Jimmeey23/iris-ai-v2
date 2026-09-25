import type { Instrumentation } from "next";

export function register() {
  // Nothing to initialise. Kept so an APM/Sentry `register()` can slot in here
  // later (see README → Monitoring).
}

/**
 * Called by Next for every uncaught server error (Server Components, Route
 * Handlers, Server Actions, Proxy). One JSON line on stderr is what Vercel's log
 * pipeline indexes best; the `digest` matches the reference shown to the user by
 * error.tsx / global-error.tsx. Headers, cookies and query strings are deliberately
 * not logged — they carry session tokens.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as Error & { digest?: string };
  const path = request.path.split("?")[0];
  console.error(
    JSON.stringify({
      level: "error",
      source: "onRequestError",
      message: error?.message ?? String(err),
      digest: error?.digest,
      path,
      method: request.method,
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: "renderSource" in context ? context.renderSource : undefined,
      stack: process.env.NODE_ENV === "production" ? error?.stack?.split("\n").slice(0, 8).join("\n") : error?.stack,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      at: new Date().toISOString(),
    }),
  );
};
