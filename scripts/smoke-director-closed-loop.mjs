#!/usr/bin/env node

const args = new Set(process.argv.slice(2))
const execute = args.has("--execute")
const requireAdvanced = args.has("--require-advanced")

const baseURL = stripTrailingSlash(process.env.NEXTAPI_BASE_URL || "https://api.nextapi.top")
const email = process.env.NEXTAPI_SMOKE_EMAIL || ""
const password = process.env.NEXTAPI_SMOKE_PASSWORD || ""
const story =
  process.env.NEXTAPI_SMOKE_STORY ||
  "一个年轻创业者在雨夜修好第一台视频生成服务器，清晨终于看到第一条多镜头短片成功进入队列。"

if (!email || !password) {
  console.error(
    [
      "Director closed-loop smoke requires credentials.",
      "",
      "Set:",
      "  NEXTAPI_SMOKE_EMAIL=<dashboard account email>",
      "  NEXTAPI_SMOKE_PASSWORD=<dashboard account password>",
      "",
      "Optional:",
      "  NEXTAPI_BASE_URL=https://api.nextapi.top",
      "  NEXTAPI_SMOKE_STORY='一句剧情'",
      "",
      "Run planning/workflow-only smoke:",
      "  pnpm director:smoke",
      "",
      "Run real queue handoff smoke, which may consume credits:",
      "  pnpm director:smoke -- --execute --require-advanced",
    ].join("\n"),
  )
  process.exit(2)
}

const summary = {
  base_url: baseURL,
  execute,
  require_advanced: requireAdvanced,
  auth: "pending",
  status: null,
  director: null,
}

try {
  const login = await postJSON("/v1/auth/login", { email, password })
  const dashboardKey = login?.dashboard_key?.secret
  if (!dashboardKey || typeof dashboardKey !== "string") {
    throw new Error("login succeeded but no dashboard key was minted")
  }
  summary.auth = "ok"

  const status = await getJSON("/v1/director/status", dashboardKey)
  summary.status = pickStatus(status)
  if (!status?.available) {
    throw new Error(`AI Director unavailable: ${status?.blocking_reason || status?.reason || "unknown"}`)
  }

  const result = await postJSON(
    "/v1/director/mode/run",
    {
      engine: "advanced",
      story,
      genre: "short_drama",
      style: "cinematic realistic",
      shot_count: 3,
      duration_per_shot: 4,
      generate_images: Boolean(status?.image_provider_configured),
      run_workflow: execute,
      options: {
        name: "Director smoke closed loop",
        ratio: "9:16",
        resolution: "1080p",
        generate_audio: false,
        model: "seedance-2.0-pro",
        enable_merge: Boolean(status?.merge_enabled),
      },
    },
    dashboardKey,
  )

  const plan = result?.plan
  const workflow = result?.workflow
  const run = result?.run
  const engine = result?.engine_status || plan?.engine_status || {}
  const shotCount = Array.isArray(plan?.shots) ? plan.shots.length : 0
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  const videoNodes = nodes.filter((node) => node?.type === "seedance.video")
  const mergeNodes = nodes.filter((node) => node?.type === "video.merge")
  const fallbackUsed = Boolean(engine?.fallback_used)
  const engineUsed = result?.engine_used || plan?.engine_used || engine?.engine_used || "unknown"

  if (shotCount <= 0) {
    throw new Error("director returned no shots")
  }
  if (videoNodes.length !== shotCount) {
    throw new Error(`workflow video node count mismatch: ${videoNodes.length} nodes for ${shotCount} shots`)
  }
  if (!result?.record?.id) {
    throw new Error("workflow record was not persisted")
  }
  if (requireAdvanced && (fallbackUsed || engineUsed !== "advanced_sidecar")) {
    throw new Error(`advanced sidecar required, got engine_used=${engineUsed}, fallback_used=${fallbackUsed}`)
  }
  if (execute) {
    const jobCount = Array.isArray(run?.job_ids) ? run.job_ids.length : run?.task_id ? 1 : 0
    if (!run || jobCount <= 0) {
      throw new Error("workflow execution did not create queued video jobs")
    }
  }

  summary.director = {
    engine_used: engineUsed,
    fallback_used: fallbackUsed,
    sidecar_healthy: Boolean(engine?.sidecar_healthy),
    workflow_id: result.record.id,
    shot_count: shotCount,
    video_node_count: videoNodes.length,
    merge_node_count: mergeNodes.length,
    run_status: run?.status || null,
    batch_run_id: run?.batch_run_id || null,
    job_count: Array.isArray(run?.job_ids) ? run.job_ids.length : run?.task_id ? 1 : 0,
    merge_job_id: run?.merge_job_id || null,
  }

  console.log(JSON.stringify({ ok: true, ...summary }, null, 2))
} catch (err) {
  console.error(JSON.stringify({ ok: false, ...summary, error: err.message }, null, 2))
  process.exit(1)
}

async function getJSON(path, token) {
  const res = await fetch(`${baseURL}${path}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  return readResponse(res, path)
}

async function postJSON(path, body, token) {
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(execute ? { "Idempotency-Key": `director-smoke-${Date.now()}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return readResponse(res, path)
}

async function readResponse(res, path) {
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  if (!res.ok) {
    const code = body?.error?.code || body?.detail || res.statusText
    const message = body?.error?.message || body?.message || ""
    throw new Error(`${path} failed: ${res.status} ${code}${message ? ` - ${message}` : ""}`)
  }
  return body
}

function pickStatus(status) {
  return {
    available: Boolean(status?.available),
    entitled: Boolean(status?.entitled),
    text_provider_configured: Boolean(status?.text_provider_configured),
    image_provider_configured: Boolean(status?.image_provider_configured),
    merge_enabled: Boolean(status?.merge_enabled),
    engine_used: status?.engine_used || status?.engine_status?.engine_used || null,
    fallback_used: Boolean(status?.fallback_used || status?.engine_status?.fallback_used),
    sidecar_configured: Boolean(status?.sidecar_configured || status?.engine_status?.sidecar_configured),
    sidecar_healthy: Boolean(status?.sidecar_healthy || status?.engine_status?.sidecar_healthy),
    blocking_reason: status?.blocking_reason || null,
    reason: status?.reason || status?.engine_status?.reason || null,
  }
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "")
}
