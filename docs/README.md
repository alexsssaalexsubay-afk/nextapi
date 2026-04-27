# NextAPI 文档索引（仓库内）

> **完全不懂代码？** 请先读 [`BEGINNERS-GUIDE-ZH.md`](./BEGINNERS-GUIDE-ZH.md)（中文、白话、从零开始）。  
> **English, no code background:** start with the docs site page [Non-developers guide](../docs-site/docs/non-coder-guide.md) (also published when you build `docs-site`).

---

## 按角色选文档

| 你是谁 | 建议阅读顺序 |
|--------|----------------|
| 老板 / 运营 / 零基础 | [`BEGINNERS-GUIDE-ZH.md`](./BEGINNERS-GUIDE-ZH.md) → [`REPO-TOUR-ZH.md`](./REPO-TOUR-ZH.md)（文件夹地图）→ [`FLOW-ZH.md`](./FLOW-ZH.md)（流程）→ [`FAQ-ZH.md`](./FAQ-ZH.md) → [`GLOSSARY-ZH.md`](./GLOSSARY-ZH.md) → [`INTEGRATIONS-GUIDE.md`](./INTEGRATIONS-GUIDE.md) |
| 要自己或找人部署上线 | [`SETUP-GUIDE.md`](./SETUP-GUIDE.md) → [`deploy-cloudflare.md`](./deploy-cloudflare.md) → [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) |
| 日常管服务器、跑迁移、应急 | [`OPERATOR-HANDBOOK.md`](./OPERATOR-HANDBOOK.md) |
| 开发者 / 对接 API | [`sdks/README.md`](../sdks/README.md) → [`backend/api/openapi.yaml`](../backend/api/openapi.yaml) → 根目录 [`README.md`](../README.md) → [`docs/modules/`](./modules/README.md) |
| 批量视频、ComfyUI、本地工具 | [`toolkit/README.zh.md`](../toolkit/README.zh.md)（中文导读）→ [`toolkit/README.md`](../toolkit/README.md) 及 `toolkit/docs/` |

---

## 文档清单（本目录）

| 文件 | 内容 |
|------|------|
| **BEGINNERS-GUIDE-ZH.md** | 零基础中文指南：产品是啥、网址、怎么用控制台、名词解释入口 |
| **REPO-TOUR-ZH.md** | 仓库文件夹地图：`backend/`、`apps/`、`toolkit/` 等白话说明 |
| **FLOW-ZH.md** | 从发起生成到出视频：`sk_`/`ak_`/`ops_`、server/worker、新旧接口 |
| **FAQ-ZH.md** | 小白常见问题短答 |
| **GLOSSARY-ZH.md** | 中英文对照词汇表（API Key、积分、任务、Webhook 等） |
| **SETUP-GUIDE.md** | 从 0 部署到生产：DNS、环境变量、systemd、检查清单 |
| **OPERATOR-HANDBOOK.md** | 运维手册：数据库迁移、管理后台、Seedance 环境变量、应急 |
| **UPSTREAM-SEEDANCE-RELAY-ZH.md** | Seedance 托管上游接入指南：env、模型映射、任务回调 URL、错误码；与 `docs/modules/seedance-relay-webhook-assets.md` 互补 |
| **INTEGRATIONS-GUIDE.md** | 第三方：Resend、Grafana、支付规划等（偏「老板操作」） |
| **deploy-cloudflare.md** | Cloudflare Pages / Workers 与 GitHub Actions 部署说明 |
| **modules/** | 各子系统设计（给开发/审代码用） |

---

## 对外用户文档站点（Docusaurus）

产品说明、快速开始、批量指南、API 说明等面向客户的正文，在 **`docs-site/`** 里维护（构建后发布到你的文档域名）。

- 中文入口：`docs-site/i18n/zh/docusaurus-plugin-content-docs/current/`
- 英文入口：`docs-site/docs/`
- 零基础专页：`non-coder-guide`（中/英各一份）

## 产品内使用 / 下载入口要求

面向用户的 Dashboard、Director、任务结果页、API 文档页需要保持同一套入口命名，避免用户生成完成后找不到下一步：

| 场景 | 必须提供的入口 | 指向 |
|------|----------------|------|
| 首次进入控制台 | `Quickstart` / `快速开始` | 对外文档站快速开始页 |
| API 对接 | `API docs` / `API 文档` | OpenAPI/Mintlify 或 Docusaurus API 入口 |
| Director 空状态 | `Director guide` / `导演模式指南` | Director 使用文档或模块说明摘要 |
| 任务成功 | `Download` / `下载`、`Open workflow` / `打开工作流`、`Use via API` / `通过 API 使用` | 稳定资产 URL、Canvas 工作流、对应 API 示例 |
| 任务失败/降级 | `Troubleshooting` / `排查指南` | 错误、模型配置、fallback 说明 |
| 管理员配置缺失 | `Provider setup` / `模型配置` | Admin AI providers 设置说明 |

验收标准：

- 下载入口必须出现在完成态资产旁边，不能只藏在详情页或日志里。
- 使用文档入口必须出现在空状态、错误态、降级态和成功态中至少一个相关位置。
- 英文和中文文案同时维护；新增用户可见入口时同步更新 i18n 消息和文档索引。
- 如果某入口暂未实现，UI/文档必须标注为 `Preview` / `预览` 或 `Coming soon` / `即将推出`，不能伪装成可用能力。

---

## 与代码同步

- **API 行为** 以 `backend/api/openapi.yaml` 为准；改接口时记得改 OpenAPI 和对外文档。
- **上线检查** 以 `SETUP-GUIDE.md` 第八节 + `OPERATOR-HANDBOOK.md` 环境变量清单为准。
- **当前构建状态** 见仓库根目录 [`STATUS.md`](../STATUS.md)。
