# 仓库里有什么（小白版地图）

> 你不需要读懂每一行代码。这篇用 **「文件夹 = 干什么用的」** 帮你建立印象。  
> 名词不懂请看 [`GLOSSARY-ZH.md`](./GLOSSARY-ZH.md)。

---

## 顶层目录一眼表

| 文件夹 | 白话说明 | 谁能动 |
|--------|----------|--------|
| **`backend/`** | **真正的 API 大脑**：接请求、记账、排队、调视频模型、写数据库。 | 后端开发 / 运维部署 |
| **`apps/site/`** | **官网**（nextapi.top）：介绍、定价、文档入口等静态/半静态页面。 | 前端 / 市场 |
| **`apps/dashboard/`** | **客户控制台**（app.nextapi.top）：登录、密钥、任务列表等。 | 前端 |
| **`apps/admin/`** | **内部管理台**（admin.nextapi.top）：调账、暂停组织等。 | 前端 + 白名单账号 |
| **`packages/ui/`** | **共用界面组件和文案**（中英文翻译很多在这里）。 | 前端 |
| **`docs/`** | **本仓库内的说明文档**（运维、零基础、词汇表）。 | 所有人阅读 |
| **`docs-site/`** | **对外文档站**源码（Docusaurus），可发布到 docs 子域。 | 产品 / 文档 |
| **`toolkit/`** | **本地批量工具**（Python）：CSV 批跑、ComfyUI 节点等，不替代线上 API。 | 制片 / 技术美术 |
| **`sdks/`** | **各语言示例客户端**（Python / Node / Go），给程序员拷贝接入。 | 开发者 |
| **`ops/`** | **运维脚本与监控配置**（Prometheus、部署说明等）。 | 运维 |

---

## `backend/` 里再拆一层（知道名字即可）

| 路径 | 干什么 |
|------|--------|
| **`cmd/server/`** | 启动 **HTTP 服务**：对外提供 `https://api.../v1/...`。 |
| **`cmd/worker/`** | 启动 **后台工人**：从队列里取任务，真正去调模型、更新状态（和 server 分工不同）。 |
| **`cmd/seed/`** | 一次性脚本入口（如灌测试数据），日常用户不用关心。 |
| **`internal/gateway/`** | **路由层**：哪个网址对应哪个功能（创建视频、管理密钥、管理后台接口等）。 |
| **`internal/job/`** | **任务业务**：创建任务、预留积分、失败退款等与「一单视频」相关的规则。 |
| **`internal/auth/`** | **鉴权**：校验 API Key、Clerk 等。 |
| **`internal/billing/`** | **积分账本**：充值、扣费、流水。 |
| **`internal/provider/`** | **上游视频模型适配**（例如 Seedance live/mock）。 |
| **`internal/spend/`** | **花费控制**：预算上限、熔断等与「别把钱花冒了」相关的逻辑。 |
| **`internal/webhook/`** | **Webhook**：任务状态变更时通知客户服务器。 |
| **`migrations/`** | **数据库结构升级脚本**（SQL 文件按编号执行）。运维上线必看。 |
| **`api/openapi.yaml`** | **HTTP 接口说明书**（机器可读）：路径、参数、字段名以它为准。 |

---

## 和「五个网址」怎么对应？

| 网址 | 代码主要在 |
|------|------------|
| nextapi.top | `apps/site` |
| app.nextapi.top | `apps/dashboard` + `packages/ui` |
| admin.nextapi.top | `apps/admin` + `packages/ui` |
| api.nextapi.top | `backend/cmd/server`（部署在 VPS，前面通常还有 Nginx） |

前端页面 **不会** 直接连火山引擎；它们通过浏览器调用 **你的 API**，API 再在服务器里调模型。

---

## 下一步读什么？

- 流程白话：[`FLOW-ZH.md`](./FLOW-ZH.md)  
- 零基础总览：[`BEGINNERS-GUIDE-ZH.md`](./BEGINNERS-GUIDE-ZH.md)  
- 常见问题：[`FAQ-ZH.md`](./FAQ-ZH.md)  
- 文档总索引：[`README.md`](./README.md)
