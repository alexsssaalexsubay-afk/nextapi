/** Strong password: exactly 10 characters, at least one lower, upper, digit, symbol. */

const L = "abcdefghjkmnpqrstuvwxyz"
const U = "ABCDEFGHJKMNPQRSTUVWXYZ"
const D = "23456789"
const S = "!@#$%&*"
const A = L + U + D + S

function pick(s: string, buf: Uint8Array, i: number) {
  return s[buf[i]! % s.length]!
}

export function generateStrongPassword10(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    // Fallback (should not run in browser)
    return Math.random().toString(36).slice(2, 12)
  }
  const buf = new Uint8Array(20)
  crypto.getRandomValues(buf)
  const chars: string[] = [
    pick(L, buf, 0),
    pick(U, buf, 1),
    pick(D, buf, 2),
    pick(S, buf, 3),
  ]
  for (let i = 0; i < 6; i++) {
    chars.push(pick(A, buf, 4 + i))
  }
  const r = new Uint8Array(10)
  crypto.getRandomValues(r)
  for (let i = 9; i > 0; i--) {
    const j = r[i]! % (i + 1)
    const a = chars[i]!
    const b = chars[j]!
    chars[i] = b
    chars[j] = a
  }
  return chars.join("")
}

const LOCAL_ALNUM = "abcdefghjkmnpqrstuvwxyz23456789"

/** 8-byte random local part, safe for left side of @nextapi.top */
export function generateEmailLocal8(): string {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    return `u${Date.now().toString(36)}`
  }
  const buf = new Uint8Array(8)
  crypto.getRandomValues(buf)
  let s = "u-"
  for (let i = 0; i < 6; i++) s += LOCAL_ALNUM[buf[i]! % LOCAL_ALNUM.length]
  return s
}
