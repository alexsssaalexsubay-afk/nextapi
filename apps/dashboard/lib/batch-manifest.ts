/** Client-side helpers for Batch Studio CSV → POST /v1/videos. */

export const VALID_ASPECT_RATIOS = new Set([
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9",
  "adaptive",
])

const CONTINUITY_FIELDS = [
  "character_ref",
  "outfit_ref",
  "scene_ref",
  "character_id",
  "outfit_id",
] as const

function clean(s: unknown): string {
  if (s === null || s === undefined) return ""
  return String(s).trim()
}

/** Minimal RFC4180-style line parser (handles quoted commas). */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += c
    }
  }
  out.push(cur)
  return out
}

export function parseShotManifestCsv(text: string): {
  headers: string[]
  rows: Record<string, string>[]
} {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = normalized.split("\n").filter((l) => clean(l) !== "")
  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row.")
  }
  const headers = parseCsvLine(lines[0]).map((h) => clean(h))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = clean(cells[j])
    })
    rows.push(row)
  }
  return { headers, rows }
}

export function applyContinuityInheritance(
  rows: Record<string, string>[],
): Record<string, string>[] {
  const byGroup = new Map<string, Record<string, string>>()
  const out: Record<string, string>[] = []
  for (const r of rows) {
    const cg = clean(r.continuity_group)
    if (!cg) {
      out.push({ ...r })
      continue
    }
    if (!byGroup.has(cg)) {
      byGroup.set(cg, r)
      out.push({ ...r })
      continue
    }
    const anchor = byGroup.get(cg)!
    const merged = { ...r }
    for (const key of CONTINUITY_FIELDS) {
      if (!clean(merged[key]) && clean(anchor[key])) {
        merged[key] = anchor[key]!
      }
    }
    out.push(merged)
  }
  return out
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

export function pickImageUrl(row: Record<string, string>): string | undefined {
  for (const key of ["character_ref", "outfit_ref", "scene_ref", "reference_video"] as const) {
    const v = clean(row[key])
    if (v && isHttpUrl(v)) return v
  }
  return undefined
}

export function buildPrompt(row: Record<string, string>): string {
  const primary = clean(row.prompt_en) || clean(row.prompt_cn)
  const camera = clean(row.camera)
  const motion = clean(row.motion)
  const mood = clean(row.mood)
  const neg = clean(row.negative_prompt)
  const bits = [camera, motion, mood].filter(Boolean)
  let p = primary
  if (bits.length) {
    p = p ? `${p}\n\n${bits.join(". ")}` : bits.join(". ")
  }
  if (neg) {
    p = p ? `${p}\n\nAvoid: ${neg}` : `Avoid: ${neg}`
  }
  return p
}

export type PreparedShot = {
  index: number
  shot_id: string
  prompt: string
  duration_seconds: number
  aspect_ratio: string
  image_url?: string
  refWarning?: string
}

export type ValidateResult = {
  prepared: PreparedShot[]
  errors: { index: number; shot_id: string; message: string }[]
  warnings: string[]
}

export function validateAndPrepareRows(
  rows: Record<string, string>[],
): ValidateResult {
  const errors: { index: number; shot_id: string; message: string }[] = []
  const warnings: string[] = []
  const prepared: PreparedShot[] = []

  rows.forEach((row, index) => {
    const shotId = clean(row.shot_id)
    if (!shotId) {
      errors.push({ index, shot_id: "", message: "Missing shot_id." })
      return
    }

    const prompt = buildPrompt(row)
    if (prompt.length < 4) {
      errors.push({ index, shot_id: shotId, message: "prompt_en / prompt_cn is too short or empty." })
      return
    }

    const durRaw = clean(row.duration)
    const duration = durRaw ? Number.parseInt(durRaw, 10) : 5
    if (!Number.isFinite(duration) || duration < 2 || duration > 15) {
      errors.push({
        index,
        shot_id: shotId,
        message: "duration must be between 2 and 15 seconds.",
      })
      return
    }

    const aspect = clean(row.aspect_ratio) || "16:9"
    if (!VALID_ASPECT_RATIOS.has(aspect)) {
      errors.push({
        index,
        shot_id: shotId,
        message: `Invalid aspect_ratio "${aspect}".`,
      })
      return
    }

    let refWarning: string | undefined
    const img = pickImageUrl(row)
    if (!img) {
      for (const key of ["character_ref", "outfit_ref", "scene_ref", "reference_video"] as const) {
        const v = clean(row[key])
        if (v && !isHttpUrl(v)) {
          refWarning =
            "Reference columns contain filenames, not HTTPS URLs. Image-to-video needs a public URL in the browser, or use the desktop Batch Studio app to upload files."
          break
        }
      }
    }

    prepared.push({
      index,
      shot_id: shotId,
      prompt,
      duration_seconds: duration,
      aspect_ratio: aspect,
      image_url: img,
      refWarning,
    })
  })

  const warned = new Set<string>()
  for (const p of prepared) {
    if (p.refWarning && !warned.has(p.refWarning)) {
      warnings.push(p.refWarning)
      warned.add(p.refWarning)
    }
  }

  return { prepared, errors, warnings }
}

export function buildVideoCreateBody(
  shot: PreparedShot,
  model: string,
  resolution: string,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt: shot.prompt,
    duration_seconds: shot.duration_seconds,
    resolution,
    aspect_ratio: shot.aspect_ratio,
  }
  if (shot.image_url) {
    input.image_url = shot.image_url
  }
  return {
    model,
    input,
  }
}
