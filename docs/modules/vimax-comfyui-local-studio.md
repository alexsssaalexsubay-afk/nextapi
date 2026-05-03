# ViMax + ComfyUI Local Studio

## Goal

Build the customer-facing local creator tool by adapting the vendored ViMax director pipeline and the existing ComfyUI NextAPI node pack, rather than creating a parallel workflow system.

The first stable slice makes ViMax produce a NextAPI-ready director plan and lets ComfyUI consume that plan as an upstream node before `NextAPI · Generate Video`.

## Boundary

- ViMax owns script/story/shot planning concepts.
- ComfyUI owns visual graph composition and user editing.
- NextAPI owns authentication, asset-library references, video task creation, polling, and billing.
- Provider keys must stay in NextAPI/Auth nodes or environment variables; the director plan must not expose upstream provider credentials.

## First Slice

- Add a lightweight ViMax adapter that converts one script or idea into scenes, shots, Seedance-compatible prompts, reference policy, and a ComfyUI-style workflow graph.
- Add a ComfyUI node that loads the ViMax adapter and returns both the first-shot fields for direct wiring and full JSON for batch/editor use.
- Keep the adapter deterministic and local-only for now. Real ViMax agent calls can replace the planner behind the same output contract later.

## Verification

- Unit-test the ViMax adapter shape.
- Import the ComfyUI node package and execute the director node without a running ComfyUI instance.
- Compile touched Python modules.
