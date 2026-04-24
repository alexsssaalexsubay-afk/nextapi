---
slug: /non-coder-guide
title: For non-developers
sidebar_label: Non-developers
description: Plain-language overview of NextAPI — no programming required.
---

# For non-developers

This page is for **operators, producers, and founders** who will use NextAPI without writing code.

## What NextAPI does

NextAPI is a **managed video generation API**:

- Your team signs up, tops up **credits**, and creates **API keys**.
- Applications (or our Batch Studio / ComfyUI tools) send a **prompt** and optional **reference image**.
- NextAPI handles **auth, billing, queuing, Seedance-family video models, refunds on failure, and job history**.

You call **`https://api.nextapi.top/v1`** with your **`sk_` key** and a public **model** id (e.g. `seedance-2.0-pro`); you do not need to sign up with third-party model vendors yourself.

## The five URLs

| URL | Who | Purpose |
|-----|-----|---------|
| **nextapi.top** | Everyone | Marketing and docs links. |
| **app.nextapi.top** | Customers | Sign in, API keys, jobs, trials. |
| **admin.nextapi.top** | Operators | Credits, org pause, audit (allowlisted emails). |
| **api.nextapi.top** | Programs | HTTPS API for generation and status. |
| Your **docs** site | Everyone | Product guides (this site). |

Treat **API keys** like passwords: never paste them in public chats or GitHub.

## Try your first video (no code)

1. Open **app.nextapi.top** and sign in.
2. Create an **API key** and store it in a password manager (shown once in full).
3. If the dashboard offers a **playground**, submit a prompt and wait until the job shows **succeeded**.

If there is no playground, hand the key to a developer and point them to [API Reference](./api-reference) and [Quick Start](./quickstart).

## Credits

- Credits are **reserved** when a job starts.
- **Succeeded** jobs consume credits; **failed** jobs release the reservation (refund behavior as documented).

## For your technical contact

Ask them to read the repo docs (not just this site):

- `docs/SETUP-GUIDE.md` — production deployment.
- `docs/OPERATOR-HANDBOOK.md` — env vars, DB migrations, production checks.
- `backend/api/openapi.yaml` — authoritative API schema.

## More detail in Chinese

A longer beginner guide (Chinese) lives in the repository: `docs/BEGINNERS-GUIDE-ZH.md`.  
Same folder for **repo map** (`REPO-TOUR-ZH.md`), **request lifecycle** (`FLOW-ZH.md`), and **FAQ** (`FAQ-ZH.md`) — useful if you clone the monorepo.

## Glossary

See `docs/GLOSSARY-ZH.md` in the repository for a Chinese glossary (API, webhook, async jobs, etc.).
