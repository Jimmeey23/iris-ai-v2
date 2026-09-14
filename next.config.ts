import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // `scripts/dev.mjs` gives each concurrent dev server its own dist directory so
  // they never contend for the `<distDir>/dev/lock` file lock.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    // Pin the workspace root. Without this, Next walks up and finds the stray
    // lockfile in the home directory, then warns on every start.
    root: path.resolve(import.meta.dirname),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "microphone=(self), autoplay=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
