---
title: ComfyUI 指南
sidebar_label: ComfyUI 指南
description: 在 ComfyUI 工作流中安装和使用 NextAPI 节点包。
---

# ComfyUI 指南

NextAPI 提供一套 ComfyUI 自定义节点，让你在可视化工作流中直接调用视频生成 API。适合已经熟悉 ComfyUI 的创作者，希望把 NextAPI 接入现有的图像/视频处理流程。

:::info 批量生成推荐 Batch Studio
ComfyUI 节点适合 1–10 条镜头的交互式工作流。如果需要一次生成 20+ 条，Batch Studio 的 CSV 驱动方式效率更高。
:::

---

## 安装

```bash
# 进入 ComfyUI 自定义节点目录
cd ComfyUI/custom_nodes

# 克隆节点包
git clone https://github.com/your-org/comfyui-nextapi.git
# 或者把 toolkit/comfyui_nextapi/ 文件夹整个复制进来

# 安装依赖
cd comfyui-nextapi
pip install -r requirements.txt

# 重启 ComfyUI
```

重启后，在节点菜单里搜索 `NextAPI`，可以看到五个节点。

---

## 五个节点详解

### NextAPI · Auth

**作用：** 配置 API 密钥和接口地址，为下游节点提供认证凭证。

**必须的输入：**
- `api_key` — 你的 `sk_live_…` 密钥（或留空读取 `NEXTAPI_KEY` 环境变量）
- `base_url` — 默认 `https://api.nextapi.top`（通常不需要修改）

**输出：** `auth_config` — 传给其他所有节点

每个工作流只需要一个 Auth 节点，用 Reroute 节点把输出分发给所有下游节点。

---

### NextAPI · Asset Resolver

**作用：** 把本地图片文件或图片 ID 转换成 API 可接受的 `https://` URL。

**输入：**
- `auth_config` — 来自 Auth 节点
- `asset_path` — 本地文件路径或已上传的资源 ID
- `asset_type` — `character` / `outfit` / `scene`

**输出：** `asset_url` — 传给 Generate Video 节点的参考图字段

如果你的参考图已经托管在公开 CDN 上（有 `https://` 地址），可以直接跳过这个节点，在 Generate Video 节点里填 URL 即可。

---

### NextAPI · Generate Video

**作用：** 提交一个视频生成任务，返回 Job ID。

**输入：**
- `auth_config` — 来自 Auth 节点
- `prompt` — 生成提示词
- `duration` — 时长（2–12 秒）
- `aspect_ratio` — 画面比例
- `negative_prompt`（可选）
- `character_url`（可选）— 来自 Asset Resolver
- `outfit_url`（可选）— 来自 Asset Resolver
- `scene_url`（可选）— 来自 Asset Resolver

**输出：** `job_id` — 传给 Poll Job 节点

---

### NextAPI · Poll Job

**作用：** 持续轮询任务状态，直到完成（`succeeded` 或 `failed`）。

**输入：**
- `auth_config`
- `job_id` — 来自 Generate Video 节点

**输出：** `video_url` — 下载链接（仅在成功时有值）

轮询间隔默认 4 秒，最长等待 15 分钟。如果超时，节点会抛出异常，Queue 会标记为失败。

---

### NextAPI · Download Result

**作用：** 把视频 URL 下载到本地，保存为 MP4 文件。

**输入：**
- `video_url` — 来自 Poll Job 节点
- `output_path`（可选）— 保存路径，默认为 `output/` 目录

**输出：** `file_path` — 保存后的本地路径

---

## 基础工作流示例

一个最简单的单镜头生成工作流：

```
[Auth] ──────────────────────────────────────────┐
                                                  ↓
[Asset Resolver (char_lin.jpg)] ──── [Generate Video] ──── [Poll Job] ──── [Download]
```

在 ComfyUI 里：
1. 添加一个 **NextAPI · Auth** 节点，填入密钥
2. 添加 **NextAPI · Asset Resolver**，选择参考图
3. 连接到 **NextAPI · Generate Video**，填写提示词和参数
4. 连接到 **NextAPI · Poll Job**
5. 连接到 **NextAPI · Download Result**
6. 点击 **Queue Prompt**

---

## 多镜头工作流

可以在一个工作流里串联多组节点，每组生成一条镜头：

1. 一个 **Auth** 节点 + Reroute，连接给所有 Generate Video 节点
2. 同一个 **Asset Resolver** 输出连接给所有 Generate Video 节点（共享参考图）
3. 每个 Generate Video 节点写独立的提示词
4. **Queue Prompt** — ComfyUI 会按顺序依次提交

超过 10 条镜头时，换用 Batch Studio。CSV 方式在大批量下明显更好管理。

---

## 环境变量

在 ComfyUI 启动环境里设置：

| 变量名 | 对应节点 | 用途 |
|--------|---------|------|
| `NEXTAPI_KEY` | Auth | 默认 API 密钥 |
| `NEXTAPI_BASE_URL` | Auth | 默认接口地址 |
| `NEXTAPI_UPLOAD_URL` | Asset Resolver | 本地图片上传端点 |
| `NEXTAPI_UPLOAD_KEY` | Asset Resolver | 上传端点的 Bearer Token |

设置好环境变量后，节点字段留空会自动读取，不需要在工作流 JSON 里存储密钥。
