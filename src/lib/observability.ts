/**
 * Error reporting.
 *
 * Every server-side failure already reaches stderr as one JSON line, which is what Vercel's
 * log pipeline indexes. That is enough to read after the fact and nothing at all to be
 * alerted by: nobody is watching the log at 11pm when the outbox starts failing.
 *
 * `reportError` keeps the structured log line and, when `SENTRY_DSN` is set, additionally
 * posts the error to Sentry's envelope endpoint. There is deliberately no SDK: the envelope
 * API is three fields and a POST, and an SDK here would mean a build-time wrapper, two more
 * config files and a client bundle none of this needs. The trade-off is that we send the raw
 * stack string rather than parsed frames, so Sentry groups by exception type and message and
 * shows the stack as an attachment-style extra instead of linked source lines.
 *
 * With no DSN configured this is exactly the previous behaviour — a log line — so the app
 * runs unchanged in development and in CI.
 */

type Severity = "error" | "warning" | "fatal";

export type ErrorContext = {
  /** Where this came from: `cron.outbox`, `api.tickets`, `onRequestError`. Becomes the Sentry
   *  transaction, and the `source` field on the log line. */
  source: string;
  severity?: Severity;
  /** Request path, already stripped of its query string by the caller. Never pass a URL with
   *  a query: intake links carry ticket content, and Momence links carry member ids. */
  path?: string;
  method?: string;
  /** The reference error.tsx showed the person, so a support conversation can be matched to
   *  the report without asking them for anything else. */
  digest?: string;
  /** Anything else worth seeing. Keep it to identifiers — no member names, no email
   *  addresses, no request bodies. */
  extra?: Record<string, unknown>;
};

const DSN_PATTERN = /^https:\/\/([^@]+)@([^/]+)\/(.+)$/;

type Dsn = { host: string; publicKey: string; projectId: string };

let dsnCache: { raw: string | undefined; parsed: Dsn | null } | undefined;

/** Parses `https://<publicKey>@<host>/<projectId>`. A malformed DSN is reported once and then
 *  treated as absent — a monitoring misconfiguration must not take the app down. */
export function sentryDsn(raw = process.env.SENTRY_DSN): Dsn | null {
  if (dsnCache && dsnCache.raw === raw) return dsnCache.parsed;
  let parsed: Dsn | null = null;
  const trimmed = raw?.trim();
  if (trimmed) {
    const match = DSN_PATTERN.exec(trimmed);
    if (match) parsed = { publicKey: match[1], host: match[2], projectId: match[3] };
    else
      console.error(
        JSON.stringify({
          level: "error",
          source: "observability",
          message:
            "SENTRY_DSN is set but is not a https://<key>@<host>/<project> DSN. Errors will be logged only.",
        }),
      );
  }
  dsnCache = { raw, parsed };
  return parsed;
}

const release = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
const environment =
  process.env.VERCEL_ENV || process.env.NODE_ENV || "development";

function eventId() {
  return crypto.randomUUID().replace(/-/g, "");
}

/** Trimmed to eight frames: enough to see the call path, short enough that a log line stays
 *  one line in the Vercel console. */
function shortStack(stack?: string) {
  return stack?.split("\n").slice(0, 8).join("\n");
}

function envelope(error: Error, context: ErrorContext, dsn: Dsn) {
  const header = {
    event_id: eventId(),
    sent_at: new Date().toISOString(),
    dsn: `https://${dsn.publicKey}@${dsn.host}/${dsn.projectId}`,
  };
  const event = {
    event_id: header.event_id,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: context.severity ?? "error",
    environment,
    release,
    transaction: context.source,
    server_name: process.env.VERCEL_REGION,
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message || String(error),
        },
      ],
    },
    tags: {
      source: context.source,
      ...(context.method ? { method: context.method } : {}),
      ...(context.digest ? { digest: context.digest } : {}),
    },
    request: context.path ? { url: context.path, method: context.method } : undefined,
    extra: { ...context.extra, stack: error.stack },
  };
  return (
    JSON.stringify(header) +
    "\n" +
    JSON.stringify({ type: "event" }) +
    "\n" +
    JSON.stringify(event) +
    "\n"
  );
}

/** Fire-and-forget: a slow or down Sentry must never add latency to a request that is already
 *  failing, and a rejected POST must never replace the original error. */
async function send(error: Error, context: ErrorContext, dsn: Dsn) {
  try {
    await fetch(`https://${dsn.host}/api/${dsn.projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=iris/1.0, sentry_key=${dsn.publicKey}`,
      },
      body: envelope(error, context, dsn),
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
  } catch {
    // Reporting the reporter failing would be a loop. The structured log line already went out.
  }
}

function asError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  const error = new Error(
    typeof thrown === "string" ? thrown : JSON.stringify(thrown),
  );
  error.name = "NonError";
  return error;
}

/**
 * Logs one structured line and, if a DSN is configured, reports to Sentry.
 *
 * Returns the promise so a caller inside `after()` can await the delivery; everywhere else
 * can ignore it. Never throws.
 */
export function reportError(thrown: unknown, context: ErrorContext): Promise<void> {
  const error = asError(thrown);
  console.error(
    JSON.stringify({
      level: context.severity ?? "error",
      source: context.source,
      message: error.message,
      name: error.name,
      digest: context.digest,
      path: context.path,
      method: context.method,
      ...context.extra,
      stack:
        environment === "development" ? error.stack : shortStack(error.stack),
      commit: release,
      at: new Date().toISOString(),
    }),
  );
  const dsn = sentryDsn();
  if (!dsn) return Promise.resolve();
  return send(error, context, dsn);
}
