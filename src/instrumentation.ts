import type { Instrumentation } from "next";
import { reportError, sentryDsn } from "@/lib/observability";

export function register() {
  // No SDK to boot — reporting is a POST, see lib/observability. This only states, once per
  // cold start, whether errors are going anywhere other than stderr; a deployment that
  // believes it is monitored and is not is worse than one that knows it is not.
  console.log(
    JSON.stringify({
      level: "info",
      source: "instrumentation",
      errorReporting: sentryDsn() ? "sentry" : "logs-only",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    }),
  );
}

/**
 * Called by Next for every uncaught server error (Server Components, Route Handlers, Server
 * Actions, Proxy). `reportError` writes the JSON line Vercel's log pipeline indexes and, when
 * SENTRY_DSN is set, reports it. The `digest` matches the reference shown to the user by
 * error.tsx / global-error.tsx, so a support conversation can be tied to the report.
 *
 * Headers, cookies and query strings are deliberately not passed on — they carry session
 * tokens, and intake query strings carry ticket content.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const error = err as Error & { digest?: string };
  await reportError(error, {
    source: "onRequestError",
    path: request.path.split("?")[0],
    method: request.method,
    digest: error?.digest,
    extra: {
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: "renderSource" in context ? context.renderSource : undefined,
    },
  });
};
