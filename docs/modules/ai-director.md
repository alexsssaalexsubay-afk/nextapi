# AI Director

## Goal

AI Director turns a customer story into editable storyboard shots, then into the
existing Canvas/Workflow graph. It is an orchestration layer above current
providers: video generation must still flow through the existing job, video,
billing, throughput, moderation, and webhook paths.

## Boundaries

- Text and image models are configured as AI providers by operators.
- Provider API keys are encrypted at rest and are never returned to frontend
  clients.
- Storyboard generation may call text providers.
- Optional storyboard image generation may call image providers and save results
  into the asset library.
- Video generation still uses the existing `job.Service.Create` path. AI
  Director must not call Seedance relay providers directly.
- Canvas remains the editable workflow surface.
- AI Director is a VIP-gated workspace feature. VIP access only unlocks the
  surface; text, image, and video calls still consume the normal credits.
- If text/image providers or key encryption are not configured, the dashboard
  must show a configuration/status message instead of looking broken.
- Model choice is staged through visible catalog cards first. Non-Seedance
  providers can appear as "coming soon" until operators configure live
  providers in admin.
- Video merge stays disabled by default. The merge node records intent for
  future support, but v1 does not promise automatic final video stitching.

## Rollout

The feature is additive:

1. Provider configuration and encrypted key storage.
2. OpenAI-compatible text/image adapter runtime.
3. Text storyboard generation with strict JSON validation and one repair pass.
4. Dashboard `/director` page for story input, shot editing, workflow creation,
   and Canvas handoff.
5. Multi-shot workflow execution through existing batch/job services.
6. Optional image generation and asset persistence.
7. VIP/configuration status surfaces in dashboard and admin.
8. Canvas image inputs can use local uploads, asset library picks, and image
   prompts.
9. Merge node support remains staged until media merge is proven reliable.

## Verification

Run backend tests plus dashboard/admin typechecks after changes. Manual smoke
test: configure a text provider, generate three shots, save a workflow, open it
in Canvas, and run it while confirming `/v1/videos` behavior is unchanged.
