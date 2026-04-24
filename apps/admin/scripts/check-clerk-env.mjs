#!/usr/bin/env node
// Forwards to the repo-root script (single source of truth). See
// apps/dashboard/scripts/check-clerk-env.mjs.
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const script = join(root, "scripts", "check-clerk-env.mjs")
const r = spawnSync(process.execPath, [script], { stdio: "inherit" })
process.exit(r.status === null ? 1 : r.status)
