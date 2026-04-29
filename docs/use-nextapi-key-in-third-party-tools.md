# Use your NextAPI key in third-party tools

NextAPI sells API access. You can generate videos with our API, and you can also paste your key into
compatible local tools if you prefer a graphical interface over `curl` or code.

This page explains how to get a key, what API format NextAPI uses, which tools are likely to work,
and important security rules.

## 1. Get your NextAPI key

1. Sign in at [app.nextapi.top](https://app.nextapi.top).
2. Go to **API Keys** in the sidebar.
3. Click **Create key**, give it a name (e.g. "my-local-tool"), and copy the `sk_...` value.
4. The full key is shown **only once**. Store it somewhere safe.

Your key is tied to your account credits. Anyone with the key can spend your credits.

## 2. Universal configuration pattern

Most tools that support custom API providers ask for two things:

| Field | Value |
|-------|-------|
| **Base URL** | `https://api.nextapi.top/v1` or `https://api.nextapi.top` (try both — tools vary) |
| **API key** | `sk_...` (the full key from step 1) |

If the tool has a model picker, look for model IDs like `seedance-v2-pro` or `seedance-2.0-pro`.
These are the models NextAPI currently serves.

**Important:** NextAPI is a video-generation API. Text chat and image generation endpoints are not
currently served. A tool that expects `/v1/chat/completions` will not work with NextAPI unless we
later add an OpenAI-compatible bridge (see below).

## 3. Tool categories

### Verified with NextAPI

*None yet.* We are testing tools one at a time and will list verified configurations here as we
confirm them. If you successfully connect a tool to NextAPI, tell us and we will verify and add it.

### Likely compatible

Tools that support a **custom OpenAI-compatible base URL** *may* work for video generation if they
also support the `/v1/videos` endpoint pattern. However, most "OpenAI-compatible" tools only
implement chat and image endpoints. Check the tool's documentation for video API support.

- **Generic OpenAI clients** (any desktop or web client that lets you set a custom base URL) —
  may work for `/v1/models` listing; video generation depends on whether the client calls
  `/v1/videos` or only `/v1/chat/completions`.
- **Local workflow tools** that let you configure a custom HTTP endpoint per node — if a node
  can POST JSON and poll a URL, it can drive NextAPI video jobs.
- **[AI-CanvasPro](https://github.com/ashuoAI/AI-CanvasPro)** (user-installed upstream only) —
  appears to support generic OpenAI-compatible endpoints for some model types. NextAPI does **not**
  redistribute AI-CanvasPro. Install it yourself from the official repository. We have not verified
  whether its video node works with the NextAPI `/v1/videos` endpoint; test with a small job first.

### Not enough evidence

Tools that only support their own built-in providers, or that require provider-specific API key
fields without a custom base URL option, are unlikely to work with NextAPI without modification.

Examples: video-specific GUI tools that hardcode provider endpoints; mobile apps that proxy
requests through their own backend.

## 4. AI-CanvasPro specific note

AI-CanvasPro is a local node-based AI canvas by 阿硕. It is **Source Available / non-commercial**
([license](https://github.com/ashuoAI/AI-CanvasPro/blob/main/LICENSE)). Key points:

- **You install it yourself** from [github.com/ashuoAI/AI-CanvasPro](https://github.com/ashuoAI/AI-CanvasPro).
  NextAPI does not distribute, mirror, or modify it.
- It supports several providers including a generic OpenAI-compatible endpoint option.
- We have **not yet verified** that its video generation node works with NextAPI's `/v1/videos`
  endpoint. If you try it:
  - Set the base URL to `https://api.nextapi.top/v1` or `https://api.nextapi.top`.
  - Use a small prompt and minimum duration to limit credit spend during testing.
  - Report your results so we can update this page.
- Do **not** use any unofficial hosted mirror of AI-CanvasPro. Only install from the official
  GitHub repository.

## 5. Security warnings

- **Only paste your key into tools you trust.** A malicious tool can steal your key and spend
  your credits.
- **Prefer local-only tools.** Tools that run entirely on your machine (Electron apps, localhost
  web apps, CLI tools) are safer than hosted web apps that proxy your key through someone else's
  server.
- **Never paste your key into an unofficial hosted mirror.** If a website claims to be
  "AI-CanvasPro online" or "NextAPI web client" but is not at `app.nextapi.top`, it is not ours.
- **Rotate your key if exposed.** Go to app.nextapi.top → API Keys, revoke the old key, and
  create a new one. All credits and usage stay with your account.
- **Your key is stored locally** by desktop tools. Anyone with access to your computer may be
  able to read it. Use a strong device password.

## 6. What NextAPI is building

We are building a **Creator Kit** — a minimal local app where you paste your key, write a prompt,
upload an optional image, and generate a video in two clicks. No `curl`, no code, no configuration.

Until the Creator Kit is ready, this guide is how you use your NextAPI key with tools you already
have. If a tool works well for you, tell us and we will test and document it.

## 7. Troubleshooting

| Symptom | Likely cause | Try |
|---------|-------------|-----|
| Tool shows "404 Not Found" | Wrong base URL path | Use `https://api.nextapi.top/v1` or `https://api.nextapi.top` |
| Tool shows "401 Unauthorized" | Key missing or wrong | Check the key starts with `sk_` and was copied completely |
| Tool shows "model not found" | Model ID mismatch | Use `seedance-v2-pro` or `seedance-2.0-pro` |
| Tool only offers chat models | Tool calls `/v1/models` but only parses chat models | Check if the tool has a video or custom node mode |
| Video job created but no output | Job still processing | Wait 30-120 seconds; check status at `GET /v1/videos/:id` |

---

NextAPI does **not** redistribute, resell, or white-label any third-party tool listed on this page
without the upstream author's written commercial permission. All tool names and links belong to
their respective owners.
