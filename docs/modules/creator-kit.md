# NextAPI Creator Kit

## Purpose

NextAPI Creator Kit is a planned "fill-key-and-create" local tool that makes NextAPI easier to try, buy, and use.
A user installs it locally (web app or Electron wrapper), pastes their `sk_*` key, picks a Seedance model,
fills in a prompt and optional image, and generates a video — all without writing `curl` or reading API docs.

The Creator Kit sells NextAPI API access. It is *not* a separate product with its own billing, task queue,
or provider backend.

## Non-goals

- Do **not** vendor, redistribute, white-label, mirror, or repackage AI-CanvasPro or any other Source Available /
  non-commercial tool without a signed commercial license from the upstream author.
- Do **not** copy AI-CanvasPro source code, obfuscated bundles, UI assets, node icons, layout trade dress, or
  Electron packaging scripts into this repository.
- Do **not** create a second billing system, credit ledger, task queue, or provider abstraction layer.
  All jobs flow through the existing `POST /v1/videos` → Asynq worker → provider pipeline.
- Do **not** expose provider-level API keys. The user only holds a NextAPI key (`sk_*`).
- Do **not** add offline generation, local model inference, or bypass the NextAPI gateway.

## Paths

### A. Docs-only BYO guide (safe, immediate)

Publish [`docs/use-nextapi-key-in-third-party-tools.md`](../use-nextapi-key-in-third-party-tools.md).
It teaches users how to get a NextAPI key, what base URL and key format to paste, and which tools are
likely or unlikely to work. This path requires zero code and zero license risk.

### B. Commercial license negotiation (gate for bundling)

If NextAPI ever wants to bundle a specific third-party desktop tool, contact the upstream author and
negotiate a written commercial license covering bundle/white-label/resale/private-deployment scope.
No code or integration work starts until the license is signed.

### C. Self-built NextAPI Creator Kit (long-term, no external license dependency)

Build our own local Electron/web app that is:

- **Minimal**: a prompt box, an optional image drop-zone, a model picker, a video player, and a job list.
- **Local-first**: stores the API key in `localStorage` or a local config file — never on NextAPI servers.
- **Single-endpoint**: calls only `https://api.nextapi.top/v1/videos` (and polling `GET /v1/videos/:id`).
- **Stateless beyond polling**: no local task queue, no local database.
- **Open-source under MIT or Apache-2.0**: deliberately permissive so users and partners can trust it.

## Architecture (self-built path)

```
┌──────────────────────────────────┐
│  NextAPI Creator Kit (local)     │
│  Electron or localhost web app   │
│                                  │
│  ┌──────────┐  ┌──────────────┐  │
│  │ Key store │  │ Canvas JSON  │  │
│  │localStorage│  │ import/export│  │
│  └──────────┘  └──────────────┘  │
│         │              │          │
│         ▼              ▼          │
│  ┌──────────────────────────────┐ │
│  │  POST /v1/videos             │ │
│  │  GET  /v1/videos/:id (poll)  │ │
│  │  GET  /v1/models             │ │
│  └──────────────────────────────┘ │
└──────────────────┬───────────────┘
                   │ HTTPS
                   ▼
         ┌─────────────────┐
         │ api.nextapi.top  │
         │ (existing gateway)│
         └─────────────────┘
```

- **Key storage**: `localStorage` with a clear "remove key" button. Never sent to any server other than
  `api.nextapi.top`. Warn on first launch that the key is stored locally and unprotected.
- **Endpoint profile**: a JSON snippet the user can export/import with base URL, model list, and key
  placeholder. Useful for BYO-tool guides.
- **Canvas workflow JSON**: import/export in the existing NextAPI workflow JSON format so Creator Kit
  projects can open in the Dashboard Canvas.
- **Asset upload**: reuse the existing library upload endpoint. Uploaded images get a provider-ready URL.
- **Video job polling**: polls `GET /v1/videos/:id` every 4 seconds while status is active. Shows a
  thumbnail placeholder during generation.
- **History**: a local list of recent job IDs with status. No server-side history beyond the existing
  `GET /v1/videos` endpoint.

## Security

- The key is stored **locally only**. The app never sends it anywhere except `api.nextapi.top` over HTTPS.
- On first launch, show a short security notice: "Your API key is stored in this browser's local storage.
  Anyone with access to this device can use it. Do not paste your key into unofficial hosted mirrors."
- No key proxying. The Creator Kit is a direct client of `api.nextapi.top`.
- If the user wants to try a third-party tool (AI-CanvasPro, ComfyUI, etc.), the docs warn them to:
  - Install from the official upstream source only.
  - Never paste their NextAPI key into an unofficial hosted mirror.
  - Rotate the key if they suspect exposure.

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
