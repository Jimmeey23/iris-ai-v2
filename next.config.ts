import type { NextConfig } from "next";
import path from "node:path";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * Origins the browser actually talks to (audited from src/components + src/app):
 *   - 'self'                     pages, API routes, /images, /video, next/font
 *                                (next/font/google self-hosts the fonts at build time)
 *   - https://server.fillout.com Fillout / Zite embed scripts (fillout-embed.tsx)
 *   - https://*.fillout.com      the iframe those scripts inject
 *   - https: for img-src         equipment photos are arbitrary URLs a studio pastes in
 *   - blob: / data:              exports (createObjectURL), TTS audio, attachment previews
 * Supabase, OpenAI, Momence etc. are only called server-side, so connect-src is 'self'.
 *
 * script-src needs 'unsafe-inline' for the pre-paint theme script in layout.tsx and
 * Next's inline bootstrap. A per-request nonce (generated in proxy.ts) would be
 * stricter but forces every page to render dynamically; revisit if that trade-off
 * changes. 'unsafe-eval' is only needed by React's dev tooling.
 *
 * The policy is now enforced. It shipped Report-Only first because the Fillout runtime
 * can pull in origins we cannot audit from this repo; the production console stayed
 * clean, so the same directive list is served as Content-Security-Policy. Report-Only
 * is kept alongside it — with no `report-uri` it costs nothing, and flipping a single
 * header back is the fastest rollback if an embed starts failing.
 */
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://server.fillout.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' blob: data:",
  `connect-src 'self' https://server.fillout.com https://*.fillout.com${isDev ? " ws: wss:" : ""}`,
  "frame-src 'self' https://*.fillout.com https://*.zite.so",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const csp = cspDirectives.join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self), autoplay=(self), camera=(), geolocation=()" },
  { key: "Content-Security-Policy", value: csp },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  // `scripts/dev.mjs` gives each concurrent dev server its own dist directory so
  // they never contend for the `<distDir>/dev/lock` file lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  turbopack: {
    // Pin the workspace root. Without this, Next walks up and finds the stray
    // lockfile in the home directory, then warns on every start.
    root: path.resolve(import.meta.dirname),
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
