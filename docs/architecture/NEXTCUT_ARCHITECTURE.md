# NextCut — System Architecture & Competitive Analysis

> Last updated: 2026-05-04

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        NextCut Desktop App                       │
│  ┌───────────┐  ┌──────────────────────────────────────────┐    │
│  │  Tauri 2   │  │            React 19 + Vite               │    │
│  │  (Rust)    │  │                                          │    │
│  │  ─ Window  │  │  ┌─────────┐ ┌─────────┐ ┌──────────┐  │    │
│  │  ─ FS      │  │  │  Zustand │ │  Hooks  │ │  Router  │  │    │
│  │  ─ Update  │  │  │  Stores  │ │         │ │          │  │    │
│  │  ─ Sidecar │  │  └────┬────┘ └────┬────┘ └──────────┘  │    │
│  └───────────┘  │       │            │                      │    │
│                  │  ┌────┴────────────┴───────────────────┐  │    │
│                  │  │           UI Layer (40 components)   │  │    │
│                  │  │                                      │  │    │
│                  │  │  Shell: AppShell, Sidebar, Titlebar, │  │    │
│                  │  │         StatusBar, Toast, WorkSpace  │  │    │
│                  │  │                                      │  │    │
│                  │  │  Director: StructuredPromptBuilder,  │  │    │
│                  │  │    WorkflowPresets, PipelineStepFlow, │  │    │
│                  │  │    CharacterPanel, GuidedWizard,     │  │    │
│                  │  │    AgentCards, PromptQualityMeter    │  │    │
│                  │  │                                      │  │    │
│                  │  │  Panels: DirectorInput, HomePage,    │  │    │
│                  │  │    StoryboardPanel, InspectorPanel,  │  │    │
│                  │  │    AgentLogPanel, TemplatePanel,     │  │    │
│                  │  │    LibraryPanel, ProjectsPanel,      │  │    │
│                  │  │    SettingsPanel                     │  │    │
│                  │  │                                      │  │    │
│                  │  │  Media: PreviewMonitor, Timeline,    │  │    │
│                  │  │    NodeCanvas                        │  │    │
│                  │  └──────────────┬───────────────────────┘  │    │
│                  └────────────────┼───────────────────────────┘    │
│                                   │ HTTP + WebSocket               │
└───────────────────────────────────┼───────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NextCut Sidecar (Python/FastAPI)               │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                      API Layer (8 routers)                   │ │
│  │  /director  — Plan CRUD, shot edit, reorder, prompt actions │ │
│  │  /generate  — Submit, batch, poll, job stats                │ │
│  │  /agents    — Agent config                                  │ │
│  │  /projects  — Project CRUD                                  │ │
│  │  /auth      — API key validation                            │ │
│  │  /setup     — Onboarding                                    │ │
│  │  /comfyui   — ComfyUI bridge                                │ │
│  │  /models    — Model listing                                 │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
│                          │                                        │
│  ┌──────────────────────┴──────────────────────────────────────┐ │
│  │               Director Engine (8 agents + pipeline)          │ │
│  │                                                              │ │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐  │ │
│  │  │ Screenwriter │→│ CharacterExtract │→│ StoryboardArtist│  │ │
│  │  │ (story/scene)│  │ (identity lock) │  │ (shot decomp)  │  │ │
│  │  └──────┬──────┘  └────────┬────────┘  └───────┬────────┘  │ │
│  │         │                  │                    │            │ │
│  │  ┌──────┴──────┐  ┌───────┴────────┐  ┌───────┴────────┐  │ │
│  │  │Cinematograph│  │ AudioDirector  │  │ EditingAgent   │  │ │
│  │  │(camera/lens)│  │ (music/sfx/lip)│  │ (pace/transit) │  │ │
│  │  └──────┬──────┘  └───────┬────────┘  └───────┬────────┘  │ │
│  │         │                  │                    │            │ │
│  │  ┌──────┴──────────────────┴────────────────────┴────────┐  │ │
│  │  │              PromptOptimizer                           │  │ │
│  │  │  (SVO structure, shot-script, constraints, ref-inst)  │  │ │
│  │  └───────────────────────┬────────────────────────────────┘  │ │
│  │                          │                                    │ │
│  │  ┌───────────────────────┴────────────────────────────────┐  │ │
│  │  │           ConsistencyChecker (Quality Agent)            │  │ │
│  │  │  char drift · prompt quality · camera · style · audio  │  │ │
│  │  └────────────────────────────────────────────────────────┘  │ │
│  │                                                              │ │
│  │  Tools: IdentityAnchor, ProviderScorer, CameraPresets       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                          │                                        │
│  ┌──────────────────────┴──────────────────────────────────────┐ │
│  │                    Provider Layer                             │ │
│  │  ┌─────────────────┐  ┌──────────────────┐                  │ │
│  │  │  SeedanceProvider│  │  ComfyUIProvider │                  │ │
│  │  │  ─ generate      │  │  (bridge)        │                  │ │
│  │  │  ─ sequence      │  └──────────────────┘                  │ │
│  │  │  ─ extend        │                                        │ │
│  │  │  ─ edit          │                                        │ │
│  │  │  ─ poll/cancel   │                                        │ │
│  │  └────────┬────────┘                                         │ │
│  └───────────┼──────────────────────────────────────────────────┘ │
└──────────────┼──────────────────────────────────────────────────┘
               │ HTTPS
               ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│   NextAPI Gateway         │     │   ViMax (third_party)     │
│   api.nextapi.top/v1     │     │   14 agents + 3 pipelines│
│   ─ POST /videos         │     │   ─ Novel→Movie          │
│   ─ GET  /videos/:id     │     │   ─ Script→Video         │
│   ─ DELETE /videos/:id   │     │   ─ Idea→Video           │
└──────────────────────────┘     └──────────────────────────┘
```

---

## 2. Complete Capability Inventory

### Frontend (40 files, React 19 + Tauri 2)

| Category | Component | Capability |
|----------|-----------|------------|
| **Entry** | HomePage | Dual-path UX: Quick Path (one-sentence) + Precise Director Mode |
| **Entry** | GuidedWizard | 4-step beginner wizard: Goal→Content→Style→Generate |
| **Prompt** | StructuredPromptBuilder | Subject→Action→Camera→Style→Constraints 5-field form |
| **Prompt** | PromptQualityMeter | Real-time prompt scoring (word count, SVO, physical desc, camera) |
| **Prompt** | Prompt Actions | One-click Simplify / Enhance / Translate (zh↔en) |
| **Character** | CharacterPanel | Create/edit characters, reference images, appearance lock, identity anchor |
| **Workflow** | WorkflowPresets | 3 Seedance workflows: Text→Video, Image→Video, Multimodal Story |
| **Workflow** | TemplatePanel | Template marketplace: 6 built-in + user templates, search/filter |
| **Pipeline** | PipelineStepFlow | 6-step visual flow: Script→Review→Storyboard→Prompts→Generate→Quality |
| **Pipeline** | AgentCards | 8 named AI agents with avatars, thinking bubbles, real-time progress |
| **Pipeline** | AgentLogPanel | Per-agent progress bars, quality report card, step hints |
| **Director** | DirectorInput | Freeform + Director Mode toggle, collapsible sections, batch generate |
| **Storyboard** | StoryboardPanel | Drag-reorder, quality scores per shot, inline prompt edit, quick actions |
| **Preview** | PreviewMonitor | Video playback, scrub bar, volume, auto-advance, shot counter |
| **Timeline** | TimelineEditor | Draggable playhead, zoom controls, timecode ruler, shot clips |
| **Canvas** | NodeCanvas | @xyflow/react node-based pipeline visualization |
| **Media** | LibraryPanel | Media library: filter by type, search, sort, asset grid |
| **Inspector** | InspectorPanel | Properties/Prompt/Export tabs, per-shot download, regenerate |
| **Shell** | AppShell, Sidebar, Titlebar, StatusBar, WorkspaceLayout | Full desktop chrome |
| **System** | SetupWizard, LoginPanel, Settings, Projects, ErrorBoundary, Toast | Configuration |
| **State** | director-store | 30+ state fields, characters, templates, pipeline steps, quality |
| **State** | app-store | Navigation, workspace view, zoom, connection status |
| **Hooks** | useDirector | Pipeline execution, polling, scene/shot/quality mapping |
| **Hooks** | useSidecar | HTTP + WebSocket to sidecar, health monitoring |
| **Hooks** | useKeyboardShortcuts | 15+ shortcuts: navigation, view modes, zoom, shot nav |

### Backend (40 files, Python FastAPI)

| Category | Module | Capability |
|----------|--------|------------|
| **Agent** | Screenwriter | Story development + multi-scene screenplay |
| **Agent** | CharacterExtractor | Extract characters + appearance from script |
| **Agent** | StoryboardArtist | Shot decomposition: visual/motion/first-last frame |
| **Agent** | Cinematographer | Camera angle, lens, lighting, composition |
| **Agent** | AudioDirector | Music, SFX, voiceover, lip-sync, ambient |
| **Agent** | EditingAgent | Pacing, transitions, color grade |
| **Agent** | PromptOptimizer | SVO structure, shot-script, constraints, reference instructions |
| **Agent** | ConsistencyChecker | 6-dimension quality: character drift, prompt, camera, style, narrative, audio |
| **Tool** | IdentityAnchor | Master-reference per character, consistency suffix injection |
| **Tool** | ProviderScorer | Auto-select best model for task |
| **Tool** | CameraPresets | Pre-defined camera movement library |
| **Pipeline** | DirectorPipeline | Full orchestration: 9 agents + error resilience + progress events |
| **Provider** | SeedanceProvider | generate, sequence, extend, edit, poll, cancel |
| **Provider** | ComfyUIProvider | Bridge to local ComfyUI |
| **API** | POST /director/plan | Create plan with workflow routing |
| **API** | PATCH /director/plan/:id/shot/:id | Edit shot prompt/duration/title |
| **API** | POST /director/plan/:id/reorder | Reorder shots |
| **API** | POST /director/prompt/action | Simplify / Enhance / Translate |
| **API** | POST /director/templates | Template CRUD |
| **API** | POST /generate/submit | Single shot generation |
| **API** | POST /generate/batch | Multi-shot batch generation |
| **API** | GET /generate/jobs/stats | RenderJob observability aggregate |
| **Observability** | RenderJob tracking | Template ID, resolution, ref count, retry, failure reason, elapsed_ms |

### ViMax Integration (third_party, 14 agents)

| Agent | Capability |
|-------|------------|
| ScriptPlanner | Story arc planning |
| SceneExtractor | Scene boundary detection |
| EventExtractor | Action event extraction |
| Screenwriter | Full screenplay generation |
| ScriptEnhancer | Script polish and enhancement |
| NovelCompressor | Long text → condensed script |
| GlobalInfoPlanner | Cross-scene consistency planning |
| StoryboardArtist | Visual storyboard with frames |
| CinematographyShotAgent | Camera language per shot |
| CharacterExtractor | Character profile extraction |
| CharacterPortraitsGenerator | AI portrait generation |
| CameraImageGenerator | Camera angle visualization |
| ReferenceImageSelector | Best reference image selection |
| BestImageSelector | Image quality ranking |

---

## 3. Competitive Analysis

### Feature Matrix: NextCut vs Competitors

| Feature | NextCut | Runway Gen-3 | Kling 1.6 | Pika 2.0 | Vidu 2.0 | ComfyUI | LibTV |
|---------|---------|-------------|-----------|----------|----------|---------|-------|
| **Multi-shot story** | ✅ 8 agents | ❌ single shot | ❌ single shot | ❌ single shot | ❌ single shot | ⚠️ manual | ✅ |
| **Character consistency** | ✅ identity anchor + master ref | ❌ none | ⚠️ face ref | ⚠️ face ref | ✅ consistent char | ❌ manual | ⚠️ |
| **Structured prompt** | ✅ 5-field director form | ❌ freeform only | ❌ freeform | ❌ freeform | ❌ freeform | ❌ | ❌ |
| **Prompt quality scoring** | ✅ real-time 0-100 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Storyboard view** | ✅ drag reorder + quality | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Human-in-the-loop** | ✅ edit at every step | ❌ | ❌ | ❌ | ❌ | ✅ nodes | ⚠️ |
| **Workflow templates** | ✅ 6 built-in + custom | ❌ | ❌ | ⚠️ presets | ❌ | ✅ marketplace | ⚠️ |
| **Beginner wizard** | ✅ 4-step guided | ✅ simple UI | ✅ simple UI | ✅ simple UI | ✅ simple UI | ❌ complex | ❌ |
| **Agent transparency** | ✅ 8 named agents with progress | ❌ black box | ❌ black box | ❌ black box | ❌ black box | ⚠️ nodes | ❌ |
| **Timeline editor** | ✅ draggable + zoom | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Node canvas** | ✅ visual pipeline | ❌ | ❌ | ❌ | ❌ | ✅ core | ❌ |
| **Quality scoring** | ✅ per-shot 4-axis | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Prompt actions** | ✅ simplify/enhance/translate | ❌ | ❌ | ⚠️ enhance | ❌ | ❌ | ❌ |
| **Batch generation** | ✅ sequential + parallel | ⚠️ queue | ⚠️ queue | ⚠️ queue | ⚠️ queue | ✅ | ⚠️ |
| **Video extend/edit** | ✅ API ready | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Desktop app** | ✅ Tauri 2 native | ❌ web only | ❌ web only | ❌ web only | ❌ web only | ✅ desktop | ❌ |
| **Multi-provider** | ✅ Seedance + ComfyUI | ❌ locked | ❌ locked | ❌ locked | ❌ locked | ✅ any | ⚠️ |
| **Render observability** | ✅ full job tracking | ❌ | ❌ | ❌ | ❌ | ⚠️ logs | ❌ |
| **i18n** | ✅ en + zh | ✅ multi | ✅ multi | ✅ multi | ✅ zh+en | ✅ community | ❌ |

### Our Key Advantages
1. **Only tool with 8-agent transparent pipeline** — users see exactly what each AI is doing
2. **Only tool with structured 5-field prompt builder** — proven more stable than freeform
3. **Only tool with real-time prompt quality scoring** — guides users to write better prompts
4. **Multi-shot story as first-class citizen** — competitors are all single-shot
5. **Character identity anchor system** — master reference + appearance lock + consistency suffix
6. **Human-in-the-loop at every step** — competitors are either fully auto or fully manual

### Gaps to Close

| Gap | Priority | Status | Plan |
|-----|----------|--------|------|
| Video inpainting/editing UI | HIGH | API ready, no UI | Add EditVideoPanel |
| Video extend (forward/backward) | HIGH | API ready, no UI | Add extend controls per shot |
| Multi-language lip-sync preview | MED | Backend has lip-sync | Add audio waveform to timeline |
| Batch export (timeline → single video) | HIGH | Not implemented | FFmpeg-based assembly |
| Real VLM quality scoring | HIGH | LLM-based proxy | Integrate VLM (GPT-4o vision) |
| Reference image generation | MED | ViMax has it | Connect CharacterPortraitsGenerator |
| Music/SFX library | LOW | AudioDirector plans it | Add audio asset browser |
| Collaboration (multi-user) | LOW | Not planned v1 | Future: real-time sync |
| Mobile app | LOW | Desktop only | Future: React Native |

---

## 4. Data Flow

```
User Input                    Director Engine                     Seedance 2.0
───────────                   ───────────────                     ────────────
                              
Prompt + Style + Refs         1. ProviderScorer → pick model
        │                     2. Screenwriter → story + scenes
        ▼                     3. CharacterExtractor → profiles
  POST /director/plan    ───→ 4. StoryboardArtist → shot decomposition
        │                     5. Cinematographer → camera language
        │                     6. AudioDirector → sound plan
  WebSocket progress     ←─── 7. EditingAgent → pacing/transitions
        │                     8. PromptOptimizer → SVO + constraints
        │                     9. ConsistencyChecker → quality scores
        ▼                            │
  Human Review                       ▼
  (edit scenes/shots/prompts)   DirectorPlan (JSON)
        │                            │
        ▼                            ▼
  POST /generate/batch   ───→ SeedanceProvider.generate()
        │                     POST api.nextapi.top/v1/videos
        │                            │
  WebSocket progress     ←─── poll until complete
        │                            │
        ▼                            ▼
  Video URLs → PreviewMonitor   video_url in response
  Timeline → TimelineEditor
  Export → download
```

---

## 5. Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Desktop Shell | Tauri | 2.x |
| Frontend Framework | React | 19.x |
| Build Tool | Vite | 6.x |
| State Management | Zustand | 5.x |
| Styling | Tailwind CSS | 4.x |
| Node Canvas | @xyflow/react | latest |
| Backend Framework | FastAPI | latest |
| LLM Client | OpenAI SDK (Python) | latest |
| HTTP Client | httpx | latest |
| Data Validation | Pydantic | v2 |
| Video Provider | Seedance 2.0 via NextAPI | latest |
| Desktop Build | PyInstaller (sidecar) | latest |

---

## 6. File Map (41 frontend + 40 backend = 81 source files)

### Frontend: apps/nextcut/src/
```
components/
  auth/LoginPanel.tsx            — API key login
  canvas/NodeCanvas.tsx          — @xyflow pipeline visualization
  director/
    AgentCards.tsx                — 8 agent personality cards with thinking bubbles
    CharacterPanel.tsx           — Character CRUD + reference images + identity lock
    GuidedWizard.tsx             — 4-step beginner wizard
    PipelineStepFlow.tsx         — 6-step progress indicator + ScriptReviewPanel
    PromptQualityMeter.tsx       — Real-time prompt scoring 0-100
    StructuredPromptBuilder.tsx  — Subject→Action→Camera→Style→Constraints
    WorkflowPresets.tsx          — 3 Seedance workflow cards
  onboarding/SetupWizard.tsx     — First-run setup
  panels/
    AgentLogPanel.tsx            — Agent progress + quality report
    DirectorInput.tsx            — Main director interface with all controls
    HomePage.tsx                 — Dual-path landing + wizard + templates
    InspectorPanel.tsx           — Shot properties/prompt/export
    LibraryPanel.tsx             — Media asset browser
    ProjectsPanel.tsx            — Project management
    SettingsPanel.tsx            — LLM + provider configuration
    StoryboardPanel.tsx          — Drag-reorder grid + quality + prompt actions
    TemplatePanel.tsx            — Template marketplace
  preview/PreviewMonitor.tsx     — Video player + scrub + volume
  shell/
    AppShell.tsx                 — Root layout
    ErrorBoundary.tsx            — Error catch
    Sidebar.tsx                  — 6-item navigation
    StatusBar.tsx                — Connection + pipeline status
    Titlebar.tsx                 — Window chrome + processing badge
    Toast.tsx                    — Error messages
    UpdateBanner.tsx             — App updates
    WorkspaceLayout.tsx          — View modes: storyboard/canvas/split
  timeline/TimelineEditor.tsx    — Zoomable timeline with playhead
hooks/
  useDirector.ts                 — Pipeline execution + polling + quality mapping
  useKeyboardShortcuts.ts        — 15+ keyboard shortcuts
  useSidecar.ts                  — HTTP + WebSocket connection
  useUpdater.ts                  — Tauri auto-update
lib/
  cn.ts                          — clsx + tailwind-merge
  sidecar.ts                     — API client + WebSocket manager
stores/
  app-store.ts                   — Navigation, view, zoom, connections
  director-store.ts              — 30+ fields: prompt, characters, shots, templates, quality
  setup-store.ts                 — Onboarding state
```

### Backend: apps/nextcut-sidecar/
```
app/
  api/
    director.py      — Plan CRUD, shot edit, reorder, prompt actions, templates
    generate.py      — Video generation: submit, batch, poll, stats, retry
    agents.py        — Agent configuration
    auth.py          — API key auth
    comfyui.py       — ComfyUI bridge
    models.py        — Model listing
    projects.py      — Project CRUD
    quickcreate.py   — Quick creation shortcut
    setup.py         — First-run setup
  core/
    config.py        — Settings + env vars
    events.py        — EventBus (WebSocket pub/sub)
  main.py            — FastAPI app entry

director_engine/
  agents/
    base.py                — BaseAgent with JSON retry, LLM client
    screenwriter.py        — Story + scene generation
    character_extractor.py — Character profile extraction
    storyboard_artist.py   — Shot decomposition
    cinematographer.py     — Camera language
    audio_director.py      — Audio planning
    editing_agent.py       — Edit pacing
    prompt_optimizer.py    — Seedance-optimized prompts
    consistency_checker.py — 6-axis quality scoring
  interfaces/
    models.py              — 20+ Pydantic models (Shot, Scene, Plan, Quality, Template...)
  pipelines/
    director.py            — Full 9-agent orchestration pipeline
  providers/
    base.py                — VideoProvider protocol
    seedance.py            — Seedance 2.0: generate, sequence, extend, edit
    comfyui.py             — ComfyUI bridge
  tools/
    identity_anchor.py     — Master reference + appearance lock
    provider_scorer.py     — Auto model selection
    camera_presets.py      — Camera movement library
```
