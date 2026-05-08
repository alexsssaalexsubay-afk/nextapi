# NextCut Handoff 2026-05

## Purpose
This document is for engineering handoff and fault isolation.
It maps the current NextCut desktop product structure, runtime chain, state ownership, sidecar dependencies, and the places where the workflow is already connected versus still UI-only.

## Product Scope
NextCut is an AI video creation desktop app built around one main chain:

1. user intent input
2. director planning
3. storyboard and shot contracts
4. timeline / canvas editing
5. preview, inspection, and downstream generation

The target product shape is not a generic admin dashboard.
It is a creator-first SaaS workbench with four first-class abilities:

1. `storyboard`
2. `reference`
3. `camera motion`
4. `prompt decomposition`

## Runtime Topology

### Frontend
- `apps/nextcut`
- Stack: React + TypeScript + Tailwind + Zustand
- Main shell composition lives in [WorkspaceLayout.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/shell/WorkspaceLayout.tsx)

### Sidecar
- `apps/nextcut-sidecar`
- Real planning endpoint:
  - `/director/plan`
  - `/director/plan/{id}`
- Frontend transport:
  - [sidecar.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/lib/sidecar.ts)

### ViMax / legacy reference
- The current UI mirrors the ViMax-shaped chain and uses it as a planning mental model.
- Reference source note:
  - `third_party/vimax/nextapi_director.py`

## State Ownership

### App shell state
- Store: [app-store.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/stores/app-store.ts)
- Key fields:
  - `sidebarPage`
  - `workspaceView`
  - `selectedShotId`
  - `timelineZoom`
  - `previewFullscreen`
  - `inspectorCollapsed`

This store decides which page is visible and which shot is currently active across storyboard, preview, timeline, and inspector.

### Director pipeline state
- Store: [director-store.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/stores/director-store.ts)
- Key fields:
  - `prompt`
  - `structuredPrompt`
  - `useStructuredPrompt`
  - `references`
  - `selectedWorkflow`
  - `style`
  - `numShots`
  - `duration`
  - `aspectRatio`
  - `pipelineStep`
  - `shots`
  - `sceneOutlines`
  - `characters`
  - `shotGenerationCards`
  - `promptReview`
  - `productionBible`
  - `overallQuality`

### Important semantic contracts
- `Shot.prompt`
  - main generation prompt for the shot
- `Shot.generationParams.shot_script`
  - human-readable action decomposition used as motion contract
- `Shot.camera`
  - camera / lens / movement contract
- `Shot.generationParams.reference_instructions`
  - reference execution rules
- `ShotGenerationCard`
  - prompt decomposition review artifact for each shot

## Main UI Entry Points

### Home
- File: [HomePage.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/HomePage.tsx)
- Purpose:
  - overview
  - quick entry
  - guided wizard entry

### AI Director
- File: [DirectorInput.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/DirectorInput.tsx)
- Current role:
  - primary creation entry
  - owns planning trigger
  - writes downstream storyboard/edit state

### Storyboard
- File: [StoryboardPanel.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/StoryboardPanel.tsx)
- Current role:
  - shot grid
  - drag reorder
  - prompt edit
  - regenerate trigger

### Canvas / workflow view
- File: [NodeCanvas.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/canvas/NodeCanvas.tsx)
- Current role:
  - visual workflow view
  - not yet fully upgraded to grouped, collapsible, preview-rich canvas behavior

### Timeline
- File: [TimelineEditor.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/timeline/TimelineEditor.tsx)
- Current role:
  - shot-based timeline
  - reads `selectedShotId`
  - should remain linked with storyboard / preview / inspector

### Inspector and preview
- Files:
  - [InspectorPanel.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/InspectorPanel.tsx)
  - [PreviewMonitor.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/preview/PreviewMonitor.tsx)
- Current role:
  - selected-shot details
  - selected-shot preview
  - quality / findings / generation actions

## Current Workflow Chain

### Happy path
1. user enters prompt in `DirectorInput`
2. optional structured prompt is compiled into the effective prompt
3. references are attached as `ReferenceAsset[]`
4. `runDirectorPlan()` triggers
5. frontend builds fallback plan locally using `buildLocalPlan()`
6. frontend checks sidecar health
7. frontend POSTs `/director/plan`
8. frontend polls `/director/plan/{id}`
9. response is merged with fallback via `mergeSidecarPlan()`
10. resulting `shots/scenes/characters/cards/bible/review` are written into `director-store`
11. user opens storyboard / edit workspace

### Fallback path
If sidecar fails or returns empty plan:
- UI still receives a local planning result
- `planSource` is marked as local
- storyboard and inspector continue to work on local plan data

## First-Class Abilities Status

### Storyboard
- Connected:
  - `shots`
  - `selectedShotId`
  - reorder
  - prompt edit
- Still weak:
  - execution contract visibility
  - tighter connection to timeline and canvas

### Reference
- Connected:
  - store shape exists
  - passed to sidecar planning
- Recently improved:
  - UI is being shifted from placeholder tiles to actual reference stack input
- Still weak:
  - no direct media-library drag-in
  - no priority weighting UI beyond basic primary/secondary behavior

### Camera motion
- Connected:
  - motion intensity affects local plan camera presets
  - prompt dictionary already provides movement vocabulary
- Still weak:
  - no dedicated motion workbench in canvas/timeline
  - no visual trajectory editor yet

### Prompt decomposition
- Connected:
  - `structuredPrompt`
  - `ShotGenerationCard`
  - prompt review artifacts
- Recently improved:
  - structured prompt fields now include `scene`, `motion`, `lighting`, `audio`
- Still weak:
  - quality lint and grammar correction need to be wired in as live feedback

## What Is Already in Place

### Guided wizard
- File: [GuidedWizard.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/director/GuidedWizard.tsx)
- Status:
  - basic novice flow already exists
  - not yet fully elevated to the dominant “beginner mode”

### Prompt quality meter
- File: [PromptQualityMeter.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/director/PromptQualityMeter.tsx)
- Status:
  - existing component
  - should be reconnected into the new structured prompt surface

### Edit video panel
- File: [EditVideoPanel.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/EditVideoPanel.tsx)
- Status:
  - starter panel exists
  - still needs stronger timeline integration and richer post tools

## Known Disconnects

### UI-level disconnects
1. some pages still use older dense card layouts with insufficient clamp / spacing normalization
2. sidebar does not yet persist collapsed state
3. keyboard shortcut system is not yet centralized
4. canvas remains visually separate from timeline semantics

### Data-level disconnects
1. references exist in store and planning API, but media-library-to-reference pipeline is still partial
2. structured prompt exists, but not all pages treat it as the canonical creative contract
3. shot generation cards are generated, but storyboard and canvas do not yet surface them everywhere they should

### Flow-level disconnects
1. pipeline auto-scroll and auto-advance guidance are incomplete
2. batch generation and A/B result comparison are not wired
3. workflow version history is not implemented
4. offline queue and sync are not implemented

## Where To Audit First

### If prompt changes do not affect results
- Check:
  - `DirectorInput.runDirectorPlan()`
  - `compileStructuredIntent()`
  - `useStructuredPrompt`
  - `enrichPromptWithKnowledge()`

### If storyboard shows stale data
- Check:
  - `applyPlan()`
  - `setShots()`
  - `setShotGenerationCards()`
  - `selectedShotId`

### If preview and timeline select different shots
- Check:
  - `useAppStore().selectedShotId`
  - [TimelineEditor.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/timeline/TimelineEditor.tsx)
  - [PreviewMonitor.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/preview/PreviewMonitor.tsx)
  - [InspectorPanel.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/InspectorPanel.tsx)

### If sidecar planning fails too often
- Check:
  - sidecar health endpoint
  - request payload `prompt/style/references/pipeline`
  - `mergeSidecarPlan()` fallback assumptions

## Recommended Next Slices

### Slice A: layout and Chinese readability normalization
- apply consistent `line-clamp`
- normalize card heights and shadows
- add adaptive grid rules to all dense panels

### Slice B: sidebar and navigation ergonomics
- persist sidebar collapsed state
- add icon + text labels consistently
- expose workspace view switching with shortcuts

### Slice C: first-class creative workbench
- promote storyboard/reference/camera motion/prompt decomposition above legacy form controls
- make advanced mode optional instead of always-on

### Slice D: canvas and timeline coupling
- shared highlight between node and shot
- node hover preview
- canvas auto-layout, grouping, collapsible clusters

### Slice E: observability and versioning
- richer `AgentLogPanel`
- workflow version snapshots
- diff and rollback

## Files Most Important For Another AI To Read
- [director-store.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/stores/director-store.ts)
- [app-store.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/stores/app-store.ts)
- [DirectorInput.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/DirectorInput.tsx)
- [StoryboardPanel.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/panels/StoryboardPanel.tsx)
- [TimelineEditor.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/timeline/TimelineEditor.tsx)
- [NodeCanvas.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/canvas/NodeCanvas.tsx)
- [WorkspaceLayout.tsx](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/components/shell/WorkspaceLayout.tsx)
- [sidecar.ts](/Users/sunwuyuan/Desktop/01-项目/nextapi-v3/apps/nextcut/src/lib/sidecar.ts)

## Current Intent
The current refactor direction is:

1. make the UI breathable and Chinese-safe
2. reduce fake controls and placeholder affordances
3. turn creative primitives into first-class product capabilities
4. keep local fallback planning working even when the engine is unavailable
