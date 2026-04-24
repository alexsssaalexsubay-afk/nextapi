/**
 * Ensures en.ts and zh.ts have identical nested key paths (leaf parity).
 * Run: pnpm --filter @nextapi/ui check-i18n
 */
import { en } from "../src/lib/i18n/messages/en"
import { zh } from "../src/lib/i18n/messages/zh"

function leafPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return prefix ? [prefix] : []
  }
  const keys = Object.keys(obj as object)
  if (keys.length === 0) return [prefix]
  return keys.flatMap((k) =>
    leafPaths((obj as Record<string, unknown>)[k], prefix ? `${prefix}.${k}` : k),
  )
}

const enSet = new Set(leafPaths(en))
const zhSet = new Set(leafPaths(zh))
const onlyEn = [...enSet].filter((p) => !zhSet.has(p)).sort()
const onlyZh = [...zhSet].filter((p) => !enSet.has(p)).sort()

if (onlyEn.length || onlyZh.length) {
  console.error("i18n key mismatch between en.ts and zh.ts:")
  onlyEn.forEach((p) => console.error("  only en:", p))
  onlyZh.forEach((p) => console.error("  only zh:", p))
  process.exit(1)
}

console.log("i18n OK: en and zh have identical leaf keys (%d).", enSet.size)
