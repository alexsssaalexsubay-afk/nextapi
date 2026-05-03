# ViMax + ComfyUI Local Studio

## Goal

Build the customer-facing local creator tool by adapting the vendored ViMax director pipeline and the existing ComfyUI workflow ecosystem, rather than creating a parallel planning engine.

The product UI is the NextAPI dashboard: Director, Canvas, assets, queue, billing, and model management. ComfyUI remains an import/export compatibility layer and a power-user ecosystem, not the primary interface users must learn.

## Boundary

- ViMax owns script/story/shot planning concepts and emits a portable director/workbench payload.
- NextAPI Canvas owns visual graph composition, user editing, execution, auth, and billing.
- ComfyUI JSON workflows can be imported into NextAPI Canvas and exported back when useful.
- NextAPI owns authentication, asset-library references, video task creation, polling, and billing.
- Provider keys must stay in NextAPI/Auth nodes or environment variables; the director plan must not expose upstream provider credentials.
- Configurable Director/LLM nodes are controlled NextAPI capabilities. They require login plus an active AI Director entitlement before execution.

## First Slice

- Add a ViMax adapter that converts one script or idea into scenes, shots, Seedance-compatible prompts, reference policy, a ComfyUI-style graph, and a NextAPI workbench payload.
- Add a ComfyUI node that loads the ViMax adapter and returns both the first-shot fields for direct wiring and full JSON for batch/editor use.
- Add a NextAPI Canvas import path for external ComfyUI JSON. Imported Director/LLM nodes become locked NextAPI nodes and cannot run without AI Director entitlement.
- Keep deterministic planning as an offline fallback. The real chain is `Screenwriter -> ScriptEnhancer -> CharacterExtractor -> StoryboardArtist -> CinematographyShotAgent` behind the same output contract.

## Verification

- Unit-test the ViMax adapter shape.
- Import the ComfyUI node package and execute the director node without a running ComfyUI instance.
- Type-check the dashboard Canvas import path and keep i18n keys aligned.
- Compile touched Python modules.
