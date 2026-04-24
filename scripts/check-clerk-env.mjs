#!/usr/bin/env node
// Build-time guard: refuse to ship a Worker/Next bundle that doesn't have a
// Clerk publishable key. The wrangler config does not hard-code one (avoids
// wrong keys in production), so a missing `NEXT_PUBLIC_*` would produce a
// client that errors at runtime — fail the build instead.
//
// `NEXT_PUBLIC_*` must be present at **build** time (Next inlines it). For
// Cloudflare Pages/Workers, add it under Project → Settings → Environment
// variables (Build) — not only as a runtime Worker secret.
//
// Escape hatch: SKIP_CLERK_ENV_CHECK=1 (fork CI, not for real deployments).
const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""

if (!key) {
  if (process.env.SKIP_CLERK_ENV_CHECK === "1") {
    console.warn(
      "\x1b[33m⚠ SKIP_CLERK_ENV_CHECK=1: building without NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.\x1b[0m\n" +
        "  The app will not authenticate until you set the real key and rebuild.",
    )
    process.exit(0)
  }
  console.error(
    "\x1b[31m✘ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set (during this build).\x1b[0m\n" +
      "  Next.js inlines it at **build** time. Worker-only \"Variables and secrets\" are often **runtime** —\n" +
      "  the remote `next build` step will not see them unless you also set **build** env for the pipeline.\n" +
      "  Local: export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx  (or pk_live_…)\n" +
      "  Cloudflare Workers: Settings → **Builds** (or build env) → add the same `pk_…` for the build; see ops/deploy/README.md\n" +
      "  Wrangler: ensure the var is in the build environment, not `secret put` alone for NEXT_PUBLIC_*\n" +
      "  Emergency only: SKIP_CLERK_ENV_CHECK=1 pnpm build",
  )
  process.exit(1)
}
const env = key.startsWith("pk_live_") ? "live" : key.startsWith("pk_test_") ? "test" : "unknown"
if (env === "unknown") {
  console.error(
    "\x1b[31m✘ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not look like a Clerk publishable key.\x1b[0m\n" +
      "  Got: " +
      key.slice(0, 10) +
      "…",
  )
  process.exit(1)
}
console.log(`✓ Clerk publishable key present (${env})`)
