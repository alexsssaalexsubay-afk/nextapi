# NextAPI Director Mode Audit Report

## Directory Structure

- `apps/dashboard/lib/director-runtime/`
  - `adapters/text-adapter.ts`
  - `adapters/image-adapter.ts`
  - `adapters/video-adapter.ts`
  - `adapters/storage-adapter.ts`
  - `provider-bridge.ts`
  - `run-director-pipeline.ts`
  - `types.ts`
- `backend/internal/director/`
  - Reuses the existing AI Director service as the NextAPI Director planning layer.
- `backend/internal/director/vimaxruntime/`
  - Internal advanced director runner boundary. It is the only place allowed to talk to the vendored advanced-director sidecar.
  - Public product/API surfaces must keep the `NextAPI Director` brand and use `engine: "advanced"` instead of exposing upstream project names.
- `backend/internal/gateway/director.go`
  - Exposes `/v1/director/mode/run`.
- `backend/internal/gateway/director_runtime.go`
  - Internal callback surface used by the sidecar to call `generateTextWithProvider` and `generateImageWithProvider` without receiving API keys.
- `services/director_sidecar/`
  - Python sidecar that loads the vendored director/screenwriter/storyboard modules and returns a NextAPI storyboard only.
- `third_party/vimax/`
  - Vendored source with upstream `LICENSE`; treated as implementation detail, not product surface.

## Reusable Modules

- Existing AI provider runtime for text and image calls.
- Existing media asset library for generated reference images.
- Existing workflow JSON schema and Canvas editor.
- Existing workflow run path, batch service, job service, billing, throughput, moderation, and Seedance relay provider path.
- Existing Redis/job queue for high-concurrency video generation. Director planning creates workflow JSON; multi-shot video generation must run through workflow/batch jobs rather than blocking the HTTP request.

## Non-Reusable Modules

- Direct external model calls are not reusable because provider keys must never leave NextAPI.
- Any second task queue is rejected. Video generation must stay inside the existing workflow/job system.
- Vendored third-party director code must not manage API keys, video tasks, billing, storage, or status polling directly.

## Model Call Points

- Text/story/script planning: `generateTextWithProvider`.
- Shot image generation: `generateImageWithProvider`.
- Video generation: workflow run -> existing job service -> provider adapter -> Seedance relay.
- Storage: generated images are persisted through the existing media asset library/R2 path.

## Upstream Director Runtime Audit

Network status on 2026-04-27: GitHub is reachable but unstable. `git ls-remote https://github.com/HKUDS/ViMax.git HEAD` succeeded at commit `2d953d44f52b891a2d2e878aa75a8ef92ef625ed`. Full clone and default zip downloads stalled over HTTP/2, but a resumable HTTP/1.1 codeload download succeeded and was vendored under `third_party/vimax/`, including:

- `agents/screenwriter.py`
- `agents/storyboard_artist.py`
- `agents/character_extractor.py`
- `agents/character_portraits_generator.py`
- `agents/script_planner.py`
- `agents/script_enhancer.py`
- `agents/global_information_planner.py`
- `pipelines/idea2video_pipeline.py`
- `pipelines/script2video_pipeline.py`
- `tools/image_generator_*`
- `tools/video_generator_*`
- `configs/idea2video.yaml`
- `configs/script2video.yaml`

Confirmed direct-call exits:

- `pipelines/idea2video_pipeline.py` and `pipelines/script2video_pipeline.py` initialize LangChain chat models and local render backends.
- `agents/screenwriter.py`, `agents/character_extractor.py`, and `agents/storyboard_artist.py` call `chat_model.ainvoke` or `chat_model | parser`.
- `tools/image_generator_*` own image API keys and direct HTTP calls.
- `tools/video_generator_*` own video API keys, polling loops, and local output files.
- `utils/video.py`, `utils/image.py`, and pipeline working directories write local artifacts.

Integration decision: reuse the director/screenwriter/storyboard call graph, but block the direct image/video tools for production. The sidecar currently uses the text-model planning modules to produce storyboard JSON; image generation, video generation, task status, storage, and billing remain inside NextAPI-owned systems.

The sidecar planning chain should execute the reusable creative modules in this
order:

1. `screenwriter.develop_story` expands the user's idea into a coherent story.
2. `screenwriter.write_script_based_on_story` divides the story into scene scripts.
3. `script_enhancer.enhance_script` tightens continuity, sensory detail,
   dialogue, and scene transitions without changing the plot.
4. `character_extractor.extract_characters` extracts identity, static features,
   and dynamic wardrobe/prop details from the enhanced script.
5. `storyboard_artist.design_storyboard` creates per-scene shot briefs.
6. `storyboard_artist.decompose_visual_description` turns each brief into first
   frame, last frame, motion, and variation evidence.

Only text-provider calls may execute inside this chain, and every call must go
through the NextAPI runtime callback. Image generation, video generation, asset
review, task status, metering, and billing still belong to the Go backend and
existing workflow/job pipeline.

# Integration Plan

## Adapter Design

The TypeScript `director-runtime` layer mirrors director-pipeline exits without owning credentials:

- `text-adapter.ts` calls the backend Director text provider endpoint.
- `image-adapter.ts` calls the backend Director image provider endpoint.
- `video-adapter.ts` maps each `DirectorShot` to a Seedance-compatible create-video payload without mixing `first_frame_url` and `image_urls`.
- `storage-adapter.ts` uses the existing asset library.
- `provider-bridge.ts` converts `DirectorPlan` to editable workflow JSON.

## Provider Replacement

Director-mode calls terminate at these platform-owned interfaces:

- `generateTextWithProvider(providerId, messages, options)`
- `generateImageWithProvider(providerId, prompt, options)`
- `workflow/run`, which reuses the existing video job pipeline

No frontend code receives provider keys.

`engine: "advanced"` activates the internal advanced runner. The dashboard Director page sends this by default. The runner first calls `VIMAX_RUNTIME_URL` when configured. Production is fail-closed by default: if the sidecar is missing or unhealthy, the request is unavailable instead of silently degrading. Only set `VIMAX_RUNTIME_ALLOW_FALLBACK=true` in a staging/debug environment when an operator intentionally wants the provider-managed fallback path.

## Engine Observability Contract

`engine: "advanced"` is only the requested mode. It must not be treated as proof that the full advanced sidecar path actually ran.

Every Director planning response should expose the actual engine outcome to the API caller, dashboard, admin/debug surfaces, and logs:

- `requested_engine`: the user/API request, usually `advanced`.
- `engine_used`: the runtime that actually produced the storyboard.
  - `advanced_sidecar`: the Go backend called `VIMAX_RUNTIME_URL`, the sidecar returned a valid storyboard, and the storyboard was converted into NextAPI workflow JSON.
  - `advanced_fallback`: the advanced request was served by the provider-managed planner because the sidecar was not configured or was unavailable and fallback was allowed.
  - `nextapi`: the default provider-managed NextAPI planner, not the advanced sidecar.
- `fallback_used`: true only when the request asked for advanced behavior but the sidecar did not produce the storyboard.
- `fallback_enabled`: true when operator configuration allows provider-managed fallback.
- `sidecar_configured`: true when `VIMAX_RUNTIME_URL` is configured.
- `sidecar_healthy`: true only when the sidecar path is currently proven healthy for this run or by a live health check; it must not be inferred from configuration alone.
- `reason`: short machine-readable explanation for degraded mode, such as missing sidecar URL, sidecar error, fallback disabled, or provider planner unavailable.

The fallback is intentionally provider-managed, not "full advanced". It can preserve product continuity and generate a usable editable workflow, but it does not prove that the vendored screenwriter/character/storyboard call graph ran. User-facing copy, admin status, release notes, and acceptance summaries must not silently claim "advanced sidecar is live" when `engine_used` is `advanced_fallback`.

Why this matters:

- Commercial honesty: VIP access unlocks the workspace, but operators need to know whether users received the advanced sidecar experience or a compatibility planner.
- Debuggability: sidecar deployment, callback auth, provider failures, and storyboard validation errors have different owners and remediation paths.
- Safety: disabling fallback is the only way to prove production traffic fails closed when the advanced sidecar is required.
- Billing and support: planning, reference-image generation, workflow creation, and video execution have different costs and evidence trails.

The sidecar receives only callback coordinates:

- `DIRECTOR_RUNTIME_CALLBACK_URL`
- `DIRECTOR_RUNTIME_TOKEN`
- provider ids, not provider secrets

The Go backend exposes:

- `POST /v1/internal/director-runtime/text`
- `POST /v1/internal/director-runtime/image`

Both require `X-Director-Runtime-Token`.

## Workflow Conversion

`convertDirectorPlanToWorkflow(plan)` emits per-shot:

- `prompt.input`
- optional `image.input`
- `video.params`
- `seedance.video`

When merge is requested and the production merge executor is enabled, it appends `video.merge` and `output.preview`; otherwise each video connects directly to output preview. Merge is intentionally fail-closed: `VIDEO_MERGE_ENABLED=true` alone is not enough, because creating merge jobs without an executor produces a fake closed loop.

## Director Workflow State Machine

Director mode has two related but separate state tracks: planning state and execution state. UI, API responses, logs, and admin/debug panels should name both when possible.

Planning states:

| State | Meaning | Allowed next states |
|-------|---------|---------------------|
| `draft` | User is editing story, characters, style, provider/model choices, or budget. | `planning_requested`, `cancelled` |
| `planning_requested` | Request accepted; entitlement, moderation, provider config, and sidecar/fallback policy are being checked. | `planning_running`, `blocked`, `failed`, `cancelled` |
| `planning_running` | Text/storyboard planner is producing structured shots. | `workflow_ready`, `degraded_workflow_ready`, `failed` |
| `workflow_ready` | Workflow JSON is valid and produced by the requested/accepted engine. | `execution_requested`, `archived` |
| `degraded_workflow_ready` | Workflow JSON is valid but produced by a fallback or lower-capability route. | `execution_requested`, `retry_planning`, `archived` |
| `blocked` | Missing entitlement, provider, model, quota, moderation approval, or fail-closed sidecar requirement. | `draft`, `planning_requested` |
| `failed` | Planning could not produce valid workflow JSON. | `retry_planning`, `draft` |
| `cancelled` | User/operator cancelled before execution. | `draft` |

Execution states:

| State | Meaning | Allowed next states |
|-------|---------|---------------------|
| `execution_requested` | User chose to run generated workflow. | `queued`, `blocked`, `failed` |
| `queued` | Workflow/batch/job records exist and are waiting for worker capacity. | `running`, `cancelled`, `failed` |
| `running` | One or more video/image/merge jobs are in progress through the existing job system. | `partial_success`, `succeeded`, `failed`, `cancelled` |
| `partial_success` | Some shots/assets succeeded and others failed or need retry. | `running`, `succeeded`, `failed` |
| `succeeded` | Requested final outputs are ready and persisted through platform storage. | `archived` |
| `failed` | Execution stopped with no complete usable output for the requested run. | `execution_requested`, `draft` |
| `cancelled` | User/operator cancelled queued or running work. | `draft` |

State requirements:

- Do not collapse planning fallback into success copy. `degraded_workflow_ready` must be visible before execution.
- Do not create video jobs from `/v1/director/mode/run` unless the request explicitly asks for execution/queue handoff.
- Every transition that bills, reserves credits, refunds credits, or creates external provider tasks must leave an auditable record.
- Refresh/reload must recover the latest state from backend records, not local component state only.

## Director Run Recovery API

`GET /v1/director/runs` lists recent org-scoped Director runs with stable cursor
pagination. Each row includes the durable job envelope, step count, and aggregate
metering totals so Dashboard/Admin can render a history panel without scanning
local component state.

`GET /v1/director/runs/:id` returns one org-scoped Director run from the existing
NextAPI-owned audit tables:

- `director_jobs`: the durable run envelope, requested story, workflow/run ids,
  engine evidence, fallback evidence, budget snapshot, and plan snapshot.
- `director_steps`: ordered step-machine evidence for planning, workflow build,
  video submit, completion, failure, and future resume checkpoints.
- `director_metering`: per-step usage/cost records created by the existing
  provider, workflow, job, and billing paths.
- `director_checkpoints`: ordered recovery snapshots. List responses expose the
  newest checkpoint for fast resume cards; detail responses expose the full
  checkpoint sequence for Step Machine recovery and operator debugging.

These endpoints are intentionally read-only and additive. They must not create a
second task system, a second billing path, or a direct ViMax/Seedance credential
surface. They exist so Dashboard/Canvas/Admin can recover runs after refresh and
show evidence from platform records instead of local component state.

Advanced runtime requests now carry both `text_provider_id` and
`image_provider_id` to the managed sidecar request. The sidecar may ask for
text/image exits only through `/v1/internal/director-runtime/*`, keeping provider
credentials, asset persistence, task status, and metering inside NextAPI.

The response includes aggregate metering totals so UI and support tools can
show reservation/reconciliation evidence without recalculating from unrelated
job tables. Org scoping is mandatory; a run owned by another org must behave as
not found.

## NextAPI Director Intelligence Contract

The advanced runtime is useful only when its creative capabilities become
NextAPI-owned execution evidence. Every storyboard shot must therefore carry a
normalized `promptEnhancement` object before it is converted to workflow JSON:

- `continuity`: how this shot preserves timeline, scene, wardrobe, and emotion
  from the surrounding shots.
- `camera_plan`: the cinematic movement and framing instruction used by the
  video model.
- `subject_lock`: the identity, body, face, and wardrobe consistency instruction.
- `reference_policy`: how uploaded/approved assets should be referenced without
  bypassing the NextAPI asset library.
- `quality_terms`: deterministic video-quality and anti-deformation terms added
  by the backend.
- `audio_cue`: the intended audio/dialogue/sound direction when audio generation
  is enabled.

The sidecar may provide richer versions of these fields, but the Go backend must
fill any missing fields deterministically. This keeps `advanced_sidecar`,
`advanced_fallback`, and `nextapi` plans compatible with Canvas and with the
existing workflow/job/billing path. It also prevents upstream project terms,
keys, task queues, direct storage, or direct billing semantics from leaking into
public API responses.

When a run reaches `director_steps.step_key = "final_asset"`, both list and
detail responses expose a compact `final_asset` evidence object derived from
that existing step output. The object is read-only and may include the merged
asset id, video URL, storage key, merge timestamp, step status, and failure
code. This keeps Director recovery tied to NextAPI-owned jobs, metering, merge,
and media records without exposing provider keys or creating a parallel task
system.

## Historical Assets MVP

Phase 2 starts from explicit user-selected assets, not invisible global memory.

Existing reusable primitives:

- `media_assets`: uploaded/generated image, video, and audio assets.
- `characters`: reusable character records with reference image URLs.
- `workflow_versions`: Canvas/workflow version history.

Asset-library reads remain conservative: the default library list returns
images for existing Dashboard reference-image flows, while `kind=video`,
`kind=audio`, and `kind=all` let Director/Admin recover generated media rows
such as merged `final_asset` videos. Manual permanent library uploads remain
image-only until storage tiers and retention policy are explicitly expanded.

Recovery queries are indexed for the high-frequency shapes used by Dashboard,
Admin, and the Step Machine: org-scoped Director run lists, optional status
filters, final-asset step lookup, per-run metering totals, and asset-library
kind filters. `final_asset` is constrained to one row per Director job so
concurrent merge completion cannot create duplicate terminal asset evidence.

New schema anchors added in `00032_director_asset_memory.sql`:

- `director_jobs`: durable Director-level job envelope linking story, workflow, workflow run, batch run, engine evidence, selected characters, plan snapshot, and budget snapshot.
- `director_steps`: future Step Machine rows for `story_plan`, `character_plan`, `storyboard`, `image_submit`, `video_submit`, `quality_check`, `merge`, and final asset handoff.
- `director_metering`: per-step cost/usage rows for text, image, video, merge, and future evaluation calls.
- `director_checkpoints`: resumable state snapshots so long Director jobs can continue after process restarts. The backend now writes checkpoints when Director steps start, succeed, or fail, and when the Director job reaches a failed or finished state.
- `brand_kits`, `scene_assets`, `style_presets`, `prompt_memories`, `asset_embeddings`: asset memory primitives for brand, location, visual style, prompt preference, and similarity retrieval.
- `generation_feedback`, `agent_prompt_versions`, `model_performance_stats`: controlled self-improvement primitives for feedback, prompt versioning, offline evaluation, and model routing decisions.

Current vertical slice:

- The Dashboard Director page lists existing `characters`.
- Users can select historical characters before generating a storyboard.
- Selected character names, ids, and reference image URLs are sent to `/v1/director/generate-shots` and `/v1/director/mode/run`.
- The Go Director service passes those characters to both the advanced sidecar request and provider-managed fallback prompt.
- The Director page surfaces selected characters as auditable memory bindings with asset ids and reference-image counts.
- Director workflow creation can carry selected characters in `WorkflowOptions.characters`.
- `BuildWorkflowFromShots` converts selected character reference images into Canvas `image.input` nodes with `asset_id`, `image_type: "character"`, and `character_name`, so Canvas and the existing workflow/video path can inspect and run them without a second task or billing system.

Not yet claimed:

- Vector retrieval over historical assets.
- Automatic prompt evolution.
- Automatic model routing changes.
- Actual media stitching into a final merged video file.
- Final video assets are persisted as `media_assets` by the merge executor, but the customer asset-library API still exposes image assets only.

# Code Implementation

- Adapters are implemented in `apps/dashboard/lib/director-runtime/adapters/`.
- Provider bridge is implemented in `apps/dashboard/lib/director-runtime/provider-bridge.ts`.
- Workflow builder is implemented both client-side for editable previews and server-side through `director.BuildWorkflowFromShots`.
- API route is `POST /v1/director/mode/run`.
- Internal advanced runner boundary is implemented in `backend/internal/director/vimaxruntime/`.
- Sidecar app is implemented in `services/director_sidecar/`.
- Server wiring is in `backend/cmd/server/main.go` through `VIMAX_RUNTIME_URL`, `DIRECTOR_RUNTIME_CALLBACK_URL`, `DIRECTOR_RUNTIME_TOKEN`, and `DIRECTOR_SIDECAR_TOKEN`.
- systemd unit: `ops/systemd/nextapi-director-sidecar.service`.
- install script: `ops/deploy/install-director-sidecar.sh`.

# Risks

- Complexity: director orchestration can grow quickly; keep model calls at adapter boundaries.
- Cost: text/image usage is logged and reserved for future billing, while video billing remains live through the existing job system.
- Stability: merge is the riskiest path and should stay feature-gated until media stitching is proven.
- Concurrency: many users should not run long video generation inside `/director/mode/run`. That endpoint must stay bounded to planning + workflow creation; execution fans out through workflow/batch/job queues.
- Upstream licensing: if vendoring MIT upstream code, keep `LICENSE` and attribution in the internal vendor directory and release notes.

# Pricing Strategy

The commercial pricing model should stay understandable to users and configurable for operators:

- **Video cost is the source of truth.** Each generated shot still becomes a normal video job, so reservation, retry, refund, reconciliation, markup, membership tier, spend controls, and margin reporting reuse the existing billing/job/pricing pipeline.
- **Director planning is a product entitlement first.** VIP/member entitlement unlocks the advanced workspace; it should not silently drain credits before the user launches actual video generation.
- **Optional planning surcharge is an operator setting, not hard-coded.** If we later charge for heavy script/storyboard planning, add it as a visible admin pricing setting with a clear pre-submit estimate, never as hidden ledger noise.
- **Image reference generation is explicit.** If the user enables reference images, show that image generation may consume credits or membership quota. Until image billing is fully wired, keep usage logged and avoid pretending it is free forever.
- **Membership tiers should reduce markup, not bypass safety.** VIP users can get lower markup or higher throughput, but spend limits, queue caps, moderation, idempotency, and upstream retry rules stay active.
- **Operator overrides win.** Existing admin pricing supports global markup, membership tiers, and per-org override; Director should reuse those before adding any new knob.
- **User copy must be honest.** Before running a workflow, show a grouped estimate: planning status, reference-image estimate, video-shot estimate, merge status, and possible final reconciliation.

Recommended admin-configurable knobs:

- Global video markup BPS (already implemented).
- Membership tiers by lifetime top-up with per-tier markup BPS (already implemented).
- Per-org pricing override and manual membership tier (already implemented).
- Director entitlement by org (already implemented).
- Future: `director_planning_fee_cents`, `director_reference_image_fee_cents`, and monthly included planning runs. These should be added only after usage metering for text/image calls is visible in admin.

# Minimum Implementation Path

1. Configure default text and image providers in admin.
2. Grant AI Director VIP entitlement to an org.
3. Call `/v1/director/mode/run` with a story and optionally `engine: "advanced"`.
4. Open the returned workflow JSON in Canvas.
5. Run workflow to create Seedance jobs through the existing task system.
6. Deploy the advanced sidecar on the API server and set `VIMAX_RUNTIME_URL=http://127.0.0.1:<port>` when ready.
7. Enable merge only after the merge worker/service is production-ready.

## Production Acceptance

Treat Director Mode as production-ready only after these checks have executable evidence. A successful fallback run is useful, but it is not acceptance for the advanced sidecar.

- Provider readiness: default text provider is enabled, decryptable, and returns a valid JSON storyboard; default image provider is enabled only if reference images are part of the test.
- Entitlement readiness: the test org has AI Director VIP entitlement and a normal non-entitled org is blocked with `ai_director_vip_required`.
- Sidecar deployment: `services/director_sidecar` is running on the API VPS or private network; `/health` returns ok; `DIRECTOR_SIDECAR_TOKEN`, `DIRECTOR_RUNTIME_CALLBACK_URL`, and `DIRECTOR_RUNTIME_TOKEN` are set consistently.
- Callback security: sidecar -> Go calls to `/v1/internal/director-runtime/text` and `/v1/internal/director-runtime/image` require `X-Director-Runtime-Token`; Go -> sidecar includes `X-Director-Sidecar-Token` when configured.
- Advanced sidecar proof: a `POST /v1/director/mode/run` request with `engine: "advanced"` returns workflow JSON plus engine evidence showing `engine_used: "advanced_sidecar"`, `fallback_used: false`, `sidecar_configured: true`, and `sidecar_healthy: true`.
- Fallback drill: with the sidecar stopped and fallback allowed, the same request must show `engine_used: "advanced_fallback"` and `fallback_used: true`; dashboard/admin copy should show degraded mode rather than a full advanced claim.
- Fail-closed drill: with the sidecar stopped and fallback disabled, `engine: "advanced"` must fail with a planner/runtime unavailable error and must not create a misleading workflow record.
- Workflow execution: the returned workflow opens in Canvas, creates normal Seedance jobs through the existing workflow/batch/job system, and does not run video generation inside `/v1/director/mode/run`.
- Asset path: generated reference images, when enabled, are persisted through the media library/R2 path and return asset ids or stable URLs; sidecar-local files are not product outputs.
- Observability: logs or metrics include requested engine, actual engine, fallback flag, sidecar configured/healthy state, provider ids, org id, workflow id, and sanitized error reason.
- Cost visibility: UI copy distinguishes planning, reference images, video shots, merge, and final reconciliation; do not hide text/image planning costs if they later become billable.
- No silent fallback: acceptance must include a fail-closed run with fallback disabled and a degraded run with fallback enabled. The user-facing response, workflow metadata, admin surface, and logs must all agree on `engine_used` and `fallback_used`.
- No secret fallback: if a configured provider/model is unavailable, the system may suggest an operator-approved alternative, but it must not bill or launch on a different provider/model unless the user or workflow policy explicitly allowed that route.

Executable smoke proof:

```bash
NEXTAPI_SMOKE_EMAIL="user@example.com" \
NEXTAPI_SMOKE_PASSWORD="..." \
NEXTAPI_BASE_URL="https://api.nextapi.top" \
pnpm director:smoke -- --require-advanced

# Real queue handoff, may consume credits:
NEXTAPI_SMOKE_EMAIL="user@example.com" \
NEXTAPI_SMOKE_PASSWORD="..." \
NEXTAPI_BASE_URL="https://api.nextapi.top" \
pnpm director:smoke -- --execute --require-advanced
```

The smoke script fails rather than reporting success when VIP entitlement, provider configuration, sidecar health, workflow persistence, video node generation, or queue handoff is missing.

# Server Deployment Notes

- Web entry: `app.nextapi.top` dashboard.
- API/runtime entry: `api.nextapi.top` on the Aliyun HK VPS.
- Advanced sidecar should run on the same VPS or a private network host, not in the browser and not on Cloudflare Workers.
- The sidecar should expose only an internal endpoint such as `POST /v1/director/storyboard`.
- Sidecar requests must include a managed provider policy and must never contain raw upstream model keys.
- Go -> sidecar uses `X-Director-Sidecar-Token` when `DIRECTOR_SIDECAR_TOKEN` is set.
- sidecar -> Go uses `X-Director-Runtime-Token` and never receives decrypted provider keys.
- Video execution remains in the Go backend queue path: workflow -> batch/job -> provider adapter -> Seedance relay -> webhook/status -> assets/billing.

# Next Phase: Historical Assets and Agent Self-Evolution

These are intentionally next-phase capabilities, not launch blockers for Director Mode.

## Historical Asset Awareness

Director should eventually use the existing media library as memory, but only through explicit, auditable product paths:

- Reuse uploaded character references, generated reference images, prior successful clips, and user-approved brand/style assets as optional context.
- Prefer asset ids and signed/stable URLs from the NextAPI media library; do not let the sidecar read arbitrary local paths or private object storage credentials.
- Track which historical assets influenced each shot so users can remove, replace, or audit references.
- Respect org boundaries, deletion, retention, moderation, and licensing metadata.
- Keep final video generation in the workflow/job system so historical-asset reuse still inherits billing, spend controls, and provider safety.

## Agent Self-Evolution

Self-evolution should mean controlled improvement loops, not autonomous production mutation:

- Capture user edits to storyboards, rejected shots, successful final clips, retry reasons, moderation outcomes, and support tags as feedback signals.
- Convert feedback into versioned prompts, style guides, shot templates, and evaluation fixtures reviewed by operators.
- Run offline evaluations before promotion; compare sidecar output, provider-managed fallback output, cost, latency, policy failures, and user edit distance.
- Require admin-visible release notes and rollback for any promoted Director prompt/runtime version.
- Never allow the sidecar or agent loop to change provider keys, pricing, entitlement, workflow execution, billing, or safety policy.
- Keep the public contract stable: users request `engine: "advanced"`; observability reports the actual engine and version behind it.
