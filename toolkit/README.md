# NextAPI Operator Toolkit

**Professional video batch generation for short-drama teams and ecommerce creatives.**

Everything you need to go from "I just received an API key" to "100 shots delivered" — a local Streamlit console, ComfyUI custom nodes, a short-drama production pack, and operator documentation. Built for reliability and repeatability, not demos.

> **零基础（不写代码）**：工具链仍需在本机安装 Python；若你只想了解产品是做什么的，请先读仓库 [`docs/BEGINNERS-GUIDE-ZH.md`](../docs/BEGINNERS-GUIDE-ZH.md) 与 [`docs/GLOSSARY-ZH.md`](../docs/GLOSSARY-ZH.md)。

---

## Components

| Component | Purpose | Best for |
|-----------|---------|---------|
| [**Batch Studio**](batch_studio/) | Streamlit batch console with validation, continuity groups, Quick Test, and per-shot retry | 10–500+ shots from a CSV manifest |
| [**ComfyUI-NextAPI**](comfyui_nextapi/) | Five production ComfyUI custom nodes (Auth → Asset Resolver → Generate → Poll → Download) + two example workflows | Interactive 1–10 shot exploration and graph-based automation |
| [**Short Drama Pack**](short_drama_pack/) | Character bible, scene bible, shot manifest templates, prompt library, 100-shot production playbook | Planning and structuring a production before running |
| [**Operator Docs**](docs/) | Quickstart, Batch Studio reference, ComfyUI guide, troubleshooting | When something isn't working |

---

## Repository layout

```
toolkit/
├── batch_studio/               NextAPI Batch Studio (Streamlit)
│   ├── app.py                  UI entry point (tabs: Batch / Generate Prompts / Run History)
│   ├── api_client.py           Async HTTP client — submit, poll, download
│   ├── batch_runner.py         Concurrency engine — asyncio.Semaphore, retry, progress callbacks
│   ├── schema.py               Pydantic models, validation with plain-English errors, warnings
│   ├── utils.py                Payload builder, continuity inheritance, annotate_inherited_refs,
│   │                           generate_sample_manifest, sample prompt templates
│   ├── requirements.txt
│   ├── README.md
│   └── sample_data/
│       ├── shot_manifest.csv   15-shot sample (drama + ecommerce, bilingual prompts)
│       ├── character_bible.csv 5 sample characters
│       └── scene_bible.csv     6 sample locations
│
├── comfyui_nextapi/            ComfyUI-NextAPI custom node package
│   ├── __init__.py             Auto-discovery (NODE_CLASS_MAPPINGS + NODE_DISPLAY_NAME_MAPPINGS)
│   ├── requirements.txt
│   ├── README.md
│   ├── nodes/
│   │   ├── _client.py          Shared sync HTTP + exponential-backoff retry
│   │   ├── auth.py             NextAPIAuth
│   │   ├── asset_resolver.py   NextAPIAssetResolver
│   │   ├── generate_video.py   NextAPIGenerateVideo
│   │   ├── poll_job.py         NextAPIPollJob
│   │   └── download_result.py  NextAPIDownloadResult
│   └── example_workflows/
│       ├── short_drama_consistent_character.json
│       └── ecom_batch_creatives.json
│
├── short_drama_pack/           Production planning templates
│   ├── README.md
│   ├── sample_data/
│   │   ├── character_bible.csv
│   │   ├── scene_bible.csv
│   │   └── shot_manifest.csv
│   └── docs/
│       ├── prompt_templates.md  10 prompt skeletons (drama + ecommerce)
│       └── workflow_guide.md    100-shot batch production playbook
│
└── docs/
    ├── quickstart.md           10-minute first batch
    ├── batch_studio_guide.md   Full Batch Studio reference
    ├── comfyui_guide.md        Node reference and workflow tips
    └── troubleshooting.md      Common errors and fixes
```

---

## Quick start

```bash
# 1. Install Batch Studio
cd toolkit/batch_studio
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Run
streamlit run app.py
```

Then:
1. Paste your `sk_live_…` API key in the sidebar.
2. Upload `sample_data/shot_manifest.csv` in the **Batch** tab.
3. Click **Validate CSV** → **⚡ Quick Test (3 shots)** → **▶ Start Full Batch**.

Full guide: [`docs/quickstart.md`](docs/quickstart.md)

---

## API contract

网关目前 **同时保留** 两条创建入口（见 `backend/cmd/server/main.go`）：

| 路径 | 说明 |
|------|------|
| **`POST /v1/video/generations`** | 本工具包里的 Batch Studio、ComfyUI 节点 **当前使用** 这一条。 |
| **`POST /v1/videos`** | 新版 B2B 面（计费/限速/幂等等全开）；**新集成优先** 读 `backend/api/openapi.yaml`。 |

轮询状态：工具使用 **`GET /v1/jobs/{id}`**（与旧流水线一致）。若你只用 `/v1/videos` 创建，请用 **`GET /v1/videos/{id}`** 查状态（以 OpenAPI 为准）。

```
Authorization: Bearer sk_live_…
```

All tools default to `https://api.nextapi.top`. Override via the sidebar, `NEXTAPI_BASE_URL` env var, or node inputs.

---

## Where to start

| Goal | Start here |
|------|-----------|
| First video in under 10 minutes | [`docs/quickstart.md`](docs/quickstart.md) |
| Full Batch Studio walkthrough | [`batch_studio/README.md`](batch_studio/README.md) |
| ComfyUI node setup | [`comfyui_nextapi/README.md`](comfyui_nextapi/README.md) |
| Plan a 100-shot drama production | [`short_drama_pack/docs/workflow_guide.md`](short_drama_pack/docs/workflow_guide.md) |
| Write prompts from scratch | [`short_drama_pack/docs/prompt_templates.md`](short_drama_pack/docs/prompt_templates.md) |
| Something isn't working | [`docs/troubleshooting.md`](docs/troubleshooting.md) |

---

## License

MIT
