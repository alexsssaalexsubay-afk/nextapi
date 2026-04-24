---
title: 零基础用户指南
sidebar_label: 零基础指南
description: 不写代码也能理解的 NextAPI 说明 — 网址、积分、API Key、该读哪些文档。
slug: /non-coder-guide
---

# 零基础用户指南

这篇写给 **老板、运营、制片、编导** 等 **不需要写代码** 的角色。

---

## NextAPI 是做什么的？

NextAPI 是一个 **托管的视频生成 API**：

- 团队在网页注册、充值 **积分**，创建 **API Key**。
- 程序或本地工具（Batch Studio、ComfyUI）把 **文字描述** 和可选 **参考图** 发给我们。
- 我们负责：**验证身份、检查余额、排队、调用 Seedance 系列视频模型、失败退款、任务记录**。

日常使用时，你 **不必** 关心底层云厂商或第三方网关——在控制台用 **业务 API Key** 调用 `https://api.nextapi.top/v1` 即可。

---

## 五个网址别搞混

| 网址 | 给谁 | 做什么 |
|------|------|--------|
| **nextapi.top** | 所有人 | 官网、价格、文档入口。 |
| **app.nextapi.top** | **客户** | 登录、创建 Key、看任务。 |
| **admin.nextapi.top** | **内部运营** | 调账、暂停组织、审计（邮箱需在白名单）。 |
| **api.nextapi.top** | **程序** | 真正的接口地址。 |
| **文档站**（本站） | 所有人 | 使用说明与 API 参考。 |

**API Key = 密码**：不要发微信群、不要贴 GitHub。

---

## 不写代码怎么试第一条视频？

1. 打开 **app.nextapi.top** 注册登录。  
2. 在 **API Key** 页面创建密钥，复制到 **密码管理器**（完整密钥往往只显示一次）。  
3. 若控制台有 **试用/Playground**，按提示填 **提示词** 和参数，提交后等待任务变 **成功**。  

没有试用入口时，把 Key 交给技术人员，让他们看本站的 [快速开始](./quickstart) 和 [API 参考](./api-reference)。

---

## 积分怎么扣？

- 任务创建时会 **预留** 积分。  
- **成功** 会按规则扣除；**失败** 会 **退还/释放** 预留（以页面与账单为准）。  

异常扣费请记下 **任务 ID** 和时间，联系支持或查运维手册。

---

## Seedance 模型名是什么？我要记哪些 ID？

- 你在请求里填的 `model` 是 **公开模型 ID**，例如 **`seedance-2.0-pro`**（高画质）、**`seedance-2.0-fast`**（更快）、**`seedream-5.0-lite`**（轻量档）。  
- 全部通过 **同一套** API 基址与 **`sk_` 业务密钥** 调用；具体列表以 [`GET /v1/models`](https://api.nextapi.top/v1/models) 或官网文档为准。  
- 若你曾使用旧版 ID（如 `seedance-2.0`），网关在多数情况下仍会自动兼容，详见发布说明；新集成请优先用上述带 `-pro` / `-fast` / `seedream-` 的名称。

---

## 要给「程序员」看什么？

请他们阅读 **Git 仓库里的** 文档（比本站更偏运维）：

| 文档 | 内容 |
|------|------|
| `docs/BEGINNERS-GUIDE-ZH.md` | 更长的零基础说明（与本文互补） |
| `docs/GLOSSARY-ZH.md` | 名词表 |
| `docs/SETUP-GUIDE.md` | 部署上线 |
| `docs/OPERATOR-HANDBOOK.md` | 环境变量、数据库迁移、应急 |
| `backend/api/openapi.yaml` | API 权威定义 |

仓库根目录还有 **`docs/README.md`** 总索引。推荐小白再读（均在 `docs/`）：

- **`REPO-TOUR-ZH.md`** — 每个顶层文件夹是干什么的  
- **`FLOW-ZH.md`** — 从发请求到出视频、`sk_` / 运维会话 等  
- **`FAQ-ZH.md`** — 短问答  

---

## 下一步

- 名词解释：仓库内 `docs/GLOSSARY-ZH.md`  
- 批量拍镜头：[批量生成指南](./batch-guide)  
- 出错时：[错误与排查](./errors) · [常见问题](./faq)
