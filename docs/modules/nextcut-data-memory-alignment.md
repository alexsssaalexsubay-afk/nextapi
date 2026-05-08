# NextCut Data, Asset, Prompt, and Memory Alignment

## Purpose

Make NextCut's desktop product, sidecar, main API/docs, vendored ViMax pipeline, and future product memory use the same field contract instead of drifting into separate demos.

## Current Verdict

Not fully aligned yet.

The main NextAPI surface already defines the production contracts for `/v1/videos`, `/me/library/assets`, Seedance relay assets, Director run checkpoints, prompt memories, asset embeddings, and agent prompt versions. NextCut desktop has started to mirror the important video fields (`image_urls`, `video_urls`, `audio_urls`, `first_frame_desc`, `last_frame_desc`, runtime prompts, model presets), but several product surfaces still stop at local/demo state.

| Area | Current source of truth | NextCut desktop status | Gap |
|---|---|---|---|
| Video generation request fields | `backend/api/openapi.yaml` `VideoInput` | Sidecar `/generate/*` and `apps/nextcut/src/lib/generation.ts` include refs and preflight | Desktop uses sidecar contract, not canonical nested `/v1/videos` shape yet |
| Persistent asset library | `backend/internal/domain/media_asset.go`, `/me/library/assets` | `LibraryPanel` renders generated shots and demo assets | Not listing/uploading main-site library assets yet |
| Seedance usable asset URLs | `docs/modules/seedance-relay-webhook-assets.md` | Preflight blocks local/blob URLs | No desktop flow to promote generated images into R2/Seedance asset library |
| Character asset chain | `apps/nextcut-sidecar/app/api/agents.py`, ViMax portraits | API can generate turnaround/expression/outfit/pose packs | UI must persist packs, show versions, and inject them into every shot |
| Storyboard/keyframe chain | Sidecar `/agents/generate-storyboard-assets` | API can produce storyboard, first frame, last frame | UI must write returned URLs back to `shot.generationParams` and timeline thumbnails |
| Prompt visibility | Sidecar `/config/prompts`, `~/.nextcut/runtime-prompts.json` | Settings page shows and edits prompts | Backend `agent_prompt_versions` is not wired, so prompt history is local-only |
| Model/provider config | Sidecar `/config/llm-presets`, Settings page | 30+ presets are visible, keys stay local | Needs backend encrypted provider config for team/shared mode |
| Memory/knowledge | Backend `prompt_memories`, `asset_embeddings`; ViMax local FAISS/cache; llmwiki external tool | Director has local prompt DB and hard-coded knowledge sources | No product memory UI/API yet; current memory is fragmented |

## Invariants

- Main API docs and OpenAPI are canonical for customer-facing request/response fields.
- Desktop may use sidecar convenience routes, but every generated request must be mappable to the canonical `/v1/videos` `VideoInput`.
- Provider integrations must use an open envelope: keep normalized NextCut fields for UI linkage, but also expose sanitized upstream request/submit/final payloads and normalized artifacts so future hosted APIs, RunningHub-style workflows, ComfyUI, and local models do not require hard-coded response schemas.
- Generated images, character refs, storyboard keyframes, first frames, last frames, and uploaded refs are assets, not loose URLs.
- Prompt text must be versioned and inspectable. Runtime-only overrides are acceptable for single-user desktop, but team mode needs `agent_prompt_versions`.
- Secrets must not be persisted in frontend localStorage. Keys are local-only in desktop or encrypted in backend provider config.
- Memory is not a replacement for asset classification. NextCut needs both: structured asset registry for files and semantic memory for reusable knowledge/decisions.

## Public Surface To Align

### Main API and Docs

- `backend/api/openapi.yaml`
  - `VideoInput.prompt`
  - `image_url`
  - `image_urls` max 9
  - `video_urls` max 3
  - `audio_urls` max 3
  - `first_frame_url`
  - `last_frame_url`
  - `references[]`
  - `duration_seconds` 4-15
  - `resolution`, `aspect_ratio`, `fps`, `generate_audio`, `camera_fixed`, `seed`
- `docs-site/docs/api-reference.md`
  - Human summary, but explicitly says OpenAPI is canonical.
- `docs-site/docs/consistency-guide.md`
  - Character reference, outfit reference, scene reference, fixed visual traits, and `continuity_group` are the documented consistency levers.
- `docs-site/docs/comfyui-guide.md`
  - ComfyUI nodes use Auth -> Asset Resolver -> Generate -> Poll -> Download.

### Backend Tables

- `media_assets`
  - Persistent reusable uploads, currently image-first for manual uploads, with generated video/audio rows possible through job flows.
- `director_jobs`, `director_steps`, `director_checkpoints`
  - Durable Director execution, step output snapshots, and resumable checkpoints.
- `prompt_memories`
  - Product memory table for learned prompt/user/project facts.
- `asset_embeddings`
  - Asset semantic retrieval hook.
- `agent_prompt_versions`
  - Durable prompt versioning for agents.
- `style_presets`, `scene_assets`, `brand_kits`
  - Reusable production constraints.

### NextCut Desktop and Sidecar

- `apps/nextcut/src/stores/director-store.ts`
  - `ReferenceAsset`
  - `CharacterProfile`
  - `ShotGenerationParams`
  - `Shot.generationParams`
  - `PipelineConfig`
  - local `nextcut-director` persistence strips API keys and currently persists preferences/templates, not full production assets.
- `apps/nextcut/src/lib/generation.ts`
  - Builds sidecar generation payload from `shot.generationParams`.
  - Includes `image_urls`, `video_urls`, `audio_urls`.
  - Adds thumbnail/video as refs when present.
- `apps/nextcut-sidecar/app/api/generate.py`
  - `/generate/preflight`, `/generate/submit`, `/generate/batch`.
  - Blocks missing `image_urls` for image-to-video and local-only URLs.
- `apps/nextcut-sidecar/app/api/agents.py`
  - `/agents/generate-character-assets`.
  - `/agents/generate-storyboard-assets`.
  - Returns generated image URLs and prompts but does not persist them to main asset library.
- `apps/nextcut-sidecar/app/api/config.py`
  - `/config/llm-presets`, `/config/prompts`, `/config/test-llm`.
- `apps/nextcut-sidecar/director_engine/tools/runtime_prompts.py`
  - Local prompt overrides stored in `NEXTCUT_RUNTIME_PROMPTS_FILE` or `~/.nextcut/runtime-prompts.json`.
- `apps/nextcut-sidecar/director_engine/tools/prompt_massive_dict.db`
  - Local prompt/tag knowledge DB, not project memory.

## Where Things Are Stored Today

| Thing | Current storage | Product risk |
|---|---|---|
| Settings model choice | `nextcut-director` localStorage, API keys stripped | Good for desktop; not team-shared |
| Runtime agent prompts | `~/.nextcut/runtime-prompts.json` | User can edit, but no version history/evals |
| Prompt massive dictionary | SQLite DB in sidecar source tree | Useful knowledge, but not user/project memory |
| Template catalog thumbnails | `apps/nextcut/public/templates/*.jpg` | Static UI assets only |
| Guide/tutorial images | `apps/nextcut/public/tutorial/*` and `docs/assets/*` | Static documentation assets |
| Library UI assets | Derived from current shots or demo fallback | Not canonical asset library |
| Sidecar generation jobs | In-memory `_generation_jobs` dict | Lost on restart; okay for MVP, not production history |
| Main API library assets | R2 + `media_assets` | Canonical backend, not consumed by desktop yet |
| Backend prompt memories | `prompt_memories` | Schema exists, product not wired |
| Backend asset embeddings | `asset_embeddings` | Schema exists, retrieval not wired |
| ViMax character portraits | Pipeline working dir JSON/images | Good pipeline cache, not NextCut product inventory |
| ViMax novel knowledge | Local FAISS/cache under working dir | Per-run/project retrieval, not shared product memory |

## ViMax Lessons We Should Productize

Vendored ViMax already has the right creative chain ideas:

- Character portrait generation creates front/side/back views and stores a portrait registry in the working directory.
- Reference image selector chooses relevant character/environment refs per frame.
- Script/video pipelines reuse previous frames as reference images for continuity.
- Novel pipeline constructs a local FAISS knowledge base from source text.

Those are not enough by themselves for NextCut because they are file-based pipeline caches. NextCut should turn them into product concepts:

- Character Asset Pack
- Scene/Location Asset Pack
- Storyboard Keyframe Pack
- Shot Reference Stack
- Project Knowledge Base
- Prompt Version Pack

## External Product References

Checked on GitHub on 2026-05-08:

- [HKUDS/ViMax](https://github.com/HKUDS/ViMax): agentic video generation with script, storyboard, reference management, and consistency checking.
- [Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates): workflow templates are treated as first-class reusable graph products, not just examples.
- [mem0ai/mem0](https://github.com/mem0ai/mem0): positions memory as a universal long-term memory layer for agents.
- [run-llama/llama_index](https://github.com/run-llama/llama_index): document/agent data framework for retrieval and knowledge-grounded workflows.

Design implication: NextCut should not copy a node UI blindly. It should adopt the product principle: graph templates, assets, prompts, runs, memory, and feedback are all durable objects with provenance.

## Target Product Model

Use three separate registries, not one overloaded library.

## Open Provider Envelope

Generation jobs should always expose two layers:

1. **Normalized fields** for product behavior:
   - `shot_id`
   - `status`
   - `provider`
   - `provider_model`
   - `provider_job_id`
   - `video_url`
   - `failure_reason`
   - `artifacts[]`

2. **Sanitized upstream envelope** for provider-native inspection:
   - `upstream.request`
   - `upstream.submit`
   - `upstream.final`
   - `provider_options`

The envelope is intentionally provider-agnostic. New adapters can return arbitrary nested fields from OpenAI-compatible APIs, ComfyUI, RunningHub-style graph runners, local model servers, or future video/image/audio APIs. NextCut should not flatten those fields away. Instead it should:

- redact secret-like keys such as `api_key`, `authorization`, `token`, `secret`, and `password`;
- cap very large nested payloads before returning them to the UI;
- extract common media URLs into `artifacts[]` with `type`, `url`, `source`, and `metadata`;
- keep raw provider fields available in logs/Inspector/debug panels for troubleshooting;
- promote selected artifacts into the durable Asset Registry when the user saves or the workflow completes.

### Adapter Registry

Sidecar generation must select adapters through `create_video_provider(config)`, not by directly constructing one provider inside the run loop.

Supported adapter IDs:

| Provider ID | Purpose | Default behavior |
|---|---|---|
| `seedance` | Seedance video generation through NextAPI-style `/v1/videos` | Uses canonical video fields and Seedance limits |
| `nextapi` | NextAPI video relay alias | Same adapter as Seedance, but separate product-facing provider ID |
| `comfyui` | Local ComfyUI workflow execution | Submits workflow JSON to `/prompt`, polls `/history/{job_id}` |
| `runninghub` | RunningHub cloud workflow / AI App | Defaults to `/task/openapi/create` or `/task/openapi/ai-app/run`, polls `/task/openapi/outputs`; all paths remain overrideable |
| `local-openai-compatible` | Ollama, LM Studio, or local OpenAI-compatible servers | Defaults to synchronous `/chat/completions`, can switch endpoint to `/images/generations` |
| `custom-http` | Arbitrary HTTP provider | Uses `provider_options` for endpoint, method, body, headers, status path, and cancel path |

Provider-specific knobs belong in `provider_options`, not in the global generation schema. The global schema should only hold fields that every creative generation provider can reasonably understand: prompt, refs, duration, aspect ratio, model, provider, and the normalized output envelope.

### 1. Asset Registry

Stores physical/generated media and reusable references.

Core types:

- `image`
- `video`
- `audio`
- `storyboard_keyframe`
- `first_frame`
- `last_frame`
- `character_turnaround`
- `character_expression`
- `character_outfit`
- `character_pose`
- `scene_reference`
- `product_reference`
- `style_reference`

Required fields:

```ts
type NextCutAsset = {
  id: string;
  orgId?: string;
  projectId?: string;
  kind: "image" | "video" | "audio";
  semanticType:
    | "source_upload"
    | "storyboard_keyframe"
    | "first_frame"
    | "last_frame"
    | "character_turnaround"
    | "character_expression"
    | "character_outfit"
    | "character_pose"
    | "scene_reference"
    | "product_reference"
    | "style_reference"
    | "generated_output";
  filename: string;
  contentType: string;
  sizeBytes: number;
  previewUrl: string;
  generationUrl: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  aspectRatio?: string;
  provider?: string;
  model?: string;
  promptId?: string;
  generationJobId?: string;
  sourceShotId?: string;
  sourceCharacterId?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
};
```

### 2. Prompt Registry

Stores prompt packs, agent system prompts, image prompt templates, video prompt templates, and user overrides.

Core fields:

```ts
type PromptVersion = {
  id: string;
  scope: "agent" | "image" | "video" | "preflight" | "template" | "style";
  ownerKey: string;
  version: number;
  status: "draft" | "active" | "archived";
  body: string;
  variables: string[];
  targetProviders: string[];
  evalSummary: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};
```

Runtime desktop may keep `~/.nextcut/runtime-prompts.json`, but the durable product path should sync to `agent_prompt_versions`.

### 3. Memory Registry

Stores semantic, non-file knowledge.

Do not put every asset into memory. Memory should contain reusable decisions and knowledge:

- project story bible
- character identity rules
- brand voice and banned terms
- successful prompt patterns
- recurring user preferences
- provider failure lessons
- feedback from rejected/accepted outputs
- source document summaries with citations

Core fields:

```ts
type NextCutMemory = {
  id: string;
  orgId: string;
  projectId?: string;
  memoryType:
    | "project_bible"
    | "character_identity"
    | "style_rule"
    | "prompt_pattern"
    | "provider_lesson"
    | "user_preference"
    | "source_document";
  sourceType: "manual" | "director_job" | "asset" | "feedback" | "document" | "import";
  sourceId?: string;
  content: string;
  summary: string;
  confidence: number;
  embeddingRef?: string;
  citations: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
};
```

## Required Production Chains

### Character Asset Chain

```text
Character text anchor
  -> generate turnaround / expressions / outfits / poses
  -> persist assets
  -> register Identity Lock
  -> inject selected reference assets into every matching shot
  -> preflight blocks if required refs are missing
```

The UI must show this as a character pack, not loose thumbnails. Each pack needs version, lock strength, selected defaults, and usage count.

### Storyboard Image Chain

```text
Shot decomposition
  -> storyboard keyframe prompt
  -> first frame prompt
  -> last frame prompt
  -> image generation
  -> persist assets
  -> write urls into shot.thumbnail_url and shot.generationParams.image_urls
```

The shot card must auto-fit images with a fixed aspect-ratio frame, line-clamped prompt preview, and a detail drawer for full prompt/source.

### Reference Passing Chain

```text
Reference Stack
  -> shot.generationParams.image_urls/video_urls/audio_urls
  -> buildGeneratePayload()
  -> /generate/preflight
  -> /generate/submit or /generate/batch
  -> Seedance/NextAPI payload
```

No video generation button should bypass preflight.

### Memory Learning Chain

```text
Run output + user feedback + accepted edits
  -> summarize lesson
  -> write prompt_memories
  -> optional embedding
  -> next Director run retrieves relevant memories
  -> prompt cites applied memory snippets
```

This should be opt-in/visible. Users must be able to view, disable, edit, or delete memories.

## UI Plan

Add a first-class "Knowledge & Assets" product surface rather than hiding everything in the current Library page.

Tabs:

- Assets: physical/generated media, filters by semantic type and provider status.
- Characters: character packs with three-view, expression, outfit, and pose assets.
- Storyboards: keyframes, first frames, last frames, shot usage.
- Prompts: current agent prompts, image prompts, video prompts, version history.
- Memory: project/team knowledge, learned rules, source docs, provider lessons.

Card rules:

- Every card has a fixed thumbnail frame (`aspect-video`, `aspect-square`, or provider aspect).
- Long text uses `line-clamp` and opens full text in drawer.
- Generated outputs show source prompt, provider, model, job id, status, and usage.
- Reference assets expose "Use as character / first frame / last frame / scene / style" actions.
- No raw URL-only cards in the main grid.

Inspector rules:

- Use sections: Preview, Usage, Prompt, Generation, Lineage, Metadata, Actions.
- Do not show every JSON field at once.
- Raw JSON is a collapsible advanced section.

## Implementation Order

1. Desktop field alignment document and contracts.
2. Main-site library client in sidecar or desktop:
   - list `/me/library/assets?kind=all`
   - upload image to `/me/library/assets`
   - expose `generation_url` to reference stacks.
3. Persist generated character/storyboard images:
   - use backend library when authenticated;
   - use local app data cache when offline;
   - always create a `NextCutAsset` metadata record.
4. Wire generated assets back into `shot.generationParams`.
5. Add product UI tabs for Characters, Storyboards, Prompts, Memory.
6. Replace local prompt JSON with versioned backend prompt registry when signed in.
7. Add memory retrieval:
   - project memory only first;
   - cite applied memory in Director output;
   - allow disable/delete.

## Out Of Scope

- Do not make llmwiki the product runtime memory. It can be a developer/operator knowledge tool, but NextCut needs its own memory model tied to projects, assets, prompts, and feedback.
- Do not treat every generated file as memory. Files belong in the asset registry; memories are semantic decisions and lessons.
- Do not expose provider API keys to frontend pages.
- Do not copy RunningHub/ComfyUI visuals. Borrow graph-template and production-chain ideas while keeping NextCut's own SaaS/video-creation language.
