# NextCut Storyflow / Infinite Canvas Workbench

## Purpose

This document records the current implementation of the NextCut infinite canvas / workbench after the 2026-05 redesign work. The workbench is no longer a simple card pile or legacy storyboard wrapper. It is a Storyflow orchestration surface that connects AI Director planning, references, prompt strategy, camera motion, storyboard assets, generation preflight, timeline feedback, preview, and contextual inspection.

The source of truth is the code under:

- `apps/nextcut/src/components/storyflow/`
- `apps/nextcut/src/stores/app-store.ts`
- `apps/nextcut/src/stores/director-store.ts`
- `apps/nextcut/src/lib/generation.ts`

## Current Route And Entry

The sidebar `workspace` page now renders `StoryflowWorkspace` by default through `WorkspaceLayout`.

Code path:

```text
Sidebar "无限画布 / 工作台"
  -> app-store.sidebarPage = "workspace"
  -> WorkspaceLayout default branch
  -> StoryflowWorkspace
```

The older `NodeCanvas`, `StoryboardPanel`, `TimelineEditor`, `PreviewMonitor`, and `InspectorPanel` still exist for the `edit` page / legacy editing surface, but the product workbench route is now the Storyflow implementation.

## Four Workbench Modes

All four modes share the same director state. A mode switch changes layout and interaction density, not the data model.

| Mode | Store value | Purpose | Current implementation |
|---|---|---|---|
| Storyflow | `storyflow` | Default global structure view | Scene outline, large React Flow canvas, node library, production run dock, overlay inspector, mini timeline |
| Focus Canvas | `focus` | Pure creation mode | Hides app sidebar through `workspaceCleanMode`, keeps floating mode switcher, canvas toolbar, run dock, shortcuts chips, optional inspector |
| Split Review | `review` | Review loop | Left shot rail, center canvas + timeline, right preview + inspector |
| Timeline Edit | `timeline` | Execution layer | Large timeline dock, selected-shot hero, preview and inspector |

Mode state is stored in `app-store.ts` as:

```ts
export type StoryflowMode = "storyflow" | "focus" | "review" | "timeline";
```

Persisted fields include `storyflowMode`, `workspaceCleanMode`, and `timelineZoom`, so the client remembers the user's editing posture.

## Storyflow Data Model

The graph is derived from AI Director state by `buildStoryflowGraph`.

Input:

- `prompt`
- `structuredPrompt`
- `references`
- `shots`
- `shotGenerationCards`

Output:

- React Flow nodes
- React Flow edges
- timeline clips
- total duration

Implemented node kinds:

| Node kind | Product meaning | Data source |
|---|---|---|
| `intent` | User brief / creative intent | `prompt`, `structuredPrompt` |
| `prompt` | Prompt strategy / decomposition | `structuredPrompt`, shot card contracts |
| `reference` | Reference Stack | `references`, first shot thumbnail fallback |
| `camera` | Camera Motion | shot camera, structured camera |
| `scene` | Scene Group | unique `shot.scene_id` groups |
| `shot` | Shot node | `shots[]` |
| `output` | Timeline / output | total shots and duration |
| `review` | Quality review | graph-wide QA placeholder |
| `version` | Version snapshot | current version placeholder |

Edges encode the intended production chain:

```text
Intent
  -> Prompt Strategy
  -> Camera Motion
  -> Scene Group
  -> Shot Nodes
  -> Output
  -> Review
  -> Version

Intent
  -> Reference Stack
  -> Camera Motion
```

Shot sequence edges are animated, and edge state is recomputed from selected nodes and shot status.

## Implemented Production Nodes

`StoryflowWorkspace` exposes a node library / run dock with these runnable actions:

| Action | Current behavior | Backend / persistence |
|---|---|---|
| Shot Node | Creates a new shot after the selected shot and creates a matching shot generation card | Local store first, sidecar `POST /director/plan/{planId}/shot` when `planId` exists |
| Prompt Decomposition | Writes structured prompt fields into `shot.prompt` and `shot.generationParams.shot_script / constraints / audio_cues` | Local store + debounced sidecar patch |
| Reference Stack | Copies image/video/audio references into `shot.generationParams.image_urls / video_urls / audio_urls` and adds reference instructions | Local store + debounced sidecar patch |
| Camera Motion | Writes camera contract into `shot.camera` and `shot.generationParams.motion_desc` | Local store + debounced sidecar patch |
| Storyboard Keyframes | Calls `/agents/generate-storyboard-assets`, requests storyboard keyframe, first frame, and last frame, then writes returned URLs back to thumbnail and `generationParams` | Requires sidecar route availability |
| Preflight Gate | Builds generate payload and runs `runGenerationPreflight`; blocked findings stop generation and mark shot failed | Frontend preflight helper |
| Generate Shot | Runs preflight, marks shot queued, submits `/generate/submit` with the open generation payload | Requires generation provider config |

This means the workbench is partially connected to real production behavior, not only static UI. The current real closed loops are shot create/update/delete/reorder, prompt/reference/camera parameter writeback, preflight, and submit generation. Storyboard asset generation depends on the sidecar asset route being available and returning assets.

## Canvas Interaction

Canvas implementation:

- `StoryflowCanvas.tsx`
- `StoryflowNodeCard.tsx`
- `StatusFlowEdge.tsx`
- `@xyflow/react`

Current behaviors:

- Node click selects a node.
- Shot node selection updates `selectedShotId`.
- Timeline clip click updates `selectedShotId` and therefore highlights the matching shot node.
- Double-clicking a node opens the inspector.
- Pane click clears selection.
- Multi-select is enabled through React Flow selection and modifier keys.
- User-created connections are allowed and styled as status flow edges.
- Fit view and auto layout are exposed through toolbar actions.
- Focus selected centers the canvas on the selected node.
- Minimap is enabled and pannable/zoomable.
- Controls are enabled in the canvas lower-left corner.
- Edges use `StatusFlowEdge` with animated stream state for running/selected edges and color mapping:
  - Purple: running or selected
  - Green: complete
  - Red: blocked/failed
  - Slate: idle

## Timeline Linkage

Timeline implementation:

- `TimelineDock.tsx`
- `storyflow-types.ts` `StoryflowClip`

Current behaviors:

- Builds clips directly from `shots`.
- Clip width scales with shot duration and `timelineZoom`.
- Selecting a clip selects the matching shot.
- Drag/drop video clips reorders shots and reindexes them.
- `-1s` / `+1s` duration controls update the selected shot.
- The mini timeline is shown in Storyflow mode.
- The full timeline is shown in Review and Timeline Edit modes.
- Timeline edits update the shared director store, so the canvas node metric and inspector duration reflect the same shot data.

## Inspector Linkage

Inspector implementation:

- `InspectorDrawer.tsx`

The inspector was changed from a long backend-like form into contextual collapsible sections:

- Shot Info
- Prompt
- Camera Motion
- References
- Style / Mood / Tags
- Generation Status
- Version History
- Quick Actions

Implemented editable fields:

- title
- duration
- status
- prompt
- camera

These call `onUpdateShot`, which updates the store and uses a debounced sidecar `PATCH /director/plan/{planId}/shot/{shotId}` when a plan exists.

Current limitation: quick action buttons are visual affordances only unless wired by the parent workflow. Regenerate/save-version/apply-template/rollback still need backend-specific implementation before the UI can claim full production support.

## Preview Linkage

Preview implementation:

- `PreviewDock.tsx`

Current behaviors:

- Shows selected shot thumbnail/video when available.
- Falls back to shot script / prompt when media is not available.
- Prev/next controls move shot selection.
- Playback state is shared within the Storyflow workspace mode.

## Keyboard Shortcuts

Implemented in `StoryflowWorkspace.tsx`:

| Shortcut | Behavior |
|---|---|
| `P` | Toggle Focus Canvas mode |
| `F` | Focus selected node |
| `Enter` | Open inspector |
| `Esc` | Close inspector, exit focus mode, or clear selection |
| `Delete` / `Backspace` | Delete selected shot node |
| `Cmd/Ctrl + D` | Duplicate selected shot |
| `Cmd/Ctrl + 0` | Fit canvas |
| `Cmd/Ctrl + +` | Zoom in |
| `Cmd/Ctrl + -` | Zoom out |
| `[` / `]` | Move selection to previous / next shot |
| `?` | Toggle shortcuts popover |

## Sidecar Sync Rules

The workbench uses optimistic local edits first:

1. Update `director-store`.
2. If `planId` exists, schedule or run sidecar sync.
3. Reflect sync status in the workbench header.

Sidecar routes used:

- `PATCH /director/plan/{planId}/shot/{shotId}`
- `POST /director/plan/{planId}/reorder`
- `POST /director/plan/{planId}/shot`
- `DELETE /director/plan/{planId}/shot/{shotId}`
- `POST /agents/generate-storyboard-assets`
- `POST /generate/submit`

If sidecar sync fails, local state remains visible and sync state becomes offline. This is intentional for local/offline editing, but still needs a conflict-resolution design before team sync is considered complete.

## What Changed From The Old Workbench

Old problems:

- Canvas felt like a generic process diagram.
- Inspector behaved like a long admin form.
- Timeline, preview, and node selection were weakly connected.
- Pure canvas mode did not remove enough chrome.
- Production nodes were mostly presentational.

Current fixes:

- Storyflow is now the default workspace route.
- Four modes share one selected-shot state and one director store.
- Focus mode hides the main sidebar and uses floating controls.
- Node library actions write real prompt/reference/camera/generation params.
- Storyboard asset generation has a route contract and writes returned images back into shot data.
- Preflight and generation submit use the same payload builder as the generation flow.
- Timeline reorder/duration edits update the same shots shown in the graph and inspector.
- Edge visuals now communicate idle/running/complete/failed/selected states.

## Remaining Product Gaps

The workbench is materially changed, but these areas are not yet 100% complete:

- Full node grouping/collapse persistence is not implemented as a saved graph model.
- User-created custom connections are currently in-canvas UI state and are not persisted to the plan.
- Version node is a visible product placeholder; actual compare/rollback needs a version API.
- Inspector quick actions need real command handlers.
- Storyboard asset generation depends on `/agents/generate-storyboard-assets`; if the route is unavailable, the node reports failure.
- Character asset chain needs first-class nodes and APIs for three-view, expression sheet, outfit sheet, pose sheet, and Identity Lock inheritance.
- Reference Stack writeback works, but drag-from-library-to-node is not yet a complete interaction.
- Multi-user conflict resolution / sync queue is not implemented.

## Validation Checklist

Fast checks after Storyflow changes:

```bash
pnpm --filter nextcut typecheck
```

Manual smoke:

1. Open `http://localhost:1420/`.
2. Go to `无限画布 / 工作台`.
3. Generate or load shots through AI Director if the empty state appears.
4. Switch modes: Storyflow, Focus Canvas, Split Review, Timeline Edit.
5. Select a shot node and confirm inspector, preview, and timeline all point to the same shot.
6. Edit duration in inspector and confirm timeline clip width / duration changes.
7. Drag a timeline clip and confirm shot order changes.
8. Run Prompt, Reference, Camera, Preflight nodes and confirm status messages.
9. Press `P`, `F`, `Cmd/Ctrl+0`, `Cmd/Ctrl+D`, `Delete`, and `Esc`.

