---
slug: /
title: NextAPI 文档
sidebar_label: 概览
description: NextAPI 视频生成网关 — 为短剧团队、电商创意和 AI 视频生产者打造的专业工具。
---

# NextAPI 文档

**NextAPI** 是基于 Seedance 构建的视频生成网关。它处理好了认证、计费、限速和参考图管理，让你专注于生成内容本身。

**不写代码？** 请先读 **[零基础用户指南](./non-coder-guide)**（老板、运营、制片适用）。名词解释见仓库内 `docs/GLOSSARY-ZH.md`。

---

## 你是哪类用户？

### 🎬 短剧团队

快速开始批量拍摄，管理角色一致性，在全集中保持人物和场景统一。

**从这里开始 →** [快速开始](./quickstart) · [短剧工作流](./short-drama-workflow)

### 🛒 电商创意

为产品批量生成展示视频，支持高并发和多种画面比例。

**从这里开始 →** [批量生成指南](./batch-guide) · [API 密钥用法](./api-key-guide)

### 🔧 开发者

接入 API，在 Python、ComfyUI 或自建系统中集成视频生成能力。

**从这里开始 →** [API 参考](./api-reference) · [ComfyUI 指南](./comfyui-guide)

---

## 核心功能

| 功能 | 描述 |
|------|------|
| **批量生成** | CSV 驱动，一次提交 100+ 条镜头，支持并发控制 |
| **角色一致性** | 参考图 + 连贯组机制，跨镜头保持人物形象稳定 |
| **ComfyUI 集成** | 原生节点包，可接入可视化工作流 |
| **灵活的 API** | Python、curl、Postman 均可直接调用 |
| **详细计费** | 每条任务的积分消耗清晰可查，失败自动退款 |
| **本地工具链** | Batch Studio 在本地运行，数据不经过第三方 |

---

## 文档结构

| 章节 | 适合谁 |
|------|--------|
| [零基础用户指南](./non-coder-guide) | 老板、运营、完全不懂代码的用户 |
| [快速开始](./quickstart) | 所有新用户 |
| [批量生成指南](./batch-guide) | 运营人员、制片 |
| [角色一致性](./consistency-guide) | 短剧导演、美术 |
| [短剧工作流](./short-drama-workflow) | 制片团队 |
| [ComfyUI 指南](./comfyui-guide) | 有技术背景的创作者 |
| [API 密钥用法](./api-key-guide) | 开发者、技术操作人员 |
| [API 参考](./api-reference) | 开发者 |
| [错误与排查](./errors) | 所有用户遇到问题时 |
| [常见问题](./faq) | 所有用户 |
