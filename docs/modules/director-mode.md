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
- Existing workflow run path, batch service, job service, billing, throughput, moderation, and Seedance/UpToken provider path.
- Existing Redis/job queue for high-concurrency video generation. Director planning creates workflow JSON; multi-shot video generation must run through workflow/batch jobs rather than blocking the HTTP request.

## Non-Reusable Modules

- Direct external model calls are not reusable because provider keys must never leave NextAPI.
- Any second task queue is rejected. Video generation must stay inside the existing workflow/job system.
- Vendored third-party director code must not manage API keys, video tasks, billing, storage, or status polling directly.

## Model Call Points

- Text/story/script planning: `generateTextWithProvider`.
- Shot image generation: `generateImageWithProvider`.
- Video generation: workflow run -> existing job service -> provider adapter -> UpToken/Seedance.
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

`engine: "advanced"` activates the internal advanced runner. The dashboard Director page sends this by default. The runner first calls `VIMAX_RUNTIME_URL` when configured. If no sidecar is configured, it falls back to a provider-managed planner so the web product remains usable during staged deployment. Set `VIMAX_RUNTIME_DISABLE_FALLBACK=true` in production only after the sidecar is healthy and monitored.

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

When merge is requested, it appends `video.merge` and `output.preview`; otherwise each video connects directly to output preview.

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

# Server Deployment Notes

- Web entry: `app.nextapi.top` dashboard.
- API/runtime entry: `api.nextapi.top` on the Aliyun HK VPS.
- Advanced sidecar should run on the same VPS or a private network host, not in the browser and not on Cloudflare Workers.
- The sidecar should expose only an internal endpoint such as `POST /v1/director/storyboard`.
- Sidecar requests must include a managed provider policy and must never contain raw upstream model keys.
- Go -> sidecar uses `X-Director-Sidecar-Token` when `DIRECTOR_SIDECAR_TOKEN` is set.
- sidecar -> Go uses `X-Director-Runtime-Token` and never receives decrypted provider keys.
- Video execution remains in the Go backend queue path: workflow -> batch/job -> provider adapter -> UpToken/Seedance -> webhook/status -> assets/billing.
