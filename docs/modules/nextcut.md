# NextCut Desktop App (formerly Creator Kit)

## Purpose

NextCut is the official local desktop tool that makes NextAPI easier to try, buy, and use. Built as a Tauri + React application, it provides a native environment where users can paste their `sk_*` key, pick a Seedance model, fill in a prompt and optional image, and generate a video — all without writing `curl` or reading API docs.

The app sells NextAPI API access. It is *not* a separate product with its own billing, task queue, or provider backend.

## Non-goals

- Do **not** vendor, redistribute, white-label, mirror, or repackage AI-CanvasPro or any other Source Available / non-commercial tool without a signed commercial license from the upstream author.
- Do **not** copy AI-CanvasPro source code, obfuscated bundles, UI assets, node icons, layout trade dress, or Electron packaging scripts into this repository.
- Do **not** create a second billing system, credit ledger, task queue, or provider abstraction layer. All jobs flow through the existing `POST /v1/videos` → Asynq worker → provider pipeline.
- Do **not** expose provider-level API keys. The user only holds a NextAPI key (`sk_*`).
- Do **not** add offline generation, local model inference, or bypass the NextAPI gateway.

## Architecture (Tauri + Python Sidecar)

```
┌──────────────────────────────────────┐
│  NextCut (local)                     │
│  Tauri (Rust) + React (TypeScript)   │
│                                      │
│  ┌──────────┐  ┌──────────────────┐  │
│  │ Key store│  │ Python Sidecar   │  │
│  │ zustand  │  │ (FastAPI, local) │  │
│  └──────────┘  └──────────────────┘  │
│         │              │             │
│         ▼              ▼             │
│  ┌─────────────────────────────────┐ │
│  │  POST /v1/videos                │ │
│  │  GET  /v1/videos/:id (poll)     │ │
│  │  GET  /v1/models                │ │
│  └─────────────────────────────────┘ │
└──────────────────┬───────────────────┘
                   │ HTTPS
                   ▼
         ┌─────────────────┐
         │ api.nextapi.top │
         │ (NextAPI gateway)│
         └─────────────────┘
```

- **Key storage**: `zustand` + Tauri Store with a clear "logout" button. Never sent to any server other than `api.nextapi.top` and the local sidecar.
- **Python Sidecar**: Bundled via PyInstaller and managed by Tauri's process API. Handles advanced prompt compilation and local AI logic.
- **Endpoint profile**: A JSON snippet the user can export/import with base URL, model list, and key placeholder.
- **Video job polling**: Polls `GET /v1/videos/:id` every 4 seconds while status is active. Shows a thumbnail placeholder during generation.
- **History**: A local list of recent job IDs with status, synced via the sidecar/Tauri store.

## Security

- The key is stored **locally only**. The app never sends it anywhere except `api.nextapi.top` over HTTPS (or the local sidecar bound to localhost).
- On first launch, show a short security notice.
- No key proxying to unverified endpoints. The app is a direct client of `api.nextapi.top`.

## First engineering slices (after this doc)

1. **Endpoint profile export** — a JSON blob (base URL + model list) that users can import into
   third-party tools that support custom OpenAI-compatible endpoints.
2. **Canvas node library search** — filter/search the node palette in `canvas-workspace.tsx` so
   users can find nodes faster when building workflows.
3. **Local starter template** — a minimal HTML page that demonstrates `POST /v1/videos` + poll loop
   with a NextAPI key. Ships as a downloadable zip or a `/starter` route in the dashboard.
4. **OpenAI-compatible bridge** — only if verified against a concrete tool; do not promise
   compatibility before testing.

## References

- [Use NextAPI keys in third-party tools](../use-nextapi-key-in-third-party-tools.md) — user-facing guide
- [Canvas workbench v0.2](./canvas-workbench-v02.md) — existing Canvas module design
- [Canvas workflow](./canvas-workflow.md) — workflow CRUD and run model
