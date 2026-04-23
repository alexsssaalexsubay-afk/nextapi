#!/usr/bin/env node
// Build-time guard: refuse to ship a Worker bundle that doesn't have a
// Clerk publishable key. The wrangler.toml no longer hard-codes one
// (so we can't accidentally deploy the test instance to production), but
// that means an absent env var would silently produce a Worker that
// crashes on first request. Fail the build instead.
//
// Usage: `node scripts/check-clerk-env.mjs` — wired in via package.json
// "build" script that runs before `next build`.
const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
if (!key) {
  console.error(
    "\x1b[31m✘ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set.\x1b[0m\n" +
      "  Set it via:\n" +
      "    export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx   (or pk_test_xxx for staging)\n" +
      "  or, for the deployed Worker:\n" +
      "    pnpm --filter @nextapi/dashboard exec wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  )
  process.exit(1)
}
const env = key.startsWith("pk_live_") ? "live" : key.startsWith("pk_test_") ? "test" : "unknown"
if (env === "unknown") {
  console.error(
    "\x1b[31m✘ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not look like a Clerk publishable key.\x1b[0m\n" +
      "  Got: " + key.slice(0, 10) + "…",
  )
  process.exit(1)
}
console.log(`✓ Clerk publishable key present (${env})`)
