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
- Video merge stays fail-closed by default. It requires both
  `VIDEO_MERGE_ENABLED=true` and a proven executor flag
  `VIDEO_MERGE_EXECUTOR_ENABLED=true`; otherwise Director must not advertise
  automatic final video stitching.

## Workspace UX

- Director is a creation workbench, not a report page. The canvas and editable
  shot/workflow cards get the first viewport.
- Top chrome must stay compact: no large hero copy, no persistent explanation
  bands, and no dashboard summary blocks above the working surface.
- Director uses the dashboard immersive shell: the global navigation rail and
  search bar are hidden so only Director-local tools compete with the canvas.
- Prompt, model, and generation parameters belong with the active card or the
  composer below the canvas, so users can keep context while editing.
- Runtime readiness, engine evidence, memory bindings, and closed-loop proof are
  still visible, but they should not occupy a permanent right column before the
  user has workspace context.

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
