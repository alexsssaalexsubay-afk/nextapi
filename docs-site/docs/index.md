---
slug: /overview
title: Overview
sidebar_label: Overview
description: NextAPI video generation gateway — for short drama teams, e-commerce creatives, and AI video producers.
---

# NextAPI Documentation

NextAPI is a video generation gateway built on top of Seedance. It handles authentication, billing, rate limiting, and reference-image management so you can focus on generating content.

## What you can do

- **Batch generate** 10 to 500+ shots from a CSV manifest with a single click
- **Keep characters consistent** across an entire episode using reference images and continuity groups
- **Control costs** with per-key rate limits, credit budgets, and spend caps
- **Integrate anywhere** — Batch Studio, ComfyUI, Python scripts, or direct HTTP

## How it works

```
API Key  →  POST /v1/video/generations  →  job_id
                                              ↓
                          poll GET /v1/jobs/id  →  video_url  →  download
```

Every video generation is a **job**. You submit a job, get back a `job_id`, then poll until the job reaches `succeeded` or `failed`. Batch Studio and the ComfyUI nodes handle this loop automatically.

## Where to start

| Guide | Audience |
|-------|----------|
| [Quick Start](./quickstart) | First video with Batch Studio — all users |
| [Batch Guide](./batch-guide) | CSV batch runs — operators and creators |
| [Character Consistency](./consistency-guide) | Stable character appearance — directors and artists |
| [Short Drama Workflow](./short-drama-workflow) | Full production playbook — production teams |
| [ComfyUI Guide](./comfyui-guide) | Visual workflow integration — technical creators |
| [API Keys](./api-key-guide) | How to use your key in every tool |
| [API Reference](./api-reference) | HTTP integration — developers |
| [Errors & FAQ](./errors) | When something breaks |
