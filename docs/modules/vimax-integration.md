# ViMax Integration Audit Report

## Directory Structure

- `apps/dashboard/lib/vimax-runtime/`
  - `adapters/text-adapter.ts`
  - `adapters/image-adapter.ts`
  - `adapters/video-adapter.ts`
  - `adapters/storage-adapter.ts`
  - `provider-bridge.ts`
  - `run-vimax-pipeline.ts`
  - `types.ts`
- `backend/internal/director/`
  - Reuses the existing AI Director service as the ViMax-compatible planning layer.
- `backend/internal/gateway/director.go`
  - Exposes `/v1/director/vimax/run`.

## Reusable Modules

- Existing AI provider runtime for text and image calls.
- Existing media asset library for generated reference images.
- Existing workflow JSON schema and Canvas editor.
- Existing workflow run path, batch service, job service, billing, throughput, moderation, and Seedance/UpToken provider path.

## Non-Reusable Modules

- Direct ViMax external model calls are not reusable because provider keys must never leave NextAPI.
- Any second task queue is rejected. Video generation must stay inside the existing workflow/job system.
- Automatic media merge remains behind the existing merge node/service boundary until it is production-ready.

## Model Call Points

- Text/story/script planning: `generateTextWithProvider`.
- Shot image generation: `generateImageWithProvider`.
- Video generation: workflow run -> existing job service -> provider adapter -> UpToken/Seedance.
- Storage: generated images are persisted through the existing media asset library/R2 path.

# Integration Plan

## Adapter Design

The TypeScript `vimax-runtime` layer mirrors ViMax's pipeline exits without owning credentials:

- `text-adapter.ts` calls the backend Director text provider endpoint.
- `image-adapter.ts` calls the backend Director image provider endpoint.
- `video-adapter.ts` maps each `VimaxShot` to a Seedance-compatible create-video payload without mixing `first_frame_url` and `image_urls`.
- `storage-adapter.ts` uses the existing asset library.
- `provider-bridge.ts` converts `VimaxPlan` to editable workflow JSON.

## Provider Replacement

ViMax-compatible calls terminate at these platform-owned interfaces:

- `generateTextWithProvider(providerId, messages, options)`
- `generateImageWithProvider(providerId, prompt, options)`
- `workflow/run`, which reuses the existing video job pipeline

No frontend code receives provider keys.

## Workflow Conversion

`convertVimaxPlanToWorkflow(plan)` emits per-shot:

- `prompt.input`
- optional `image.input`
- `video.params`
- `seedance.video`

When merge is requested, it appends `video.merge` and `output.preview`; otherwise each video connects directly to output preview.

# Code Implementation

- Adapters are implemented in `apps/dashboard/lib/vimax-runtime/adapters/`.
- Provider bridge is implemented in `apps/dashboard/lib/vimax-runtime/provider-bridge.ts`.
- Workflow builder is implemented both client-side for editable previews and server-side through `director.BuildWorkflowFromShots`.
- API route is `POST /v1/director/vimax/run`.

# Risks

- Complexity: ViMax orchestration can grow quickly; keep model calls at adapter boundaries.
- Cost: text/image usage is logged and reserved for future billing, while video billing remains live through the existing job system.
- Stability: merge is the riskiest path and should stay feature-gated until media stitching is proven.

# Minimum Implementation Path

1. Configure default text and image providers in admin.
2. Grant AI Director VIP entitlement to an org.
3. Call `/v1/director/vimax/run` with a story.
4. Open the returned workflow JSON in Canvas.
5. Run workflow to create Seedance jobs through the existing task system.
6. Enable merge only after the merge worker/service is production-ready.
